/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — assets.js
 *
 * 数据模型层：
 *   - formal-v2 五类 Asset 实体、校验、patch 与投影
 *   - 正式财务、生命周期、订阅周期和预付/使用记录契约
 *   - computeAssetDerived（基础派生）/ computeAssetMetrics（含到期徽章 + 4 种折旧 + 5 个虚拟 v2 字段）
 *   - computeNetCost（M10 运行时 maintenanceCost 注入）/ computeDailyCost（4 种日均价决策）/ computeTargetProgress
 *   - computeMaintenanceTotal（M10 维护总费用）— 由 computeNetCost 注入
 *   - computeUsageStats / computeUsageTotalDuration（v0.16-T4-γ，M13 使用统计）
 *   - computeStats（首页汇总）+ applyFilter / sortAssets
 *   - newOperationLog（v0.16-T1，M14 操作日志）：记录 add/update/delete/set-status/wishlist* 6 类 mutation
 *
 * 依赖：./algorithms.js（genId / todayISO / daysBetween）
 *
 * v0.18 formal-v2 数据契约：
 *   - schemaGeneration: 'formal-v2'，schemaVersion: 1
 *   - 删除评分、skipNextRenewal、使用追踪、dailyCostOverrideMinor、
 *     versionLabel、virtualPerpetual.costGoal、wishlist 携带的
 *     categoryId / tagIds / notes、及 reminderPolicy 等 v1 残留字段
 *   - v2 wishlist 仅承载极小字段集（kind/name/currency/cover/wishlist 子对象）
 *   - v2 wishlist 不再校验 kind 与 targetGroup 的一致性；两者独立校验
 *   - v1 normalize 与 reminderPolicy 帮助函数已从该文件中完全移除；任何 v1
 *     normalize 调用现在直接抛 FORMAL_ASSET_INVALID（白名单 declare 时缺
 *     reminderPolicy 等）。也就是说：reminderPolicy 已不再是「白名单能接受
 *     的字段」，而是被 v1/v2 双方在 parse 阶段硬性拒收。剩余 v1 helper
 *     仅服务于 v1→v2 migrate / operation log snapshot 反查，不接 UI 热路径。
 *   - 旧 v1 函数与字段全保留供现有调用方过渡；test 与 UI 切换留到阶段 8/10
 */

'use strict';

const {
    genId,
    todayISO,
    daysBetween,
    createStableId,
    isUUID,
    isForeignKey,
    normalizeForeignKey,
    isEnumValue,
    normalizeEnum,
    isBusinessDate,
    normalizeBusinessDate,
    isUTCInstant,
    normalizeUTCInstant,
    isISO4217Currency,
    normalizeISO4217Currency,
    isAmountMinor,
    normalizeAmountMinor,
    safeMinorAdd,
    safeMinorSubtract,
} = require('./algorithms');
const { normalizeCover } = require('./media');

const STATUSES = [
    { id: 'wishlist', emoji: '🌱', key: 'statusWishlist', color: '#67c23a' },
    { id: 'active',   emoji: '✅', key: 'statusActive',   color: '#3575f3' },
    { id: 'retired',  emoji: '⏸️', key: 'statusRetired',  color: '#909399' },
];

const SORTS = [
    { id: 'default',   key: 'sortDefault' },
    { id: 'newest',    key: 'sortNewest' },
    { id: 'oldest',    key: 'sortOldest' },
    { id: 'priceHigh', key: 'sortPriceHigh' },
    { id: 'priceLow',  key: 'sortPriceLow' },
    { id: 'nameAsc',   key: 'sortNameAsc' },
];

const STATUS_ORDER = { active: 0, retired: 1, wishlist: 2 };

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]));
const SORT_MAP = Object.fromEntries(SORTS.map(s => [s.id, s]));
// Stable domain enums. Existing UI arrays remain below for display metadata.
const ASSET_KIND = Object.freeze({
    PHYSICAL: 'physical',
    VIRTUAL: 'virtual',
    PREPAID: 'prepaid',
});
const ASSET_STATUS = Object.freeze({
    WISHLIST: 'wishlist',
    ACTIVE: 'active',
    RETIRED: 'retired',
});
const FINANCIAL_DIRECTION = Object.freeze({
    OUTFLOW: 'outflow',
    INFLOW: 'inflow',
});
const FINANCIAL_EVENT_TYPE = Object.freeze({
    PURCHASE: 'purchase',
    ADDITIONAL_COST: 'additionalCost',
    MAINTENANCE: 'maintenance',
    SUBSCRIPTION_PAYMENT: 'subscriptionPayment',
    PREPAID_CHARGE: 'prepaidCharge',
    PREPAID_CONSUMPTION: 'prepaidConsumption',
    SALE: 'sale',
    REFUND: 'refund',
    INCOME: 'income',
    ADJUSTMENT: 'adjustment',
});
const LIFECYCLE_EVENT_TYPE = Object.freeze({
    CREATED: 'created',
    WISHLISTED: 'wishlisted',
    ACTIVATED: 'activated',
    RETIRED: 'retired',
    RESTORED: 'restored',
    DELETED: 'deleted',
    STATUS_CHANGED: 'statusChanged',
    MAINTENANCE_RECORDED: 'maintenanceRecorded',
    USAGE_RECORDED: 'usageRecorded',
    PREPAID_TRANSACTION: 'prepaidTransaction',
    SUBSCRIPTION_STARTED: 'subscriptionStarted',
    SUBSCRIPTION_RENEWED: 'subscriptionRenewed',
    SUBSCRIPTION_REOPENED: 'subscriptionReopened',
    SUBSCRIPTION_CANCELLED: 'subscriptionCancelled',
    SUBSCRIPTION_SKIPPED: 'subscriptionSkipped',
});
const SUBSCRIPTION_PERIOD_KIND = Object.freeze({
    TRIAL: 'trial',
    BILLING: 'billing',
    GRACE: 'grace',
    COMPLIMENTARY: 'complimentary',
});
// lifecycleEvents.json uses this canonical shape. Do not substitute the older
// eventType/fromStatus/toStatus envelope here: lifecycle `kind` and `details`
// are the persisted contract used by storage, reports, and mutation paths.
const FORMAL_LIFECYCLE_RECORD_KEYS = Object.freeze([
    'id', 'schemaVersion', 'assetId', 'occurredAt', 'effectiveDate', 'createdAt',
    'source', 'correlationId', 'note', 'replacesEventId', 'voidedAt', 'kind', 'details',
]);
const EVENT_SOURCE = Object.freeze({
    USER: 'user',
    SYSTEM: 'system',
    IMPORT: 'import',
    MIGRATION: 'migration',
    UNDO: 'undo',
});
const ASSET_EXTENSION_NAMESPACE = Object.freeze({
    FINANCIAL: 'financial',
    LIFECYCLE: 'lifecycle',
    SUBSCRIPTION_PERIODS: 'subscriptionPeriods',
    PHYSICAL: 'physical',
    PREPAID: 'prepaid',
});
const DOMAIN_EVENT_SCHEMA_VERSION = 1;
const FINANCIAL_RECORD_KEYS = Object.freeze([
    'id', 'schemaVersion', 'assetId', 'occurredAt', 'effectiveDate', 'createdAt',
    'source', 'correlationId', 'note', 'metadata', 'replacesEventId', 'voidedAt',
    'direction', 'eventType', 'currency', 'amountMinor',
]);
const ASSET_TYPES = Object.freeze(Object.keys(ASSET_KIND).map(key => ASSET_KIND[key]));
const VALID_VIRTUAL_SUBTYPES = Object.freeze(['subscription', 'oneTime']);
const VALID_PREPAID_KINDS = ['amount', 'count'];
const WISHLIST_REASON_MAX_LENGTH = 500;

// Formal-v1 is the only production asset model.
const FORMAL_SCHEMA_GENERATION = 'formal-v1';
const FORMAL_ASSET_SCHEMA_VERSION = 1;
const FORMAL_ASSET_KIND = Object.freeze({
    PHYSICAL: 'physical',
    VIRTUAL_SUBSCRIPTION: 'virtualSubscription',
    VIRTUAL_PERPETUAL: 'virtualPerpetual',
    PREPAID_AMOUNT: 'prepaidAmount',
    PREPAID_COUNT: 'prepaidCount',
});
const FORMAL_ASSET_KINDS = Object.freeze(Object.keys(FORMAL_ASSET_KIND).map(key => FORMAL_ASSET_KIND[key]));
const FORMAL_BILLING_CYCLES = Object.freeze(['monthly', 'quarterly', 'halfYearly', 'yearly']);
// categoryId is a controlled presentation/reporting dimension. It is deliberately
// separate from the old free-form `category` field and never carries money truth.
const FORMAL_CATEGORIES = Object.freeze([
    { id: 'digital', kinds: ['physical'] },
    { id: 'appliance', kinds: ['physical'] },
    { id: 'home', kinds: ['physical'] },
    { id: 'otherPhysical', kinds: ['physical'] },
    { id: 'member', kinds: ['virtualSubscription'] },
    { id: 'software', kinds: ['virtualSubscription', 'virtualPerpetual'] },
    { id: 'service', kinds: ['virtualSubscription'] },
    { id: 'domain', kinds: ['virtualSubscription'] },
    { id: 'ai', kinds: ['virtualSubscription'] },
    { id: 'otherVirtual', kinds: ['virtualSubscription', 'virtualPerpetual'] },
    { id: 'prepaidAmount', kinds: ['prepaidAmount'] },
    { id: 'prepaidCount', kinds: ['prepaidCount'] },
]);
const FORMAL_CATEGORY_IDS = Object.freeze(FORMAL_CATEGORIES.map(category => category.id));

function toFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function parseISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0]
        && date.getUTCMonth() === parts[1] - 1
        && date.getUTCDate() === parts[2]
        ? date
        : null;
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeMetadata(value) {
    return isPlainObject(value) ? Object.assign({}, value) : {};
}

function validationResult(errors) {
    return { valid: errors.length === 0, errors: errors };
}

function isPositiveSafeInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

/**
 * Normalize the shared event envelope used by formal sidecar records.
 */
function normalizeEventEnvelope(value, options) {
    const source = isPlainObject(value) ? value : {};
    const now = normalizeUTCInstant(options && options.now, new Date());
    const occurredAt = normalizeUTCInstant(source.occurredAt, now);
    return {
        id: isUUID(source.id) ? source.id.toLowerCase() : createStableId(),
        schemaVersion: isPositiveSafeInteger(source.schemaVersion) ? source.schemaVersion : DOMAIN_EVENT_SCHEMA_VERSION,
        assetId: normalizeForeignKey(source.assetId),
        occurredAt: occurredAt,
        effectiveDate: normalizeBusinessDate(source.effectiveDate, occurredAt),
        createdAt: normalizeUTCInstant(source.createdAt, now),
        source: normalizeEnum(source.source, EVENT_SOURCE, EVENT_SOURCE.USER),
        correlationId: normalizeForeignKey(source.correlationId),
        note: source.note == null ? '' : String(source.note).trim(),
        metadata: normalizeMetadata(source.metadata),
        replacesEventId: normalizeForeignKey(source.replacesEventId),
        voidedAt: source.voidedAt == null ? null : normalizeUTCInstant(source.voidedAt),
    };
}

function validateEventEnvelope(value) {
    if (!isPlainObject(value)) return validationResult(['event must be an object']);
    const errors = [];
    if (!isUUID(value.id)) errors.push('id must be a valid UUID');
    if (!isPositiveSafeInteger(value.schemaVersion)) errors.push('schemaVersion must be a positive integer');
    if (!isForeignKey(value.assetId)) errors.push('assetId must be a valid foreign key');
    if (!isUTCInstant(value.occurredAt)) errors.push('occurredAt must be a UTC ISO timestamp');
    if (!isBusinessDate(value.effectiveDate)) errors.push('effectiveDate must be YYYY-MM-DD');
    if (!isUTCInstant(value.createdAt)) errors.push('createdAt must be a UTC ISO timestamp');
    if (!isEnumValue(value.source, EVENT_SOURCE)) errors.push('source is invalid');
    if (value.correlationId != null && !isForeignKey(value.correlationId)) errors.push('correlationId must be a valid foreign key');
    if (typeof value.note !== 'string') errors.push('note must be a string');
    if (!isPlainObject(value.metadata)) errors.push('metadata must be an object');
    if (value.replacesEventId != null && !isForeignKey(value.replacesEventId)) errors.push('replacesEventId must be a valid foreign key');
    if (value.voidedAt != null && !isUTCInstant(value.voidedAt)) errors.push('voidedAt must be a UTC ISO timestamp');
    return validationResult(errors);
}

function normalizeFinancialRecord(value, options) {
    const source = isPlainObject(value) ? value : {};
    const unknown = Object.keys(source).filter(key => FINANCIAL_RECORD_KEYS.indexOf(key) < 0);
    if (unknown.length) throw new TypeError('financial event contains unknown field: ' + unknown[0]);
    return Object.assign(normalizeEventEnvelope(source, options), {
        direction: normalizeEnum(source.direction, FINANCIAL_DIRECTION, FINANCIAL_DIRECTION.OUTFLOW),
        eventType: normalizeEnum(source.eventType, FINANCIAL_EVENT_TYPE, FINANCIAL_EVENT_TYPE.PURCHASE),
        currency: normalizeISO4217Currency(source.currency, 'CNY'),
        amountMinor: normalizeAmountMinor(source.amountMinor, 0),
    });
}

function validateFinancialRecord(value) {
    const result = validateEventEnvelope(value);
    const errors = result.errors.slice();
    if (isPlainObject(value)) {
        const unknown = Object.keys(value).filter(key => FINANCIAL_RECORD_KEYS.indexOf(key) < 0);
        if (unknown.length) errors.push('contains unknown field: ' + unknown[0]);
    }
    if (!isEnumValue(value && value.direction, FINANCIAL_DIRECTION)) errors.push('direction is invalid');
    if (!isEnumValue(value && value.eventType, FINANCIAL_EVENT_TYPE)) errors.push('eventType is invalid');
    if (!isISO4217Currency(value && value.currency)) errors.push('currency must be ISO 4217');
    if (!isAmountMinor(value && value.amountMinor)) errors.push('amountMinor must be a non-negative safe integer');
    if (value && (!isUUID(value.id) || value.id !== value.id.toLowerCase())) errors.push('id must be a lowercase UUID');
    if (value && (!isUUID(value.assetId) || value.assetId !== value.assetId.toLowerCase())) errors.push('assetId must be a lowercase UUID');
    ['correlationId', 'replacesEventId'].forEach(field => {
        if (value && value[field] != null && (!isUUID(value[field]) || value[field] !== value[field].toLowerCase())) {
            errors.push(field + ' must be a lowercase UUID or null');
        }
    });
    const requiredDirection = {
        purchase: FINANCIAL_DIRECTION.OUTFLOW,
        additionalCost: FINANCIAL_DIRECTION.OUTFLOW,
        maintenance: FINANCIAL_DIRECTION.OUTFLOW,
        subscriptionPayment: FINANCIAL_DIRECTION.OUTFLOW,
        prepaidCharge: FINANCIAL_DIRECTION.OUTFLOW,
        prepaidConsumption: FINANCIAL_DIRECTION.OUTFLOW,
        sale: FINANCIAL_DIRECTION.INFLOW,
        refund: FINANCIAL_DIRECTION.INFLOW,
        income: FINANCIAL_DIRECTION.INFLOW,
    };
    if (value && requiredDirection[value.eventType] && value.direction !== requiredDirection[value.eventType]) {
        errors.push('direction is invalid for eventType ' + value.eventType);
    }
    if (value && value.eventType === FINANCIAL_EVENT_TYPE.PREPAID_CONSUMPTION
        && (!isPlainObject(value.metadata) || value.metadata.affectsCash !== false)) {
        errors.push('prepaidConsumption metadata.affectsCash must be false');
    }
    return validationResult(errors);
}

function validateFinancialReplacementChain(events) {
    const errors = [];
    if (!Array.isArray(events)) return validationResult(['financial events must be an array']);
    const byId = new Map();
    events.forEach((event, index) => {
        if (event && byId.has(event.id)) errors.push('financialEvents[' + index + '].id duplicates another event');
        if (event) byId.set(event.id, event);
    });
    const replacementCounts = new Map();
    events.forEach((event, index) => {
        if (!event || event.replacesEventId == null) return;
        const original = byId.get(event.replacesEventId);
        if (!original) { errors.push('financialEvents[' + index + '].replacesEventId references no event'); return; }
        if (original.id === event.id) errors.push('financialEvents[' + index + '] cannot replace itself');
        if (event.eventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT || original.eventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT) {
            errors.push('financialEvents[' + index + '] adjustment cannot replace another event');
        }
        if (original.assetId !== event.assetId || original.currency !== event.currency) errors.push('financialEvents[' + index + '] replacement owner/currency mismatch');
        if (original.eventType !== event.eventType || original.direction !== event.direction) errors.push('financialEvents[' + index + '] replacement must preserve eventType and direction');
        if (original.voidedAt == null) errors.push('financialEvents[' + index + '] replaced original must be voided');
        if (event.voidedAt != null) errors.push('financialEvents[' + index + '] replacement must be active');
        replacementCounts.set(original.id, (replacementCounts.get(original.id) || 0) + 1);
    });
    replacementCounts.forEach((count, id) => { if (count > 1) errors.push('financial event ' + id + ' has multiple replacements'); });
    events.forEach((event, index) => {
        const seen = new Set();
        let cursor = event;
        while (cursor && cursor.replacesEventId != null) {
            if (seen.has(cursor.id)) { errors.push('financialEvents[' + index + '] replacement chain contains a cycle'); break; }
            seen.add(cursor.id);
            cursor = byId.get(cursor.replacesEventId);
        }
    });
    return validationResult(errors);
}

function normalizeLifecycleRecord(value, options) {
    const source = isPlainObject(value) ? value : {};
    return Object.assign(normalizeEventEnvelope(source, options), {
        eventType: normalizeEnum(source.eventType, LIFECYCLE_EVENT_TYPE, LIFECYCLE_EVENT_TYPE.CREATED),
        fromStatus: normalizeEnum(source.fromStatus, ASSET_STATUS, null),
        toStatus: normalizeEnum(source.toStatus, ASSET_STATUS, null),
    });
}

function validateLifecycleRecord(value) {
    const result = validateEventEnvelope(value);
    const errors = result.errors.slice();
    if (!isEnumValue(value && value.eventType, LIFECYCLE_EVENT_TYPE)) errors.push('eventType is invalid');
    if (value && value.fromStatus != null && !isEnumValue(value.fromStatus, ASSET_STATUS)) errors.push('fromStatus is invalid');
    if (value && value.toStatus != null && !isEnumValue(value.toStatus, ASSET_STATUS)) errors.push('toStatus is invalid');
    return validationResult(errors);
}

function validateFormalLifecycleRecord(value) {
    const errors = [];
    if (!isPlainObject(value)) return validationResult(['lifecycle event must be an object']);
    const unknown = Object.keys(value).filter(key => FORMAL_LIFECYCLE_RECORD_KEYS.indexOf(key) < 0);
    if (unknown.length) errors.push('contains unknown field: ' + unknown[0]);
    const envelope = Object.assign({ metadata: {} }, value, { eventType: value.kind, fromStatus: null, toStatus: null });
    validateLifecycleRecord(envelope).errors.forEach(error => errors.push(error));
    if (value.schemaVersion !== DOMAIN_EVENT_SCHEMA_VERSION) errors.push('schemaVersion must be ' + DOMAIN_EVENT_SCHEMA_VERSION);
    if (!isPlainObject(value.details)) errors.push('details must be an object');
    if (value && (!isUUID(value.id) || value.id !== value.id.toLowerCase())) errors.push('id must be a lowercase UUID');
    if (value && (!isUUID(value.assetId) || value.assetId !== value.assetId.toLowerCase())) errors.push('assetId must be a lowercase UUID');
    ['correlationId', 'replacesEventId'].forEach(field => {
        if (value[field] != null && (!isUUID(value[field]) || value[field] !== value[field].toLowerCase())) {
            errors.push(field + ' must be a lowercase UUID or null');
        }
    });
    return validationResult(errors);
}

/** Validate the replacement/audit chain for canonical lifecycle records. */
function validateFormalLifecycleReplacementChain(events) {
    const errors = [];
    if (!Array.isArray(events)) return validationResult(['lifecycle events must be an array']);
    const byId = new Map();
    events.forEach((event, index) => {
        if (event && byId.has(event.id)) errors.push('lifecycleEvents[' + index + '].id duplicates another event');
        if (event) byId.set(event.id, event);
    });
    const replacementCounts = new Map();
    events.forEach((event, index) => {
        if (!event || event.replacesEventId == null) return;
        const original = byId.get(event.replacesEventId);
        if (!original) { errors.push('lifecycleEvents[' + index + '].replacesEventId references no event'); return; }
        if (original.id === event.id) errors.push('lifecycleEvents[' + index + '] cannot replace itself');
        if (original.assetId !== event.assetId) errors.push('lifecycleEvents[' + index + '] replacement owner mismatch');
        if (original.kind !== event.kind) errors.push('lifecycleEvents[' + index + '] replacement must preserve kind');
        if (original.voidedAt == null) errors.push('lifecycleEvents[' + index + '] replaced original must be voided');
        if (event.voidedAt != null) errors.push('lifecycleEvents[' + index + '] replacement must be active');
        replacementCounts.set(original.id, (replacementCounts.get(original.id) || 0) + 1);
    });
    replacementCounts.forEach((count, id) => { if (count > 1) errors.push('lifecycle event ' + id + ' has multiple replacements'); });
    events.forEach((event, index) => {
        const seen = new Set();
        let cursor = event;
        while (cursor && cursor.replacesEventId != null) {
            if (seen.has(cursor.id)) { errors.push('lifecycleEvents[' + index + '] replacement chain contains a cycle'); break; }
            seen.add(cursor.id);
            cursor = byId.get(cursor.replacesEventId);
        }
    });
    return validationResult(errors);
}

function normalizeSubscriptionPeriodRecord(value, options) {
    const source = isPlainObject(value) ? value : {};
    const envelope = normalizeEventEnvelope(source, options);
    return Object.assign(envelope, {
        kind: normalizeEnum(source.kind, SUBSCRIPTION_PERIOD_KIND, SUBSCRIPTION_PERIOD_KIND.BILLING),
        startDate: normalizeBusinessDate(source.startDate, envelope.effectiveDate),
        endDate: normalizeBusinessDate(source.endDate),
        paymentEventId: source.paymentEventId == null ? null : normalizeForeignKey(source.paymentEventId),
    });
}

function validateSubscriptionPeriodRecord(value) {
    const result = validateEventEnvelope(value);
    const errors = result.errors.slice();
    if (!isEnumValue(value && value.kind, SUBSCRIPTION_PERIOD_KIND)) errors.push('kind is invalid');
    if (!isBusinessDate(value && value.startDate)) errors.push('startDate must be YYYY-MM-DD');
    if (!isBusinessDate(value && value.endDate)) errors.push('endDate must be YYYY-MM-DD');
    if (isBusinessDate(value && value.startDate) && isBusinessDate(value && value.endDate)
        && value.startDate > value.endDate) errors.push('startDate must not be after endDate');
    if (value && value.paymentEventId != null && !isUUID(value.paymentEventId)) errors.push('paymentEventId must be a UUID or null');
    if (value && value.kind === SUBSCRIPTION_PERIOD_KIND.BILLING && !isUUID(value.paymentEventId)) {
        errors.push('paymentEventId is required for billing periods');
    }
    return validationResult(errors);
}

/** Inclusive business-date periods for the same asset must not overlap. Voided records are ignored. */
function validateSubscriptionPeriodsNoOverlap(records) {
    if (!Array.isArray(records)) return validationResult(['subscription periods must be an array']);
    const errors = [];
    const byAsset = {};
    records.forEach((record, index) => {
        const result = validateSubscriptionPeriodRecord(record);
        result.errors.forEach(error => errors.push('records[' + index + '].' + error));
        if (!result.valid || record.voidedAt) return;
        if (!byAsset[record.assetId]) byAsset[record.assetId] = [];
        byAsset[record.assetId].push({ index: index, startDate: record.startDate, endDate: record.endDate });
    });
    Object.keys(byAsset).forEach(assetId => {
        const periods = byAsset[assetId].sort((a, b) => a.startDate.localeCompare(b.startDate));
        for (let i = 1; i < periods.length; i++) {
            const previous = periods[i - 1];
            const current = periods[i];
            if (current.startDate <= previous.endDate) {
                errors.push('records[' + current.index + '] overlaps records[' + previous.index + '] for assetId ' + assetId);
            }
        }
    });
    return validationResult(errors);
}

// ---------------------------------------------------------------------------
// Formal asset v1 pure contract kernel.
// ---------------------------------------------------------------------------

const FORMAL_OWNED_KEYS = Object.freeze([
    'id', 'kind', 'name', 'status', 'currency',
    'acquiredOn', 'statusChangedOn', 'categoryId', 'tagIds', 'cover', 'notes',
    'createdAt', 'updatedAt', 'details',
]);
const FORMAL_WISHLIST_KEYS = Object.freeze([
    'id', 'kind', 'name', 'status', 'currency', 'categoryId', 'tagIds', 'cover', 'notes',
    'createdAt', 'updatedAt', 'wishlist',
]);
const FORMAL_WISHLIST_TARGET_GROUPS = Object.freeze(['physical', 'virtual', 'prepaid']);

// ---------------------------------------------------------------------------
// formal-v2 严格层（v0.18+）
//
// v2 数据契约在 v1 基础上去除一批非关键字段：
//   - 实物 details: 移除 dailyCostOverrideMinor
//   - 虚拟订阅 details: 与 v1 同，但 normalize 拒绝外部注入 v1 残留字段
//     （skipNextRenewal / renewalScore / usageTrackingEnabled 等）
//   - 虚拟买断 details: 移除 costGoal（仅保留 licenseAccountLabel）
//   - 种草资产: 切到极简字段集，不接受 categoryId / tagIds / notes /
//     acquiredOn / statusChangedOn / reminderPolicy / details
//   - 顶层: 移除 reminderPolicy
//
// v2 wishlist 内层 carrier kind 语义由「targetGroup 强制锁定 kind」改为：
//   kind ∈ FORMAL_ASSET_KIND（独立校验）
//   targetGroup ∈ FORMAL_WISHLIST_TARGET_GROUPS（独立校验）
//   两者无需一致；targetGroup 才是购买路由真值（physical/virtual/prepaid），
//   kind 只是上层 form 表单选择的实物形态。normalize 不再拒不一致的资产。
// ---------------------------------------------------------------------------
const FORMAL_V2_SCHEMA_GENERATION = 'formal-v2';
const FORMAL_V2_ASSET_SCHEMA_VERSION = 1;
const FORMAL_V2_DETAIL_KEYS = Object.freeze({
    physical: Object.freeze(['warrantyEndsOn', 'costGoal']),
    virtualSubscription: Object.freeze(['planName', 'accountLabel', 'billingPlan', 'autoRenew']),
    virtualPerpetual: Object.freeze(['licenseAccountLabel']),
    prepaidAmount: Object.freeze(['provider', 'expiresOn']),
    prepaidCount: Object.freeze(['provider', 'expiresOn']),
});
const FORMAL_V2_OWNED_KEYS = Object.freeze([
    'id', 'kind', 'name', 'status', 'currency',
    'acquiredOn', 'statusChangedOn', 'categoryId', 'tagIds', 'cover', 'notes',
    'createdAt', 'updatedAt', 'details',
    // v2.5.0 笔记双链阶段1：可选笔记双链字段（仅 owned；wishlist 极简 schema 不变）。
    'indexBlockId', 'relatedNotes',
]);
const FORMAL_V2_WISHLIST_KEYS = Object.freeze([
    'id', 'kind', 'name', 'status', 'currency', 'cover',
    'createdAt', 'updatedAt', 'wishlist',
]);

function formalError(message) {
    const error = new TypeError(message);
    error.code = 'FORMAL_ASSET_INVALID';
    return error;
}

function assertFormalPlainObject(value, path) {
    if (!isPlainObject(value)) throw formalError((path || 'value') + ' must be an object');
    return value;
}

function assertFormalKnownKeys(value, allowed, path) {
    const unknown = Object.keys(value).filter(key => allowed.indexOf(key) < 0);
    if (unknown.length) throw formalError((path || 'value') + ' contains unknown field: ' + unknown[0]);
}

function formalString(value, fallback, maxLength, nullable, path) {
    if (value == null && nullable) return null;
    const result = value == null ? String(fallback == null ? '' : fallback).trim() : String(value).trim();
    if (result.length > maxLength) throw formalError(path + ' is too long');
    return result;
}

function formalHasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function formalDate(value, fallback, nullable, path, provided) {
    if (provided) {
        if (value === null && nullable) return null;
        if (!isBusinessDate(value)) throw formalError(path + ' must be YYYY-MM-DD');
        return value;
    }
    if (fallback == null && nullable) return null;
    const result = normalizeBusinessDate(fallback);
    if (!result) throw formalError(path + ' must be YYYY-MM-DD');
    return result;
}

function formalInstant(value, fallback, path, provided) {
    if (provided) {
        if (!isUTCInstant(value)) throw formalError(path + ' must be a UTC ISO timestamp');
        return new Date(value).toISOString();
    }
    const result = normalizeUTCInstant(fallback);
    if (!result) throw formalError(path + ' must be a UTC ISO timestamp');
    return result;
}

function formalAmountMinor(value, fallback, positive, path) {
    const result = value == null ? fallback : value;
    if (!isAmountMinor(result) || (positive && result <= 0)) {
        throw formalError(path + ' must be a ' + (positive ? 'positive' : 'non-negative') + ' safe integer');
    }
    return result;
}

function normalizeFormalTagIds(value) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw formalError('tagIds must be an array');
    const seen = new Set();
    const normalized = value.reduce((result, raw, index) => {
        if (typeof raw !== 'string' || !isUUID(raw.trim())) {
            throw formalError('tagIds[' + index + '] must be a UUID');
        }
        const id = raw.trim().toLowerCase();
        if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
        return result;
    }, []);
    if (normalized.length > 3) throw formalError('tagIds must contain at most 3 tags');
    return normalized;
}

function normalizeFormalCategoryId(kind, value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') throw formalError('categoryId must be a string or null');
    const id = value.trim();
    const category = FORMAL_CATEGORIES.find(item => item.id === id);
    if (!category) throw formalError('categoryId is invalid');
    if (category.kinds.indexOf(kind) < 0) throw formalError('categoryId is not allowed for kind ' + kind);
    return id;
}

function normalizeFormalCover(value) {
    if (value == null) return { kind: 'none' };
    const source = assertFormalPlainObject(value, 'cover');
    const allowedByKind = {
        none: ['kind'],
        upload: ['kind', 'assetPath'],
        workspaceAsset: ['kind', 'assetPath'],
        preset: ['kind', 'presetId'],
        emoji: ['kind', 'emoji'],
    };
    const allowed = allowedByKind[source.kind];
    if (!allowed) throw formalError('cover.kind is invalid');
    assertFormalKnownKeys(source, allowed, 'cover');
    const normalized = normalizeCover(source);
    if (normalized.kind !== source.kind) throw formalError('cover is invalid');
    return normalized;
}

function formalDeepEqual(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right) && left.length === right.length
            && left.every((value, index) => formalDeepEqual(value, right[index]));
    }
    if (isPlainObject(left) || isPlainObject(right)) {
        if (!isPlainObject(left) || !isPlainObject(right)) return false;
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        return leftKeys.length === rightKeys.length
            && leftKeys.every((key, index) => key === rightKeys[index] && formalDeepEqual(left[key], right[key]));
    }
    return false;
}

function normalizeFormalCostGoal(value, path) {
    if (value == null) return null;
    const source = assertFormalPlainObject(value, path);
    assertFormalKnownKeys(source, ['targetDailyAmountMinor', 'targetEndsOn'], path);
    return {
        targetDailyAmountMinor: formalAmountMinor(source.targetDailyAmountMinor, null, true, path + '.targetDailyAmountMinor'),
        targetEndsOn: formalDate(source.targetEndsOn, null, true, path + '.targetEndsOn', formalHasOwn(source, 'targetEndsOn')),
    };
}

// ---------------------------------------------------------------------------
// v2.5.0 笔记双链阶段1：索引文档块 ID + 手动关联文档归一
//
// indexBlockId：该资产在索引文档中的块 ID。只接受非空 string（≤64）或 null；
// number / 空串等一律 fail-closed。≤2.4.2 存量缺键 normalize 为 null，无迁移。
// relatedNotes：手动登记的关联文档数组，元素键白名单 {id, title, addedAt}；
// id 必填非空，title 默认 ''，addedAt 缺省回退 now；按 id 去重（保留首条）。
// ---------------------------------------------------------------------------

const FORMAL_INDEX_BLOCK_ID_MAX_LENGTH = 64;
const FORMAL_RELATED_NOTE_KEYS = Object.freeze(['id', 'title', 'addedAt']);
const FORMAL_RELATED_NOTE_TITLE_MAX_LENGTH = 200;

function normalizeFormalIndexBlockId(value) {
    if (value == null) return null;
    if (typeof value !== 'string') throw formalError('indexBlockId must be a string or null');
    const id = value.trim();
    if (!id) throw formalError('indexBlockId must not be empty');
    if (id.length > FORMAL_INDEX_BLOCK_ID_MAX_LENGTH) throw formalError('indexBlockId is too long');
    return id;
}

function normalizeFormalRelatedNotes(value, options) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw formalError('relatedNotes must be an array');
    const opts = options || {};
    const seen = new Set();
    return value.reduce((result, raw, index) => {
        const path = 'relatedNotes[' + index + ']';
        const source = assertFormalPlainObject(raw, path);
        assertFormalKnownKeys(source, FORMAL_RELATED_NOTE_KEYS, path);
        if (typeof source.id !== 'string' || !source.id.trim()) {
            throw formalError(path + '.id must be a non-empty string');
        }
        const id = source.id.trim();
        if (seen.has(id)) return result;
        seen.add(id);
        result.push({
            id: id,
            title: formalString(source.title, '', FORMAL_RELATED_NOTE_TITLE_MAX_LENGTH, false, path + '.title'),
            addedAt: formalInstant(source.addedAt, opts.now || new Date().toISOString(), path + '.addedAt', formalHasOwn(source, 'addedAt')),
        });
        return result;
    }, []);
}

// ---------------------------------------------------------------------------
// formal-v2 normalize/validate 严格层
//
// 设计：引用 FORMAL_V2_* 白名单与 v2 wishlist 语义。
// ---------------------------------------------------------------------------

function normalizeFormalV2Details(kind, value) {
    if (FORMAL_ASSET_KINDS.indexOf(kind) < 0) throw formalError('kind is invalid');
    const source = value == null ? {} : assertFormalPlainObject(value, 'details');
    assertFormalKnownKeys(source, FORMAL_V2_DETAIL_KEYS[kind], 'details');
    switch (kind) {
        case FORMAL_ASSET_KIND.PHYSICAL:
            return {
                warrantyEndsOn: formalDate(source.warrantyEndsOn, null, true, 'details.warrantyEndsOn', formalHasOwn(source, 'warrantyEndsOn')),
                costGoal: normalizeFormalCostGoal(source.costGoal, 'details.costGoal'),
            };
        case FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION: {
            const billing = source.billingPlan == null ? {} : assertFormalPlainObject(source.billingPlan, 'details.billingPlan');
            assertFormalKnownKeys(billing, ['cycle'], 'details.billingPlan');
            const cycle = billing.cycle == null ? 'monthly' : billing.cycle;
            if (FORMAL_BILLING_CYCLES.indexOf(cycle) < 0) throw formalError('details.billingPlan.cycle is invalid');
            return {
                planName: formalString(source.planName, '', 200, false, 'details.planName'),
                accountLabel: formalString(source.accountLabel, null, 200, true, 'details.accountLabel'),
                billingPlan: { cycle: cycle },
                autoRenew: source.autoRenew == null ? false : source.autoRenew,
            };
        }
        case FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL:
            return {
                licenseAccountLabel: formalString(source.licenseAccountLabel, null, 200, true, 'details.licenseAccountLabel'),
            };
        case FORMAL_ASSET_KIND.PREPAID_AMOUNT:
            return {
                provider: formalString(source.provider, null, 200, true, 'details.provider'),
                expiresOn: formalDate(source.expiresOn, null, true, 'details.expiresOn', formalHasOwn(source, 'expiresOn')),
            };
        case FORMAL_ASSET_KIND.PREPAID_COUNT:
            return {
                provider: formalString(source.provider, null, 200, true, 'details.provider'),
                expiresOn: formalDate(source.expiresOn, null, true, 'details.expiresOn', formalHasOwn(source, 'expiresOn')),
            };
        default:
            throw formalError('kind is invalid');
    }
}

function normalizeFormalV2Asset(value, options) {
    const source = assertFormalPlainObject(value, 'asset');
    const opts = options || {};
    // v2: kind is validated independently as one of FORMAL_ASSET_KIND. For
    // wishlist, kind 与 targetGroup 之间无强制对应关系（详见下方 wishlist 分支）。
    if (FORMAL_ASSET_KINDS.indexOf(source.kind) < 0) throw formalError('kind is invalid');
    const kind = source.kind;
    const status = source.status == null ? ASSET_STATUS.ACTIVE : source.status;
    if (!isEnumValue(status, ASSET_STATUS)) throw formalError('status is invalid');
    if (status === ASSET_STATUS.RETIRED && kind !== FORMAL_ASSET_KIND.PHYSICAL) {
        throw formalError('retired status is only allowed for physical assets');
    }
    const wishlist = status === ASSET_STATUS.WISHLIST;
    assertFormalKnownKeys(source, wishlist ? FORMAL_V2_WISHLIST_KEYS : FORMAL_V2_OWNED_KEYS, 'asset');
    const createdAt = formalInstant(source.createdAt, opts.now || new Date().toISOString(), 'createdAt', formalHasOwn(source, 'createdAt'));
    const now = formalInstant(source.updatedAt, createdAt, 'updatedAt', formalHasOwn(source, 'updatedAt'));
    const id = source.id == null ? createStableId() : String(source.id).trim().toLowerCase();
    if (!isUUID(id)) throw formalError('id must be a lowercase UUID');
    const name = formalString(source.name, '', 200, false, 'name');
    if (!name) throw formalError('name is required');
    const currency = formalHasOwn(source, 'currency')
        ? (isISO4217Currency(source.currency) ? String(source.currency).trim().toUpperCase() : null)
        : (formalHasOwn(opts, 'currency')
            ? (isISO4217Currency(opts.currency) ? String(opts.currency).trim().toUpperCase() : null)
            : 'CNY');
    if (!currency) throw formalError('currency must be ISO 4217');

    // Wishlist path 必须只输出 FORMAL_V2_WISHLIST_KEYS 内的字段；共同字段基底
    // 不包含 categoryId / tagIds / notes（v2 wishlist 已删除）。
    const baseFields = {
        id: id,
        kind: kind,
        name: name,
        status: status,
        currency: currency,
        cover: normalizeFormalCover(source.cover),
        createdAt: createdAt,
        updatedAt: now,
    };
    if (wishlist) {
        const wish = source.wishlist == null ? {} : assertFormalPlainObject(source.wishlist, 'wishlist');
        assertFormalKnownKeys(wish, ['expectedAmountMinor', 'reason', 'targetGroup', 'heartbeatTarget'], 'wishlist');
        // wishlist.targetGroup 是 3 选 1 的购买路由真值（physical / virtual /
        // prepaid），用于决定「购买时跳到哪个表单」。wishlist.kind 是上层
        // 表单选择的实物形态（5 选 1），两者独立校验，normalize 不再因两者
        // 不一致而拒绝。
        const inferredTargetGroup = kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
            : (kind.indexOf('virtual') === 0 ? 'virtual' : 'prepaid');
        const targetGroup = wish.targetGroup == null ? inferredTargetGroup : wish.targetGroup;
        if (FORMAL_WISHLIST_TARGET_GROUPS.indexOf(targetGroup) < 0) {
            throw formalError('wishlist.targetGroup is invalid');
        }
        // v2.4.2 心动值：可选目标心动值（1-999 的安全整数）；null = 无目标
        // （纯计数模式）。心动计数本身不落主表，由 wishlistEvents 的 heartbeat
        // 事件流派生。旧数据缺省键 normalize 为 null，无需迁移。
        let heartbeatTarget = null;
        if (wish.heartbeatTarget != null) {
            if (!Number.isSafeInteger(wish.heartbeatTarget) || wish.heartbeatTarget < 1 || wish.heartbeatTarget > 999) {
                throw formalError('wishlist.heartbeatTarget must be null or an integer between 1 and 999');
            }
            heartbeatTarget = wish.heartbeatTarget;
        }
        return Object.assign({}, baseFields, {
            wishlist: {
                expectedAmountMinor: wish.expectedAmountMinor == null ? null
                    : formalAmountMinor(wish.expectedAmountMinor, null, false, 'wishlist.expectedAmountMinor'),
                reason: formalString(wish.reason, '', WISHLIST_REASON_MAX_LENGTH, false, 'wishlist.reason'),
                targetGroup: targetGroup,
                heartbeatTarget: heartbeatTarget,
            },
        });
    }
    const details = normalizeFormalV2Details(kind, source.details);
    // v2 owned assets must NOT carry a reminderPolicy; the whitelist
    // (FORMAL_V2_OWNED_KEYS) already excludes it, so any external injector is
    // rejected above by assertFormalKnownKeys.
    return Object.assign({}, baseFields, {
        categoryId: normalizeFormalCategoryId(kind, source.categoryId),
        tagIds: normalizeFormalTagIds(source.tagIds),
        notes: formalString(source.notes, '', 5000, false, 'notes'),
        acquiredOn: formalDate(source.acquiredOn, opts.today || now, false, 'acquiredOn', formalHasOwn(source, 'acquiredOn')),
        statusChangedOn: formalDate(source.statusChangedOn, opts.today || now, false, 'statusChangedOn', formalHasOwn(source, 'statusChangedOn')),
        details: details,
        // v2.5.0 笔记双链阶段1：可选笔记双链字段，缺省 null / []（存量缺键读取容忍）。
        indexBlockId: normalizeFormalIndexBlockId(source.indexBlockId),
        relatedNotes: normalizeFormalRelatedNotes(source.relatedNotes, { now: now }),
    });
}

function newFormalV2Asset(seed, options) {
    return normalizeFormalV2Asset(seed || {}, options);
}

function validateFormalV2Asset(value) {
    try {
        const normalized = normalizeFormalV2Asset(value, { now: value && value.updatedAt, today: value && value.statusChangedOn });
        // v2.4.2 读取容忍（本契约唯一的读取容忍例外）：≤2.4.1 写入的存量
        // wishlist 资产及其事件内嵌 sourceSnapshot 的 wishlist 子对象只有 3 键
        // （无 heartbeatTarget）。读取时缺键等价 null，因此 deepEqual 的比较目标
        // 改为「value 的副本，其 wishlist 子对象末位追加 heartbeatTarget: null」；
        // 写入路径（normalize）始终输出 4 键 canonical，未知键仍 fail-closed。
        let expected = value;
        if (value.status === ASSET_STATUS.WISHLIST
            && isPlainObject(value.wishlist)
            && !Object.prototype.hasOwnProperty.call(value.wishlist, 'heartbeatTarget')) {
            expected = Object.assign({}, value, {
                wishlist: Object.assign({}, value.wishlist, { heartbeatTarget: null }),
            });
        }
        // v2.5.0 阶段1 读取容忍：≤2.4.2 写入的存量 owned 资产没有
        // indexBlockId / relatedNotes 键。读取时缺键等价 null / []；写入路径
        // （normalize）始终输出 canonical，未知键仍 fail-closed。
        if (expected.status !== ASSET_STATUS.WISHLIST
            && (!Object.prototype.hasOwnProperty.call(expected, 'indexBlockId')
                || !Object.prototype.hasOwnProperty.call(expected, 'relatedNotes'))) {
            expected = Object.assign({}, expected);
            if (!Object.prototype.hasOwnProperty.call(expected, 'indexBlockId')) expected.indexBlockId = null;
            if (!Object.prototype.hasOwnProperty.call(expected, 'relatedNotes')) expected.relatedNotes = [];
        }
        const exact = formalDeepEqual(normalized, expected);
        return validationResult(exact ? [] : ['asset must already be in canonical formal-v2 form']);
    } catch (error) {
        return validationResult([error && error.message ? error.message : String(error)]);
    }
}

function normalizeFormalV2AssetPatch(asset, patch) {
    const current = normalizeFormalV2Asset(asset);
    const source = assertFormalPlainObject(patch, 'patch');
    if (Object.prototype.hasOwnProperty.call(source, 'kind')) throw formalError('patch.kind cannot be changed');
    if (Object.prototype.hasOwnProperty.call(source, 'status')
        && (source.status === ASSET_STATUS.WISHLIST) !== (current.status === ASSET_STATUS.WISHLIST)) {
        throw formalError('patch.status cannot cross the wishlist/owned branch');
    }
    // v2 wishlist 不再有 categoryId / tagIds / notes 的 patch 入口；
    // reminderPolicy 已从 owned 中移除（v2 remove）。
    // v2.5.0 笔记双链阶段1：owned patch 白名单追加 indexBlockId / relatedNotes
    // （wishlist 分支不接受笔记双链字段）。
    const allowed = current.status === ASSET_STATUS.WISHLIST
        ? ['name', 'status', 'currency', 'cover', 'updatedAt', 'wishlist']
        : ['name', 'status', 'currency', 'acquiredOn', 'statusChangedOn', 'categoryId', 'tagIds', 'cover', 'notes', 'updatedAt', 'details', 'indexBlockId', 'relatedNotes'];
    assertFormalKnownKeys(source, allowed, 'patch');
    const result = Object.assign({}, source);
    if (Object.prototype.hasOwnProperty.call(source, 'details')) {
        const detailPatch = assertFormalPlainObject(source.details, 'patch.details');
        assertFormalKnownKeys(detailPatch, FORMAL_V2_DETAIL_KEYS[current.kind], 'patch.details');
        result.details = Object.assign({}, current.details, detailPatch);
        if (current.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && Object.prototype.hasOwnProperty.call(detailPatch, 'billingPlan')) {
            result.details.billingPlan = Object.assign({}, current.details.billingPlan, assertFormalPlainObject(detailPatch.billingPlan, 'patch.details.billingPlan'));
        }
        if (current.kind === FORMAL_ASSET_KIND.PHYSICAL
            && Object.prototype.hasOwnProperty.call(detailPatch, 'costGoal') && detailPatch.costGoal != null) {
            result.details.costGoal = Object.assign({}, current.details.costGoal || {}, assertFormalPlainObject(detailPatch.costGoal, 'patch.details.costGoal'));
        }
    }
    if (Object.prototype.hasOwnProperty.call(source, 'wishlist')) {
        result.wishlist = Object.assign({}, current.wishlist, assertFormalPlainObject(source.wishlist, 'patch.wishlist'));
    }
    return result;
}

function mergeFormalV2AssetPatch(asset, patch, options) {
    const current = normalizeFormalV2Asset(asset);
    const normalizedPatch = normalizeFormalV2AssetPatch(current, patch);
    const opts = options || {};
    const candidate = Object.assign({}, current, normalizedPatch, {
        id: current.id,
        kind: current.kind,
        createdAt: current.createdAt,
        updatedAt: Object.prototype.hasOwnProperty.call(normalizedPatch, 'updatedAt')
            ? normalizedPatch.updatedAt : formalInstant(null, opts.now || new Date().toISOString(), 'updatedAt', false),
    });
    return normalizeFormalV2Asset(candidate, opts);
}

function createFormalV2AssetWrapper(assets, options) {
    if (!Array.isArray(assets)) throw formalError('assets must be an array');
    const opts = options || {};
    const updatedAt = formalInstant(opts.updatedAt, opts.now || new Date().toISOString(), 'updatedAt', formalHasOwn(opts, 'updatedAt'));
    return {
        schemaGeneration: FORMAL_V2_SCHEMA_GENERATION,
        schemaVersion: FORMAL_V2_ASSET_SCHEMA_VERSION,
        assets: assets.map(asset => normalizeFormalV2Asset(asset)),
        updatedAt: updatedAt,
    };
}

function validateFormalV2AssetWrapper(value) {
    const errors = [];
    if (!isPlainObject(value)) return validationResult(['wrapper must be an object']);
    const unknown = Object.keys(value).filter(key => ['schemaGeneration', 'schemaVersion', 'assets', 'updatedAt'].indexOf(key) < 0);
    if (unknown.length) errors.push('wrapper contains unknown field: ' + unknown[0]);
    // v2 严格校验：只接受 formal-v2 wrapper。任何 v1 或其他 schemaGeneration
    // 的 wrapper 由 storage 层抛 RESET_REQUIRED 处理；本函数只负责结构与字段。
    if (value.schemaGeneration !== FORMAL_V2_SCHEMA_GENERATION) errors.push('schemaGeneration must be formal-v2');
    if (value.schemaVersion !== FORMAL_V2_ASSET_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
    if (!isUTCInstant(value.updatedAt)) errors.push('updatedAt must be a UTC ISO timestamp');
    if (!Array.isArray(value.assets)) errors.push('assets must be an array');
    else {
        const ids = new Set();
        value.assets.forEach((asset, index) => {
            validateFormalV2Asset(asset).errors.forEach(error => errors.push('assets[' + index + '].' + error));
            if (asset && typeof asset.id === 'string') {
                if (ids.has(asset.id)) errors.push('assets[' + index + '].id must be globally unique');
                else ids.add(asset.id);
            }
        });
    }
    return validationResult(errors);
}

// Formal-v1 semantic read boundary. All selectors require a canonical asset;
// sidecar projections are strict and never normalize malformed records silently.
const FORMAL_DISPLAY_GROUP = Object.freeze({ physical: 'physical', virtualSubscription: 'virtual', virtualPerpetual: 'virtual', prepaidAmount: 'prepaid', prepaidCount: 'prepaid' });
const FORMAL_PREPAID_TRANSACTION_TYPES = Object.freeze(['opening', 'inflow', 'outflow', 'refund', 'adjust']);
// Canonical formal-v1 prepaid sidecar record. Stage 5 storage writes this
// shape directly; legacy prepaid transaction names are intentionally rejected.
const FORMAL_PREPAID_TRANSACTION_KEYS = Object.freeze([
    'id', 'assetId', 'type', 'dimension', 'direction', 'count',
    'effectiveDate', 'occurredAt', 'createdAt', 'note', 'financialEventId',
]);

function _tryV2Asset(asset) { try { return normalizeFormalV2Asset(asset); } catch (e) { return null; } }
function assertCanonicalFormalAsset(asset) {
    const v2 = _tryV2Asset(asset);
    if (v2) return v2;
    throw formalError('asset must be canonical formal-v2');
}
function isFormalKind(value) { return FORMAL_ASSET_KINDS.indexOf(value) >= 0; }
function getFormalKind(asset) { return assertCanonicalFormalAsset(asset).kind; }
function getFormalDisplayGroup(asset) { return FORMAL_DISPLAY_GROUP[getFormalKind(asset)]; }
function getFormalAcquiredOn(asset) { const a = assertCanonicalFormalAsset(asset); return a.status === ASSET_STATUS.WISHLIST ? null : a.acquiredOn; }
function getFormalWarrantyEndsOn(asset) { const a = assertCanonicalFormalAsset(asset); return a.status !== ASSET_STATUS.WISHLIST && a.kind === FORMAL_ASSET_KIND.PHYSICAL ? a.details.warrantyEndsOn : null; }
function formalToday(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (isBusinessDate(value)) return value;
    if (value == null) return todayISO();
    throw formalError('today must be YYYY-MM-DD or a valid Date');
}
function formalRecords(value, key, path) {
    if (Array.isArray(value)) return value;
    if (isPlainObject(value) && Array.isArray(value[key])) return value[key];
    if (value == null) return [];
    throw formalError((path || key) + ' must be an array or wrapper');
}
function assertFormalRecordAssetId(record, assetId, path) {
    if (!record || !isUUID(record.assetId)) throw formalError(path + '.assetId must be a UUID');
    if (record.assetId !== assetId) throw formalError(path + '.assetId must equal asset.id');
}

function projectFormalSubscription(asset, periods, today) {
    let a;
    try { a = normalizeFormalV2Asset(asset); } catch (e) { a = assertCanonicalFormalAsset(asset); }
    if (a.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || a.status === ASSET_STATUS.WISHLIST) return null;
    const date = formalToday(today);
    const records = formalRecords(periods, 'records', 'subscriptionPeriods');
    const validation = validateSubscriptionPeriodsNoOverlap(records);
    if (!validation.valid) throw formalError('subscriptionPeriods are invalid: ' + validation.errors.join('; '));
    records.forEach((record, index) => assertFormalRecordAssetId(record, a.id, 'subscriptionPeriods[' + index + ']'));
    const valid = records.filter(record => !record.voidedAt).slice().sort((l, r) => l.startDate.localeCompare(r.startDate) || l.endDate.localeCompare(r.endDate));
    const currentPeriod = valid.find(period => period.startDate <= date && date <= period.endDate) || null;
    const latestPeriod = valid.length ? valid[valid.length - 1] : null;
    let state = 'pendingConfirmation';
    if (currentPeriod) state = 'subscribed';
    else if (latestPeriod && date > latestPeriod.endDate) state = a.details.autoRenew ? 'pendingConfirmation' : 'expired';
    const basis = currentPeriod || latestPeriod;
    const plannedRenewalDate = a.details.autoRenew && basis ? addBusinessDays(basis.endDate, 1) : null;
    const trialPeriod = currentPeriod && currentPeriod.kind === SUBSCRIPTION_PERIOD_KIND.TRIAL ? currentPeriod : null;
    return {
        state,
        currentPeriod: currentPeriod ? Object.assign({}, currentPeriod) : null,
        latestPeriod: latestPeriod ? Object.assign({}, latestPeriod) : null,
        plannedRenewalDate,
        isTrial: !!trialPeriod,
        trialPeriod: trialPeriod ? Object.assign({}, trialPeriod) : null,
        latestPeriodWasTrial: !!latestPeriod && latestPeriod.kind === SUBSCRIPTION_PERIOD_KIND.TRIAL,
        indeterminate: state === 'pendingConfirmation' && !latestPeriod,
    };
}
function getFormalExpiryOn(asset, periods, today) {
    const a = assertCanonicalFormalAsset(asset);
    if (a.status === ASSET_STATUS.WISHLIST) return null;
    if (a.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || a.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) return a.details.expiresOn;
    if (a.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) return null;
    const projection = projectFormalSubscription(a, periods, today);
    return projection.currentPeriod ? projection.currentPeriod.endDate : (projection.latestPeriod ? projection.latestPeriod.endDate : null);
}
/**
 * The single read-only cross-kind date projection for reminders, sorting, and
 * reports. It deliberately returns no cached asset field: each source remains
 * authoritative in its own detail/period sidecar.
 */
function getFormalNextImportantDate(asset, periods, today) {
    const a = assertCanonicalFormalAsset(asset);
    if (a.status === ASSET_STATUS.WISHLIST) return null;
    if (a.kind === FORMAL_ASSET_KIND.PHYSICAL) {
        return a.details.warrantyEndsOn ? { date: a.details.warrantyEndsOn, type: 'warranty' } : null;
    }
    if (a.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || a.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) {
        return a.details.expiresOn ? { date: a.details.expiresOn, type: 'prepaidExpiry' } : null;
    }
    if (a.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
        const date = getFormalExpiryOn(a, periods, today);
        return date ? { date: date, type: 'subscriptionExpiry' } : null;
    }
    return null;
}
function supportsFormalCostGoal(asset) {
    const a = assertCanonicalFormalAsset(asset);
    return a.status !== ASSET_STATUS.WISHLIST && a.kind === FORMAL_ASSET_KIND.PHYSICAL;
}

function assertFormalPrepaidTransaction(record, asset, index) {
    const path = 'prepaidTransactions[' + index + ']';
    assertFormalPlainObject(record, path);
    assertFormalKnownKeys(record, FORMAL_PREPAID_TRANSACTION_KEYS, path);
    if (!isUUID(record.id)) throw formalError(path + '.id must be a UUID');
    assertFormalRecordAssetId(record, asset.id, path);
    if (!FORMAL_PREPAID_TRANSACTION_TYPES.includes(record.type)) throw formalError(path + '.type is invalid');
    if (!isBusinessDate(record.effectiveDate)) throw formalError(path + '.effectiveDate must be YYYY-MM-DD');
    const expectedDirection = record.type === 'outflow' || record.type === 'refund' ? FINANCIAL_DIRECTION.OUTFLOW : FINANCIAL_DIRECTION.INFLOW;
    if (record.type === 'adjust') {
        if (![FINANCIAL_DIRECTION.INFLOW, FINANCIAL_DIRECTION.OUTFLOW].includes(record.direction)) throw formalError(path + '.direction is required for adjust');
    } else if (record.direction !== expectedDirection) throw formalError(path + '.direction is invalid for type ' + record.type);
    if (!isUTCInstant(record.occurredAt)) throw formalError(path + '.occurredAt must be a UTC ISO timestamp');
    if (!isUTCInstant(record.createdAt)) throw formalError(path + '.createdAt must be a UTC ISO timestamp');
    if (typeof record.note !== 'string') throw formalError(path + '.note must be a string');
    if (record.financialEventId != null && !isUUID(record.financialEventId)) throw formalError(path + '.financialEventId must be a UUID or null');
    const expectedDimension = asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT ? 'amount' : 'count';
    if (record.dimension !== expectedDimension) throw formalError(path + '.dimension must match asset kind');
    if (expectedDimension === 'amount') {
        if (!isUUID(record.financialEventId)) throw formalError(path + '.financialEventId is required for amount transactions');
        if (formalHasOwn(record, 'count')) throw formalError(path + ' mixes amount and count dimensions');
    } else {
        if (!Number.isSafeInteger(record.count) || record.count < 0) throw formalError(path + '.count must be a non-negative safe integer');
        if (formalHasOwn(record, 'amountMinor')) throw formalError(path + ' mixes count and amount dimensions');
    }
}
function validateFormalPrepaidTransaction(record, asset) {
    try {
        const a = assertCanonicalFormalAsset(asset);
        if (![FORMAL_ASSET_KIND.PREPAID_AMOUNT, FORMAL_ASSET_KIND.PREPAID_COUNT].includes(a.kind) || a.status === ASSET_STATUS.WISHLIST) throw formalError('asset must be an owned prepaid asset');
        assertFormalPrepaidTransaction(record, a, 0);
        return validationResult([]);
    } catch (error) { return validationResult([error && error.message ? error.message : String(error)]); }
}
function projectFormalPrepaid(asset, transactions, financialEvents) {
    let a;
    try { a = normalizeFormalV2Asset(asset); } catch (e) { a = assertCanonicalFormalAsset(asset); }
    const amountKind = a.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT;
    if (!amountKind && a.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT || a.status === ASSET_STATUS.WISHLIST) return null;
    const records = formalRecords(transactions, 'records', 'prepaidTransactions');
    const financialById = new Map(formalRecords(financialEvents, 'events', 'financialEvents').map(event => [event.id, event]));
    const linkedFinancialEventIds = new Set();
    let opening = 0, inflow = 0, outflow = 0, adjust = 0;
    records.forEach((record, index) => {
        assertFormalPrepaidTransaction(record, a, index);
        if (record.financialEventId != null) {
            if (linkedFinancialEventIds.has(record.financialEventId)) {
                throw formalError('prepaidTransactions[' + index + '].financialEventId is already linked to another prepaid transaction');
            }
            linkedFinancialEventIds.add(record.financialEventId);
        }
        const event = record.financialEventId == null ? null : financialById.get(record.financialEventId);
        if ((amountKind || record.financialEventId != null) && (!event || event.assetId !== a.id || event.currency !== a.currency || event.voidedAt)) {
            throw formalError('prepaidTransactions[' + index + '].financialEventId has no active matching financial event');
        }
        if (event && event.effectiveDate !== record.effectiveDate) throw formalError('prepaidTransactions[' + index + '].effectiveDate must match linked financial event');
        if (event) {
            const expectedTypes = record.type === 'opening' ? [FINANCIAL_EVENT_TYPE.PURCHASE, FINANCIAL_EVENT_TYPE.ADJUSTMENT]
                : (record.type === 'inflow' ? [FINANCIAL_EVENT_TYPE.PREPAID_CHARGE]
                    : (record.type === 'outflow' ? [FINANCIAL_EVENT_TYPE.PREPAID_CONSUMPTION]
                        : (record.type === 'refund' ? [FINANCIAL_EVENT_TYPE.REFUND] : [FINANCIAL_EVENT_TYPE.ADJUSTMENT])));
            if (expectedTypes.indexOf(event.eventType) < 0) throw formalError('prepaidTransactions[' + index + '].financialEventId has incompatible eventType');
            const expectedEventDirection = record.type === 'refund' ? FINANCIAL_DIRECTION.INFLOW
                : (record.type === 'inflow' || event.eventType === FINANCIAL_EVENT_TYPE.PURCHASE
                    ? FINANCIAL_DIRECTION.OUTFLOW : record.direction);
            if (event.direction !== expectedEventDirection) throw formalError('prepaidTransactions[' + index + '].financialEventId has incompatible direction');
            if ((record.type === 'outflow' || record.type === 'adjust' || event.eventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT)
                && event.metadata.affectsCash !== false) throw formalError('prepaidTransactions[' + index + '].financialEventId must be non-cash');
        }
        const value = amountKind ? event.amountMinor : record.count;
        if (record.type === 'opening') opening += value;
        else if (record.type === 'inflow') inflow += value;
        else if (record.type === 'outflow' || record.type === 'refund') outflow += value;
        else adjust += record.direction === FINANCIAL_DIRECTION.OUTFLOW ? -value : value;
        if (![opening, inflow, outflow, adjust].every(Number.isSafeInteger)) throw formalError('prepaid projection exceeds safe integer range');
    });
    const remaining = opening + inflow - outflow + adjust;
    if (!Number.isSafeInteger(remaining)) throw formalError('prepaid projection exceeds safe integer range');
    return amountKind
        ? { dimension: 'amount', currency: a.currency, openingAmountMinor: opening, inflowAmountMinor: inflow, outflowAmountMinor: outflow, adjustAmountMinor: adjust, balanceAmountMinor: remaining, transactionCount: records.length }
        : { dimension: 'count', unitLabel: '次', openingCount: opening, inflowCount: inflow, outflowCount: outflow, adjustCount: adjust, remainingCount: remaining, transactionCount: records.length };
}

function assertFormalUsageRecord(record, index) {
    const path = 'usage[' + index + ']';
    assertFormalPlainObject(record, path);
    assertFormalKnownKeys(record, ['id', 'assetId', 'date', 'durationMinutes', 'action', 'note', 'createdAt'], path);
    if (!isUUID(record.id)) throw formalError(path + '.id must be a UUID');
    if (!isUUID(record.assetId)) throw formalError(path + '.assetId must be a UUID');
    if (!isBusinessDate(record.date)) throw formalError(path + '.date must be YYYY-MM-DD');
    if (!Number.isSafeInteger(record.durationMinutes) || record.durationMinutes < 0) throw formalError(path + '.durationMinutes must be a non-negative safe integer');
    if (typeof record.action !== 'string') throw formalError(path + '.action must be a string');
    if (typeof record.note !== 'string') throw formalError(path + '.note must be a string');
    if (!isUTCInstant(record.createdAt)) throw formalError(path + '.createdAt must be a UTC ISO timestamp');
}
function validateFormalUsageRecord(record, asset) {
    try {
        const a = assertCanonicalFormalAsset(asset);
        assertFormalUsageRecord(record, 0);
        assertFormalRecordAssetId(record, a.id, 'usage[0]');
        return validationResult([]);
    } catch (error) { return validationResult([error && error.message ? error.message : String(error)]); }
}
function projectFormalFinancials(asset, financialEvents) {
    let a;
    try { a = normalizeFormalV2Asset(asset); } catch (e) { a = assertCanonicalFormalAsset(asset); }
    if (a.status === ASSET_STATUS.WISHLIST) return null;
    if (financialEvents == null) throw formalError('financialEvents sidecar is required for financial projection');
    const reachable = formalRecords(financialEvents, 'events', 'financialEvents');
    reachable.forEach((record, index) => {
        const validation = validateFinancialRecord(record);
        if (!validation.valid) throw formalError('financialEvents[' + index + '] is invalid: ' + validation.errors.join('; '));
        assertFormalRecordAssetId(record, a.id, 'financialEvents[' + index + ']');
        if (record.currency !== a.currency) {
            throw formalError('financialEvents[' + index + '].currency is ' + record.currency + '; expected owner currency ' + a.currency);
        }
    });
    const replacementValidation = validateFinancialReplacementChain(reachable);
    if (!replacementValidation.valid) throw formalError('financialEvents replacement chain is invalid: ' + replacementValidation.errors.join('; '));
    const records = reachable.filter(record => !record.voidedAt);
    let inflowAmountMinor = 0, outflowAmountMinor = 0, acquisitionAmountMinor = 0;
    records.forEach(record => {
        try {
            if (record.direction === FINANCIAL_DIRECTION.INFLOW) inflowAmountMinor = safeMinorAdd(inflowAmountMinor, record.amountMinor);
            else outflowAmountMinor = safeMinorAdd(outflowAmountMinor, record.amountMinor);
            if (record.eventType === FINANCIAL_EVENT_TYPE.PURCHASE
                || (a.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
                    && record.eventType === FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT)) {
                acquisitionAmountMinor = record.direction === FINANCIAL_DIRECTION.OUTFLOW
                    ? safeMinorAdd(acquisitionAmountMinor, record.amountMinor)
                    : safeMinorSubtract(acquisitionAmountMinor, record.amountMinor);
            } else if (record.eventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT
                && record.replacesEventId == null && record.metadata && record.metadata.scope === 'acquisition') {
                acquisitionAmountMinor = record.direction === FINANCIAL_DIRECTION.OUTFLOW
                    ? safeMinorAdd(acquisitionAmountMinor, record.amountMinor)
                    : safeMinorSubtract(acquisitionAmountMinor, record.amountMinor);
            }
        } catch (error) { throw formalError('financial projection exceeds safe integer range'); }
    });
    let netAmountMinor;
    try { netAmountMinor = safeMinorSubtract(outflowAmountMinor, inflowAmountMinor); }
    catch (error) { throw formalError('financial projection exceeds safe integer range'); }
    const cashRecords = records.filter(record => !record.metadata || record.metadata.affectsCash !== false);
    let cashInflowAmountMinor = 0, cashOutflowAmountMinor = 0;
    cashRecords.forEach(record => {
        if (record.direction === FINANCIAL_DIRECTION.INFLOW) cashInflowAmountMinor = safeMinorAdd(cashInflowAmountMinor, record.amountMinor);
        else cashOutflowAmountMinor = safeMinorAdd(cashOutflowAmountMinor, record.amountMinor);
    });
    const cashNetAmountMinor = safeMinorSubtract(cashOutflowAmountMinor, cashInflowAmountMinor);
    return { currency: a.currency, acquisitionAmountMinor, netAmountMinor, cashTotals: {
        inflowAmountMinor: cashInflowAmountMinor, outflowAmountMinor: cashOutflowAmountMinor,
        netAmountMinor: cashNetAmountMinor, eventCount: cashRecords.length,
    },
        recordedTotals: { inflowAmountMinor, outflowAmountMinor, netAmountMinor, eventCount: records.length } };
}
function projectFormalCostGoal(asset, today, financialEvents) {
    let a;
    try { a = normalizeFormalV2Asset(asset); } catch (e) { a = assertCanonicalFormalAsset(asset); }
    if (!supportsFormalCostGoal(a) || a.details.costGoal == null) return null;
    const T = a.details.costGoal.targetDailyAmountMinor;
    const elapsedDays = Math.max(1, daysBetween(a.acquiredOn, formalToday(today)) + 1);
    const N = projectFormalFinancials(a, financialEvents).netAmountMinor;
    const currentDailyAmountMinor = Math.ceil(N / elapsedDays);
    const achieved = currentDailyAmountMinor <= T;
    let daysToTarget = 0;
    let targetDate = null;
    if (N > 0 && T > 0) {
        const dTarget = Math.ceil(N / T);
        daysToTarget = Math.max(0, dTarget - elapsedDays);
        targetDate = addBusinessDays(a.acquiredOn, dTarget - 1);
    }
    return { targetDailyAmountMinor: T, targetEndsOn: a.details.costGoal.targetEndsOn, currentDailyAmountMinor, achieved, daysToTarget, targetDate };
}

/**
 * 反向投影：给定目标截止日期 targetEndsOn，反算达成该日期所需的日均价。
 * 与 projectFormalCostGoal 共用口径：days = daysBetween(acquiredOn, targetEndsOn) + 1（含两端）。
 * 纯函数、无副作用。`today` 保留于签名以对齐 projectFormalCostGoal，公式本身不使用。
 * 返回 { targetDailyAmountMinor, days, valid, reason }：
 *   - valid=true  → targetDailyAmountMinor = ceil(N / days)
 *   - valid=false → targetDailyAmountMinor = null，reason ∈ {'invalid','dateBeforeAcquired','noNetCost'}
 */
function projectFormalCostGoalByDate(asset, targetEndsOn, today, financialEvents) {
    let a;
    try { a = normalizeFormalV2Asset(asset); } catch (e) { a = assertCanonicalFormalAsset(asset); }
    const fail = (reason) => ({ targetDailyAmountMinor: null, days: 0, valid: false, reason });
    if (!supportsFormalCostGoal(a)) return fail('invalid');
    const ends = parseISODate(targetEndsOn);
    const acquired = parseISODate(a.acquiredOn);
    if (!ends || !acquired) return fail('invalid');
    if (ends.getTime() < acquired.getTime()) return fail('dateBeforeAcquired');
    const days = daysBetween(a.acquiredOn, targetEndsOn) + 1;
    if (days <= 0) return fail('invalid');
    const N = projectFormalFinancials(a, financialEvents).netAmountMinor;
    if (!(N > 0)) return fail('noNetCost');
    return { targetDailyAmountMinor: Math.ceil(N / days), days, valid: true, reason: null };
}
function projectFormalAsset(asset, snapshot, today) {
    const a0 = asset;
    let a;
    try { a = normalizeFormalV2Asset(a0); } catch (e) { a = assertCanonicalFormalAsset(a0); }
    const sidecars = snapshot == null ? {} : assertFormalPlainObject(snapshot, 'snapshot');
    const wishlist = a.status === ASSET_STATUS.WISHLIST;
    return {
        id: a.id, kind: a.kind, displayGroup: FORMAL_DISPLAY_GROUP[a.kind], status: a.status, name: a.name,
        currency: a.currency, tagIds: a.tagIds.slice(), acquiredOn: wishlist ? null : a.acquiredOn,
        acquisition: wishlist ? null : { currency: a.currency, amountMinor: projectFormalFinancials(a, sidecars.financialEvents).acquisitionAmountMinor },
        warrantyEndsOn: getFormalWarrantyEndsOn(a), expiryOn: getFormalExpiryOn(a, sidecars.subscriptionPeriods, today),
        nextImportant: getFormalNextImportantDate(a, sidecars.subscriptionPeriods, today),
        costGoalSupported: supportsFormalCostGoal(a),
        costGoalConfigured: supportsFormalCostGoal(a) && a.details.costGoal != null,
        subscription: projectFormalSubscription(a, sidecars.subscriptionPeriods, today),
        prepaid: projectFormalPrepaid(a, sidecars.prepaidTransactions, sidecars.financialEvents),
        financials: wishlist ? null : projectFormalFinancials(a, sidecars.financialEvents), costGoal: wishlist ? null : projectFormalCostGoal(a, today, sidecars.financialEvents),
    };
}

function addBusinessDays(date, days) {
    const parsed = parseISODate(date);
    if (!parsed || !Number.isSafeInteger(days)) return null;
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
}

function addBillingCycle(startDate, cycle) {
    const parsed = parseISODate(startDate);
    if (!parsed) return null;
    const months = cycle === 'yearly' ? 12 : (cycle === 'halfYearly' ? 6 : (cycle === 'quarterly' ? 3 : 1));
    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + months;
    const day = parsed.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** A billing period includes both endpoints: [startDate, endDate]. */
function getSubscriptionPeriodEnd(startDate, cycle) {
    const nextStart = addBillingCycle(startDate, cycle);
    return nextStart ? addBusinessDays(nextStart, -1) : null;
}

function sortAssets(assets, sortId, financialEvents) {
    const list = assets.slice();
    const acquisition = asset => {
        if (!asset || asset.status === ASSET_STATUS.WISHLIST || !isFormalKind(asset.kind)) return 0;
        return projectFormalFinancials(asset, (financialEvents || []).filter(event => event && event.assetId === asset.id)).acquisitionAmountMinor;
    };
    const compareCurrencyThenAmount = (left, right, descending) => {
        const currencyOrder = String(left.currency).localeCompare(String(right.currency));
        if (currencyOrder !== 0) return currencyOrder;
        const leftAmount = acquisition(left), rightAmount = acquisition(right);
        if (leftAmount === rightAmount) return 0;
        return descending ? (leftAmount < rightAmount ? 1 : -1) : (leftAmount < rightAmount ? -1 : 1);
    };
    switch (sortId) {
        case 'newest':
            return list.sort((a, b) => (b.acquiredOn || '').localeCompare(a.acquiredOn || ''));
        case 'oldest':
            return list.sort((a, b) => (a.acquiredOn || '').localeCompare(b.acquiredOn || ''));
        case 'priceHigh':
            return list.sort((a, b) => compareCurrencyThenAmount(a, b, true));
        case 'priceLow':
            return list.sort((a, b) => compareCurrencyThenAmount(a, b, false));
        case 'nameAsc':
            return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
        case 'default':
        default:
            return list.sort((a, b) => {
                const oa = STATUS_ORDER[a.status] != null ? STATUS_ORDER[a.status] : 9;
                const ob = STATUS_ORDER[b.status] != null ? STATUS_ORDER[b.status] : 9;
                if (oa !== ob) return oa - ob;
                return (b.acquiredOn || '').localeCompare(a.acquiredOn || '');
            });
    }
}

function applyFilter(assets, filter) {
    let list = assets;
    if (filter.kind && filter.kind !== 'all') {
        const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
        list = list.filter(a => kinds.includes(a.kind));
    }
    if (filter.status && filter.status !== 'all') list = list.filter(a => a.status === filter.status);
    if (filter.categoryId && filter.categoryId !== 'all') list = list.filter(a => a.categoryId === filter.categoryId);
    if (filter.search) {
        const q = filter.search.toLowerCase().trim();
        list = list.filter(a => (a.name || '').toLowerCase().includes(q));
    }
    // tagIds and filter.tagIds share the same canonical UUID domain. Selected
    // tags use OR semantics; an empty selection means no tag restriction.
    // v1.3.1-fix：原代码调用不存在的 normalizeTagIds（ReferenceError），导致标签筛选
    // 永远崩溃并污染后续所有 renderDock。改用内联轻量归一化（trim + lowercase），
    // 与 normalizeFormalTagIds 的输出格式一致，但不做严格校验/数量限制。
    if (Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
        const ids = new Set(filter.tagIds.map(id => String(id).trim().toLowerCase()));
        list = list.filter(a => Array.isArray(a.tagIds) && a.tagIds.some(id => ids.has(id)));
    }
    return sortAssets(list, filter.sort || 'default', filter.financialEvents);
}

/**
 * Subscription-aware daily cost — the single source of truth shared by the list
 * card (_formalCardData), the top summary (computeStats) and the report
 * (buildFormalReport) so all three surfaces agree per asset.
 *
 * Only `virtualSubscription` may switch to a period basis:
 *   period   = subscription.currentPeriod || subscription.latestPeriod
 *              (covers subscribed / expired / pendingConfirmation; both endpoints
 *              inclusive, matching getSubscriptionPeriodEnd period semantics)
 *   days     = max(1, daysBetween(period.startDate, period.endDate) + 1)
 *   numerator= the period's non-void payment event amountMinor
 *   daily    = ceil(numerator / days)
 *
 * Every other kind — and any subscription with no usable period or whose payment
 * event is void/missing — falls back to the caller-supplied amortized numerator:
 *   ceil(cashNetAmountMinor / max(1, daysBetween(acquiredOn, referenceDate) + 1))
 * This keeps physical / prepaidAmount / prepaidCount / virtualPerpetual values
 * byte-for-byte unchanged (they always take the amortized branch).
 *
 * @param {object} input
 * @param {string} input.kind                asset kind (FORMAL_ASSET_KIND value)
 * @param {string} input.acquiredOn          YYYY-MM-DD amortized basis start
 * @param {number} input.cashNetAmountMinor  amortized numerator supplied by caller
 * @param {string|Date} input.referenceDate  amortized "today" (YYYY-MM-DD or Date)
 * @param {object|null} input.subscription   projectFormalSubscription output
 * @param {Array}  input.financialEvents     financial records to resolve paymentEventId
 * @returns {{amountMinor: number, basis: 'period'|'amortized'}}
 */
function formalDailyAmountMinor(input) {
    const opts = input || {};
    const cashNetAmountMinor = Number.isSafeInteger(opts.cashNetAmountMinor) ? opts.cashNetAmountMinor : 0;
    const amortizedDays = Math.max(1, daysBetween(opts.acquiredOn, opts.referenceDate) + 1);
    const fallback = { amountMinor: Math.ceil(cashNetAmountMinor / amortizedDays), basis: 'amortized' };
    if (opts.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) return fallback;
    const subscription = opts.subscription;
    if (!subscription) return fallback;
    const period = subscription.currentPeriod || subscription.latestPeriod;
    if (!period || !period.paymentEventId) return fallback;
    const events = Array.isArray(opts.financialEvents) ? opts.financialEvents : [];
    const payment = events.find(event => event && event.id === period.paymentEventId && !event.voidedAt);
    if (!payment || !Number.isSafeInteger(payment.amountMinor)) return fallback;
    const days = Math.max(1, daysBetween(period.startDate, period.endDate) + 1);
    return { amountMinor: Math.ceil(payment.amountMinor / days), basis: 'period' };
}

function computeStats(assets, financialEvents, subscriptionPeriods) {
    const active = assets.filter(a => a.status === 'active');
    const retired = assets.filter(a => a.status === 'retired');
    const wishlist = assets.filter(a => a.status === 'wishlist');
    const byCurrency = Object.create(null);
    const allFinancialEvents = financialEvents || [];
    const allPeriods = subscriptionPeriods || [];
    active.forEach(asset => {
        if (!isFormalKind(asset.kind)) return;
        const assetEvents = allFinancialEvents.filter(event => event && event.assetId === asset.id);
        const projection = projectFormalFinancials(asset, assetEvents);
        const bucket = byCurrency[asset.currency] || { currency: asset.currency, netAmountMinor: 0, dailyAmountMinor: 0, assetCount: 0 };
        bucket.netAmountMinor = safeMinorAdd(bucket.netAmountMinor, projection.cashTotals.netAmountMinor);
        let subscription = null;
        if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
            try {
                subscription = projectFormalSubscription(asset, allPeriods.filter(period => period && period.assetId === asset.id), todayISO());
            } catch (e) { subscription = null; }
        }
        const daily = formalDailyAmountMinor({
            kind: asset.kind,
            acquiredOn: asset.acquiredOn,
            cashNetAmountMinor: projection.cashTotals.netAmountMinor,
            referenceDate: todayISO(),
            subscription: subscription,
            financialEvents: assetEvents,
        });
        bucket.dailyAmountMinor = safeMinorAdd(bucket.dailyAmountMinor, daily.amountMinor);
        bucket.assetCount++;
        byCurrency[asset.currency] = bucket;
    });
    return {
        byCurrency: byCurrency,
        activeCount: active.length,
        retiredCount: retired.length,
        wishlistCount: wishlist.length,
        totalCount: assets.length,
    };
}

module.exports = {
    STATUSES: STATUSES,
    SORTS: SORTS,
    STATUS_MAP: STATUS_MAP,
    SORT_MAP: SORT_MAP,
    STATUS_ORDER: STATUS_ORDER,
    FORMAL_SCHEMA_GENERATION: FORMAL_SCHEMA_GENERATION,
    FORMAL_ASSET_SCHEMA_VERSION: FORMAL_ASSET_SCHEMA_VERSION,
    FORMAL_ASSET_KIND: FORMAL_ASSET_KIND,
    FORMAL_ASSET_KINDS: FORMAL_ASSET_KINDS,
    FORMAL_BILLING_CYCLES: FORMAL_BILLING_CYCLES,
    FORMAL_CATEGORIES: FORMAL_CATEGORIES,
    FORMAL_CATEGORY_IDS: FORMAL_CATEGORY_IDS,
    ASSET_STATUS: ASSET_STATUS,
    FINANCIAL_DIRECTION: FINANCIAL_DIRECTION,
    FINANCIAL_EVENT_TYPE: FINANCIAL_EVENT_TYPE,
    LIFECYCLE_EVENT_TYPE: LIFECYCLE_EVENT_TYPE,
    SUBSCRIPTION_PERIOD_KIND: SUBSCRIPTION_PERIOD_KIND,
    EVENT_SOURCE: EVENT_SOURCE,
    DOMAIN_EVENT_SCHEMA_VERSION: DOMAIN_EVENT_SCHEMA_VERSION,
    FINANCIAL_RECORD_KEYS: FINANCIAL_RECORD_KEYS,
    normalizeCover: normalizeCover,
    normalizeEventEnvelope: normalizeEventEnvelope,
    validateEventEnvelope: validateEventEnvelope,
    normalizeFinancialRecord: normalizeFinancialRecord,
    validateFinancialRecord: validateFinancialRecord,
    validateFinancialReplacementChain: validateFinancialReplacementChain,
    normalizeLifecycleRecord: normalizeLifecycleRecord,
    validateLifecycleRecord: validateLifecycleRecord,
    FORMAL_LIFECYCLE_RECORD_KEYS: FORMAL_LIFECYCLE_RECORD_KEYS,
    validateFormalLifecycleRecord: validateFormalLifecycleRecord,
    validateFormalLifecycleReplacementChain: validateFormalLifecycleReplacementChain,
    normalizeSubscriptionPeriodRecord: normalizeSubscriptionPeriodRecord,
    validateSubscriptionPeriodRecord: validateSubscriptionPeriodRecord,
    validateSubscriptionPeriodsNoOverlap: validateSubscriptionPeriodsNoOverlap,
    addBusinessDays: addBusinessDays,
    addBillingCycle: addBillingCycle,
    getSubscriptionPeriodEnd: getSubscriptionPeriodEnd,
    getFormalNextImportantDate: getFormalNextImportantDate,
    normalizeFormalTagIds: normalizeFormalTagIds,
    normalizeFormalCategoryId: normalizeFormalCategoryId,
    FORMAL_WISHLIST_TARGET_GROUPS: FORMAL_WISHLIST_TARGET_GROUPS,

    FORMAL_V2_SCHEMA_GENERATION: FORMAL_V2_SCHEMA_GENERATION,
    FORMAL_V2_ASSET_SCHEMA_VERSION: FORMAL_V2_ASSET_SCHEMA_VERSION,
    FORMAL_V2_DETAIL_KEYS: FORMAL_V2_DETAIL_KEYS,
    FORMAL_V2_OWNED_KEYS: FORMAL_V2_OWNED_KEYS,
    FORMAL_V2_WISHLIST_KEYS: FORMAL_V2_WISHLIST_KEYS,
    newFormalV2Asset: newFormalV2Asset,
    normalizeFormalV2Asset: normalizeFormalV2Asset,
    validateFormalV2Asset: validateFormalV2Asset,
    normalizeFormalV2AssetPatch: normalizeFormalV2AssetPatch,
    mergeFormalV2AssetPatch: mergeFormalV2AssetPatch,
    createFormalV2AssetWrapper: createFormalV2AssetWrapper,
    validateFormalV2AssetWrapper: validateFormalV2AssetWrapper,
    FORMAL_DISPLAY_GROUP: FORMAL_DISPLAY_GROUP,
    FORMAL_PREPAID_TRANSACTION_TYPES: FORMAL_PREPAID_TRANSACTION_TYPES,
    FORMAL_PREPAID_TRANSACTION_KEYS: FORMAL_PREPAID_TRANSACTION_KEYS,
    isFormalKind: isFormalKind,
    getFormalKind: getFormalKind,
    getFormalDisplayGroup: getFormalDisplayGroup,
    getFormalAcquiredOn: getFormalAcquiredOn,
    getFormalWarrantyEndsOn: getFormalWarrantyEndsOn,
    getFormalExpiryOn: getFormalExpiryOn,
    supportsFormalCostGoal: supportsFormalCostGoal,
    projectFormalSubscription: projectFormalSubscription,
    projectFormalPrepaid: projectFormalPrepaid,
    validateFormalPrepaidTransaction: validateFormalPrepaidTransaction,
    validateFormalUsageRecord: validateFormalUsageRecord,
    projectFormalFinancials: projectFormalFinancials,
    projectFormalCostGoal: projectFormalCostGoal,
    projectFormalCostGoalByDate: projectFormalCostGoalByDate,
    projectFormalAsset: projectFormalAsset,
    sortAssets: sortAssets,
    formalDailyAmountMinor: formalDailyAmountMinor,
    computeStats: computeStats,
    applyFilter: applyFilter,
};
