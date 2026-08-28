/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — storage.js
 *
 * 已实现：
 *   - createStorage(plugin)：plugin.loadData / saveData 包装
 *   - STORAGE_FILES 路径常量（assets/settings/wishlistEvents + 规划占位）
 *   - schemaVersion 迁移框架 migrateFile(name, raw)
 *   - strict formal-v2 snapshots, settings, import/export and reset boundaries
 *   - readOperationLogs/writeOperationLogs（v0.16-T1，M14）
 *   - maintenance-only FIFO：maintenance.json 的读取、校验、增删只触及本文件
 *   - readUsage/writeUsage/readUsageByAsset（v0.16-T4-α，M13 使用记录）
 *   - backup(name) / restore(name, backupName) →  data/storage/petal/siyuan-plugin-asset-management/backups/
 *   - DEFAULT_SETTINGS：preferredCurrency / currencyDisplayMode / notificationsEnabled / notificationDays / schemaVersion
 *   - 官方 Agent 工具权限：总开关默认关闭，查询默认开启；旧 AI 顾问设置只读兼容，不再写回
 *   - 每个正式 sidecar 使用独立 schemaVersion=1 wrapper
 *
 * v0.15-T6：DEFAULT_SETTINGS.currencyDisplayMode = 'native' | 'preferred' | 'dual'
 *   - 'native'   按资产原币种显示（M4 当前实现：UI 用 formatCurrency(x, asset.currency)）
 *   - 'preferred' 统一显示偏好币种（v0.19 接汇率 API 后实现）
 *   - 'dual'    原币种 + 偏好币种双显（v0.19 接汇率 API 后实现）
 *   T6 阶段只实现 'native' 行为；后两个模式占位（下拉存在但行为 fallback 到 native）
 *
 * v2.5.0 阶段1（笔记双链）：DEFAULT_SETTINGS 新增 6 个索引文档配置键
 *   （indexEnabled / indexNotebookId / indexDocPath / indexDocId / indexAutoSync /
 *   indexIncludeCover），总开关默认关；normalizeSettings 对存量 settings 缺键回落默认值
 *
 * M10 MVP：maintenance.json 是维护记录的唯一真值。
 *   - 记录仅含 id/assetId/type/cost/date/note/createdAt，不含 currency
 *   - 历史 currency 仅在读取时忽略；不会因读取被迁移或清空
 *   - mutateMaintenance() 的 FIFO 不读取、写入或联动 assets/ledger/log sidecar
 *
 * v0.16-T4-α（M13）：usage.json 完整接入
 *   - readUsage(): {schemaVersion:1, records:[{id, assetId, date, duration, action, note, createdAt}]}
 *   - writeUsage(records, opts={backup:true})
 *   - readUsageByAsset(assetId)
 *   - USAGE_MAX = 1000
 *
 * v0.17-T1-α（M12）：tags.json 完整接入
 *   - readTags(): {schemaVersion: 1, tags: [{id, label, emoji, color, isSystem}]}
 *   - writeTags(tags, opts={backup:true})：尾部截断到 TAG_MAX
 *   - seedSystemTagsIfMissing()：兼容旧调用的 no-op，标签库允许为空
 *   - TAG_MAX = 200（与 OPERATION_LOG_MAX 同语义，尾部截断）
 *   - 所有正式文件通过同一 WebView 全局 FIFO 串行提交
 *   - 实物「其他」与虚拟「其他」用 label 后缀「·实物/·虚拟」区分（id 命名空间独立）
 *
 * 规划中（STORAGE_FILES 已注册占位，需要 v0.17+ 接入 readXxx/writeXxx）：
 *   - exchangeRates.json
 */

'use strict';

const {
    ASSET_KIND,
    FINANCIAL_EVENT_TYPE,
    normalizeFinancialRecord,
    validateFinancialRecord,
    validateFinancialReplacementChain,
    normalizeLifecycleRecord,
    validateLifecycleRecord,
    validateFormalLifecycleRecord,
    FORMAL_LIFECYCLE_RECORD_KEYS,
    validateFormalLifecycleReplacementChain,
    normalizeSubscriptionPeriodRecord,
    validateSubscriptionPeriodRecord,
    validateSubscriptionPeriodsNoOverlap,
    FORMAL_SCHEMA_GENERATION,
    FORMAL_ASSET_SCHEMA_VERSION,
    FORMAL_V2_SCHEMA_GENERATION,
    FORMAL_V2_ASSET_SCHEMA_VERSION,
    FORMAL_ASSET_KIND,
    FORMAL_WISHLIST_TARGET_GROUPS,
    createFormalV2AssetWrapper,
    validateFormalV2AssetWrapper,
    validateFormalV2Asset,
    validateFormalPrepaidTransaction,
    validateFormalUsageRecord,
} = require('./assets');
const { isUploadCover, DEFAULT_PRESET_ICON_ID, isLegacyIconParkPreset } = require('./media');
const { normalizeResourceIndex } = require('./resource-index');
const { isUUID, isISO4217Currency } = require('./algorithms');
const {
    AGENT_DEFAULT_SETTINGS,
    LEGACY_AGENT_SETTING_KEYS,
    normalizeAgentSettings,
    stripLegacyAgentSettings,
} = require('./agent-actions');

const { safeAsync } = require('./utils');

const STORAGE_FILES = Object.freeze({
    assets: 'assets.json',
    settings: 'settings.json',
    tags: 'tags.json',
    maintenance: 'maintenance.json',
    usage: 'usage.json',
    operationLogs: 'operationLogs.json',
    prepaidTransactions: 'prepaidTransactions.json',
    wishlistEvents: 'wishlistEvents.json',
    financialEvents: 'financialEvents.json',
    lifecycleEvents: 'lifecycleEvents.json',
    subscriptionPeriods: 'subscriptionPeriods.json',
    exchangeRates: 'exchangeRates.json',
    backupsDir: 'backups',
});

// Core startup deliberately has a narrower persistence boundary than the full
// formal domain. These are the only files its initial recovery path may touch.
const CORE_STORAGE_FILES = Object.freeze({
    assets: STORAGE_FILES.assets,
    settings: STORAGE_FILES.settings,
});

// Every mutation that can change a formal-domain file shares this WebView-wide
// FIFO across Plugin instances.
// The coordinator owns only a fulfilled tail; capabilities and close state stay
// on the originating storage instance.
const CORE_ASSETS_COORDINATOR_KEY = Symbol.for(
    'siyuan-plugin-asset-management:data/storage/petal/assets-tags:domain-fifo:v2'
);

function getCoreAssetsCoordinator() {
    const root = globalThis;
    const existing = root[CORE_ASSETS_COORDINATOR_KEY];
    if (existing && existing.tail && typeof existing.tail.then === 'function') {
        return existing;
    }
    const coordinator = { tail: Promise.resolve() };
    root[CORE_ASSETS_COORDINATOR_KEY] = coordinator;
    return coordinator;
}

function enqueueGlobalAssetTagTask(task) {
    const coordinator = getCoreAssetsCoordinator();
    const run = coordinator.tail.then(() => task());
    // Always recover the shared tail. The caller still receives the original
    // rejection, while a later storage instance can continue safely.
    coordinator.tail = run.catch(() => undefined);
    return run;
}

const OPERATION_LOG_MAX = 1000;
const MAINTENANCE_MAX = 1000;     // v0.16-T3-α：维护记录上限（与 OPERATION_LOG_MAX 同语义，尾部截断）
const USAGE_MAX = 1000;           // v0.16-T4-α：使用记录上限（与 OPERATION_LOG_MAX 同语义，尾部截断）
const TAG_MAX = 200;              // v0.17-T1-α（M12）：tag 上限（与 OPERATION_LOG_MAX 同语义，尾部截断）
const PREPAID_TRANSACTION_MAX = 3000;
const TAG_ITEM_KEYS = Object.freeze(['id', 'label', 'emoji', 'color', 'isSystem', 'createdAt']);

const FORMAL_ERROR_CODE = Object.freeze({
    RESET_REQUIRED: 'FORMAL_SCHEMA_RESET_REQUIRED',
    STORAGE_CORRUPT: 'FORMAL_STORAGE_CORRUPT',
    READ_FAILED: 'FORMAL_STORAGE_READ_FAILED',
    ASSET_INVALID: 'FORMAL_ASSET_VALIDATION_FAILED',
    TAG_INVALID: 'FORMAL_TAG_CATALOG_INVALID',
    REFERENCE_INVALID: 'FORMAL_REFERENCE_INTEGRITY_FAILED',
    IMPORT_INVALID: 'FORMAL_IMPORT_INVALID',
    TRANSACTION_FAILED: 'FORMAL_PERSISTENCE_TRANSACTION_FAILED',
    CONFLICT: 'FORMAL_PERSISTENCE_CONFLICT',
});

const FORMAL_BACKUP_FORMAT = 'siyuan-asset-management-backup';
const FORMAL_BACKUP_SCHEMA_VERSION = 1;
// This recovery artifact intentionally preserves storage exactly as read. It is
// not a formal import format and must never pass through formal validation.
const RAW_RESET_BACKUP_FORMAT = 'siyuan-asset-management-raw-reset-backup';
const FORMAL_BACKUP_DATA_KEYS = Object.freeze([
    'assets', 'tags', 'wishlistEvents', 'operationLogs', 'maintenance', 'usage',
    'prepaidTransactions', 'financialEvents', 'lifecycleEvents',
    'subscriptionPeriods', 'exchangeRates',
]);
const FORMAL_BACKUP_SETTING_KEYS = Object.freeze([
    'defaultSort', 'defaultStatus', 'defaultViewMode', 'viewMode', 'matrixCols', 'costGoalMode',
    'preferredCurrency', 'currencyDisplayMode', 'notificationsEnabled',
    'notificationDays', 'notificationIntervalMinutes', 'resourceIndex',
    'markdownExportTarget',
    // v2.3.0 阶段 2：标签取色器用户自定义颜色行（≤10 个 hex 字符串）。
    'customTagColors',
    // v2.5.0 笔记双链阶段1：资产索引文档配置（备份/导入与重置保留均走此白名单）。
    'indexEnabled', 'indexNotebookId', 'indexDocPath', 'indexDocId',
    'indexAutoSync', 'indexIncludeCover',
    // v2.6.4 阶段1：汇率自动刷新开关（备份/导入与重置保留均走此白名单）。
    'exchangeRateAutoRefresh',
    // 旧 2.6 顾问字段继续接受导入，但 normalize 后不会写回。
    'aiEnabled', 'aiPrivacyScope', 'aiIncludeFinancial', 'aiIncludeNotes', 'aiMaxAssets', 'aiLanguage',
    'aiAllowQuery', 'aiAllowCreate', 'aiAllowModify', 'aiAllowLifecycle', 'aiAllowRecords', 'aiAllowDelete',
]);

const FORMAL_SIDECAR_DEFINITIONS = Object.freeze({
    wishlistEvents: Object.freeze({ file: STORAGE_FILES.wishlistEvents, recordKey: 'events' }),
    operationLogs: Object.freeze({ file: STORAGE_FILES.operationLogs, recordKey: 'logs', max: OPERATION_LOG_MAX }),
    maintenance: Object.freeze({ file: STORAGE_FILES.maintenance, recordKey: 'records', max: MAINTENANCE_MAX }),
    usage: Object.freeze({ file: STORAGE_FILES.usage, recordKey: 'records', max: USAGE_MAX }),
    prepaidTransactions: Object.freeze({ file: STORAGE_FILES.prepaidTransactions, recordKey: 'records', max: PREPAID_TRANSACTION_MAX }),
    financialEvents: Object.freeze({ file: STORAGE_FILES.financialEvents, recordKey: 'events' }),
    lifecycleEvents: Object.freeze({ file: STORAGE_FILES.lifecycleEvents, recordKey: 'events' }),
    subscriptionPeriods: Object.freeze({ file: STORAGE_FILES.subscriptionPeriods, recordKey: 'records' }),
    exchangeRates: Object.freeze({ file: STORAGE_FILES.exchangeRates, objectPayload: true }),
});

function formalStorageError(code, message, detail) {
    const error = new Error('[formal-storage] ' + message);
    error.code = code;
    if (detail) Object.assign(error, detail);
    return error;
}

function isMissingStoragePayload(raw) {
    return raw == null || (typeof raw === 'string' && raw.trim() === '');
}

function ownDataValue(object, key) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
}

/**
 * formal-v2 strict wrapper guard. v0.18+ 的读路径唯一入口：
 *  - 仅接受 schemaGeneration === 'formal-v2' / schemaVersion === 1
 *  - 其他 schemaGeneration（包括 'formal-v1'）一律抛 RESET_REQUIRED，
 *    明确文案 "assets.json is not a formal-v2 wrapper; explicit reset is required"
 *    用于 settings dialog 提示用户「reset 才是合法路径」。
 *  - 历史 v1 hasLegacyAssetFields 隐式兼容已移除：v1 数据本身被白名单拒绝。
 */
function assertStrictFormalAssetWrapper(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'assets.json must contain an object wrapper');
    }
    if (raw.schemaGeneration !== FORMAL_V2_SCHEMA_GENERATION || raw.schemaVersion !== FORMAL_V2_ASSET_SCHEMA_VERSION) {
        throw formalStorageError(FORMAL_ERROR_CODE.RESET_REQUIRED,
            'assets.json is not a formal-v2 wrapper; explicit reset is required');
    }
    const validation = validateFormalV2AssetWrapper(raw);
    if (!validation.valid) {
        const structural = validation.errors.some(message => /wrapper contains unknown field|must be an array/.test(message));
        throw formalStorageError(structural ? FORMAL_ERROR_CODE.STORAGE_CORRUPT : FORMAL_ERROR_CODE.ASSET_INVALID,
            'invalid formal asset wrapper: ' + validation.errors.join('; '), { validationErrors: validation.errors.slice() });
    }
    return cloneStorageSnapshot(raw);
}

function readStrictFormalSidecar(raw, key) {
    const definition = FORMAL_SIDECAR_DEFINITIONS[key];
    if (!definition) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'unknown formal sidecar ' + key);
    if (isMissingStoragePayload(raw)) return definition.objectPayload
        ? { schemaVersion: SIDECAR_SCHEMA, baseCurrency: 'CNY', rates: {} }
        : { schemaVersion: SIDECAR_SCHEMA, [definition.recordKey]: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, definition.file + ' must contain an object wrapper');
    }
    if (raw.schemaVersion !== SIDECAR_SCHEMA) {
        throw formalStorageError(FORMAL_ERROR_CODE.RESET_REQUIRED,
            definition.file + ' is not a strict v1 sidecar wrapper');
    }
    if (definition.objectPayload) return assertFormalExchangeRates(raw);
    if (!Array.isArray(raw[definition.recordKey])) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT,
            definition.file + ' must contain a ' + definition.recordKey + ' array');
    }
    const allowed = ['schemaVersion', definition.recordKey, 'updatedAt'];
    const unknown = Object.keys(raw).filter(keyName => allowed.indexOf(keyName) < 0);
    if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT,
        definition.file + ' contains unsupported field ' + unknown[0]);
    return cloneStorageSnapshot(raw);
}

function assertFormalKnownRecordKeys(record, allowed, path) {
    const unknown = Object.keys(record).filter(key => allowed.indexOf(key) < 0);
    if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT,
        path + ' contains unknown field ' + unknown[0]);
}

function assertFormalRecordId(record, path) {
    if (typeof record.id !== 'string' || !isUUID(record.id) || record.id !== record.id.toLowerCase()) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, path + '.id must be a lowercase UUID');
    }
}

function assertFormalOwnedRecord(record, path, owned) {
    if (typeof record.assetId !== 'string' || !isUUID(record.assetId) || record.assetId !== record.assetId.toLowerCase()) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, path + '.assetId must be a lowercase UUID');
    }
    const owner = owned.get(record.assetId);
    if (!owner) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.assetId references no owned asset');
    return owner;
}

function isFormalDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isFormalInstantString(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function assertFormalMaintenance(record, path, owned) {
    assertFormalKnownRecordKeys(record, ['id', 'assetId', 'type', 'date', 'note', 'createdAt', 'financialEventId', 'details'], path);
    const owner = assertFormalOwnedRecord(record, path, owned);
    if (owner.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
    if (record.type !== 'repair' && record.type !== 'maintain') throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.type is invalid');
    if (record.financialEventId !== null && (!isUUID(record.financialEventId) || record.financialEventId !== record.financialEventId.toLowerCase())) {
        throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.financialEventId must be a lowercase UUID or null');
    }
    if (!record.details || typeof record.details !== 'object' || Array.isArray(record.details)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.details must be an object');
    if (Object.keys(record.details).length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.details contains unsupported field ' + Object.keys(record.details)[0]);
    if (!isFormalDateString(record.date)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.date must be YYYY-MM-DD');
    if (typeof record.note !== 'string' || !isFormalInstantString(record.createdAt)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid note or createdAt');
}

function isFormalOptionalAmountMinor(value) {
    return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function assertFormalWishlistEvent(record, path, owned) {
    assertFormalKnownRecordKeys(record, ['id', 'eventType', 'sourceWishlistId', 'targetAssetId', 'targetKind', 'sourceTargetGroup',
        'occurredAt', 'financialEventId', 'abandonReason', 'currency', 'expectedAmountMinor', 'previousAmountMinor', 'sourceSnapshot'], path);
    if (record.eventType !== 'purchased' && record.eventType !== 'abandoned' && record.eventType !== 'expectedPriceChanged' && record.eventType !== 'heartbeat') throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.eventType is invalid');
    if (!isUUID(record.sourceWishlistId) || record.sourceWishlistId !== record.sourceWishlistId.toLowerCase()) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.sourceWishlistId must be a lowercase UUID');
    if (!Object.values(FORMAL_ASSET_KIND).includes(record.targetKind)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.targetKind is invalid');
    if (!isFormalInstantString(record.occurredAt)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.occurredAt must be a UTC ISO timestamp');
    // v0.18 fail-closed：sourceSnapshot 必须按 v2 形态校验（v2 wishlist 已移除
    // categoryId/tagIds/notes/reminderPolicy，v1 validateFormalAsset 会假报）。
    const snapshotValidation = validateFormalV2Asset(record.sourceSnapshot);
    if (!snapshotValidation.valid || record.sourceSnapshot.status !== 'wishlist'
        || record.sourceSnapshot.id !== record.sourceWishlistId
        || record.sourceSnapshot.wishlist.targetGroup !== record.sourceTargetGroup) {
        throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.sourceSnapshot must be the canonical source wishlist asset');
    }
    if (!FORMAL_WISHLIST_TARGET_GROUPS.includes(record.sourceTargetGroup)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.sourceTargetGroup is invalid');
    if (record.eventType === 'purchased') {
        if (!isUUID(record.targetAssetId)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.targetAssetId must be a UUID');
        const target = owned.get(record.targetAssetId);
        if (target && target.kind !== record.targetKind) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.targetKind does not match target asset');
        const targetGroup = record.targetKind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
            : (record.targetKind.indexOf('virtual') === 0 ? 'virtual' : 'prepaid');
        if (targetGroup !== record.sourceTargetGroup) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.targetKind is incompatible with sourceTargetGroup');
        if (target && record.currency !== target.currency) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.currency must match target asset');
        if (!isUUID(record.financialEventId) || record.financialEventId !== record.financialEventId.toLowerCase()) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.financialEventId must be a lowercase UUID');
    } else if (record.eventType === 'abandoned') {
        if (record.targetAssetId !== null || typeof record.abandonReason !== 'string') {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid abandonment fields');
        }
    } else if (record.eventType === 'expectedPriceChanged') {
        // v2.4.1 种草期望价变化历史：无目标资产、无财务事件、无拔草理由；
        // wishlist 游离于 operationLogs sidecar 之外，事件本身即审计轨迹。
        if (record.targetAssetId !== null || record.financialEventId !== null || record.abandonReason !== null) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid expectedPriceChanged fields');
        }
        if (record.currency !== record.sourceSnapshot.currency) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.currency must match sourceSnapshot');
        if (!isFormalOptionalAmountMinor(record.expectedAmountMinor)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.expectedAmountMinor must be null or a non-negative safe integer');
        if (!isFormalOptionalAmountMinor(record.previousAmountMinor)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.previousAmountMinor must be null or a non-negative safe integer');
    } else if (record.eventType === 'heartbeat') {
        // v2.4.2 心动值计数事件：无目标资产、无财务事件、无拔草理由、无金额
        // 变化；计数完全由事件流派生，主表不落缓存。wishlist 游离于
        // operationLogs sidecar 之外，事件本身即审计轨迹。
        if (record.targetAssetId !== null || record.financialEventId !== null || record.abandonReason !== null
            || record.expectedAmountMinor !== null || record.previousAmountMinor !== null) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid heartbeat fields');
        }
        if (record.currency !== record.sourceSnapshot.currency) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.currency must match sourceSnapshot');
    }
    if (record.eventType === 'abandoned' && record.currency !== record.sourceSnapshot.currency) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.currency must match sourceSnapshot');
}

function assertFormalOperationAssetSnapshot(value, path, expected) {
    // v0.18 fail-closed：operation log 嵌入的 asset 快照也必须是 v2 形态
    // （v2 已无 reminderPolicy/dailyCostOverrideMinor）。
    const result = validateFormalV2Asset(value);
    if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID,
        path + ' must be a canonical formal-v2 asset snapshot');
    if (expected.id != null && value.id !== expected.id) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.id does not match operation log');
    if (expected.name != null && value.name !== expected.name) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.name does not match operation log');
    if (expected.kind != null && value.kind !== expected.kind) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.kind does not match operation log');
    if (expected.status != null && value.status !== expected.status) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.status does not match operation log');
    return value;
}

function getCanonicalFormalOperationSnapshot(value) {
    // v0.18 fail-closed：v2 严格校验，返回 v2 canonical 快照。
    const validation = validateFormalV2Asset(value);
    return validation.valid ? value : null;
}

function assertFormalOperationLog(record, path, owned, wishlistIds, tagsById, records, recordIndex) {
    assertFormalKnownRecordKeys(record, ['id', 'type', 'assetId', 'assetName', 'field', 'oldValue', 'newValue', 'ts'], path);
    if (typeof record.assetId !== 'string' || !isUUID(record.assetId) || record.assetId !== record.assetId.toLowerCase()) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, path + '.assetId must be a lowercase UUID');
    }
    // physical-retire / physical-sale (retirePhysicalAsset / recordPhysicalSaleAsset) and
    // subscription-auto-renew-toggle (toggleSubscriptionAutoRenew) carry raw oldValue/newValue.
    const ordinary = ['add', 'update', 'set-status', 'restore', 'status-restore',
        'subscription-renew', 'subscription-cancel', 'subscription-skip', 'subscription-reopen', 'subscription-auto-renew-toggle',
        'physical-retire', 'physical-sale',
        'maintenance-add', 'maintenance-delete', 'usage-add', 'usage-delete',
        'prepaid-inflow', 'prepaid-outflow', 'prepaid-refund', 'prepaid-adjust'];
    const purchase = record.type === 'wishlist-to-active' || record.type === 'wishlist-purchase';
    const tagOperation = record.type === 'tag-create' || record.type === 'tag-delete';
    const tagStyleUpdate = record.type === 'tag-update';
    const hasHistoricalOwnerName = (owner, historicalName) => {
        if (owner.name === historicalName) return true;
        let expectedName = historicalName;
        let proofTime = Date.parse(record.ts);
        for (let index = recordIndex - 1; index >= 0; index--) {
            const candidate = records[index];
            if (!candidate || candidate.type !== 'update' || candidate.assetId !== owner.id
                || !isFormalInstantString(candidate.ts)) continue;
            const candidateTime = Date.parse(candidate.ts);
            if (candidateTime < proofTime) continue;
            const oldSnapshot = getCanonicalFormalOperationSnapshot(candidate.oldValue);
            const newSnapshot = getCanonicalFormalOperationSnapshot(candidate.newValue);
            if (!oldSnapshot || !newSnapshot || oldSnapshot.id !== owner.id || newSnapshot.id !== owner.id
                || oldSnapshot.kind !== owner.kind || newSnapshot.kind !== owner.kind
                || oldSnapshot.status === 'wishlist' || newSnapshot.status === 'wishlist'
                || oldSnapshot.name === newSnapshot.name || candidate.assetName !== newSnapshot.name
                || oldSnapshot.name !== expectedName) continue;
            expectedName = newSnapshot.name;
            proofTime = candidateTime;
            if (expectedName === owner.name) return true;
        }
        return false;
    };
    if (ordinary.indexOf(record.type) < 0 && record.type !== 'delete'
        && record.type !== 'wishlist-abandon' && !purchase && !tagOperation && !tagStyleUpdate) {
        throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.type is invalid');
    }
    if (typeof record.assetName !== 'string' || (record.field !== null && typeof record.field !== 'string') || !isFormalInstantString(record.ts)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid metadata');
    if (tagStyleUpdate) {
        // v2.3.0 阶段 2：tag-update 只允许 color 样式变更；身份（id + label）不可变。
        // oldValue / newValue 为 null 或 trim 后的颜色字符串（'' 表示清除颜色）。
        if (record.field !== 'color') {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.field must be "color" for tag-update');
        }
        const validColorValue = value => value === null || (typeof value === 'string' && value === value.trim());
        if (!validColorValue(record.oldValue) || !validColorValue(record.newValue)) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' tag-update values must be null or trimmed color strings');
        }
        const current = tagsById && tagsById.get(record.assetId);
        if (current && current.label !== record.assetName) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' tag-update does not match the current tag');
        }
        return;
    }
    if (tagOperation) {
        const snapshot = record.type === 'tag-create' ? record.newValue : record.oldValue;
        let normalized;
        try { normalized = normalizeTagDirectory([snapshot])[0]; }
        catch (cause) { throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' has invalid tag snapshot: ' + cause.message); }
        if (normalized.id !== record.assetId || normalized.label !== record.assetName || record.field !== null) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' tag snapshot does not match operation log');
        }
        // v2.3.0 阶段 2：tag-update 允许颜色在创建之后漂移，因此 create/delete 链的
        // 身份证明从全量 JSON 相等放宽为 id + label 身份相等（样式字段不参与）。
        const sameTagIdentity = value => !!value && value.id === normalized.id && value.label === normalized.label;
        if (record.type === 'tag-create') {
            const current = tagsById && tagsById.get(record.assetId);
            const terminalDelete = (records || []).find(candidate => candidate && candidate.type === 'tag-delete'
                && candidate.assetId === record.assetId && candidate.assetName === record.assetName
                && sameTagIdentity(candidate.oldValue)
                && isFormalInstantString(candidate.ts) && Date.parse(candidate.ts) >= Date.parse(record.ts));
            if ((!current || !sameTagIdentity(current)) && !terminalDelete || record.oldValue !== null) {
                throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' does not match the current tag');
            }
        } else if (record.newValue !== null) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.newValue must be null for tag-delete');
        }
        return;
    }
    if (ordinary.indexOf(record.type) >= 0) {
        if (wishlistIds && wishlistIds.has(record.assetId)) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.assetId references a wishlist asset');
        const owner = owned.get(record.assetId);
        if (owner) {
            if (!hasHistoricalOwnerName(owner, record.assetName)) {
                throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.assetName does not match owner or canonical snapshot');
            }
            return;
        }
        const snapshots = [getCanonicalFormalOperationSnapshot(record.oldValue), getCanonicalFormalOperationSnapshot(record.newValue)].filter(Boolean);
        snapshots.forEach((snapshot, index) => {
            if (snapshot.id !== record.assetId || snapshot.status === 'wishlist') {
                throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.snapshot[' + index + '] does not prove the historical owner');
            }
        });
        if (snapshots.length && !snapshots.some(snapshot => snapshot.name === record.assetName)) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.assetName does not match a canonical historical snapshot');
        }
        if (snapshots.length > 1 && (snapshots[0].id !== snapshots[1].id || snapshots[0].kind !== snapshots[1].kind)) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has inconsistent historical snapshots');
        }
        if (record.type === 'update' && snapshots.length > 1 && snapshots[0].status !== snapshots[1].status) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' update snapshots have inconsistent status');
        }
        const terminalDelete = (records || []).find((candidate, index) => {
            if (index === recordIndex || !candidate || candidate.type !== 'delete'
                || candidate.assetId !== record.assetId || candidate.assetName !== record.assetName
                || !isFormalInstantString(candidate.ts) || Date.parse(candidate.ts) < Date.parse(record.ts)) return false;
            const deleteSnapshot = getCanonicalFormalOperationSnapshot(candidate.oldValue);
            return !!deleteSnapshot && deleteSnapshot.id === candidate.assetId
                && deleteSnapshot.name === candidate.assetName && deleteSnapshot.status !== 'wishlist';
        });
        if (terminalDelete && snapshots.length && terminalDelete.oldValue.kind !== snapshots[0].kind) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' does not match its terminal delete snapshot');
        }
        if (!snapshots.length && !terminalDelete) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.assetId has no owner or canonical historical proof');
        }
        return;
    }
    if (record.type === 'delete') {
        assertFormalOperationAssetSnapshot(record.oldValue, path + '.oldValue', {
            id: record.assetId, name: record.assetName, status: record.oldValue && record.oldValue.status,
            kind: record.oldValue && record.oldValue.kind,
        });
        if (record.oldValue.status === 'wishlist') throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.oldValue must be an owned asset');
        return;
    }
    if (record.type === 'wishlist-abandon') {
        assertFormalOperationAssetSnapshot(record.oldValue, path + '.oldValue', {
            id: record.assetId, name: record.assetName, status: 'wishlist',
            kind: record.oldValue && record.oldValue.kind,
        });
        return;
    }
    const source = assertFormalOperationAssetSnapshot(record.oldValue, path + '.oldValue', {
        id: record.assetId, name: record.assetName, status: 'wishlist',
        kind: record.oldValue && record.oldValue.kind,
    });
    const target = assertFormalOperationAssetSnapshot(record.newValue, path + '.newValue', {
        status: record.newValue && record.newValue.status,
    });
    const sourceGroup = source.wishlist.targetGroup;
    const targetGroup = target.kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
        : (target.kind.indexOf('virtual') === 0 ? 'virtual' : 'prepaid');
    if (sourceGroup !== targetGroup) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.newValue kind is incompatible with wishlist targetGroup');
    if (target.status === 'wishlist') throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.newValue must be an owned asset');
    const owner = owned.get(target.id);
    const ownerMatches = !!owner && owner.kind === target.kind;
    const terminalDelete = (records || []).find((candidate, index) => {
        if (!candidate || candidate.type !== 'delete' || candidate.assetId !== target.id
            || !isFormalInstantString(candidate.ts)) return false;
        const candidateTime = Date.parse(candidate.ts);
        const recordTime = Date.parse(record.ts);
        if (candidateTime < recordTime || (candidateTime === recordTime && index >= recordIndex)) return false;
        const deleteSnapshot = getCanonicalFormalOperationSnapshot(candidate.oldValue);
        return !!deleteSnapshot && deleteSnapshot.id === target.id
            && deleteSnapshot.kind === target.kind && deleteSnapshot.status !== 'wishlist'
            && candidate.assetName === deleteSnapshot.name;
    });
    if (!ownerMatches && !terminalDelete) {
        throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.newValue does not match the current target owner');
    }
}

function assertFormalExchangeRates(raw) {
    // v2.6.4 阶段1：source（'auto'|'manual'）进白名单；缺键容忍（≤2.6.3 存量无此字段）。
    const allowed = ['schemaVersion', 'baseCurrency', 'rates', 'updatedAt', 'source'];
    const unknown = Object.keys(raw).filter(key => allowed.indexOf(key) < 0);
    if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json contains unsupported field ' + unknown[0]);
    if (!isISO4217Currency(raw.baseCurrency) || raw.baseCurrency !== raw.baseCurrency.trim().toUpperCase()) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json baseCurrency is invalid');
    if (!raw.rates || typeof raw.rates !== 'object' || Array.isArray(raw.rates)) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json rates must be an object');
    Object.keys(raw.rates).forEach(currency => {
        if (!isISO4217Currency(currency) || currency !== currency.trim().toUpperCase()
            || !Number.isFinite(raw.rates[currency]) || raw.rates[currency] <= 0) {
            throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json contains an invalid rate');
        }
    });
    if (raw.updatedAt != null && !isFormalInstantString(raw.updatedAt)) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json updatedAt is invalid');
    if (raw.source != null && raw.source !== 'auto' && raw.source !== 'manual') throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates.json source is invalid');
    return cloneStorageSnapshot(raw);
}

function assertFormalDomainSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'snapshot must be an object');
    }
    const wrapper = assertStrictFormalAssetWrapper(snapshot.assets);
    let tags;
    const tagWrapper = snapshot.tags;
    if (!tagWrapper || typeof tagWrapper !== 'object' || Array.isArray(tagWrapper) || !Array.isArray(tagWrapper.tags)) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'tags wrapper must be an object with a tags array');
    }
    if (tagWrapper.schemaVersion !== SIDECAR_SCHEMA) {
        throw formalStorageError(FORMAL_ERROR_CODE.RESET_REQUIRED, 'tags wrapper must use schemaVersion 1');
    }
    const unknownTagWrapperKeys = Object.keys(tagWrapper).filter(key => ['schemaVersion', 'tags', 'updatedAt'].indexOf(key) < 0);
    if (unknownTagWrapperKeys.length) {
        throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT,
            'tags wrapper contains unknown field ' + unknownTagWrapperKeys[0]);
    }
    try {
        tags = normalizeTagDirectory(tagWrapper.tags);
    } catch (cause) {
        throw formalStorageError(FORMAL_ERROR_CODE.TAG_INVALID, cause.message, { cause: cause });
    }
    try {
        assertAssetTagReferences(wrapper.assets, tags);
    } catch (cause) {
        throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, cause.message, { cause: cause });
    }

    const owned = new Map();
    const wishlistIds = new Set();
    const tagsById = new Map();
    const globalIds = new Set();
    wrapper.assets.forEach((asset, index) => {
        // v0.18 fail-closed：assertStrictFormalAssetWrapper 已强制 schemaGeneration
        // 为 'formal-v2'，因此此处的 assets 必然是 v2 形态；以 validateFormalV2Asset
        // 校验而非 v1 validateFormalAsset（v2 资产不再含 reminderPolicy 等 v1 字段）。
        const validation = validateFormalV2Asset(asset);
        if (!validation.valid) throw formalStorageError(FORMAL_ERROR_CODE.ASSET_INVALID,
            'assets[' + index + '] is invalid: ' + validation.errors.join('; '));
        if (globalIds.has(asset.id)) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'duplicate global id ' + asset.id);
        globalIds.add(asset.id);
        if (asset.status !== 'wishlist') owned.set(asset.id, asset);
        else wishlistIds.add(asset.id);
    });
    tags.forEach(tag => {
        if (globalIds.has(tag.id)) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'duplicate global id ' + tag.id);
        globalIds.add(tag.id);
        tagsById.set(tag.id, tag);
    });

    const sidecars = {};
    Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
        const payload = readStrictFormalSidecar(snapshot[key], key);
        const definition = FORMAL_SIDECAR_DEFINITIONS[key];
        if (definition.objectPayload) {
            sidecars[key] = cloneStorageSnapshot(payload);
            return;
        }
        const records = payload[definition.recordKey];
        records.forEach((record, index) => {
            const path = key + '[' + index + ']';
            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, path + ' must be an object');
            }
            assertFormalRecordId(record, path);
            if (globalIds.has(record.id)) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'duplicate global id ' + record.id);
            globalIds.add(record.id);
            if (key === 'wishlistEvents') {
                assertFormalWishlistEvent(record, path, owned);
                return;
            }
            if (key === 'maintenance') assertFormalMaintenance(record, path, owned);
            if (key === 'operationLogs') {
                assertFormalOperationLog(record, path, owned, wishlistIds, tagsById, records, index);
                return;
            }
            const owner = assertFormalOwnedRecord(record, path, owned);
            if (key === 'subscriptionPeriods') {
                assertFormalKnownRecordKeys(record, ['id', 'schemaVersion', 'assetId', 'occurredAt', 'effectiveDate', 'createdAt',
                    'source', 'correlationId', 'note', 'metadata', 'replacesEventId', 'voidedAt', 'kind', 'startDate', 'endDate', 'paymentEventId'], path);
                if (owner.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
                }
                const result = validateSubscriptionPeriodRecord(record);
                if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' is invalid: ' + result.errors.join('; '));
            }
            if (key === 'prepaidTransactions') {
                assertFormalKnownRecordKeys(record, ['id', 'assetId', 'type', 'dimension', 'direction', 'count',
                    'effectiveDate', 'occurredAt', 'createdAt', 'note', 'financialEventId'], path);
                if (owner.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT && owner.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
                }
                const result = validateFormalPrepaidTransaction(record, owner);
                if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' is invalid: ' + result.errors.join('; '));
            }
            if (key === 'usage') {
                assertFormalKnownRecordKeys(record, ['id', 'assetId', 'date', 'durationMinutes', 'action', 'note', 'createdAt'], path);
                const result = validateFormalUsageRecord(record, owner);
                if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' is invalid: ' + result.errors.join('; '));
            }
            if (key === 'financialEvents') {
                assertFormalKnownRecordKeys(record, ['id', 'schemaVersion', 'assetId', 'occurredAt', 'effectiveDate', 'createdAt',
                    'source', 'correlationId', 'note', 'metadata', 'replacesEventId', 'voidedAt', 'direction', 'eventType',
                    'currency', 'amountMinor'], path);
                const result = validateFinancialRecord(record);
                if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' is invalid: ' + result.errors.join('; '));
                if (record.currency !== owner.currency) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' currency does not match its owner');
                if (record.eventType === FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT
                    && owner.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
                }
                if ((record.eventType === FINANCIAL_EVENT_TYPE.PREPAID_CHARGE
                    || record.eventType === FINANCIAL_EVENT_TYPE.PREPAID_CONSUMPTION)
                    && owner.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT
                    && owner.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
                }
                if (record.eventType === FINANCIAL_EVENT_TYPE.MAINTENANCE && owner.kind !== FORMAL_ASSET_KIND.PHYSICAL) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' has incompatible owner kind');
                }
                if (record.eventType === FINANCIAL_EVENT_TYPE.PURCHASE && owner.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                    throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + ' subscriptions use subscriptionPayment events');
                }
            }
            if (key === 'lifecycleEvents') {
                assertFormalKnownRecordKeys(record, FORMAL_LIFECYCLE_RECORD_KEYS, path);
                const result = validateFormalLifecycleRecord(record);
                if (!result.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + ' is invalid: ' + result.errors.join('; '));
                if (!record.details || typeof record.details !== 'object' || Array.isArray(record.details)) {
                    throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, path + '.details must be an object');
                }
            }
        });
        if (key === 'subscriptionPeriods') {
            const overlap = validateSubscriptionPeriodsNoOverlap(records);
            if (!overlap.valid) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID,
                key + ' is invalid: ' + overlap.errors.join('; '));
        }
        if (key === 'financialEvents') {
            const chain = validateFinancialReplacementChain(records);
            if (!chain.valid) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID,
                'financialEvents replacement chain is invalid: ' + chain.errors.join('; '));
        }
        if (key === 'lifecycleEvents') {
            const chain = validateFormalLifecycleReplacementChain(records);
            if (!chain.valid) throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID,
                'lifecycleEvents replacement chain is invalid: ' + chain.errors.join('; '));
        }
        sidecars[key] = records.slice();
    });
    const financialById = new Map(sidecars.financialEvents.map(event => [event.id, event]));
    const prepaidFinancialLinks = new Map();
    const assertFinancialLink = (record, field, expectedType, path) => {
        if (record[field] == null) return;
        const event = financialById.get(record[field]);
        const owner = owned.get(record.assetId);
        if (!event || event.assetId !== record.assetId || event.voidedAt || event.currency !== owner.currency
            || (expectedType && event.eventType !== expectedType)) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, path + '.' + field + ' references no compatible financial event');
        }
    };
    sidecars.maintenance.forEach((record, index) => assertFinancialLink(record, 'financialEventId', FINANCIAL_EVENT_TYPE.MAINTENANCE, 'maintenance[' + index + ']'));
    sidecars.subscriptionPeriods.forEach((record, index) => {
        if (record.paymentEventId == null) return;
        const event = financialById.get(record.paymentEventId);
        if (!event || event.assetId !== record.assetId
            || event.eventType !== FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT || event.direction !== 'outflow'
            || event.currency !== owned.get(record.assetId).currency || event.voidedAt) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'subscriptionPeriods[' + index + '].paymentEventId references no compatible financial event');
        }
    });
    sidecars.prepaidTransactions.forEach((record, index) => {
        if (record.dimension === 'count' && record.financialEventId == null) return;
        if (prepaidFinancialLinks.has(record.financialEventId)) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID,
                'prepaidTransactions[' + index + '].financialEventId is already linked by prepaidTransactions['
                + prepaidFinancialLinks.get(record.financialEventId) + ']');
        }
        prepaidFinancialLinks.set(record.financialEventId, index);
        const event = financialById.get(record.financialEventId);
        const expectedTypes = record.type === 'opening' ? [FINANCIAL_EVENT_TYPE.PURCHASE, FINANCIAL_EVENT_TYPE.ADJUSTMENT]
            : (record.type === 'inflow' ? [FINANCIAL_EVENT_TYPE.PREPAID_CHARGE]
                : (record.type === 'outflow' ? [FINANCIAL_EVENT_TYPE.PREPAID_CONSUMPTION]
                    : (record.type === 'refund' ? [FINANCIAL_EVENT_TYPE.REFUND] : [FINANCIAL_EVENT_TYPE.ADJUSTMENT])));
        const expectedDirection = record.type === 'refund' ? 'inflow'
            : (record.type === 'inflow' || (event && event.eventType === FINANCIAL_EVENT_TYPE.PURCHASE) ? 'outflow' : record.direction);
        const mustBeNonCash = record.type === 'outflow' || record.type === 'adjust'
            || (event && event.eventType === FINANCIAL_EVENT_TYPE.ADJUSTMENT);
        if (!event || event.assetId !== record.assetId || event.currency !== owned.get(record.assetId).currency
            || expectedTypes.indexOf(event.eventType) < 0 || event.direction !== expectedDirection || event.voidedAt
            || event.effectiveDate !== record.effectiveDate
            || (mustBeNonCash && event.metadata.affectsCash !== false)) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'prepaidTransactions[' + index + '].financialEventId has incompatible semantics');
        }
    });
    sidecars.wishlistEvents.forEach((record, index) => {
        if (record.eventType !== 'purchased') return;
        const event = financialById.get(record.financialEventId);
        const target = owned.get(record.targetAssetId);
        const expectedType = target && target.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            ? FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT : FINANCIAL_EVENT_TYPE.PURCHASE;
        if (!event || event.assetId !== record.targetAssetId || event.eventType !== expectedType
            || event.direction !== 'outflow' || event.currency !== record.currency || event.voidedAt) {
            throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, 'wishlistEvents[' + index + '].financialEventId references no compatible financial event');
        }
    });
    return { assets: wrapper, tags: { schemaVersion: SIDECAR_SCHEMA, tags: tags }, sidecars: sidecars };
}

function validateFormalImportSnapshot(snapshot) {
    try {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup root must be an object');
        }
        const allowed = ['format', 'schemaGeneration', 'schemaVersion', 'exportedAt', 'pluginVersion', 'data', 'settings'];
        const unknown = Object.keys(snapshot).filter(key => allowed.indexOf(key) < 0);
        if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup contains unknown field ' + unknown[0]);
        // v0.18 入口接受 formal-v1 或 formal-v2 schemaGeneration；无论哪种，
        // 内部 data.assets 都由 assertStrictFormalAssetWrapper 统一以 v2 严格
        // 校验。v1 backup 的内部 assets 本质上不会是 v2 数据，因此会被内层
        // 拒绝。这与 storage 读路径的 fail-closed 语义一致。
        if (snapshot.format !== FORMAL_BACKUP_FORMAT
            || (snapshot.schemaGeneration !== FORMAL_SCHEMA_GENERATION
                && snapshot.schemaGeneration !== FORMAL_V2_SCHEMA_GENERATION)
            || snapshot.schemaVersion !== FORMAL_BACKUP_SCHEMA_VERSION) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'only the current formal-v1 or formal-v2 backup format is accepted');
        }
        if (!isFormalInstantString(snapshot.exportedAt) || typeof snapshot.pluginVersion !== 'string' || !snapshot.pluginVersion.trim()) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup metadata is invalid');
        }
        if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup.data must be an object');
        }
        const unknownData = Object.keys(snapshot.data).filter(key => FORMAL_BACKUP_DATA_KEYS.indexOf(key) < 0);
        const missingData = FORMAL_BACKUP_DATA_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(snapshot.data, key));
        if (unknownData.length || missingData.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID,
            unknownData.length ? 'backup.data contains unknown domain ' + unknownData[0] : 'backup.data is missing domain ' + missingData[0]);
        const domain = assertFormalDomainSnapshot(snapshot.data);
        return { valid: true, snapshot: {
            format: FORMAL_BACKUP_FORMAT, schemaGeneration: snapshot.schemaGeneration,
            schemaVersion: FORMAL_BACKUP_SCHEMA_VERSION, exportedAt: snapshot.exportedAt,
            pluginVersion: snapshot.pluginVersion, data: cloneFormalDomainWrappers(domain),
            settings: validateFormalBackupSettings(snapshot.settings),
        }, errors: [] };
    } catch (error) {
        return { valid: false, snapshot: null, errors: [error.message], code: error.code || FORMAL_ERROR_CODE.IMPORT_INVALID };
    }
}

/**
 * v2 严格备份导入校验（v0.18 阶段 8 切换目标）：只接受 schemaGeneration
 * === 'formal-v2'。v1 备份在 v2 体系中不再可被导入 — 任何 v1 备份必须在导入
 * 之前用 explicit reset 路径清掉，再由用户用 v2 工具重新导出。
 */
function validateFormalV2ImportSnapshot(snapshot) {
    try {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup root must be an object');
        }
        const allowed = ['format', 'schemaGeneration', 'schemaVersion', 'exportedAt', 'pluginVersion', 'data', 'settings'];
        const unknown = Object.keys(snapshot).filter(key => allowed.indexOf(key) < 0);
        if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup contains unknown field ' + unknown[0]);
        if (snapshot.format !== FORMAL_BACKUP_FORMAT
            || snapshot.schemaGeneration !== FORMAL_V2_SCHEMA_GENERATION
            || snapshot.schemaVersion !== FORMAL_BACKUP_SCHEMA_VERSION) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'only the current formal-v2 backup format is accepted');
        }
        if (!isFormalInstantString(snapshot.exportedAt) || typeof snapshot.pluginVersion !== 'string' || !snapshot.pluginVersion.trim()) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup metadata is invalid');
        }
        if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
            throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup.data must be an object');
        }
        const unknownData = Object.keys(snapshot.data).filter(key => FORMAL_BACKUP_DATA_KEYS.indexOf(key) < 0);
        const missingData = FORMAL_BACKUP_DATA_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(snapshot.data, key));
        if (unknownData.length || missingData.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID,
            unknownData.length ? 'backup.data contains unknown domain ' + unknownData[0] : 'backup.data is missing domain ' + missingData[0]);
        const domain = assertFormalDomainSnapshot(snapshot.data);
        return { valid: true, snapshot: {
            format: FORMAL_BACKUP_FORMAT, schemaGeneration: FORMAL_V2_SCHEMA_GENERATION,
            schemaVersion: FORMAL_BACKUP_SCHEMA_VERSION, exportedAt: snapshot.exportedAt,
            pluginVersion: snapshot.pluginVersion, data: cloneFormalDomainWrappers(domain),
            settings: validateFormalBackupSettings(snapshot.settings),
        }, errors: [] };
    } catch (error) {
        return { valid: false, snapshot: null, errors: [error.message], code: error.code || FORMAL_ERROR_CODE.IMPORT_INVALID };
    }
}

function validateFormalBackupSettings(value, allowStorageMetadata) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup.settings must be an object');
    }
    const unknown = Object.keys(value).filter(key => FORMAL_BACKUP_SETTING_KEYS.indexOf(key) < 0
        && !(allowStorageMetadata === true && (key === 'schemaVersion' || key === 'updatedAt')));
    if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'backup.settings contains unsupported field ' + unknown[0]);
    const normalized = normalizeSettings(cloneStorageSnapshot(value));
    const resource = normalizeResourceIndex(value.resourceIndex);
    const markdown = normalized.markdownExportTarget || {};
    return {
        defaultSort: normalized.defaultSort, defaultStatus: normalized.defaultStatus,
        defaultViewMode: normalized.defaultViewMode, viewMode: normalized.viewMode,
        matrixCols: normalized.matrixCols,
        preferredCurrency: normalized.preferredCurrency, currencyDisplayMode: normalized.currencyDisplayMode,
        notificationsEnabled: normalized.notificationsEnabled, notificationDays: normalized.notificationDays.slice(),
        notificationIntervalMinutes: normalized.notificationIntervalMinutes,
        resourceIndex: { notebookId: resource.notebookId, documentId: resource.documentId, documentTitle: resource.documentTitle },
        markdownExportTarget: { notebookId: markdown.notebookId, documentId: markdown.documentId, documentTitle: markdown.documentTitle },
        customTagColors: normalized.customTagColors.slice(),
        // v2.5.0 笔记双链阶段1：索引文档配置随备份/导入往返（值已由 normalizeSettings 归一）。
        indexEnabled: normalized.indexEnabled,
        indexNotebookId: normalized.indexNotebookId,
        indexDocPath: normalized.indexDocPath,
        indexDocId: normalized.indexDocId,
        indexAutoSync: normalized.indexAutoSync,
        indexIncludeCover: normalized.indexIncludeCover,
        // v2.6.4 阶段1：汇率自动刷新开关随备份/导入往返（值已由 normalizeSettings 归一）。
        exchangeRateAutoRefresh: normalized.exchangeRateAutoRefresh,
        aiEnabled: normalized.aiEnabled,
        aiAllowQuery: normalized.aiAllowQuery,
        aiAllowCreate: normalized.aiAllowCreate,
        aiAllowModify: normalized.aiAllowModify,
        aiAllowLifecycle: normalized.aiAllowLifecycle,
        aiAllowRecords: normalized.aiAllowRecords,
        aiAllowDelete: normalized.aiAllowDelete,
    };
}

function cloneFormalDomainWrappers(validated) {
    const result = { assets: cloneStorageSnapshot(validated.assets), tags: cloneStorageSnapshot(validated.tags) };
    Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
        const definition = FORMAL_SIDECAR_DEFINITIONS[key];
        result[key] = definition.objectPayload ? cloneStorageSnapshot(validated.sidecars[key])
            : { schemaVersion: SIDECAR_SCHEMA, [definition.recordKey]: validated.sidecars[key].map(cloneStorageSnapshot) };
    });
    return result;
}

function createFormalResetSnapshot(options) {
    const now = options && options.updatedAt ? options.updatedAt : new Date().toISOString();
    const snapshot = {
        // v0.18 fail-closed: reset 之后必须立刻能通过 v2 严格校验，因此 assets
        // wrapper 从 v1 (FORMAL_SCHEMA_GENERATION) 切到 v2 (FORMAL_V2_SCHEMA_GENERATION)。
        assets: createFormalV2AssetWrapper([], { updatedAt: now }),
        tags: { schemaVersion: SIDECAR_SCHEMA, tags: [], updatedAt: now },
    };
    Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
        const definition = FORMAL_SIDECAR_DEFINITIONS[key];
        snapshot[key] = definition.objectPayload
            ? { schemaVersion: SIDECAR_SCHEMA, baseCurrency: 'CNY', rates: {}, updatedAt: now }
            : { schemaVersion: SIDECAR_SCHEMA, [definition.recordKey]: [], updatedAt: now };
    });
    return snapshot;
}

/**
 * v2 专用 variant：与 createFormalResetSnapshot 同形，但显式标明 assets 是 v2。
 * 阶段 8/10 可直接调用此函数；当前阶段由 initializeFormalStorageReset 隐式
 * 通过 createFormalResetSnapshot 切到 v2。
 */
function createFormalV2ResetSnapshot(options) {
    return createFormalResetSnapshot(options);
}

/** Tags are a strict catalog: unknown item keys are rejected, never preserved. */
function normalizeTagDirectory(tags) {
    if (!Array.isArray(tags)) throw new Error('[storage] tags must be an array');
    if (tags.length > TAG_MAX) throw new Error('[storage] tags exceeds maximum of ' + TAG_MAX);
    const ids = new Set();
    const labels = new Set();
    return tags.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('[storage] tags[' + index + '] must be an object');
        }
        const unknown = Object.keys(raw).filter(key => TAG_ITEM_KEYS.indexOf(key) < 0);
        if (unknown.length) throw new Error('[storage] tags[' + index + '] contains unknown field: ' + unknown[0]);
        if (typeof raw.id !== 'string' || !isUUID(raw.id.trim()) || raw.id !== raw.id.trim().toLowerCase()) {
            throw new Error('[storage] tags[' + index + '].id must be a lowercase UUID');
        }
        const id = raw.id;
        const label = typeof raw.label === 'string' ? raw.label.trim() : '';
        if (!label) throw new Error('[storage] tags[' + index + '].label must be non-empty');
        const labelKey = label.toLocaleLowerCase();
        if (ids.has(id)) throw new Error('[storage] duplicate tag id: ' + id);
        if (labels.has(labelKey)) throw new Error('[storage] duplicate tag label: ' + label);
        ids.add(id);
        labels.add(labelKey);
        const tag = { id: id, label: label };
        if (Object.prototype.hasOwnProperty.call(raw, 'emoji')) tag.emoji = String(raw.emoji == null ? '' : raw.emoji).trim();
        if (Object.prototype.hasOwnProperty.call(raw, 'color')) tag.color = String(raw.color == null ? '' : raw.color).trim();
        if (Object.prototype.hasOwnProperty.call(raw, 'isSystem')) {
            if (typeof raw.isSystem !== 'boolean') throw new Error('[storage] tags[' + index + '].isSystem must be a boolean');
            tag.isSystem = raw.isSystem;
        }
        if (Object.prototype.hasOwnProperty.call(raw, 'createdAt')) {
            if (typeof raw.createdAt !== 'string' || !raw.createdAt.trim()) throw new Error('[storage] tags[' + index + '].createdAt must be a string');
            tag.createdAt = raw.createdAt.trim();
        }
        return tag;
    });
}

function assertAssetTagReferences(assets, tags) {
    if (!Array.isArray(assets)) throw new Error('[storage] assets must be an array');
    const catalog = normalizeTagDirectory(tags);
    const ids = new Set(catalog.map(tag => tag.id));
    assets.forEach((asset, assetIndex) => {
        // v2 wishlist has no tagIds; skip the reference check for wishlist assets
        if (asset && asset.status === 'wishlist') return;
        const tagIds = asset && asset.tagIds;
        if (!Array.isArray(tagIds)) throw new Error('[storage] assets[' + assetIndex + '].tagIds must be an array');
        tagIds.forEach((id, tagIndex) => {
            if (!ids.has(id)) throw new Error('[storage] assets[' + assetIndex + '].tagIds[' + tagIndex + '] references missing tag ' + id);
        });
    });
    return true;
}

function assetsHaveTagReferences(assets) {
    return Array.isArray(assets) && assets.some(asset => Array.isArray(asset && asset.tagIds) && asset.tagIds.length > 0);
}

const SIDECAR_SCHEMA = 1;

// v2.3.0 阶段 2：标签取色器用户自定义颜色行上限。
const CUSTOM_TAG_COLOR_MAX = 10;

/**
 * v2.3.0 阶段 2：归一化 settings.customTagColors。
 *   - 仅保留合法 hex（#rgb / #rrggbb，大小写不敏感），3 位展开为 6 位并转小写
 *   - 去重（按展开后的 6 位 hex）、截断到 CUSTOM_TAG_COLOR_MAX
 *   - 非数组 / 非法项一律丢弃，永不抛错（偏好字段 fail-soft）
 */
function normalizeCustomTagColors(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        let match = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
        let hex = match ? match[1].toLowerCase() : null;
        if (!hex) {
            match = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
            if (match) hex = match[1].split('').map(ch => ch + ch).join('').toLowerCase();
        }
        if (!hex || seen.has(hex)) continue;
        seen.add(hex);
        result.push('#' + hex);
        if (result.length >= CUSTOM_TAG_COLOR_MAX) break;
    }
    return result;
}

const DEFAULT_SETTINGS = Object.freeze(Object.assign({
    defaultSort: 'default', defaultStatus: 'all', defaultViewMode: 'list', viewMode: 'list',
    // v1.7-P2：矩阵视图列数偏好。'auto' = 按容器宽度自适应（2/3/4），或手选 2/3/4 固定列数。
    matrixCols: 'auto',
    costGoalMode: 'byPrice',
    preferredCurrency: 'CNY', currencyDisplayMode: 'native', notificationsEnabled: true,
    notificationDays: [7, 30], notificationIntervalMinutes: 5,
    resourceIndex: {
        notebookId: null, documentId: null, documentTitle: '', targetVerified: false,
        managedBlockId: null, pendingCleanupBlockId: null,
        status: 'idle', updatedAt: null, lastError: null,
    },
    markdownExportTarget: { notebookId: null, documentId: null, documentTitle: null },
    // v2.3.0 阶段 2：标签取色器用户自定义颜色行（≤10 个 6 位 hex）。
    customTagColors: [],
    // v2.5.0 笔记双链阶段1：资产索引文档配置（引擎与 UI 在后续阶段落地，总开关默认关）。
    indexEnabled: false,
    indexNotebookId: '',
    indexDocPath: '/资产管理插件索引文档——不建议手动操作',
    indexDocId: '',
    indexAutoSync: true,
    indexIncludeCover: false,
    // v2.6.4 阶段1：汇率自动刷新开关（手动修正优先，自动刷新不得覆盖 manual 来源）。
    exchangeRateAutoRefresh: true,
}, AGENT_DEFAULT_SETTINGS, {
    schemaVersion: SIDECAR_SCHEMA,
}));

function sameStoragePayload(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function cloneStorageSnapshot(payload) {
    return payload == null ? null : JSON.parse(JSON.stringify(payload));
}

function createStorage(plugin) {
    if (!plugin || typeof plugin.loadData !== 'function' || typeof plugin.saveData !== 'function') {
        throw new Error('[storage] createStorage: invalid plugin instance');
    }

    let persistenceClosed = false;
    const activeWriteCapabilities = new Set();

    function storageClosedError() {
        const error = new Error('[storage] persistence is closed');
        error.code = 'STORAGE_CLOSED';
        return error;
    }

    async function loadFormalData(name) {
        try {
            return await plugin.loadData(name);
        } catch (cause) {
            throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read ' + name, { cause: cause });
        }
    }

    function assertWritable(capability) {
        // A transaction that began before shutdown must be allowed to finish or
        // compensate its own writes. The unforgeable queue capability is scoped
        // to that task, so unrelated public writes cannot borrow its authority.
        if (persistenceClosed && !activeWriteCapabilities.has(capability)) throw storageClosedError();
    }

    async function runAuthorizedTask(task) {
        const capability = Object.freeze({});
        activeWriteCapabilities.add(capability);
        try {
            return await task(capability);
        } finally {
            activeWriteCapabilities.delete(capability);
        }
    }

    function enqueueCoreAssetsTask(task) {
        if (persistenceClosed) return Promise.reject(storageClosedError());
        return enqueueGlobalAssetTagTask(async () => {
            // Do not admit an old instance after onunload. This rejection is
            // isolated to its own task and never closes the WebView-wide FIFO.
            if (persistenceClosed) throw storageClosedError();
            return runAuthorizedTask(task);
        });
    }

    function stopPersistence() {
        persistenceClosed = true;
    }

    async function restoreRawSnapshot(name, snapshot, capability) {
        assertWritable(capability);
        if (snapshot == null) {
            if (typeof plugin.removeData !== 'function') throw new Error('[formal-storage] removeData is unavailable for rollback');
            const removed = await plugin.removeData(name);
            if (removed === false) throw new Error('[formal-storage] rollback remove failed for ' + name);
            return;
        }
        const saved = await plugin.saveData(name, cloneStorageSnapshot(snapshot));
        if (saved === false) throw new Error('[formal-storage] rollback write failed for ' + name);
    }

    async function readSettings() {
        return normalizeSettings(await loadFormalData(STORAGE_FILES.settings));
    }

    function writeSettings(settings) {
        return enqueueCoreAssetsTask(async capability => {
            assertWritable(capability);
            const current = normalizeSettings(cloneStorageSnapshot(await loadFormalData(STORAGE_FILES.settings)));
            const merged = Object.assign({}, current, settings && typeof settings === 'object' ? settings : {});
            const payload = Object.assign({}, normalizeSettings(merged), { schemaVersion: SIDECAR_SCHEMA, updatedAt: new Date().toISOString() });
            const saved = await plugin.saveData(STORAGE_FILES.settings, payload);
            if (saved === false) throw new Error('[storage] write failed for settings.json');
            return true;
        });
    }

    function mutateFormalSettings(patchFn) {
        if (typeof patchFn !== 'function') return Promise.reject(formalStorageError(
            FORMAL_ERROR_CODE.IMPORT_INVALID, 'mutateFormalSettings requires a function'));
        return enqueueCoreAssetsTask(async capability => {
            const originalRaw = await loadFormalData(STORAGE_FILES.settings);
            const current = normalizeSettings(cloneStorageSnapshot(originalRaw));
            const patch = await patchFn(cloneStorageSnapshot(current));
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'settings patch must be an object');
            }
            const next = Object.assign({}, current, cloneStorageSnapshot(patch), {
                schemaVersion: SIDECAR_SCHEMA,
                updatedAt: new Date().toISOString(),
            });
            const payload = normalizeSettings(next);
            payload.updatedAt = next.updatedAt;
            await commitFormalPayloads({ settings: payload }, { settings: originalRaw }, capability, 'formal settings mutation');
            return normalizeSettings(await loadFormalData(STORAGE_FILES.settings));
        });
    }

    function formalEmptyAssetWrapper(now) {
        return createFormalV2AssetWrapper([], { updatedAt: now || new Date().toISOString() });
    }

    async function readFormalAssetWrapperSnapshot() {
        // v0.18+ fail-closed: 旧 v1 deprecated 字段自动迁移已删除。任何
        // schemaGeneration !== 'formal-v2' 或 schemaVersion !== 1 都会由
        // assertStrictFormalAssetWrapper 抛 RESET_REQUIRED（明确文案）。
        // 该函数保留仅作为 v1 公开 API 的同形兼容入口；阶段 8 时 src.template.js
        // 会切换到 readFormalV2AssetWrapperSnapshot。
        let raw;
        try {
            raw = await loadFormalData(STORAGE_FILES.assets);
        } catch (cause) {
            if (cause && cause.code === FORMAL_ERROR_CODE.READ_FAILED) throw cause;
            throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read assets.json', { cause: cause });
        }
        if (isMissingStoragePayload(raw)) return formalEmptyAssetWrapper();
        return assertStrictFormalAssetWrapper(raw);
    }

    /**
     * formal-v2 严格读路径（v0.18 唯一正常工作的 asset wrapper read）。
     * 行为与 readFormalAssetWrapperSnapshot 等价，但 future-proof 命名以便
     * 阶段 8 直接切换 src.template.js 到此函数。
     */
    async function readFormalV2AssetWrapperSnapshot() {
        let raw;
        try {
            raw = await loadFormalData(STORAGE_FILES.assets);
        } catch (cause) {
            if (cause && cause.code === FORMAL_ERROR_CODE.READ_FAILED) throw cause;
            throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read assets.json', { cause: cause });
        }
        if (isMissingStoragePayload(raw)) return formalEmptyV2AssetWrapper();
        return assertStrictFormalAssetWrapper(raw);
    }

    function formalEmptyV2AssetWrapper(now) {
        return createFormalV2AssetWrapper([], { updatedAt: now || new Date().toISOString() });
    }

    function readFormalAssetWrapper() {
        return enqueueCoreAssetsTask(readFormalAssetWrapperSnapshot);
    }

    /**
     * formal-v2 公开 read 入口（v0.18 阶段 8/10 切换目标）：
     * - readFormalV2AssetWrapper：进队列读取资产 wrapper
     * - readFormalV2Assets：进队列，返回资产数组（已做 tag 引用校验）
     * - readFormalV2DomainSnapshot：进队列，返回完整 11 个 domain 的 wrapper 形态
     * - readFormalV2BackupSnapshot：进队列，导出 v2 schemaGeneration 的备份
     */
    function readFormalV2AssetWrapper() {
        return enqueueCoreAssetsTask(readFormalV2AssetWrapperSnapshot);
    }

    async function readFormalV2Assets() {
        return enqueueCoreAssetsTask(async () => {
            const wrapper = await readFormalV2AssetWrapperSnapshot();
            const tags = await readFormalTagWrapperSnapshot();
            try {
                assertAssetTagReferences(wrapper.assets, tags.tags);
            } catch (cause) {
                throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, cause.message, { cause: cause });
            }
            return wrapper.assets.map(cloneStorageSnapshot);
        });
    }

    async function readFormalAssets() {
        return enqueueCoreAssetsTask(async () => {
            const wrapper = await readFormalAssetWrapperSnapshot();
            const tags = await readFormalTagWrapperSnapshot();
            try {
                assertAssetTagReferences(wrapper.assets, tags.tags);
            } catch (cause) {
                throw formalStorageError(FORMAL_ERROR_CODE.REFERENCE_INVALID, cause.message, { cause: cause });
            }
            return wrapper.assets.map(cloneStorageSnapshot);
        });
    }

    async function readFormalTagWrapperSnapshot() {
        let raw;
        try {
            raw = await loadFormalData(STORAGE_FILES.tags);
        } catch (cause) {
            if (cause && cause.code === FORMAL_ERROR_CODE.READ_FAILED) throw cause;
            throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read tags.json', { cause: cause });
        }
        if (isMissingStoragePayload(raw)) return { schemaVersion: SIDECAR_SCHEMA, tags: [] };
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)
            || !Array.isArray(raw.tags)) {
            throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'tags.json must contain an object wrapper with a tags array');
        }
        if (raw.schemaVersion !== SIDECAR_SCHEMA) {
            throw formalStorageError(FORMAL_ERROR_CODE.RESET_REQUIRED, 'tags.json must be a strict schemaVersion 1 wrapper');
        }
        const unknown = Object.keys(raw).filter(key => ['schemaVersion', 'tags', 'updatedAt'].indexOf(key) < 0);
        if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'tags.json contains unsupported field ' + unknown[0]);
        try {
            return Object.assign({}, cloneStorageSnapshot(raw), { tags: normalizeTagDirectory(raw.tags) });
        } catch (cause) {
            throw formalStorageError(FORMAL_ERROR_CODE.TAG_INVALID, cause.message, { cause: cause });
        }
    }

    async function readFormalDomainSnapshotInsideQueue() {
        const snapshot = {
            assets: await readFormalAssetWrapperSnapshot(),
            tags: await readFormalTagWrapperSnapshot(),
        };
        for (const key of Object.keys(FORMAL_SIDECAR_DEFINITIONS)) {
            const definition = FORMAL_SIDECAR_DEFINITIONS[key];
            let raw;
            try {
                raw = await loadFormalData(definition.file);
            } catch (cause) {
                if (cause && cause.code === FORMAL_ERROR_CODE.READ_FAILED) throw cause;
                throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read ' + definition.file, { cause: cause });
            }
            snapshot[key] = readStrictFormalSidecar(raw, key);
        }
        return assertFormalDomainSnapshot(snapshot);
    }

    /**
     * formal-v2 完整 domain 读取：assets 用 v2 严格读；tags 与 sidecar
     * schemaVersion=1 wrapper 不变（sidecar 顶层 schemaGeneration 在 v2
     * 仍走 schemaVersion=1 SIDECAR_SCHEMA，与 asset wrapper 互不影响）。
     */
    async function readFormalV2DomainSnapshotInsideQueue() {
        const snapshot = {
            assets: await readFormalV2AssetWrapperSnapshot(),
            tags: await readFormalTagWrapperSnapshot(),
        };
        for (const key of Object.keys(FORMAL_SIDECAR_DEFINITIONS)) {
            const definition = FORMAL_SIDECAR_DEFINITIONS[key];
            let raw;
            try {
                raw = await loadFormalData(definition.file);
            } catch (cause) {
                if (cause && cause.code === FORMAL_ERROR_CODE.READ_FAILED) throw cause;
                throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read ' + definition.file, { cause: cause });
            }
            snapshot[key] = readStrictFormalSidecar(raw, key);
        }
        return assertFormalDomainSnapshot(snapshot);
    }

    function readFormalDomainSnapshot() {
        return enqueueCoreAssetsTask(async () => cloneFormalDomainWrappers(await readFormalDomainSnapshotInsideQueue()));
    }

    function readFormalV2DomainSnapshot() {
        return enqueueCoreAssetsTask(async () => cloneFormalDomainWrappers(await readFormalV2DomainSnapshotInsideQueue()));
    }

    function readFormalBackupSnapshot(options) {
        return enqueueCoreAssetsTask(async () => {
            const domain = await readFormalDomainSnapshotInsideQueue();
            let rawSettings;
            try { rawSettings = await loadFormalData(STORAGE_FILES.settings); }
            catch (cause) { throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read settings.json', { cause: cause }); }
            const settings = validateFormalBackupSettings(normalizeSettings(rawSettings), true);
            return {
                format: FORMAL_BACKUP_FORMAT,
                schemaGeneration: FORMAL_SCHEMA_GENERATION,
                schemaVersion: FORMAL_BACKUP_SCHEMA_VERSION,
                exportedAt: options && options.exportedAt ? options.exportedAt : new Date().toISOString(),
                pluginVersion: String(options && options.pluginVersion || '').trim() || 'unknown',
                data: cloneFormalDomainWrappers(domain),
                settings: settings,
            };
        });
    }

    /**
     * formal-v2 备份导出：与 readFormalBackupSnapshot 同形，但 schemaGeneration
     * 字段填 'formal-v2'。导入时由 validateFormalImportSnapshot 校验。
     */
    function readFormalV2BackupSnapshot(options) {
        return enqueueCoreAssetsTask(async () => {
            const domain = await readFormalV2DomainSnapshotInsideQueue();
            let rawSettings;
            try { rawSettings = await loadFormalData(STORAGE_FILES.settings); }
            catch (cause) { throw formalStorageError(FORMAL_ERROR_CODE.READ_FAILED, 'failed to read settings.json', { cause: cause }); }
            const settings = validateFormalBackupSettings(normalizeSettings(rawSettings), true);
            return {
                format: FORMAL_BACKUP_FORMAT,
                schemaGeneration: FORMAL_V2_SCHEMA_GENERATION,
                schemaVersion: FORMAL_BACKUP_SCHEMA_VERSION,
                exportedAt: options && options.exportedAt ? options.exportedAt : new Date().toISOString(),
                pluginVersion: String(options && options.pluginVersion || '').trim() || 'unknown',
                data: cloneFormalDomainWrappers(domain),
                settings: settings,
            };
        });
    }

    function readRawFormalResetBackup(options) {
        return enqueueCoreAssetsTask(async () => {
            const files = Object.assign({ assets: STORAGE_FILES.assets, tags: STORAGE_FILES.tags },
                Object.fromEntries(Object.entries(FORMAL_SIDECAR_DEFINITIONS).map(([key, definition]) => [key, definition.file])),
                { settings: STORAGE_FILES.settings });
            const payload = {};
            // Do not validate, normalize, migrate, or otherwise reinterpret this
            // data: old and mixed schemas must remain recoverable before reset.
            for (const [key, file] of Object.entries(files)) payload[key] = cloneStorageSnapshot(await loadFormalData(file));
            return {
                format: RAW_RESET_BACKUP_FORMAT,
                createdAt: options && options.createdAt ? options.createdAt : new Date().toISOString(),
                pluginVersion: String(options && options.pluginVersion || '').trim() || 'unknown',
                payload: payload,
            };
        });
    }

    function rawArrayCount(raw, keys) {
        if (Array.isArray(raw)) return raw.length;
        if (!raw || typeof raw !== 'object') return 0;
        for (const key of keys) {
            const value = ownDataValue(raw, key);
            if (Array.isArray(value)) return value.length;
        }
        return 0;
    }

    function readFormalResetPreflight() {
        return enqueueCoreAssetsTask(async () => {
            const raw = {};
            const files = Object.assign({ assets: STORAGE_FILES.assets, tags: STORAGE_FILES.tags },
                Object.fromEntries(Object.entries(FORMAL_SIDECAR_DEFINITIONS).map(([key, definition]) => [key, definition.file])),
                { settings: STORAGE_FILES.settings });
            for (const [key, file] of Object.entries(files)) raw[key] = await loadFormalData(file);
            const counts = {
                assets: rawArrayCount(raw.assets, ['assets', 'records', 'items']),
                tags: rawArrayCount(raw.tags, ['tags', 'records', 'items']),
                maintenance: rawArrayCount(raw.maintenance, ['records', 'maintenance', 'items']),
                usage: rawArrayCount(raw.usage, ['records', 'usage', 'items']),
                prepaidTransactions: rawArrayCount(raw.prepaidTransactions, ['records', 'transactions', 'items']),
                wishlistEvents: rawArrayCount(raw.wishlistEvents, ['events', 'records', 'items']),
                operationLogs: rawArrayCount(raw.operationLogs, ['logs', 'records', 'items']),
                financialEvents: rawArrayCount(raw.financialEvents, ['events', 'records', 'items']),
                lifecycleEvents: rawArrayCount(raw.lifecycleEvents, ['events', 'records', 'items']),
                subscriptionPeriods: rawArrayCount(raw.subscriptionPeriods, ['records', 'periods', 'items']),
                exchangeRates: (() => {
                    const rates = ownDataValue(raw.exchangeRates, 'rates');
                    return rates && typeof rates === 'object' && !Array.isArray(rates)
                        ? Object.keys(rates).filter(key => key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
                            && ownDataValue(rates, key) !== undefined).length
                        : rawArrayCount(raw.exchangeRates, ['rates', 'records', 'items']);
                })(),
            };
            const rawAssets = Array.isArray(raw.assets) ? raw.assets
                : ['assets', 'records', 'items'].map(key => ownDataValue(raw.assets, key)).find(Array.isArray) || [];
            const uploads = rawAssets.reduce((total, asset) => {
                const legacyImageUrl = ownDataValue(asset, 'imageUrl');
                const legacyCoverPath = ownDataValue(asset, 'coverPath');
                const cover = ownDataValue(asset, 'cover');
                const hasLegacyUpload = [legacyImageUrl, legacyCoverPath].some(path => typeof path === 'string'
                    && /(?:^|\/)assets\/siyuan-plugin-asset-management\//.test(path));
                const hasFormalUpload = !!cover && ownDataValue(cover, 'kind') === 'upload';
                return total + (hasLegacyUpload || hasFormalUpload ? 1 : 0);
            }, 0);
            return { counts: counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), uploads: uploads };
        });
    }

    function cloneFormalPublicSnapshot(validated) {
        const result = {
            assetWrapper: cloneStorageSnapshot(validated.assets),
            assets: validated.assets.assets.map(cloneStorageSnapshot),
            tagWrapper: cloneStorageSnapshot(validated.tags),
            tags: validated.tags.tags.map(cloneStorageSnapshot),
        };
        Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
            result[key] = FORMAL_SIDECAR_DEFINITIONS[key].objectPayload
                ? cloneStorageSnapshot(validated.sidecars[key])
                : validated.sidecars[key].map(cloneStorageSnapshot);
        });
        return result;
    }

    function readFormalAssetDomainSnapshot() {
        return enqueueCoreAssetsTask(async () => cloneFormalPublicSnapshot(await readFormalDomainSnapshotInsideQueue()));
    }

    /**
     * formal-v2 public domain snapshot：与 readFormalAssetDomainSnapshot 同形，
     * 但内部经 readFormalV2DomainSnapshotInsideQueue 走 v2 严格读路径。
     */
    function readFormalV2AssetDomainSnapshot() {
        return enqueueCoreAssetsTask(async () => cloneFormalPublicSnapshot(await readFormalV2DomainSnapshotInsideQueue()));
    }

    function formalPayloadForChange(key, value, now) {
        if (key === 'assets') {
            const wrapper = Array.isArray(value)
                ? createFormalV2AssetWrapper(value, { updatedAt: now })
                : cloneStorageSnapshot(value);           return assertStrictFormalAssetWrapper(wrapper);
        }
        if (key === 'tags') {
            const tags = Array.isArray(value) ? value : value && value.tags;
            return { schemaVersion: SIDECAR_SCHEMA, tags: normalizeTagDirectory(tags), updatedAt: now };
        }
        const definition = FORMAL_SIDECAR_DEFINITIONS[key];
        if (!definition) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'unsupported formal change key ' + key);
        if (definition.objectPayload) {
            const payload = Object.assign({}, value || {}, { schemaVersion: SIDECAR_SCHEMA, updatedAt: now });
            return assertFormalExchangeRates(payload);
        }
        const records = Array.isArray(value) ? value : value && value[definition.recordKey];
        if (!Array.isArray(records)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, key + ' must be an array');
        return {
            schemaVersion: SIDECAR_SCHEMA,
            [definition.recordKey]: definition.max
                ? (key === 'operationLogs' ? records.slice(0, definition.max) : records.slice(-definition.max))
                : records.slice(),
            updatedAt: now,
        };
    }

    /**
     * formal-v2 payload factory（v0.18 阶段 8/10 切换目标）。assets 写 wrapper
     * 一律经 createFormalV2AssetWrapper + assertStrictFormalAssetWrapper；
     * tags / sidecar schemaVersion 仍为 1（即 SIDECAR_SCHEMA），与 v1 共用
     * 同一 schema family（sidecar 不带 schemaGeneration 字段）。
     */
    function formalV2PayloadForChange(key, value, now) {
        if (key === 'assets') {
            const wrapper = Array.isArray(value)
                ? createFormalV2AssetWrapper(value, { updatedAt: now })
                : cloneStorageSnapshot(value);
            return assertStrictFormalAssetWrapper(wrapper);
        }
        if (key === 'tags') {
            const tags = Array.isArray(value) ? value : value && value.tags;
            return { schemaVersion: SIDECAR_SCHEMA, tags: normalizeTagDirectory(tags), updatedAt: now };
        }
        const definition = FORMAL_SIDECAR_DEFINITIONS[key];
        if (!definition) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'unsupported formal change key ' + key);
        if (definition.objectPayload) {
            const payload = Object.assign({}, value || {}, { schemaVersion: SIDECAR_SCHEMA, updatedAt: now });
            return assertFormalExchangeRates(payload);
        }
        const records = Array.isArray(value) ? value : value && value[definition.recordKey];
        if (!Array.isArray(records)) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, key + ' must be an array');
        return {
            schemaVersion: SIDECAR_SCHEMA,
            [definition.recordKey]: definition.max
                ? (key === 'operationLogs' ? records.slice(0, definition.max) : records.slice(-definition.max))
                : records.slice(),
            updatedAt: now,
        };
    }

    async function commitFormalPayloads(payloads, originalRaw, capability, operation) {
        // Write owner catalogs before dependent sidecars. The complete snapshot
        // is validated before any write and failures still compensate in reverse,
        // while this ordering never leaves a freshly written lifecycle/financial
        // record referring to an asset that has not been persisted yet.
        const order = ['tags', 'assets'].concat(Object.keys(FORMAL_SIDECAR_DEFINITIONS)).concat(['settings'])
            .filter(key => Object.prototype.hasOwnProperty.call(payloads, key));
        const fileFor = key => key === 'assets' ? STORAGE_FILES.assets
            : (key === 'settings' ? STORAGE_FILES.settings
                : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file));
        const attempted = [];
        try {
            for (const key of order) {
                const file = fileFor(key);
                const current = await loadFormalData(file);
                if (!sameStoragePayload(current, originalRaw[key])) {
                    const conflict = formalStorageError(FORMAL_ERROR_CODE.CONFLICT, file + ' changed before commit');
                    conflict.file = file;
                    throw conflict;
                }
            }
            for (const key of order) {
                const file = fileFor(key);
                assertWritable(capability);
                attempted.push(key);
                const saved = await plugin.saveData(file, cloneStorageSnapshot(payloads[key]));
                if (saved === false) throw new Error('write failed for ' + file);
                const readBack = await loadFormalData(file);
                if (!sameStoragePayload(readBack, payloads[key])) throw new Error('read-back verification failed for ' + file);
            }
            return { ok: true, writtenFiles: order.map(fileFor) };
        } catch (cause) {
            const rollbackFailures = [];
            for (let index = attempted.length - 1; index >= 0; index--) {
                const key = attempted[index];
                const file = fileFor(key);
                try {
                    await restoreRawSnapshot(file, originalRaw[key], capability);
                    const restored = await loadFormalData(file);
                    if (!sameStoragePayload(restored, originalRaw[key])) throw new Error('rollback read-back verification failed');
                } catch (rollbackError) {
                    rollbackFailures.push({ file: file, message: rollbackError.message });
                }
            }
            const compensation = {
                attempted: attempted.map(fileFor),
                failures: rollbackFailures,
                rolledBack: rollbackFailures.length === 0,
            };
            if (cause && (cause.code === FORMAL_ERROR_CODE.READ_FAILED || cause.code === FORMAL_ERROR_CODE.CONFLICT)) {
                cause.compensation = compensation;
                throw cause;
            }
            throw formalStorageError(FORMAL_ERROR_CODE.TRANSACTION_FAILED,
                (operation || 'formal persistence') + ' failed: ' + cause.message,
                { cause: cause, compensation: compensation });
        }
    }

    function runFormalAssetPersistenceTransaction(changeOrPrepare) {
        return enqueueCoreAssetsTask(async capability => {
            const validatedCurrent = await readFormalDomainSnapshotInsideQueue();
            const current = cloneFormalPublicSnapshot(validatedCurrent);
            const prepared = typeof changeOrPrepare === 'function' ? await changeOrPrepare(current) : changeOrPrepare;
            const change = prepared && Object.prototype.hasOwnProperty.call(prepared, 'change') ? prepared.change : prepared;
            const context = prepared && Object.prototype.hasOwnProperty.call(prepared, 'context') ? prepared.context : null;
            if (change && change.noop === true) return { ok: true, noop: true, context: context };
            if (!change || typeof change !== 'object' || Array.isArray(change)) {
                throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'formal transaction requires a change object');
            }
            const allowed = ['assets', 'tags'].concat(Object.keys(FORMAL_SIDECAR_DEFINITIONS));
            const unknown = Object.keys(change).filter(key => allowed.indexOf(key) < 0);
            if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'unsupported formal change key ' + unknown[0]);
            if (Object.keys(change).length === 0) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'formal transaction requires at least one file');

            const now = new Date().toISOString();
            const complete = {
                assets: cloneStorageSnapshot(validatedCurrent.assets),
                tags: cloneStorageSnapshot(validatedCurrent.tags),
            };
            Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
                const definition = FORMAL_SIDECAR_DEFINITIONS[key];
                complete[key] = definition.objectPayload
                    ? cloneStorageSnapshot(validatedCurrent.sidecars[key])
                    : { schemaVersion: SIDECAR_SCHEMA, [definition.recordKey]: validatedCurrent.sidecars[key].slice() };
            });
            const payloads = {};
            Object.keys(change).forEach(key => {
                payloads[key] = formalPayloadForChange(key, change[key], now);
                complete[key] = payloads[key];
            });
            assertFormalDomainSnapshot(complete);

            const originalRaw = {};
            for (const key of Object.keys(payloads)) {
                const file = key === 'assets' ? STORAGE_FILES.assets
                    : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file);
                originalRaw[key] = await loadFormalData(file);
            }
            const result = await commitFormalPayloads(payloads, originalRaw, capability, 'formal transaction');
            result.context = context;
            result.assets = complete.assets.assets.map(cloneStorageSnapshot);
            result.tags = complete.tags.tags.map(cloneStorageSnapshot);
            Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
                const definition = FORMAL_SIDECAR_DEFINITIONS[key];
                result[key] = definition.objectPayload
                    ? cloneStorageSnapshot(complete[key])
                    : complete[key][definition.recordKey].map(cloneStorageSnapshot);
            });
            return result;
        });
    }

    function mutateFormalAssetDomain(prepare) {
        if (typeof prepare !== 'function') return Promise.reject(formalStorageError(
            FORMAL_ERROR_CODE.IMPORT_INVALID, 'mutateFormalAssetDomain requires a function'));
        return runFormalAssetPersistenceTransaction(prepare);
    }

    /**
     * formal-v2 persistence transaction（v0.18 阶段 8 切换目标）：
     *  - 读当前：readFormalV2DomainSnapshotInsideQueue（assets 走 v2 严格）
     *  - 改 assets：经 createFormalV2AssetWrapper + assertStrictFormalAssetWrapper
     *  - 改其他 sidecar：与 v1 共用 schemaVersion=1 wrapper 形态
     * 与 mutateFormalAssetDomain 不同点只在 assets 写 wrapper 的 schemaGeneration
     * 字段。其余 transaction 语义（payload 校验、写回、回滚）保持一致。
     */
    function runFormalV2AssetPersistenceTransaction(changeOrPrepare) {
        return enqueueCoreAssetsTask(async capability => {
            const validatedCurrent = await readFormalV2DomainSnapshotInsideQueue();
            const current = cloneFormalPublicSnapshot(validatedCurrent);
            const prepared = typeof changeOrPrepare === 'function' ? await changeOrPrepare(current) : changeOrPrepare;
            const change = prepared && Object.prototype.hasOwnProperty.call(prepared, 'change') ? prepared.change : prepared;
            const context = prepared && Object.prototype.hasOwnProperty.call(prepared, 'context') ? prepared.context : null;
            if (change && change.noop === true) return { ok: true, noop: true, context: context };
            if (!change || typeof change !== 'object' || Array.isArray(change)) {
                throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'formal v2 transaction requires a change object');
            }
            const allowed = ['assets', 'tags'].concat(Object.keys(FORMAL_SIDECAR_DEFINITIONS));
            const unknown = Object.keys(change).filter(key => allowed.indexOf(key) < 0);
            if (unknown.length) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'unsupported formal v2 change key ' + unknown[0]);
            if (Object.keys(change).length === 0) throw formalStorageError(FORMAL_ERROR_CODE.IMPORT_INVALID, 'formal v2 transaction requires at least one file');

            const now = new Date().toISOString();
            const complete = {
                assets: cloneStorageSnapshot(validatedCurrent.assets),
                tags: cloneStorageSnapshot(validatedCurrent.tags),
            };
            Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
                const definition = FORMAL_SIDECAR_DEFINITIONS[key];
                complete[key] = definition.objectPayload
                    ? cloneStorageSnapshot(validatedCurrent.sidecars[key])
                    : { schemaVersion: SIDECAR_SCHEMA, [definition.recordKey]: validatedCurrent.sidecars[key].slice() };
            });
            const payloads = {};
            Object.keys(change).forEach(key => {
                payloads[key] = formalV2PayloadForChange(key, change[key], now);
                complete[key] = payloads[key];
            });
            assertFormalDomainSnapshot(complete);

            const originalRaw = {};
            for (const key of Object.keys(payloads)) {
                const file = key === 'assets' ? STORAGE_FILES.assets
                    : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file);
                originalRaw[key] = await loadFormalData(file);
            }
            const result = await commitFormalPayloads(payloads, originalRaw, capability, 'formal v2 transaction');
            result.context = context;
            result.assets = complete.assets.assets.map(cloneStorageSnapshot);
            result.tags = complete.tags.tags.map(cloneStorageSnapshot);
            Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => {
                const definition = FORMAL_SIDECAR_DEFINITIONS[key];
                result[key] = definition.objectPayload
                    ? cloneStorageSnapshot(complete[key])
                    : complete[key][definition.recordKey].map(cloneStorageSnapshot);
            });
            return result;
        });
    }

    function mutateFormalV2AssetDomain(prepare) {
        if (typeof prepare !== 'function') return Promise.reject(formalStorageError(
            FORMAL_ERROR_CODE.IMPORT_INVALID, 'mutateFormalV2AssetDomain requires a function'));
        return runFormalV2AssetPersistenceTransaction(prepare);
    }

    function initializeFormalStorageReset(options) {
        if (!options || options.confirmReset !== true) return Promise.reject(formalStorageError(
            FORMAL_ERROR_CODE.RESET_REQUIRED, 'explicit confirmReset=true is required'));
        return enqueueCoreAssetsTask(async capability => {
            const now = new Date().toISOString();
            const reset = createFormalResetSnapshot({ updatedAt: now });
            const payloads = { assets: reset.assets, tags: reset.tags };
            Object.keys(FORMAL_SIDECAR_DEFINITIONS).forEach(key => { payloads[key] = reset[key]; });
            const settingsRaw = await loadFormalData(STORAGE_FILES.settings);
            const previousSettings = normalizeSettings(settingsRaw);
            const previousResourceIndex = normalizeResourceIndex(previousSettings.resourceIndex);
            const preservedSettings = {};
            FORMAL_BACKUP_SETTING_KEYS.forEach(key => {
                if (key !== 'resourceIndex' && Object.prototype.hasOwnProperty.call(previousSettings, key)) {
                    preservedSettings[key] = cloneStorageSnapshot(previousSettings[key]);
                }
            });
            payloads.settings = Object.assign({}, preservedSettings, {
                resourceIndex: Object.assign({}, previousResourceIndex, {
                    managedBlockId: null,
                    pendingCleanupBlockId: previousResourceIndex.pendingCleanupBlockId || previousResourceIndex.managedBlockId,
                    status: 'idle',
                    updatedAt: null,
                    lastError: null,
                }),
                schemaVersion: SIDECAR_SCHEMA,
                updatedAt: now,
            });
            assertFormalDomainSnapshot(reset);
            const originalRaw = {};
            for (const key of Object.keys(payloads)) {
                const file = key === 'assets' ? STORAGE_FILES.assets
                    : (key === 'settings' ? STORAGE_FILES.settings
                        : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file));
                originalRaw[key] = await loadFormalData(file);
            }
            const previousAssets = originalRaw.assets && typeof originalRaw.assets === 'object'
                && Array.isArray(originalRaw.assets.assets)
                ? originalRaw.assets.assets.map(cloneStorageSnapshot) : [];
            const result = await commitFormalPayloads(payloads, originalRaw, capability, 'formal reset');
            const readBack = await readFormalDomainSnapshotInsideQueue();
            const committedSettings = normalizeSettings(await loadFormalData(STORAGE_FILES.settings));
            result.previousAssets = previousAssets;
            result.previousSettings = previousSettings;
            result.previousResourceIndex = previousResourceIndex;
            result.committedSnapshot = Object.assign(cloneFormalPublicSnapshot(readBack), {
                settings: committedSettings,
            });
            result.counts = Object.freeze({
                assets: previousAssets.length,
                tags: originalRaw.tags && Array.isArray(originalRaw.tags.tags) ? originalRaw.tags.tags.length : 0,
                maintenance: originalRaw.maintenance && Array.isArray(originalRaw.maintenance.records) ? originalRaw.maintenance.records.length : 0,
                usage: originalRaw.usage && Array.isArray(originalRaw.usage.records) ? originalRaw.usage.records.length : 0,
                prepaidTransactions: originalRaw.prepaidTransactions && Array.isArray(originalRaw.prepaidTransactions.records) ? originalRaw.prepaidTransactions.records.length : 0,
                wishlistEvents: originalRaw.wishlistEvents && Array.isArray(originalRaw.wishlistEvents.events) ? originalRaw.wishlistEvents.events.length : 0,
                operationLogs: originalRaw.operationLogs && Array.isArray(originalRaw.operationLogs.logs) ? originalRaw.operationLogs.logs.length : 0,
                financialEvents: originalRaw.financialEvents && Array.isArray(originalRaw.financialEvents.events) ? originalRaw.financialEvents.events.length : 0,
                lifecycleEvents: originalRaw.lifecycleEvents && Array.isArray(originalRaw.lifecycleEvents.events) ? originalRaw.lifecycleEvents.events.length : 0,
                subscriptionPeriods: originalRaw.subscriptionPeriods && Array.isArray(originalRaw.subscriptionPeriods.records) ? originalRaw.subscriptionPeriods.records.length : 0,
                exchangeRates: originalRaw.exchangeRates && originalRaw.exchangeRates.rates && typeof originalRaw.exchangeRates.rates === 'object'
                    ? Object.keys(originalRaw.exchangeRates.rates).length : 0,
            });
            return result;
        });
    }

    function replaceFormalDomainFromBackup(snapshot) {
        return enqueueCoreAssetsTask(async capability => {
            const validation = validateFormalImportSnapshot(snapshot);
            if (!validation.valid) throw formalStorageError(validation.code || FORMAL_ERROR_CODE.IMPORT_INVALID,
                validation.errors.join('; '));
            const formal = validation.snapshot;
            const previousDomain = await readFormalDomainSnapshotInsideQueue();
            const previousSettingsRaw = await loadFormalData(STORAGE_FILES.settings);
            const previousSnapshot = Object.assign(cloneFormalPublicSnapshot(previousDomain), {
                settings: normalizeSettings(cloneStorageSnapshot(previousSettingsRaw)),
            });
            const previousResourceIndex = normalizeResourceIndex(previousSnapshot.settings.resourceIndex);
            const payloads = cloneStorageSnapshot(formal.data);
            payloads.settings = Object.assign({}, formal.settings, {
                resourceIndex: Object.assign({}, previousResourceIndex, {
                    managedBlockId: null,
                    pendingCleanupBlockId: previousResourceIndex.pendingCleanupBlockId
                        || previousResourceIndex.managedBlockId,
                    status: 'idle', updatedAt: null, lastError: null,
                }),
                schemaVersion: SIDECAR_SCHEMA,
            });
            const originalRaw = {};
            const fileFor = key => key === 'assets' ? STORAGE_FILES.assets
                : (key === 'settings' ? STORAGE_FILES.settings
                    : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file));
            for (const key of Object.keys(payloads)) originalRaw[key] = await loadFormalData(fileFor(key));
            const result = await commitFormalPayloads(payloads, originalRaw, capability, 'formal import');
            const readBack = await readFormalDomainSnapshotInsideQueue();
            const savedSettings = validateFormalBackupSettings(normalizeSettings(await loadFormalData(STORAGE_FILES.settings)), true);
            const committedSettings = Object.assign({}, savedSettings, {
                resourceIndex: normalizeResourceIndex(await loadFormalData(STORAGE_FILES.settings).then(value => normalizeSettings(value).resourceIndex)),
            });
            result.previousSnapshot = previousSnapshot;
            result.committedSnapshot = Object.assign(cloneFormalPublicSnapshot(readBack), { settings: committedSettings });
            return result;
        });
    }

    /**
     * formal-v2 备份导入：与 replaceFormalDomainFromBackup 同形态，但
     *  - 入参仅接受 schemaGeneration === 'formal-v2' 的备份
     *  - 写回资产 wrapper 一律 v2 形态（assets.assets 在 commitFormalPayloads
     *    阶段已经由 assertFormalDomainSnapshot 验证过）
     * 阶段 8 时 src.template.js 的导入按钮回调会切换到此函数。
     */
    function replaceFormalV2DomainFromBackup(snapshot) {
        return enqueueCoreAssetsTask(async capability => {
            const validation = validateFormalV2ImportSnapshot(snapshot);
            if (!validation.valid) throw formalStorageError(validation.code || FORMAL_ERROR_CODE.IMPORT_INVALID,
                validation.errors.join('; '));
            const formal = validation.snapshot;
            const previousDomain = await readFormalV2DomainSnapshotInsideQueue();
            const previousSettingsRaw = await loadFormalData(STORAGE_FILES.settings);
            const previousSnapshot = Object.assign(cloneFormalPublicSnapshot(previousDomain), {
                settings: normalizeSettings(cloneStorageSnapshot(previousSettingsRaw)),
            });
            const previousResourceIndex = normalizeResourceIndex(previousSnapshot.settings.resourceIndex);
            const payloads = cloneStorageSnapshot(formal.data);
            payloads.settings = Object.assign({}, formal.settings, {
                resourceIndex: Object.assign({}, previousResourceIndex, {
                    managedBlockId: null,
                    pendingCleanupBlockId: previousResourceIndex.pendingCleanupBlockId
                        || previousResourceIndex.managedBlockId,
                    status: 'idle', updatedAt: null, lastError: null,
                }),
                schemaVersion: SIDECAR_SCHEMA,
            });
            const originalRaw = {};
            const fileFor = key => key === 'assets' ? STORAGE_FILES.assets
                : (key === 'settings' ? STORAGE_FILES.settings
                    : (key === 'tags' ? STORAGE_FILES.tags : FORMAL_SIDECAR_DEFINITIONS[key].file));
            for (const key of Object.keys(payloads)) originalRaw[key] = await loadFormalData(fileFor(key));
            const result = await commitFormalPayloads(payloads, originalRaw, capability, 'formal v2 import');
            const readBack = await readFormalV2DomainSnapshotInsideQueue();
            const savedSettings = validateFormalBackupSettings(normalizeSettings(await loadFormalData(STORAGE_FILES.settings)), true);
            const committedSettings = Object.assign({}, savedSettings, {
                resourceIndex: normalizeResourceIndex(await loadFormalData(STORAGE_FILES.settings).then(value => normalizeSettings(value).resourceIndex)),
            });
            result.previousSnapshot = previousSnapshot;
            result.committedSnapshot = Object.assign(cloneFormalPublicSnapshot(readBack), { settings: committedSettings });
            return result;
        });
    }

    // v0.17 标签体系重建：不再强制 seed 系统标签。
    //   - 保留函数名以兼容现有调用/concat 解构，但调用时不修改 tags.json
    //   - 标签库允许为空；历史预置标签如存在，也按普通标签由 UI 管理
    async function seedSystemTagsIfMissing() {
        return false;
    }

    return {
        // v0.18 v1 公开 API（保留）：src.template.js 阶段 8 切换之前仍走这些
        // 函数；但 v1 storage read 路径经 assertStrictFormalAssetWrapper 现在
        // 会对 v1 数据抛 RESET_REQUIRED（fail-closed）。
        readFormalAssets,
        readFormalAssetWrapper,
        readFormalDomainSnapshot,
        readFormalBackupSnapshot,
        readRawFormalResetBackup,
        readFormalResetPreflight,
        readFormalAssetDomainSnapshot,
        replaceFormalDomainFromBackup,
        mutateFormalAssetDomain,
        runFormalAssetPersistenceTransaction,
        initializeFormalStorageReset,
        // v0.18 v2 公开 API（阶段 8 切换目标）：所有 read 都走 v2 严格读
        // 路径，mutate/replace 写入 v2 wrapper；backup 导出 schemaGeneration
        // 为 'formal-v2'；import 严格只接受 v2 备份。
        readFormalV2Assets,
        readFormalV2AssetWrapper,
        readFormalV2DomainSnapshot,
        readFormalV2BackupSnapshot,
        readFormalV2AssetDomainSnapshot,
        mutateFormalV2AssetDomain,
        replaceFormalV2DomainFromBackup,

        readSettings,
        writeSettings,
        mutateFormalSettings,
        readWishlistEvents: async () => (await readFormalAssetDomainSnapshot()).wishlistEvents,
        readOperationLogs: async () => (await readFormalAssetDomainSnapshot()).operationLogs,
        readMaintenance: async () => ({ schemaVersion: 1, records: (await readFormalAssetDomainSnapshot()).maintenance }),
        readUsage: async () => ({ schemaVersion: 1, records: (await readFormalAssetDomainSnapshot()).usage }),
        readPrepaidTransactions: async () => ({ schemaVersion: 1, records: (await readFormalAssetDomainSnapshot()).prepaidTransactions }),
        readFinancialEvents: async () => (await readFormalAssetDomainSnapshot()).financialEvents,
        readLifecycleEvents: async () => (await readFormalAssetDomainSnapshot()).lifecycleEvents,
        readSubscriptionPeriods: async () => (await readFormalAssetDomainSnapshot()).subscriptionPeriods,
        readExchangeRates: async () => (await readFormalAssetDomainSnapshot()).exchangeRates,
        readTags: async () => ({ schemaVersion: 1, tags: (await readFormalAssetDomainSnapshot()).tags }),
        stopPersistence,
    };
}

function normalizeSettings(raw) {
    if (!raw || typeof raw !== 'object') return Object.assign({}, DEFAULT_SETTINGS);
    const migrated = raw;
    const markdownTarget = migrated.markdownExportTarget && typeof migrated.markdownExportTarget === 'object'
        ? migrated.markdownExportTarget : {};
    // filetree endpoints call util.InvalidIDPattern, so both notebook and
    // document values must be actual kernel Node IDs before persistence.
    const validNotebookId = value => {
        const id = String(value || '').trim();
        return /^[0-9]{14}-[a-z0-9]{7}$/.test(id) ? id : null;
    };
    const validDocumentId = value => /^[0-9]{14}-[a-z0-9]{7}$/.test(String(value || '').trim())
        ? String(value).trim() : null;
    const normalized = Object.assign({}, stripLegacyAgentSettings(migrated), {
        defaultSort: migrated.defaultSort || DEFAULT_SETTINGS.defaultSort,
        defaultStatus: migrated.defaultStatus || DEFAULT_SETTINGS.defaultStatus,
        defaultViewMode: migrated.defaultViewMode || DEFAULT_SETTINGS.defaultViewMode,
        viewMode: migrated.viewMode === 'matrix' ? 'matrix' : 'list',
        // v1.7-P2：矩阵列数偏好白名单归一。旧 settings 无此字段或值非法（非 'auto'/2/3/4）
        // 一律回退 'auto'；数字字符串 '2'/'3'/'4' 归一为数字，保证 UI 循环与 CSS 选择器一致。
        matrixCols: ['auto', 2, 3, 4].includes(migrated.matrixCols)
            ? migrated.matrixCols
            : (['2', '3', '4'].includes(migrated.matrixCols) ? Number(migrated.matrixCols) : DEFAULT_SETTINGS.matrixCols),
        costGoalMode: ['byPrice', 'byDate'].includes(migrated.costGoalMode) ? migrated.costGoalMode : DEFAULT_SETTINGS.costGoalMode,
        preferredCurrency: migrated.preferredCurrency || DEFAULT_SETTINGS.preferredCurrency,
        // v0.15-T6：currencyDisplayMode 白名单校验（不在白名单则 fallback 'native'）
        currencyDisplayMode: ['native', 'preferred', 'dual'].includes(migrated.currencyDisplayMode)
            ? migrated.currencyDisplayMode
            : DEFAULT_SETTINGS.currencyDisplayMode,
        notificationsEnabled: migrated.notificationsEnabled !== false,
        notificationDays: Array.isArray(migrated.notificationDays) ? migrated.notificationDays : DEFAULT_SETTINGS.notificationDays,
        // v0.15-T7-A：扫描间隔白名单校验（5 / 10 / 30 三档，其它 fallback 默认 5）
        notificationIntervalMinutes: [5, 10, 30].includes(Number(migrated.notificationIntervalMinutes))
            ? Number(migrated.notificationIntervalMinutes)
            : DEFAULT_SETTINGS.notificationIntervalMinutes,
        resourceIndex: normalizeResourceIndex(migrated.resourceIndex),
        markdownExportTarget: {
            notebookId: validNotebookId(markdownTarget.notebookId),
            documentId: validDocumentId(markdownTarget.documentId),
            documentTitle: typeof markdownTarget.documentTitle === 'string'
                ? markdownTarget.documentTitle.trim().slice(0, 240) || null : null,
        },
        // v2.3.0 阶段 2：自定义标签色归一（仅合法 hex、去重、截断 10）。
        customTagColors: normalizeCustomTagColors(migrated.customTagColors),
        // v2.5.0 阶段1：索引文档配置——存量 settings 缺键回落默认值（Object.assign
        // 合并，不整体覆写）；notebook/document ID 必须为合法内核 ID 否则回落空串。
        indexEnabled: migrated.indexEnabled === true,
        indexNotebookId: validNotebookId(migrated.indexNotebookId) || '',
        indexDocPath: typeof migrated.indexDocPath === 'string' && migrated.indexDocPath.trim()
            ? migrated.indexDocPath.trim().slice(0, 240) : DEFAULT_SETTINGS.indexDocPath,
        indexDocId: validDocumentId(migrated.indexDocId) || '',
        indexAutoSync: migrated.indexAutoSync !== false,
        indexIncludeCover: migrated.indexIncludeCover === true,
        // v2.6.4 阶段1：汇率自动刷新开关——存量 settings 缺键回落 true（!== false 语义，
        // 同 notificationsEnabled / indexAutoSync）。
        exchangeRateAutoRefresh: migrated.exchangeRateAutoRefresh !== false,
        ...normalizeAgentSettings(migrated),
        schemaVersion: SIDECAR_SCHEMA,
    });
    LEGACY_AGENT_SETTING_KEYS.forEach(key => { delete normalized[key]; });
    return normalized;
}

module.exports = {
    createStorage,
    normalizeSettings,
    DEFAULT_SETTINGS,
    STORAGE_FILES,
    OPERATION_LOG_MAX,
    FORMAL_ERROR_CODE,
    FORMAL_BACKUP_FORMAT,
    FORMAL_LIFECYCLE_RECORD_KEYS,
    FORMAL_BACKUP_SCHEMA_VERSION,
    FORMAL_BACKUP_DATA_KEYS,
    FORMAL_SIDECAR_DEFINITIONS,
    assertStrictFormalAssetWrapper,
    assertFormalDomainSnapshot,
    validateFormalImportSnapshot,
    validateFormalV2ImportSnapshot,
    createFormalResetSnapshot,
    createFormalV2ResetSnapshot,
    normalizeTagDirectory,
    assertAssetTagReferences,
    SIDECAR_SCHEMA,
    normalizeCustomTagColors,
    CUSTOM_TAG_COLOR_MAX,
};
