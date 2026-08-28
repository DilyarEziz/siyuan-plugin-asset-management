/* eslint-disable no-use-before-define */
'use strict';

/**
 * 可信报表聚合层。
 *
 * 输入仅为内存快照，输出为可 JSON 序列化的冻结值；金额始终按 currency
 * 分组，绝不进行跨币种换算或合计。这里的 `byCurrency` 是 JSON 兼容的
 * currency map，而不是 JavaScript Map。
 */

const {
    FORMAL_ASSET_KINDS,
    FORMAL_ASSET_KIND,
    validateFormalV2Asset,
    validateSubscriptionPeriodRecord,
    validateSubscriptionPeriodsNoOverlap,
    validateFinancialRecord,
    validateFinancialReplacementChain,
    validateFormalPrepaidTransaction,
    validateFormalLifecycleRecord,
    validateFormalLifecycleReplacementChain,
    projectFormalAsset,
    formalDailyAmountMinor,
    LIFECYCLE_EVENT_TYPE,
    ASSET_STATUS,
    FINANCIAL_EVENT_TYPE,
    FINANCIAL_DIRECTION,
} = require('./assets');
const { isUUID, daysUntil } = require('./algorithms');

const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 120;
// v2.6.3 订阅月度支出折算：计费周期 → 月数。非法/缺失 cycle 回落 1。
const SUBSCRIPTION_BILLING_CYCLE_MONTHS = Object.freeze({ monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12 });
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }
function currencyOf(value) { return String(value || 'CNY').trim().toUpperCase() || 'CNY'; }
function createDict() { return Object.create(null); }
function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function normalizeList(value) { return Array.isArray(value) ? Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean))) : []; }
function dayKey(date) { return date.toISOString().slice(0, 10); }
function monthKey(date) { return date.toISOString().slice(0, 7); }
function parseRecordedDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    if (typeof value !== 'string' || !value.trim()) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(value + 'T00:00:00.000Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function beijingBusinessDateFromInstant(value) {
    const date = parseRecordedDate(value);
    return date ? new Date(date.getTime() + 8 * 3600000) : null;
}
function getMonthWindow(filter) {
    const end = parseRecordedDate(filter.endDate);
    const start = filter.dateFrom ? parseRecordedDate(filter.dateFrom) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - filter.months + 1, 1));
    const buckets = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
        const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        buckets.push({ key: monthKey(cursor), startDate: dayKey(cursor), endDate: dayKey(new Date(Math.min(end.getTime(), next.getTime() - 86400000))) });
        cursor = next;
    }
    return { rangeStart: start, rangeEnd: end, buckets: buckets };
}
function isWithinReportRange(date, window) { return !!date && date >= window.rangeStart && date <= window.rangeEnd; }

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// Formal-v1 report/dashboard entry points.
// ---------------------------------------------------------------------------

function formalReportError(message, cause, path) {
    const error = new TypeError('[formal-report] ' + message);
    error.code = 'FORMAL_REPORT_INVALID';
    if (path) error.path = path;
    if (cause) error.cause = cause;
    return error;
}

function normalizeFormalReportFilter(input, now) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const unknown = Object.keys(source).filter(key => [
        'months', 'dateFrom', 'endDate', 'statuses', 'status', 'kinds', 'kind',
        'tagIds', 'categoryIds', 'categoryId', 'currencies', 'currency',
    ].indexOf(key) < 0);
    if (unknown.length) throw formalReportError('filter contains unknown field: ' + unknown[0]);
    if (hasOwn(source, 'dateFrom') && !isBusinessDateString(source.dateFrom)) throw formalReportError('dateFrom must be YYYY-MM-DD');
    if (hasOwn(source, 'endDate') && !isBusinessDateString(source.endDate)) throw formalReportError('endDate must be YYYY-MM-DD');
    const reference = hasOwn(source, 'endDate') ? source.endDate : dayKey(beijingBusinessDateFromInstant(now) || beijingBusinessDateFromInstant(new Date()));
    const months = Math.max(1, Math.min(MAX_MONTHS, Math.floor(finite(source.months, DEFAULT_MONTHS)) || DEFAULT_MONTHS));
    const dateFrom = hasOwn(source, 'dateFrom') ? source.dateFrom : null;
    if (dateFrom && dateFrom > reference) throw formalReportError('dateFrom must not be after endDate');
    const kinds = normalizeList(source.kinds || (source.kind ? [source.kind] : []));
    if (kinds.some(kind => FORMAL_ASSET_KINDS.indexOf(kind) < 0)) throw formalReportError('filter kind is invalid');
    const statuses = normalizeList(source.statuses || (source.status && source.status !== 'all' ? [source.status] : []));
    if (statuses.some(status => status !== 'active' && status !== 'retired')) throw formalReportError('filter status is invalid');
    const tagIds = normalizeList(source.tagIds);
    const categoryIds = normalizeList(source.categoryIds || (source.categoryId ? [source.categoryId] : []));
    const currencies = normalizeList(source.currencies || (source.currency && source.currency !== 'all' ? [source.currency] : [])).map(currencyOf);
    return {
        months: months,
        dateFrom: dateFrom,
        endDate: reference,
        statuses: statuses,
        kinds: kinds,
        tagIds: tagIds,
        categoryIds: categoryIds,
        currencies: currencies,
        timeBasis: 'acquiredOn',
    };
}

function isBusinessDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !!parseRecordedDate(value);
}

function formalSnapshotArray(source, key, recordKey, required) {
    const value = source[key];
    if (value == null) {
        if (required) throw formalReportError(key + ' is required for a complete formal snapshot');
        return [];
    }
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value[recordKey])) return value[recordKey];
    throw formalReportError(key + ' must be an array or wrapper');
}

function formalSnapshotForProjection(source) {
    return {
        subscriptionPeriods: formalSnapshotArray(source, "subscriptionPeriods", "records", false),
        prepaidTransactions: formalSnapshotArray(source, "prepaidTransactions", "records", false),
        financialEvents: formalSnapshotArray(source, "financialEvents", "events", false),
        maintenance: formalSnapshotArray(source, "maintenance", "records", false),
        lifecycleEvents: formalSnapshotArray(source, "lifecycleEvents", "events", false),
        wishlistEvents: formalSnapshotArray(source, "wishlistEvents", "events", false),
    };
}

function safeAddFormal(left, right, label) {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw formalReportError(label + ' must be safe integers');
    const result = left + right;
    if (!Number.isSafeInteger(result)) throw formalReportError(label + ' exceeds safe integer range');
    return result;
}

function incrementFormalGroup(groups, key, label) {
    const group = String(key || 'unspecified');
    groups[group] = safeAddFormal(hasOwn(groups, group) ? groups[group] : 0, 1, label || 'count');
}

function validateFormalReportSidecars(assets, sidecars) {
    const index = createDict();
    const globalIds = new Set();
    assets.forEach(asset => {
        if (globalIds.has(asset.id)) throw formalReportError('duplicate global id: ' + asset.id);
        globalIds.add(asset.id);
        if (asset.status !== 'wishlist') index[asset.id] = asset;
    });
    const assertOwner = (record, path) => {
        if (!record || typeof record.assetId !== 'string' || !hasOwn(index, record.assetId)) throw formalReportError(path + '.assetId references no owned asset');
        return index[record.assetId];
    };
    const assertRecordUuid = (record, path) => {
        if (!record || !isUUID(record.id) || record.id !== record.id.toLowerCase()) {
            throw formalReportError(path + '.id must be a lowercase UUID');
        }
        if (globalIds.has(record.id)) throw formalReportError(path + '.id duplicates global id ' + record.id);
        globalIds.add(record.id);
        if (!isUUID(record.assetId) || record.assetId !== record.assetId.toLowerCase()) {
            throw formalReportError(path + '.assetId must be a lowercase UUID');
        }
    };
    const periodValidation = validateSubscriptionPeriodsNoOverlap(sidecars.subscriptionPeriods);
    if (!periodValidation.valid) throw formalReportError('subscriptionPeriods are invalid: ' + periodValidation.errors.join('; '));
    sidecars.subscriptionPeriods.forEach((record, recordIndex) => {
        assertRecordUuid(record, 'subscriptionPeriods[' + recordIndex + ']');
        const validation = validateSubscriptionPeriodRecord(record);
        if (!validation.valid) throw formalReportError('subscriptionPeriods[' + recordIndex + '] is invalid: ' + validation.errors.join('; '));
        const owner = assertOwner(record, 'subscriptionPeriods[' + recordIndex + ']');
        if (owner.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw formalReportError('subscriptionPeriods[' + recordIndex + '] belongs to an incompatible asset kind');
    });
    sidecars.prepaidTransactions.forEach((record, recordIndex) => {
        assertRecordUuid(record, 'prepaidTransactions[' + recordIndex + ']');
        const owner = assertOwner(record, 'prepaidTransactions[' + recordIndex + ']');
        if (owner.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT && owner.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw formalReportError('prepaidTransactions[' + recordIndex + '] belongs to an incompatible asset kind');
        const validation = { valid: true, errors: [] };
        if (!validation.valid) throw formalReportError('prepaidTransactions[' + recordIndex + '] is invalid: ' + validation.errors.join('; '));
    });
    sidecars.financialEvents.forEach((record, recordIndex) => {
        assertRecordUuid(record, 'financialEvents[' + recordIndex + ']');
        const validation = validateFinancialRecord(record);
        if (!validation.valid) throw formalReportError('financialEvents[' + recordIndex + '] is invalid: ' + validation.errors.join('; '));
        const owner = assertOwner(record, 'financialEvents[' + recordIndex + ']');
        if (record.currency !== owner.currency) {
            throw formalReportError('financialEvents[' + recordIndex + '].currency is ' + record.currency + '; expected owner currency ' + owner.currency);
        }
        if (record.eventType === 'subscriptionPayment' && owner.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw formalReportError('financialEvents[' + recordIndex + '] belongs to an incompatible asset kind');
        if ((record.eventType === 'prepaidCharge' || record.eventType === 'prepaidConsumption')
            && owner.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT && owner.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw formalReportError('financialEvents[' + recordIndex + '] belongs to an incompatible asset kind');
        if (record.eventType === 'maintenance' && owner.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw formalReportError('financialEvents[' + recordIndex + '] belongs to an incompatible asset kind');
        if (record.eventType === 'purchase' && owner.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw formalReportError('financialEvents[' + recordIndex + '] subscriptions use subscriptionPayment events');
    });
    const replacementValidation = validateFinancialReplacementChain(sidecars.financialEvents);
    if (!replacementValidation.valid) throw formalReportError('financialEvents replacement chain is invalid: ' + replacementValidation.errors.join('; '));
    const financialById = new Map(sidecars.financialEvents.map(event => [event.id, event]));
    const prepaidFinancialLinks = new Map();
    sidecars.prepaidTransactions.forEach((record, recordIndex) => {
        if (record.dimension === 'count' && record.financialEventId == null) return;
        if (prepaidFinancialLinks.has(record.financialEventId)) {
            throw formalReportError('prepaidTransactions[' + recordIndex + '].financialEventId is already linked by prepaidTransactions['
                + prepaidFinancialLinks.get(record.financialEventId) + ']');
        }
        prepaidFinancialLinks.set(record.financialEventId, recordIndex);
        const event = financialById.get(record.financialEventId);
        const expectedTypes = record.type === 'opening' ? ['purchase', 'adjustment']
            : (record.type === 'inflow' ? ['prepaidCharge']
                : (record.type === 'outflow' ? ['prepaidConsumption']
                    : (record.type === 'refund' ? ['refund'] : ['adjustment'])));
        const expectedDirection = record.type === 'refund' ? 'inflow'
            : (record.type === 'inflow' || (event && event.eventType === 'purchase') ? 'outflow' : record.direction);
        const mustBeNonCash = record.type === 'outflow' || record.type === 'adjust'
            || (event && event.eventType === 'adjustment');
        if (!event || event.assetId !== record.assetId || event.currency !== index[record.assetId].currency
            || expectedTypes.indexOf(event.eventType) < 0 || event.direction !== expectedDirection || event.voidedAt
            || event.effectiveDate !== record.effectiveDate
            || (mustBeNonCash && event.metadata.affectsCash !== false)) {
            throw formalReportError('prepaidTransactions[' + recordIndex + '].financialEventId has incompatible semantics');
        }
    });
    sidecars.subscriptionPeriods.forEach((record, recordIndex) => {
        if (record.paymentEventId == null) return;
        const event = financialById.get(record.paymentEventId);
        if (!event || event.assetId !== record.assetId
            || event.eventType !== 'subscriptionPayment' || event.direction !== 'outflow'
            || event.currency !== index[record.assetId].currency || event.voidedAt) {
            throw formalReportError('subscriptionPeriods[' + recordIndex + '].paymentEventId has incompatible semantics');
        }
    });
    sidecars.maintenance.forEach((record, recordIndex) => {
        const path = 'maintenance[' + recordIndex + ']';
        assertRecordUuid(record, path);
        const owner = assertOwner(record, path);
        if (owner.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw formalReportError(path + ' belongs to an incompatible asset kind');
        const keys = Object.keys(record || {});
        const unknown = keys.filter(key => ['id', 'assetId', 'type', 'date', 'note', 'createdAt', 'financialEventId', 'details'].indexOf(key) < 0);
        if (unknown.length) throw formalReportError(path + ' contains unknown field ' + unknown[0]);
        if (record.type !== 'repair' && record.type !== 'maintain') throw formalReportError(path + '.type is invalid');
        if (record.financialEventId !== null && !isUUID(record.financialEventId)) throw formalReportError(path + '.financialEventId must be a UUID or null');
        if (!record.details || typeof record.details !== 'object' || Array.isArray(record.details)) throw formalReportError(path + '.details must be an object');
        if (Object.keys(record.details).length) throw formalReportError(path + '.details contains unsupported field ' + Object.keys(record.details)[0]);
        if (!isBusinessDateString(record.date)) throw formalReportError(path + '.date must be YYYY-MM-DD');
        if (typeof record.note !== 'string' || typeof record.createdAt !== 'string'
            || Number.isNaN(Date.parse(record.createdAt)) || new Date(record.createdAt).toISOString() !== record.createdAt) {
            throw formalReportError(path + ' has invalid note or createdAt');
        }
    });
    const lifecycleKinds = Object.values(LIFECYCLE_EVENT_TYPE);
    sidecars.lifecycleEvents.forEach((record, recordIndex) => {
        const path = 'lifecycleEvents[' + recordIndex + ']';
        assertRecordUuid(record, path);
        const owner = assertOwner(record, path);
        const validation = validateFormalLifecycleRecord(record);
        if (!validation.valid) throw formalReportError(path + ' is invalid: ' + validation.errors.join('; '));
        const subscriptionKinds = ['subscriptionStarted', 'subscriptionRenewed', 'subscriptionReopened', 'subscriptionCancelled', 'subscriptionSkipped'];
        if (subscriptionKinds.includes(record.kind) && owner.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
            throw formalReportError(path + ' belongs to an incompatible asset kind');
        }
        if (record.kind === 'maintenanceRecorded' && owner.kind !== FORMAL_ASSET_KIND.PHYSICAL) {
            throw formalReportError(path + ' belongs to an incompatible asset kind');
        }
    });
    const lifecycleChain = validateFormalLifecycleReplacementChain(sidecars.lifecycleEvents);
    if (!lifecycleChain.valid) throw formalReportError('lifecycleEvents replacement chain is invalid: ' + lifecycleChain.errors.join('; '));
    return index;
}

function sidecarsForFormalAsset(sidecars, assetId) {
    return {
        subscriptionPeriods: sidecars.subscriptionPeriods.filter(record => record.assetId === assetId),
        prepaidTransactions: sidecars.prepaidTransactions.filter(record => record.assetId === assetId),
        financialEvents: sidecars.financialEvents.filter(record => record.assetId === assetId),
    };
}

function incrementFormalMinorBucket(target, currency, field, amountMinor, countField) {
    if (!hasOwn(target, currency)) target[currency] = { currency: currency };
    target[currency][field] = safeAddFormal(target[currency][field] == null ? 0 : target[currency][field], amountMinor, field);
    if (countField) target[currency][countField] = safeAddFormal(target[currency][countField] == null ? 0 : target[currency][countField], 1, countField);
}

function formalRiskEntry(card, date, reference) {
    if (!date) return null;
    const parsed = parseRecordedDate(date);
    if (!parsed) return null;
    return {
        assetId: card.id,
        date: date,
        daysRemaining: daysUntil(date, dayKey(reference)),
    };
}

function buildFormalReport(snapshot, filterInput, options) {
    const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
    const assets = formalSnapshotArray(source, 'assets', 'assets', true);
    assets.forEach((asset, index) => {
        const validation = validateFormalV2Asset(asset);
        if (!validation.valid) throw formalReportError('assets[' + index + '] is not canonical: ' + validation.errors.join('; '));
    });
    const globalAssetIds = new Set();
    assets.forEach((asset, index) => {
        if (globalAssetIds.has(asset.id)) throw formalReportError('assets[' + index + '].id must be globally unique');
        globalAssetIds.add(asset.id);
    });
    const filter = normalizeFormalReportFilter(filterInput, options && options.now);
    const window = getMonthWindow(filter);
    const reference = parseRecordedDate(filter.endDate);
    const sidecars = formalSnapshotForProjection(source);
    validateFormalReportSidecars(assets, sidecars);
    const selected = assets.filter(asset => {
        if (asset.status === 'wishlist') return false;
        if (filter.statuses.length && !filter.statuses.includes(asset.status)) return false;
        if (filter.kinds.length && !filter.kinds.includes(asset.kind)) return false;
        if (filter.currencies.length && !filter.currencies.includes(asset.currency)) return false;
        if (filter.tagIds.length && !filter.tagIds.some(tagId => asset.tagIds.includes(tagId))) return false;
        if (filter.categoryIds.length && !filter.categoryIds.includes(asset.categoryId)) return false;
        const acquired = parseRecordedDate(asset.acquiredOn);
        return acquired && isWithinReportRange(acquired, window);
    });
    const cards = selected.map((asset, index) => {
        const path = 'selectedAssets[' + index + '](' + asset.id + ')';
        try {
            return projectFormalAsset(asset, sidecarsForFormalAsset(sidecars, asset.id), filter.endDate);
        } catch (error) {
            // Only formal contract validation errors cross this public report
            // boundary as FORMAL_REPORT_INVALID. Programming errors retain their
            // original type/stack and are deliberately not swallowed.
            if (error && error.code === 'FORMAL_ASSET_INVALID') {
                throw formalReportError(path + ': ' + error.message, error, path);
            }
            throw error;
        }
    });
    const buckets = window.buckets.map(bucket => ({
        key: bucket.key,
        startDate: bucket.startDate,
        endDate: bucket.endDate,
        assetCount: 0,
        acquisitionAmountMinorByCurrency: createDict(),
    }));
    const bucketByKey = createDict();
    buckets.forEach(bucket => { bucketByKey[bucket.key] = bucket; });
    const report = {
        schemaGeneration: 'formal-v2',
        filter: filter,
        assets: cards,
        counts: { total: cards.length, byKind: createDict(), byStatus: createDict() },
        tags: { uniqueCount: 0, byTagId: createDict() },
        amounts: {
            acquisitionByCurrency: createDict(),
            // 口径（v2.6.2）：净额与日均只累计在役（active）资产；退役资产不计入
            // 「我的资产」总金额，其转让所得单独聚合到 retiredSaleByCurrency。
            netByCurrency: createDict(),
            // 退役回收：退役资产的转让卖出（sale + inflow）流入合计，按资产币种分组；
            // assetCount = 至少有一笔 sale 事件的退役资产数（每张卡最多计 1 次）。
            retiredSaleByCurrency: createDict(),
            recordedFinancialsByCurrency: createDict(),
        },
        rankings: { byCurrency: createDict() },
        prepaid: {
            amountByCurrency: createDict(),
            countByAsset: createDict(),
            // v2.6.3：次数维卡合计；charge = 期初 + 追加，consume = 消费。
            countTotals: { assetCount: 0, remainingCount: 0, chargeCount: 0, consumeCount: 0 },
            expiringWithin30Days: [],
        },
        // v2.6.3 订阅专属聚合（不复用实物口径）：累计支出含已退役订阅的历史
        // 付款；月度支出只在役，并按计费周期折算；试用期（无付款事件）计 0。
        subscription: {
            total: 0,
            byState: { subscribed: 0, expired: 0, pendingConfirmation: 0, trial: 0 },
            byCurrency: createDict(),
            upcomingRenewals: [],
        },
        maintenance: { recordCount: 0, costByCurrency: createDict() },
        wishlist: { total: 0, active: 0, purchased: 0, abandoned: 0, purchaseRate: 0, abandonRate: 0 },
        dataCoverage: {
            maintenance: { provided: sidecars.maintenance.length, selected: 0 },
            lifecycleEvents: { provided: sidecars.lifecycleEvents.length, selected: 0 },
        },
        risks: {
            expiry: { expired: [], within7Days: [], within30Days: [] },
            renewal: { lapsed: [], indeterminate: [], trials: [], plannedWithin30Days: [] },
            costGoal: { achieved: [], pending: [] },
        },
        trends: { timeBasis: 'acquiredOn', buckets: buckets },
    };

    // Wishlist conversion is event-sourced. Keep it separate from owned-asset
    // counts because wishlist assets are intentionally excluded from report.cards.
    const wishlistIds = new Set(assets.filter(asset => asset.status === 'wishlist').map(asset => asset.id));
    const purchasedIds = new Set();
    const abandonedIds = new Set();
    sidecars.wishlistEvents.forEach(event => {
        if (!event || !event.sourceWishlistId) return;
        wishlistIds.add(event.sourceWishlistId);
        if (event.eventType === 'purchased') purchasedIds.add(event.sourceWishlistId);
        if (event.eventType === 'abandoned') abandonedIds.add(event.sourceWishlistId);
    });
    report.wishlist.total = wishlistIds.size;
    report.wishlist.active = assets.filter(asset => asset.status === 'wishlist').length;
    report.wishlist.purchased = purchasedIds.size;
    report.wishlist.abandoned = abandonedIds.size;
    report.wishlist.purchaseRate = wishlistIds.size ? purchasedIds.size / wishlistIds.size : 0;
    report.wishlist.abandonRate = wishlistIds.size ? abandonedIds.size / wishlistIds.size : 0;

    cards.forEach(card => {
        incrementFormalGroup(report.counts.byKind, card.kind, 'counts.byKind');
        incrementFormalGroup(report.counts.byStatus, card.status, 'counts.byStatus');
        card.tagIds.forEach(tagId => {
            if (!hasOwn(report.tags.byTagId, tagId)) report.tags.byTagId[tagId] = { count: 0, assetIds: [] };
            report.tags.byTagId[tagId].count = safeAddFormal(report.tags.byTagId[tagId].count, 1, 'tags.count');
            report.tags.byTagId[tagId].assetIds.push(card.id);
        });
        incrementFormalMinorBucket(report.amounts.acquisitionByCurrency, card.currency, 'amountMinor', card.acquisition.amountMinor, 'assetCount');
        // 口径（v2.6.2）：净额/日均只在役——退役资产不参与总金额与日均聚合。
        if (card.status === ASSET_STATUS.ACTIVE) {
            if (!hasOwn(report.amounts.netByCurrency, card.currency)) report.amounts.netByCurrency[card.currency] = {
                currency: card.currency, netAmountMinor: 0, dailyAmountMinor: 0, assetCount: 0,
            };
            const netBucket = report.amounts.netByCurrency[card.currency];
            netBucket.netAmountMinor = safeAddFormal(netBucket.netAmountMinor, card.financials.cashTotals.netAmountMinor, 'netByCurrency.netAmountMinor');
            const daily = formalDailyAmountMinor({
                kind: card.kind,
                acquiredOn: card.acquiredOn,
                cashNetAmountMinor: card.financials.cashTotals.netAmountMinor,
                referenceDate: reference,
                subscription: card.subscription,
                financialEvents: sidecars.financialEvents.filter(event => event && event.assetId === card.id),
            });
            netBucket.dailyAmountMinor = safeAddFormal(netBucket.dailyAmountMinor, daily.amountMinor, 'netByCurrency.dailyAmountMinor');
            netBucket.assetCount = safeAddFormal(netBucket.assetCount, 1, 'netByCurrency.assetCount');
        }
        // 退役回收：退役资产的转让卖出流入合计（按资产币种）；每张卡最多计 1 次 assetCount。
        if (card.status === ASSET_STATUS.RETIRED) {
            const saleEvents = sidecars.financialEvents.filter(event => event
                && event.assetId === card.id
                && !event.voidedAt
                && event.eventType === FINANCIAL_EVENT_TYPE.SALE
                && event.direction === FINANCIAL_DIRECTION.INFLOW);
            if (saleEvents.length) {
                if (!hasOwn(report.amounts.retiredSaleByCurrency, card.currency)) {
                    report.amounts.retiredSaleByCurrency[card.currency] = {
                        currency: card.currency, saleAmountMinor: 0, assetCount: 0,
                    };
                }
                const saleBucket = report.amounts.retiredSaleByCurrency[card.currency];
                saleEvents.forEach(event => {
                    saleBucket.saleAmountMinor = safeAddFormal(saleBucket.saleAmountMinor, event.amountMinor, 'retiredSaleByCurrency.saleAmountMinor');
                });
                saleBucket.assetCount = safeAddFormal(saleBucket.assetCount, 1, 'retiredSaleByCurrency.assetCount');
            }
        }
        if (!hasOwn(report.rankings.byCurrency, card.currency)) report.rankings.byCurrency[card.currency] = [];
        report.rankings.byCurrency[card.currency].push({ assetId: card.id, name: card.name,
            acquisitionAmountMinor: card.financials.acquisitionAmountMinor, netAmountMinor: card.financials.cashTotals.netAmountMinor });
        const recorded = card.financials.cashTotals;
        if (!hasOwn(report.amounts.recordedFinancialsByCurrency, card.currency)) {
            report.amounts.recordedFinancialsByCurrency[card.currency] = {
                currency: card.currency, inflowAmountMinor: 0, outflowAmountMinor: 0, netAmountMinor: 0, eventCount: 0,
            };
        }
        const financeBucket = report.amounts.recordedFinancialsByCurrency[card.currency];
        ['inflowAmountMinor', 'outflowAmountMinor', 'netAmountMinor', 'eventCount'].forEach(field => {
            financeBucket[field] = safeAddFormal(financeBucket[field], recorded[field], 'recordedFinancials.' + field);
        });

        if (card.prepaid && card.prepaid.dimension === 'amount') {
            if (!hasOwn(report.prepaid.amountByCurrency, card.currency)) {
                report.prepaid.amountByCurrency[card.currency] = { currency: card.currency, balanceAmountMinor: 0, assetCount: 0, transactionCount: 0, chargeAmountMinor: 0, consumeAmountMinor: 0 };
            }
            const target = report.prepaid.amountByCurrency[card.currency];
            target.balanceAmountMinor = safeAddFormal(target.balanceAmountMinor, card.prepaid.balanceAmountMinor, 'prepaid.balanceAmountMinor');
            target.assetCount = safeAddFormal(target.assetCount, 1, 'prepaid.assetCount');
            target.transactionCount = safeAddFormal(target.transactionCount, card.prepaid.transactionCount, 'prepaid.transactionCount');
            // v2.6.3：charge = 期初 + 追加充值，consume = 消费；utilizationRate 循环后统一投影。
            target.chargeAmountMinor = safeAddFormal(target.chargeAmountMinor,
                safeAddFormal(card.prepaid.openingAmountMinor, card.prepaid.inflowAmountMinor, 'prepaid.chargeAmountMinor'), 'prepaid.chargeAmountMinor');
            target.consumeAmountMinor = safeAddFormal(target.consumeAmountMinor, card.prepaid.outflowAmountMinor, 'prepaid.consumeAmountMinor');
        } else if (card.prepaid) {
            const key = card.id;
            if (!hasOwn(report.prepaid.countByAsset, key)) {
                report.prepaid.countByAsset[key] = { assetId: key, remainingCount: 0, assetCount: 0, transactionCount: 0 };
            }
            const target = report.prepaid.countByAsset[key];
            target.remainingCount = safeAddFormal(target.remainingCount, card.prepaid.remainingCount, 'prepaid.remainingCount');
            target.assetCount = safeAddFormal(target.assetCount, 1, 'prepaid.assetCount');
            target.transactionCount = safeAddFormal(target.transactionCount, card.prepaid.transactionCount, 'prepaid.transactionCount');
            // v2.6.3：次数维卡合计；charge = 期初 + 追加，consume = 消费。
            report.prepaid.countTotals.assetCount = safeAddFormal(report.prepaid.countTotals.assetCount, 1, 'prepaid.countTotals.assetCount');
            report.prepaid.countTotals.remainingCount = safeAddFormal(report.prepaid.countTotals.remainingCount, card.prepaid.remainingCount, 'prepaid.countTotals.remainingCount');
            report.prepaid.countTotals.chargeCount = safeAddFormal(report.prepaid.countTotals.chargeCount,
                safeAddFormal(card.prepaid.openingCount, card.prepaid.inflowCount, 'prepaid.countTotals.chargeCount'), 'prepaid.countTotals.chargeCount');
            report.prepaid.countTotals.consumeCount = safeAddFormal(report.prepaid.countTotals.consumeCount, card.prepaid.outflowCount, 'prepaid.countTotals.consumeCount');
        }

        const expiry = formalRiskEntry(card, card.nextImportant && card.nextImportant.date, reference);
        if (expiry) {
            if (expiry.daysRemaining < 0) report.risks.expiry.expired.push(expiry);
            else if (expiry.daysRemaining <= 30) {
                report.risks.expiry.within30Days.push(expiry);
                if (expiry.daysRemaining <= 7) report.risks.expiry.within7Days.push(expiry);
            }
        }
        if (card.subscription) {
            if (card.subscription.state === 'lapsed') report.risks.renewal.lapsed.push(card.id);
            if (card.subscription.indeterminate) report.risks.renewal.indeterminate.push(card.id);
            if (card.subscription.isTrial) report.risks.renewal.trials.push(card.id);
            const renewal = formalRiskEntry(card, card.subscription.plannedRenewalDate, reference);
            if (renewal && renewal.daysRemaining >= 0 && renewal.daysRemaining <= 30) report.risks.renewal.plannedWithin30Days.push(renewal);
        }
        if (card.costGoal) report.risks.costGoal[card.costGoal.achieved ? 'achieved' : 'pending'].push(card.id);
        const bucket = bucketByKey[card.acquiredOn.slice(0, 7)];
        bucket.assetCount = safeAddFormal(bucket.assetCount, 1, 'trend.assetCount');
        incrementFormalMinorBucket(bucket.acquisitionAmountMinorByCurrency, card.currency, 'amountMinor', card.acquisition.amountMinor, 'assetCount');
    });

    // -----------------------------------------------------------------
    // v2.6.3 订阅专属聚合：不再套用实物报表口径。累计支出含已退役订阅的
    // 历史付款；月度支出只算在役订阅，按计费周期折算；试用期计 0。
    // -----------------------------------------------------------------
    const financialEventById = new Map(sidecars.financialEvents.map(event => [event.id, event]));
    const periodPaymentAmountMinor = period => {
        if (!period || period.paymentEventId == null) return 0;
        const paymentEvent = financialEventById.get(period.paymentEventId);
        if (!paymentEvent || paymentEvent.voidedAt) return 0;
        return paymentEvent.amountMinor;
    };
    const billingCycleMonths = asset => {
        const cycle = asset && asset.details && asset.details.billingPlan ? asset.details.billingPlan.cycle : null;
        return typeof cycle === 'string' && hasOwn(SUBSCRIPTION_BILLING_CYCLE_MONTHS, cycle) ? SUBSCRIPTION_BILLING_CYCLE_MONTHS[cycle] : 1;
    };
    // selected 与 cards 同序：取原始资产以获得 cards 投影不含的 details。
    const subscriptionEntries = [];
    cards.forEach((card, index) => {
        if (card.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) subscriptionEntries.push({ card: card, asset: selected[index] });
    });
    report.subscription.total = subscriptionEntries.length;
    const subscriptionEntryById = createDict();
    subscriptionEntries.forEach(entry => { subscriptionEntryById[entry.card.id] = entry; });
    subscriptionEntries.forEach(entry => {
        const card = entry.card;
        if (card.status !== ASSET_STATUS.ACTIVE || !card.subscription) return;
        if (!hasOwn(report.subscription.byCurrency, card.currency)) {
            report.subscription.byCurrency[card.currency] = { currency: card.currency, paidAmountMinor: 0, monthlyAmountMinor: 0, activeCount: 0 };
        }
        const currencyBucket = report.subscription.byCurrency[card.currency];
        currencyBucket.activeCount = safeAddFormal(currencyBucket.activeCount, 1, 'subscription.activeCount');
        // 分桶优先级 trial > subscribed > expired > pendingConfirmation，每张卡只计一桶。
        const stateKey = card.subscription.isTrial ? 'trial'
            : (hasOwn(report.subscription.byState, card.subscription.state) ? card.subscription.state : null);
        if (stateKey) report.subscription.byState[stateKey] = safeAddFormal(report.subscription.byState[stateKey], 1, 'subscription.byState.' + stateKey);
        // 月度支出 = 当期付款 ÷ 计费周期月数；试用期/无当期/无付款事件计 0。
        const periodAmount = periodPaymentAmountMinor(card.subscription.currentPeriod);
        if (periodAmount > 0) {
            const monthly = Math.round(periodAmount / billingCycleMonths(entry.asset));
            currencyBucket.monthlyAmountMinor = safeAddFormal(currencyBucket.monthlyAmountMinor, monthly, 'subscription.monthlyAmountMinor');
        }
    });
    // 累计支出：所有选中订阅卡（含退役）的未作废订阅付款流出，按 owner 币种入桶。
    sidecars.financialEvents.forEach(event => {
        if (!event || !hasOwn(subscriptionEntryById, event.assetId)) return;
        if (event.eventType !== FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT) return;
        if (event.direction !== FINANCIAL_DIRECTION.OUTFLOW) return;
        if (event.voidedAt) return;
        const currency = subscriptionEntryById[event.assetId].card.currency;
        if (!hasOwn(report.subscription.byCurrency, currency)) {
            report.subscription.byCurrency[currency] = { currency: currency, paidAmountMinor: 0, monthlyAmountMinor: 0, activeCount: 0 };
        }
        const currencyBucket = report.subscription.byCurrency[currency];
        currencyBucket.paidAmountMinor = safeAddFormal(currencyBucket.paidAmountMinor, event.amountMinor, 'subscription.paidAmountMinor');
    });
    // 即将续期：复用 risks.renewal.plannedWithin30Days 条目，补当期付款金额与币种。
    report.subscription.upcomingRenewals = report.risks.renewal.plannedWithin30Days
        .map(entry => {
            const found = hasOwn(subscriptionEntryById, entry.assetId) ? subscriptionEntryById[entry.assetId] : null;
            const card = found ? found.card : null;
            return {
                assetId: entry.assetId,
                date: entry.date,
                daysRemaining: entry.daysRemaining,
                amountMinor: card && card.subscription ? periodPaymentAmountMinor(card.subscription.currentPeriod) : 0,
                currency: card ? card.currency : null,
            };
        })
        .sort((left, right) => left.daysRemaining - right.daysRemaining);

    // v2.6.3 预付扩展：利用率 = 消费 / 充值（原始比值不取整）；未来 30 天
    // 内到期的预付卡按剩余天数升序，口径与 formalRiskEntry 一致。
    Object.keys(report.prepaid.amountByCurrency).forEach(currency => {
        const bucket = report.prepaid.amountByCurrency[currency];
        bucket.utilizationRate = bucket.chargeAmountMinor > 0 ? bucket.consumeAmountMinor / bucket.chargeAmountMinor : 0;
    });
    report.prepaid.expiringWithin30Days = cards
        .filter(card => card.prepaid)
        .map(card => formalRiskEntry(card, card.expiryOn, reference))
        .filter(entry => entry && entry.daysRemaining >= 0 && entry.daysRemaining <= 30)
        .sort((left, right) => left.daysRemaining - right.daysRemaining);

    const selectedIds = new Set(cards.map(card => card.id));
    sidecars.maintenance.forEach(record => {
        if (!selectedIds.has(record.assetId)) return;
        const owner = assets.find(asset => asset.id === record.assetId);
        const event = record.financialEventId == null ? null : sidecars.financialEvents.find(item => item.id === record.financialEventId);
        if (record.financialEventId != null && (!event || event.assetId !== record.assetId || event.eventType !== 'maintenance'
            || event.currency !== owner.currency || event.direction !== 'outflow' || event.voidedAt)) {
            throw formalReportError('maintenance financialEventId references no compatible financial event');
        }
        const currency = owner.currency;
        if (!hasOwn(report.maintenance.costByCurrency, currency)) {
            report.maintenance.costByCurrency[currency] = { currency, cost: 0, recordCount: 0 };
        }
        const bucket = report.maintenance.costByCurrency[currency];
        bucket.cost = safeAddFormal(bucket.cost, event ? event.amountMinor : 0, 'maintenance.costAmountMinor');
        bucket.costAmountMinor = bucket.cost;
        bucket.recordCount = safeAddFormal(bucket.recordCount, 1, 'maintenance.recordCount');
        report.maintenance.recordCount = safeAddFormal(report.maintenance.recordCount, 1, 'maintenance.recordCount');
        report.dataCoverage.maintenance.selected = safeAddFormal(report.dataCoverage.maintenance.selected, 1, 'maintenance.selected');
    });
    sidecars.lifecycleEvents.forEach(record => {
        if (selectedIds.has(record.assetId)) report.dataCoverage.lifecycleEvents.selected = safeAddFormal(
            report.dataCoverage.lifecycleEvents.selected, 1, 'lifecycleEvents.selected');
    });
    report.tags.uniqueCount = Object.keys(report.tags.byTagId).length;
    Object.keys(report.rankings.byCurrency).forEach(currency => report.rankings.byCurrency[currency].sort((left, right) => {
        if (left.netAmountMinor === right.netAmountMinor) return left.name.localeCompare(right.name);
        return left.netAmountMinor < right.netAmountMinor ? 1 : -1;
    }));
    return deepFreeze(report);
}

function buildFormalDashboard(snapshot, rangeInput, options) {
    const range = normalizeDashboardRange(rangeInput);
    const now = options && options.now;
    const reference = parseRecordedDate(now) || beijingBusinessDateFromInstant(new Date());
    const trend = dashboardTrendWindow(range, reference);
    const report = buildFormalReport(snapshot, {
        dateFrom: dayKey(trend.start),
        endDate: dayKey(trend.end),
        months: range === '6m' ? 6 : 12,
    }, { now: now });
    const dashboard = {
        schemaGeneration: 'formal-v2',
        range: range,
        referenceDate: report.filter.endDate,
        summary: { total: report.counts.total, byStatus: report.counts.byStatus },
        currencies: Object.fromEntries(Object.entries(report.amounts.netByCurrency).map(([currency, bucket]) => [currency,
            Object.assign({}, bucket, { amountMinor: bucket.netAmountMinor })])),
        composition: { byKind: report.counts.byKind },
        trend: report.trends,
        risks: report.risks,
        maintenance: report.maintenance,
        dataCoverage: report.dataCoverage,
    };
    return deepFreeze(dashboard);
}

const DASHBOARD_RANGES = Object.freeze(['30d', '6m', '12m']);

function normalizeDashboardRange(value) {
    return DASHBOARD_RANGES.includes(value) ? value : '12m';
}

function dashboardTrendWindow(range, reference) {
    const referenceDay = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
    if (range === '30d') {
        const start = new Date(referenceDay.getTime() - 29 * 86400000);
        const buckets = [];
        for (let index = 0; index < 5; index++) {
            const bucketStart = new Date(start.getTime() + index * 7 * 86400000);
            if (bucketStart > referenceDay) break;
            const bucketEnd = new Date(Math.min(referenceDay.getTime(), bucketStart.getTime() + 6 * 86400000));
            buckets.push({
                key: dayKey(bucketStart),
                label: dayKey(bucketStart).slice(5),
                startDate: dayKey(bucketStart),
                endDate: dayKey(bucketEnd),
                count: 0,
            });
        }
        return { mode: 'week', start: start, end: referenceDay, buckets: buckets };
    }

    const months = range === '6m' ? 6 : 12;
    const startMonth = new Date(Date.UTC(referenceDay.getUTCFullYear(), referenceDay.getUTCMonth() - months + 1, 1));
    const buckets = [];
    for (let index = 0; index < months; index++) {
        const bucketStart = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + index, 1));
        const nextMonth = new Date(Date.UTC(bucketStart.getUTCFullYear(), bucketStart.getUTCMonth() + 1, 1));
        const bucketEnd = new Date(Math.min(referenceDay.getTime(), nextMonth.getTime() - 86400000));
        buckets.push({
            key: monthKey(bucketStart),
            label: String(bucketStart.getUTCMonth() + 1),
            startDate: dayKey(bucketStart),
            endDate: dayKey(bucketEnd),
            count: 0,
        });
    }
    return { mode: 'month', start: startMonth, end: referenceDay, buckets: buckets };
}

// v2.4.2 心动值投影。计数严格从 wishlistEvents 事件流派生
// （eventType === 'heartbeat'），主表不落缓存；UI 层负责封顶与渲染。
function deriveWishlistHeartbeat(events, assetId) {
    if (!Array.isArray(events)) return { count: 0 };
    let count = 0;
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        if (event && event.eventType === 'heartbeat' && event.sourceWishlistId === assetId) count += 1;
    }
    return { count: count };
}

// 有目标（target 为 ≥1 的安全整数）：ratio = count / target（数值，UI 层自行
// 封顶），reached = count >= target；阶段按 ratio 分档。
// 无目标（target 为 null / 非法）：ratio = null，reached = false；阶段按
// 计数里程碑分档（0 / 1-4 / 5-9 / 10-19 / ≥20）。
function describeWishlistHeartbeat(count, target) {
    const total = Number.isSafeInteger(count) && count > 0 ? count : 0;
    const hasTarget = Number.isSafeInteger(target) && target >= 1;
    if (!hasTarget) {
        const stage = total === 0 ? ['seed', '🌰']
            : total < 5 ? ['sprout', '🌱']
            : total < 10 ? ['growing', '🌿']
            : total < 20 ? ['thriving', '☘️']
            : ['bloom', '🌸'];
        return { ratio: null, stageKey: stage[0], emoji: stage[1], reached: false };
    }
    const ratio = total / target;
    const reached = total >= target;
    const stage = total === 0 ? ['seed', '🌰']
        : ratio < 0.25 ? ['sprout', '🌱']
        : ratio < 0.5 ? ['growing', '🌿']
        : ratio < 0.75 ? ['thriving', '☘️']
        : ratio < 1 ? ['budding', '🌷']
        : ['bloom', '🌸'];
    return { ratio: ratio, stageKey: stage[0], emoji: stage[1], reached: reached };
}

module.exports = {
    DASHBOARD_RANGES: DASHBOARD_RANGES,
    normalizeDashboardRange: normalizeDashboardRange,
    normalizeFormalReportFilter: normalizeFormalReportFilter,
    buildFormalReport: buildFormalReport,
    buildFormalDashboard: buildFormalDashboard,
    deriveWishlistHeartbeat: deriveWishlistHeartbeat,
    describeWishlistHeartbeat: describeWishlistHeartbeat,
};
