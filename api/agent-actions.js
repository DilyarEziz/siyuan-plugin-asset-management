/* eslint-disable no-undef */
/**
 * Official SiYuan Agent action boundary.
 *
 * This module only validates arguments, projects a safe in-memory domain view,
 * and delegates writes to public plugin methods supplied by the caller. It does
 * not know about storage and never persists JSON by itself.
 */

'use strict';

const {
    FORMAL_ASSET_KIND,
    FORMAL_ASSET_KINDS,
    FORMAL_BILLING_CYCLES,
    FORMAL_CATEGORIES,
    ASSET_STATUS,
    newFormalV2Asset,
    mergeFormalV2AssetPatch,
    validateFormalV2Asset,
    projectFormalSubscription,
    projectFormalPrepaid,
    projectFormalFinancials,
    getFormalNextImportantDate,
    computeStats,
} = require('./assets');
const { buildFormalReport } = require('./report');
const {
    isUUID,
    isISO4217Currency,
    daysUntil,
    minorToMajorString,
} = require('./algorithms');

const AGENT_SCHEMA = 'asset-agent-v1';
const AGENT_PERMISSION_KEYS = Object.freeze([
    'aiAllowQuery',
    'aiAllowCreate',
    'aiAllowModify',
    'aiAllowLifecycle',
    'aiAllowRecords',
    'aiAllowDelete',
]);
const AGENT_DEFAULT_SETTINGS = Object.freeze({
    aiEnabled: false,
    aiAllowQuery: true,
    aiAllowCreate: false,
    aiAllowModify: false,
    aiAllowLifecycle: false,
    aiAllowRecords: false,
    aiAllowDelete: false,
});
const LEGACY_AGENT_SETTING_KEYS = Object.freeze([
    'aiPrivacyScope',
    'aiIncludeFinancial',
    'aiIncludeNotes',
    'aiMaxAssets',
    'aiLanguage',
]);
const AGENT_DEFAULT_LOCALE = 'en-US';
const AGENT_ERROR_DEFINITIONS = Object.freeze({
    UNKNOWN_FIELD: {
        'en-US': { message: 'The request contains a field that this tool does not support.', recovery: 'Remove the unsupported field and retry with the fields supported by this tool.' },
        'zh-CN': { message: '请求包含当前工具不支持的字段。', recovery: '移除不支持的字段，并按当前工具支持的参数重试。' },
    },
    INVALID_ARGS: {
        'en-US': { message: 'The request parameters are invalid.', recovery: 'Check the required and supported parameters for this tool, then retry.' },
        'zh-CN': { message: '请求参数无效。', recovery: '检查当前工具支持的参数和必填项后重试。' },
    },
    INVALID_ASSET: {
        'en-US': { message: 'The asset information is invalid or incomplete.', recovery: 'Check the required information and asset type, then retry.' },
        'zh-CN': { message: '资产信息无效或不完整。', recovery: '检查必填信息和资产类型后重试。' },
    },
    INVALID_PATCH: {
        'en-US': { message: 'The requested changes are invalid.', recovery: 'Submit only supported changes and retry.' },
        'zh-CN': { message: '请求的修改无效。', recovery: '只提交当前工具支持的修改内容后重试。' },
    },
    INVALID_KIND: {
        'en-US': { message: 'This asset type does not support the requested operation.', recovery: 'Query the asset first, then use an operation supported by its type.' },
        'zh-CN': { message: '该资产类型不支持当前操作。', recovery: '先查询资产，再使用适用于该类型的操作。' },
    },
    INVALID_ACTION: {
        'en-US': { message: 'This operation requires a different action.', recovery: 'Use the action required by the tool for this operation, then retry.' },
        'zh-CN': { message: '当前操作要求使用匹配的 action。', recovery: '按工具对当前操作的要求使用正确的 action 后重试。' },
    },
    INVALID_STATUS: {
        'en-US': { message: "The asset's current status does not allow this operation.", recovery: 'Query the asset and choose an operation allowed for its current status.' },
        'zh-CN': { message: '当前资产状态不允许此操作。', recovery: '先查询资产状态，再选择允许的操作。' },
    },
    INVALID_AMOUNT: {
        'en-US': { message: 'The amount or count is invalid.', recovery: 'Use a non-negative whole-number amount, and use a positive amount where required.' },
        'zh-CN': { message: '金额或次数无效。', recovery: '使用非负整数金额；当前操作要求正数时请使用大于零的金额。' },
    },
    INVALID_DATE: {
        'en-US': { message: 'The date or date range is invalid.', recovery: 'Use valid YYYY-MM-DD dates and ensure the end date is not before the start date.' },
        'zh-CN': { message: '日期或日期范围无效。', recovery: '使用有效的 YYYY-MM-DD 日期，并确保结束日不早于开始日。' },
    },
    INVALID_CURRENCY: {
        'en-US': { message: 'The currency is invalid.', recovery: 'Use a supported three-letter currency code and retry.' },
        'zh-CN': { message: '货币代码无效。', recovery: '使用受支持的三字母货币代码后重试。' },
    },
    INVALID_ENUM: {
        'en-US': { message: 'One of the selected values is invalid.', recovery: 'Use one of the values supported by this operation and retry.' },
        'zh-CN': { message: '选择的值无效。', recovery: '使用当前操作支持的值后重试。' },
    },
    CATEGORY_NOT_FOUND: {
        'en-US': { message: 'The category could not be matched exactly.', recovery: 'Use a supported category ID or an exact category label, then retry.' },
        'zh-CN': { message: '找不到完全匹配的分类。', recovery: '使用受支持的分类 ID 或完全匹配的分类名称后重试。' },
    },
    TAG_NOT_FOUND: {
        'en-US': { message: 'The requested tag was not found by exact label.', recovery: 'Query the tag catalog or use asset_tag_create to create and bind the missing tag.' },
        'zh-CN': { message: '按标签名称精确匹配不到该标签。', recovery: '先查询标签目录，或使用 asset_tag_create 创建并绑定缺失标签。' },
    },
    TAG_CREATE_REQUIRED: {
        'en-US': { message: 'The asset refers to a tag that does not exist.', recovery: 'Use asset_tag_create with the exact label to create and bind the tag, then retry.' },
        'zh-CN': { message: '资产引用的标签不存在。', recovery: '使用 asset_tag_create 传入准确标签名创建并绑定后重试。' },
    },
    TAG_LIMIT_EXCEEDED: {
        'en-US': { message: 'An asset can have at most three tags.', recovery: 'Remove a tag or replace the tags with no more than three exact labels, then retry.' },
        'zh-CN': { message: '每个资产最多绑定 3 个标签。', recovery: '先移除标签，或用不超过 3 个准确标签执行替换后重试。' },
    },
    INVALID_PAGINATION: {
        'en-US': { message: 'The search paging values are invalid.', recovery: 'Use a non-negative offset and a page size within the supported limit.' },
        'zh-CN': { message: '查询分页参数无效。', recovery: '使用非负偏移量和受支持范围内的分页大小。' },
    },
    INVALID_ASSET_ID: {
        'en-US': { message: 'The asset identifier is invalid.', recovery: 'Query the asset first and use the exact identifier returned by the query.' },
        'zh-CN': { message: '资产标识无效。', recovery: '先查询资产，再使用查询结果返回的准确资产标识。' },
    },
    ASSET_NOT_FOUND: {
        'en-US': { message: 'The requested asset was not found.', recovery: 'Query the current assets and retry with an existing asset identifier.' },
        'zh-CN': { message: '找不到请求的资产。', recovery: '查询当前资产后，使用现有资产的准确标识重试。' },
    },
    SUBSCRIPTION_PERIOD_OVERLAP: {
        'en-US': { message: 'The subscription dates overlap an existing period.', recovery: 'Choose a date range that does not overlap an existing subscription period.' },
        'zh-CN': { message: '订阅日期与已有周期重叠。', recovery: '选择不与已有订阅周期重叠的起止日期。' },
    },
    SUBSCRIPTION_PERIOD_INVALID: {
        'en-US': { message: 'The subscription period is invalid.', recovery: 'Use valid YYYY-MM-DD dates and ensure the end date is not before the start date.' },
        'zh-CN': { message: '订阅周期无效。', recovery: '使用有效的 YYYY-MM-DD 日期，并确保结束日不早于开始日。' },
    },
    SUBSCRIPTION_START_DATE_USE_LIFECYCLE: {
        'en-US': { message: 'A subscription start date must use the lifecycle start-date operation.', recovery: 'Use asset_lifecycle with op=updateStartDate; asset_update cannot rewrite a subscription period.' },
        'zh-CN': { message: '订阅起期必须使用生命周期专用操作。', recovery: '使用 asset_lifecycle 的 op=updateStartDate；asset_update 不能改写订阅周期。' },
    },
    SUBSCRIPTION_RENEWAL_INVALID: {
        'en-US': { message: 'The subscription renewal cannot be applied.', recovery: 'Query the subscription status and current period, then retry with a valid renewal operation.' },
        'zh-CN': { message: '当前订阅续费无法执行。', recovery: '先查询订阅状态和当前周期，再使用正确的续费操作重试。' },
    },
    DOMAIN_UNAVAILABLE: {
        'en-US': { message: 'Asset data is temporarily unavailable.', recovery: 'Wait for the asset data to finish loading, then retry.' },
        'zh-CN': { message: '资产数据暂时不可用。', recovery: '等待资产数据加载完成后重试。' },
    },
    PERMISSION_DENIED: {
        'en-US': { message: 'This Agent tool is not permitted.', recovery: 'Enable the corresponding permission in Asset Management Settings → AI, then retry.' },
        'zh-CN': { message: '此 Agent 工具未获允许。', recovery: '请在“资产管理设置 → AI”中开启对应权限后重试。' },
    },
    AGENT_DISABLED: {
        'en-US': { message: 'Agent tools are disabled.', recovery: 'Enable Agent tools in Asset Management Settings → AI, then retry.' },
        'zh-CN': { message: 'Agent 工具已关闭。', recovery: '请在“资产管理设置 → AI”中开启 Agent 工具后重试。' },
    },
    METHOD_UNAVAILABLE: {
        'en-US': { message: 'This operation is temporarily unavailable.', recovery: 'Retry shortly; if it continues, perform the operation in Asset Management.' },
        'zh-CN': { message: '当前操作暂时不可用。', recovery: '稍后重试；若持续失败，请在资产管理界面完成操作。' },
    },
    ACTION_FAILED: {
        'en-US': { message: 'The asset operation could not be completed.', recovery: 'Check the request and retry; if it continues, perform the operation in Asset Management.' },
        'zh-CN': { message: '资产操作未完成。', recovery: '检查请求后重试；若持续失败，请在资产管理界面完成操作。' },
    },
    QUEUE_CORRUPT: {
        'en-US': { message: 'The Agent write queue is corrupted or unreadable.', recovery: 'Reload Asset Management or restart SiYuan, then retry the operation.' },
        'zh-CN': { message: 'Agent 写入队列损坏或无法读取。', recovery: '重载资产管理插件或重启思源后重试当前操作。' },
    },
    QUEUE_UNAVAILABLE: {
        'en-US': { message: 'The Agent write queue is temporarily unavailable.', recovery: 'Retry shortly; if it continues, reload Asset Management or restart SiYuan.' },
        'zh-CN': { message: 'Agent 写入队列暂时不可用。', recovery: '稍后重试；若持续失败，请重载资产管理插件或重启思源。' },
    },
    WRITE_TIMEOUT: {
        'en-US': { message: 'The Agent write request timed out because the frontend plugin did not respond.', recovery: 'Reload Asset Management or restart SiYuan, then retry the operation.' },
        'zh-CN': { message: 'Agent 写入请求超时，前端插件未响应。', recovery: '重载资产管理插件或重启思源后重试当前操作。' },
    },
    AGENT_WRITE_COORDINATION_UNAVAILABLE: {
        'en-US': { message: 'Agent writes are unavailable because this environment cannot provide safe coordination.', recovery: 'Use the desktop SiYuan environment with Web Locks enabled, or complete this operation in Asset Management.' },
        'zh-CN': { message: '当前环境无法提供安全的 Agent 写入协调，因此写入已停止。', recovery: '请在支持 Web Locks 的桌面思源环境中重试，或直接在资产管理界面完成操作。' },
    },
    WRITE_RESULT_UNCERTAIN: {
        'en-US': { message: 'The write result is uncertain, so the operation was not retried to avoid a duplicate change.', recovery: 'Query the asset and its financial or lifecycle history before trying again.' },
        'zh-CN': { message: '写入结果无法确认，为避免重复修改，系统没有自动重试。', recovery: '请先查询资产及其财务或生命周期记录，确认结果后再操作。' },
    },
});
const AGENT_LEGACY_PERMISSION_HINT = ' 可在资产管理设置 → AI 中开启。';
const AGENT_ACTION_NAMES = Object.freeze([
    'asset_query',
    'asset_create',
    'asset_update',
    'asset_lifecycle',
    'asset_price_update',
    'asset_record',
    'asset_delete',
    'asset_tag_update',
    'asset_tag_create',
]);
const QUERY_OPERATIONS = Object.freeze(['count', 'search', 'detail', 'summary', 'tags']);
const LIFECYCLE_OPERATIONS = Object.freeze([
    'setStatus',
    'retire',
    'sale',
    'renewSubscription',
    'toggleAutoRenew',
    'updateStartDate',
    'updatePeriodEnd',
]);
const RECORD_OPERATIONS = Object.freeze([
    'purchaseAmount',
    'subscriptionPaymentAmount',
    'maintenance',
    'prepaidTransaction',
    'prepaidAdjust',
    'prepaidConsumption',
]);
const SEARCH_PAGE_SIZE_DEFAULT = 50;
const SEARCH_PAGE_SIZE_MAX = 200;
const NOTE_MAX_CHARS = 500;

function hasOwn(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
}

function normalizeAgentSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const result = {
        aiEnabled: source.aiEnabled === true,
        aiAllowQuery: hasOwn(source, 'aiAllowQuery') ? source.aiAllowQuery === true : true,
        aiAllowCreate: source.aiAllowCreate === true,
        aiAllowModify: source.aiAllowModify === true,
        aiAllowLifecycle: source.aiAllowLifecycle === true,
        aiAllowRecords: source.aiAllowRecords === true,
        aiAllowDelete: source.aiAllowDelete === true,
    };
    return result;
}

function stripLegacyAgentSettings(raw) {
    const result = isPlainObject(raw) ? Object.assign({}, raw) : {};
    LEGACY_AGENT_SETTING_KEYS.forEach(key => { delete result[key]; });
    return result;
}

function actionError(code, message) {
    const error = new Error(String(message || code || 'Agent action failed'));
    error.agentCode = code || 'ACTION_FAILED';
    return error;
}

function normalizeAgentLocale(value) {
    const normalized = String(value == null ? '' : value).trim().toLowerCase().replace(/_/g, '-');
    if (normalized === 'zh' || normalized.indexOf('zh-') === 0) return 'zh-CN';
    if (normalized === 'en' || normalized.indexOf('en-') === 0) return 'en-US';
    return AGENT_DEFAULT_LOCALE;
}

function normalizeQueryLocale(value) {
    if (value == null || value === '') return 'zh-CN';
    const normalized = String(value).trim().replace(/_/g, '-').toLowerCase();
    if (normalized !== 'zh-cn' && normalized !== 'en-us') throw actionError('INVALID_ENUM', 'locale is invalid');
    return normalized === 'zh-cn' ? 'zh-CN' : 'en-US';
}

const DISPLAY_LABELS = Object.freeze({
    status: Object.freeze({
        wishlist: Object.freeze({ 'zh-CN': '种草中', 'en-US': 'Wishlisted' }),
        active: Object.freeze({ 'zh-CN': '在役', 'en-US': 'Active' }),
        retired: Object.freeze({ 'zh-CN': '退役', 'en-US': 'Retired' }),
    }),
    kind: Object.freeze({
        physical: Object.freeze({ 'zh-CN': '实物资产', 'en-US': 'Physical asset' }),
        virtualSubscription: Object.freeze({ 'zh-CN': '订阅服务', 'en-US': 'Subscription service' }),
        virtualPerpetual: Object.freeze({ 'zh-CN': '虚拟买断', 'en-US': 'Perpetual virtual license' }),
        prepaidAmount: Object.freeze({ 'zh-CN': '金额预付', 'en-US': 'Prepaid amount' }),
        prepaidCount: Object.freeze({ 'zh-CN': '次数预付', 'en-US': 'Prepaid count' }),
    }),
    category: Object.freeze({
        digital: Object.freeze({ 'zh-CN': '数码', 'en-US': 'Digital' }),
        appliance: Object.freeze({ 'zh-CN': '家电', 'en-US': 'Appliance' }),
        home: Object.freeze({ 'zh-CN': '家居', 'en-US': 'Home' }),
        otherPhysical: Object.freeze({ 'zh-CN': '其他实物', 'en-US': 'Other physical' }),
        member: Object.freeze({ 'zh-CN': '会员', 'en-US': 'Membership' }),
        software: Object.freeze({ 'zh-CN': '软件', 'en-US': 'Software' }),
        service: Object.freeze({ 'zh-CN': '服务', 'en-US': 'Service' }),
        domain: Object.freeze({ 'zh-CN': '域名', 'en-US': 'Domain' }),
        ai: Object.freeze({ 'zh-CN': 'AI', 'en-US': 'AI' }),
        otherVirtual: Object.freeze({ 'zh-CN': '其他虚拟', 'en-US': 'Other virtual' }),
        prepaidAmount: Object.freeze({ 'zh-CN': '金额预付', 'en-US': 'Prepaid amount' }),
        prepaidCount: Object.freeze({ 'zh-CN': '次数预付', 'en-US': 'Prepaid count' }),
    }),
    cycle: Object.freeze({
        monthly: Object.freeze({ 'zh-CN': '月付', 'en-US': 'Monthly' }),
        quarterly: Object.freeze({ 'zh-CN': '季付', 'en-US': 'Quarterly' }),
        halfYearly: Object.freeze({ 'zh-CN': '半年付', 'en-US': 'Half-yearly' }),
        yearly: Object.freeze({ 'zh-CN': '年付', 'en-US': 'Yearly' }),
    }),
});

const CATEGORY_LABEL_ALIASES = Object.freeze({
    digital: ['digital', '数码'],
    appliance: ['appliance', '家电'],
    home: ['home', '家居'],
    otherPhysical: ['otherphysical', 'other physical', '其他实物'],
    member: ['member', 'membership', '会员'],
    software: ['software', '软件'],
    service: ['service', '服务'],
    domain: ['domain', '域名'],
    ai: ['ai'],
    otherVirtual: ['othervirtual', 'other virtual', '其他虚拟'],
    prepaidAmount: ['prepaidamount', 'prepaid amount', '金额预付'],
    prepaidCount: ['prepaidcount', 'prepaid count', '次数预付'],
});

function displayLabel(group, value, locale) {
    const item = DISPLAY_LABELS[group] && DISPLAY_LABELS[group][value];
    return item ? item[locale] || item[AGENT_DEFAULT_LOCALE] : (value == null ? null : String(value));
}

function resolveCategoryId(value, kind) {
    if (value == null || value === '') return value === null ? null : undefined;
    if (typeof value !== 'string') throw actionError('CATEGORY_NOT_FOUND', 'category is not a supported category label');
    const raw = value.trim();
    const key = raw.toLowerCase();
    const candidates = FORMAL_CATEGORIES.filter(category => category.kinds.indexOf(kind) >= 0 && (
        category.id.toLowerCase() === key
        || (CATEGORY_LABEL_ALIASES[category.id] || []).some(label => label.toLowerCase() === key)
    ));
    if (candidates.length !== 1) throw actionError('CATEGORY_NOT_FOUND', 'category does not match exactly one supported category');
    return candidates[0].id;
}

function readAgentErrorText(error) {
    try {
        return String(error && error.message || error || 'Agent action failed');
    } catch (cause) {
        return 'Agent action failed';
    }
}

function safeMessage(error) {
    const raw = readAgentErrorText(error)
        .replace(/\r?\n/g, ' ')
        .replace(/\b[A-Za-z]:[\\/][^\s]+/g, '[redacted path]')
        .replace(/\/(?:[^\s/]+\/)+[^\s/]*/g, '[redacted path]')
        .replace(/\s+/g, ' ')
        .trim();
    return raw.slice(0, 240) || 'Agent action failed';
}

function readMachineErrorCandidate(error) {
    return error && error.agentCode != null ? error.agentCode : error && error.code;
}

function machineErrorCode(error) {
    const candidate = readMachineErrorCandidate(error);
    if (candidate == null) return null;
    if (typeof candidate === 'string'
        && /^[A-Za-z0-9_-]+$/.test(candidate)
        && candidate.length <= 80
        && hasOwn(AGENT_ERROR_DEFINITIONS, candidate)) return candidate;
    return 'ACTION_FAILED';
}

function inferAgentErrorDefinition(error) {
    const text = readAgentErrorText(error).toLowerCase();
    if (/(?:subscription|billing)\s+(?:period|date)[^\n]{0,100}\b(?:overlap|overlaps|重叠)/i.test(text)
        || /\b(?:overlap|overlaps)\b[^\n]{0,100}(?:subscription|billing)\s+(?:period|date)/i.test(text)) {
        return 'SUBSCRIPTION_PERIOD_OVERLAP';
    }
    if (/invalid subscription period|no subscription period to edit|subscription period end date must not|subscription start date must/i.test(text)) {
        return 'SUBSCRIPTION_PERIOD_INVALID';
    }
    if (/subscription start dates? use asset_lifecycle|updateStartDate.*subscription/i.test(text)) {
        return 'SUBSCRIPTION_START_DATE_USE_LIFECYCLE';
    }
    if (/(?:invalid|must not be before|before its start)\s+(?:subscription\s+)?(?:period|start date|end date)/i.test(text)
        || /subscription period end date/i.test(text)
        || /invalid (?:retired|sold|effective)date/i.test(text)
        || /invalid (?:retiredDate|soldOn|effectiveDate)/i.test(text)) {
        return 'INVALID_DATE';
    }
    if (/subscription billing cycle is missing/i.test(text)
        || /invalid subscription billing cycle/i.test(text)
        || /no subscription payment event to correct/i.test(text)
        || /renew(?:al|subscription)[^\n]{0,100}(?:invalid|cannot|requires|unavailable)/i.test(text)) {
        return 'SUBSCRIPTION_RENEWAL_INVALID';
    }
    if (/subscription asset is required/i.test(text)
        || /subscription uses (?:correct|renew)/i.test(text)) return 'INVALID_KIND';
    if (/(?:amount|price|count|payment)[^\n]{0,100}(?:invalid|required|positive|non-negative|safe integer)/i.test(text)
        || /invalid (?:purchase|prepaid|maintenance|consumption) amount/i.test(text)
        || /invalid (?:targetCount|consumption count|prepaid count|priceMinor|amountMinor)/i.test(text)
        || /insufficient remaining count/i.test(text)) {
        return 'INVALID_AMOUNT';
    }
    if (/formal asset data is not fully loaded/i.test(text)
        || /(?:snapshot|asset data|storage)[^\n]{0,100}(?:unavailable|not loaded|failed|corrupt)/i.test(text)) {
        return 'DOMAIN_UNAVAILABLE';
    }
    if (/owned asset is required|requires an owned asset/i.test(text)) return 'INVALID_STATUS';
    return null;
}

function errorDefinitionCode(error, code) {
    if (code && code !== 'ACTION_FAILED' && hasOwn(AGENT_ERROR_DEFINITIONS, code)) return code;
    const candidate = readMachineErrorCandidate(error);
    if (candidate != null && candidate !== 'ACTION_FAILED') return 'ACTION_FAILED';
    return inferAgentErrorDefinition(error) || 'ACTION_FAILED';
}

function safeError(error, locale) {
    const code = machineErrorCode(error) || inferAgentErrorDefinition(error) || 'ACTION_FAILED';
    const hasExplicitLocale = locale != null || error && error.locale != null;
    const language = normalizeAgentLocale(locale != null ? locale : error && error.locale);
    const definitionCode = errorDefinitionCode(error, code);
    const definition = AGENT_ERROR_DEFINITIONS[definitionCode] || AGENT_ERROR_DEFINITIONS.ACTION_FAILED;
    const localized = definition[language] || definition[AGENT_DEFAULT_LOCALE];
    const message = !hasExplicitLocale && (definitionCode === 'PERMISSION_DENIED' || definitionCode === 'AGENT_DISABLED')
        ? localized.message + AGENT_LEGACY_PERMISSION_HINT
        : localized.message;
    return { code: code, message: message, recovery: localized.recovery, locale: language };
}

function stringify(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ ok: false, error: { code: 'RESULT_SERIALIZE_FAILED', message: 'Result could not be serialized' } });
    }
}

function success(operation, data, total, offset, pageSize, hasMore) {
    const safeTotal = Number.isSafeInteger(total) && total >= 0 ? total : 0;
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const safePageSize = Number.isSafeInteger(pageSize) && pageSize >= 0 ? pageSize : 0;
    return stringify({
        ok: true,
        data: data == null ? null : data,
        meta: {
            schema: AGENT_SCHEMA,
            operation: operation,
            total: safeTotal,
            offset: safeOffset,
            pageSize: safePageSize,
            hasMore: hasMore === true,
        },
    });
}

function failure(error, locale) {
    return stringify({ ok: false, error: safeError(error, locale) });
}

function requestLocale(raw, configuredLocale) {
    if (isPlainObject(raw) && hasOwn(raw, 'locale')) return normalizeAgentLocale(raw.locale);
    return normalizeAgentLocale(configuredLocale);
}

function withoutRequestLocale(raw) {
    if (!isPlainObject(raw) || !hasOwn(raw, 'locale')) return raw;
    const copy = Object.assign({}, raw);
    delete copy.locale;
    return copy;
}

function assertKnownKeys(value, allowed, path) {
    if (!isPlainObject(value)) throw actionError('INVALID_ARGS', path + ' must be an object');
    const unknown = Object.keys(value).filter(key => allowed.indexOf(key) < 0 && key !== 'action');
    if (unknown.length) throw actionError('UNKNOWN_FIELD', path + '.' + unknown[0] + ' is not supported');
}

function requiredString(value, field) {
    if (typeof value !== 'string' || !value.trim()) throw actionError('INVALID_ARGS', field + ' is required');
    return value.trim();
}

function optionalString(value, field, maxLength) {
    if (value == null) return undefined;
    if (typeof value !== 'string') throw actionError('INVALID_ARGS', field + ' must be a string');
    const text = value.trim();
    if (text.length > maxLength) throw actionError('INVALID_ARGS', field + ' is too long');
    return text;
}

function validBusinessDate(value, field) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw actionError('INVALID_DATE', field + ' must be YYYY-MM-DD');
    }
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw actionError('INVALID_DATE', field + ' must be a valid YYYY-MM-DD date');
    }
    return value;
}

function optionalBusinessDate(value, field) {
    return value == null ? undefined : validBusinessDate(value, field);
}

function assetId(value) {
    const id = requiredString(value, 'assetId').toLowerCase();
    if (!isUUID(id) || id !== String(value).trim()) throw actionError('INVALID_ASSET_ID', 'assetId must be a lowercase UUID');
    return id;
}

function safeIntegerLike(value) {
    if (Number.isSafeInteger(value)) return value;
    let text;
    try { text = String(value == null ? '' : value).trim(); }
    catch (error) { return null; }
    if (!/^(?:0|[1-9]\d*)$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function amount(value, field, positive) {
    const normalized = safeIntegerLike(value);
    if (normalized == null || normalized < 0 || (positive && normalized <= 0)) {
        throw actionError('INVALID_AMOUNT', field + ' must be a ' + (positive ? 'positive' : 'non-negative') + ' safe integer amountMinor');
    }
    return normalized;
}

function optionalAmount(value, field, positive) {
    return value == null ? undefined : amount(value, field, positive);
}

function enumValue(value, values, field) {
    if (values.indexOf(value) < 0) throw actionError('INVALID_ENUM', field + ' is invalid');
    return value;
}

function page(value, field, fallback, max) {
    if (value == null) return fallback;
    if (!Number.isSafeInteger(value) || value < 0 || value > max) throw actionError('INVALID_PAGINATION', field + ' is invalid');
    return value;
}

function completeDomain(domain) {
    if (!isPlainObject(domain) || !Array.isArray(domain.assets)) return false;
    return [
        'tags', 'financialEvents', 'subscriptionPeriods', 'prepaidTransactions',
        'maintenance', 'usage', 'lifecycleEvents', 'wishlistEvents', 'operationLogs',
    ].every(key => Array.isArray(domain[key]));
}

// Kernel-side callers pass async getters (storage reads); frontend callers pass
// sync getters. Awaiting a plain value resolves to itself, so both work here.
async function requireDomain(getDomain, request) {
    const domain = await (typeof getDomain === 'function' ? getDomain(request) : null);
    if (!completeDomain(domain)) throw actionError('DOMAIN_UNAVAILABLE', 'formal asset data is not fully loaded');
    return domain;
}

// Bilingual hint appended to permission errors so the model (and the user it
// relays to) can locate the switches without exposing any local path info.
const AGENT_PERMISSION_HINT = ' Enable it in Asset Management Settings -> AI. 可在 资产管理设置 → AI 中开启。';

async function requirePermission(getSettings, permission) {
    const raw = await (typeof getSettings === 'function' ? getSettings() : null);
    const settings = normalizeAgentSettings(raw);
    if (settings.aiEnabled !== true) throw actionError('AGENT_DISABLED', 'official Agent tools are disabled.' + AGENT_PERMISSION_HINT);
    const required = Array.isArray(permission) ? permission : (permission ? [permission] : []);
    if (required.some(key => settings[key] !== true)) throw actionError('PERMISSION_DENIED', 'permission is disabled for this tool.' + AGENT_PERMISSION_HINT);
    return settings;
}

function tagMatches(asset, query, tags) {
    if (!query) return true;
    const wanted = String(query).trim().toLowerCase();
    if (!wanted) return true;
    const tagIds = Array.isArray(asset.tagIds) ? asset.tagIds : [];
    if (tagIds.some(id => String(id).toLowerCase() === wanted)) return true;
    const tagById = new Map((Array.isArray(tags) ? tags : []).map(tag => [String(tag && tag.id || '').toLowerCase(), tag]));
    return tagIds.some(id => String(tagById.get(String(id).toLowerCase()) && tagById.get(String(id).toLowerCase()).label || '').toLowerCase().includes(wanted));
}

function matchesAsset(asset, args, tags) {
    if (args.status != null && asset.status !== args.status) return false;
    if (args.kind != null && asset.kind !== args.kind) return false;
    if (args.categoryId != null && asset.categoryId !== args.categoryId) return false;
    if (args.currency != null && asset.currency !== args.currency) return false;
    if (args.tagId != null && !(Array.isArray(asset.tagIds) && asset.tagIds.indexOf(args.tagId) >= 0)) return false;
    if (args.tag != null && !tagMatches(asset, args.tag, tags)) return false;
    if (args.search != null) {
        const query = String(args.search).trim().toLocaleLowerCase();
        if (query && !String(asset.name || '').toLocaleLowerCase().includes(query)) return false;
    }
    return true;
}

function normalizeQueryArgs(raw) {
    assertKnownKeys(raw, ['op', 'assetId', 'search', 'status', 'kind', 'categoryId', 'currency', 'tag', 'tagId', 'offset', 'pageSize', 'includeNotes', 'locale'], 'args');
    const args = isPlainObject(raw) ? raw : {};
    const op = enumValue(args.op, QUERY_OPERATIONS, 'op');
    const locale = normalizeQueryLocale(args.locale);
    if (op === 'detail') {
        assertKnownKeys(args, ['op', 'assetId', 'includeNotes', 'locale'], 'args');
        return { op: op, assetId: assetId(args.assetId), includeNotes: args.includeNotes === true, locale: locale };
    }
    if (op === 'summary') {
        assertKnownKeys(args, ['op', 'locale'], 'args');
        return { op: op, locale: locale };
    }
    if (op === 'tags') {
        assertKnownKeys(args, ['op', 'locale'], 'args');
        return { op: op, locale: locale };
    }
    if (args.assetId != null) throw actionError('INVALID_ARGS', 'assetId is only accepted by detail');
    if (args.includeNotes != null && args.includeNotes !== true && args.includeNotes !== false) {
        throw actionError('INVALID_ARGS', 'includeNotes must be boolean');
    }
    if (args.status != null) enumValue(args.status, ['wishlist', 'active', 'retired'], 'status');
    if (args.kind != null) enumValue(args.kind, FORMAL_ASSET_KINDS, 'kind');
    if (args.categoryId != null) optionalString(args.categoryId, 'categoryId', 80);
    if (args.tagId != null) assetId(args.tagId);
    if (args.currency != null) {
        if (typeof args.currency !== 'string' || !isISO4217Currency(args.currency.toUpperCase())) throw actionError('INVALID_CURRENCY', 'currency must be ISO 4217');
    }
    if (args.tag != null) optionalString(args.tag, 'tag', 120);
    if (args.search != null) optionalString(args.search, 'search', 200);
    if (op === 'count') {
        assertKnownKeys(args, ['op', 'status', 'kind', 'categoryId', 'currency', 'tag', 'tagId', 'locale'], 'args');
    } else {
        assertKnownKeys(args, ['op', 'search', 'status', 'kind', 'categoryId', 'currency', 'tag', 'tagId', 'offset', 'pageSize', 'locale'], 'args');
    }
    return Object.assign({}, args, {
        op: op,
        categoryId: args.categoryId == null ? undefined : String(args.categoryId).trim(),
        currency: args.currency == null ? undefined : String(args.currency).trim().toUpperCase(),
        tagId: args.tagId == null ? undefined : String(args.tagId).trim().toLowerCase(),
        locale: locale,
        offset: page(args.offset, 'offset', 0, Number.MAX_SAFE_INTEGER),
        pageSize: page(args.pageSize, 'pageSize', SEARCH_PAGE_SIZE_DEFAULT, SEARCH_PAGE_SIZE_MAX),
    });
}

function redactText(value, maxChars) {
    let text = value == null ? '' : String(value);
    text = text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted token]')
        .replace(/\b(?:sk|ghp|xoxb)[-_][A-Za-z0-9_-]+\b/gi, '[redacted token]')
        .replace(/\b(?:api[\s_-]?key|password|secret|token|cookie)\s*[:=]\s*[^\s,;]+/gi, '[redacted credential]')
        .replace(/\b[A-Za-z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]+/g, '[redacted path]')
        .replace(/\/(?:[^/\s]+\/)+[^/\s]*/g, '[redacted path]')
        .replace(/[\r\n\t ]+/g, ' ')
        .trim();
    return Array.from(text).slice(0, maxChars).join('');
}

function safeCover(cover) {
    if (!isPlainObject(cover)) return { kind: 'none' };
    if (cover.kind === 'preset') return { kind: 'preset', presetId: String(cover.presetId || '').slice(0, 80) };
    if (cover.kind === 'emoji') return { kind: 'emoji', emoji: String(cover.emoji || '').slice(0, 16) };
    return { kind: cover.kind === 'none' ? 'none' : 'none' };
}

function safeDetails(asset) {
    const details = isPlainObject(asset.details) ? asset.details : {};
    if (asset.kind === FORMAL_ASSET_KIND.PHYSICAL) {
        return { warrantyEndsOn: details.warrantyEndsOn || null, costGoal: clone(details.costGoal) };
    }
    if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
        const cycle = details.billingPlan && details.billingPlan.cycle || null;
        return {
            planName: redactText(details.planName, 120),
            billingPlan: { cycle: cycle },
            billingCycle: cycle,
            autoRenew: details.autoRenew === true,
        };
    }
    if (asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) {
        return { provider: redactText(details.provider, 120) || null, expiresOn: details.expiresOn || null };
    }
    return {};
}

function safeTagCatalog(tags) {
    return (Array.isArray(tags) ? tags : []).map(tag => ({
        id: tag && typeof tag.id === 'string' ? tag.id : '',
        label: redactText(tag && tag.label, 120),
    })).filter(tag => tag.id && tag.label);
}

function projectDisplay(asset, tags, locale) {
    const tagById = new Map(safeTagCatalog(tags).map(tag => [tag.id.toLowerCase(), tag]));
    const cycle = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
        && asset.details && asset.details.billingPlan ? asset.details.billingPlan.cycle : null;
    const tagItems = (Array.isArray(asset.tagIds) ? asset.tagIds : []).map(id => {
        const tag = tagById.get(String(id).toLowerCase());
        return { id: String(id), label: tag ? tag.label : null };
    });
    return {
        locale: locale,
        kindLabel: displayLabel('kind', asset.kind, locale),
        statusLabel: displayLabel('status', asset.status, locale),
        categoryLabel: displayLabel('category', asset.categoryId, locale),
        billingCycleLabel: displayLabel('cycle', cycle, locale),
        autoRenewLabel: asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            ? (asset.details && asset.details.autoRenew === true
                ? (locale === 'zh-CN' ? '已开启' : 'Enabled')
                : (locale === 'zh-CN' ? '未开启' : 'Disabled'))
            : null,
        tags: tagItems,
    };
}

function riskProjection(asset, domain, today) {
    // Each subscription projection must receive only that asset's periods.
    // Passing the complete sidecar makes valid periods from another asset fail
    // the formal assetId ownership assertion.
    const periods = (Array.isArray(domain.subscriptionPeriods) ? domain.subscriptionPeriods : [])
        .filter(period => period && period.assetId === asset.id);
    const important = getFormalNextImportantDate(asset, periods, today);
    const days = important && important.date ? daysUntil(important.date, today) : null;
    let bucket = 'none';
    if (days != null && days < 0) bucket = 'expired';
    else if (days != null && days <= 7) bucket = 'within7';
    else if (days != null && days <= 30) bucket = 'within30';
    else if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && asset.status === ASSET_STATUS.ACTIVE) bucket = 'renewal';
    return { bucket: bucket, daysUntil: days, importantDate: important ? important.date : null, importantType: important ? important.type : null };
}

function projectSafeAsset(asset, domain, options) {
    const opts = options || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const summaryOnly = opts.summaryOnly === true;
    const locale = normalizeQueryLocale(opts.locale);
    const output = {
        id: asset.id,
        kind: asset.kind,
        name: redactText(asset.name, 200),
        status: asset.status,
        currency: asset.currency,
        acquiredOn: asset.status === ASSET_STATUS.WISHLIST ? null : asset.acquiredOn,
        statusChangedOn: asset.statusChangedOn || null,
        categoryId: asset.categoryId || null,
        tagIds: Array.isArray(asset.tagIds) ? asset.tagIds.slice() : [],
        cover: safeCover(asset.cover),
        details: safeDetails(asset),
        display: projectDisplay(asset, domain.tags, locale),
        subscription: null,
        prepaid: null,
        expiry: { date: null, type: null },
        risk: summaryOnly ? null : riskProjection(asset, domain, today),
        relatedNotes: Array.isArray(asset.relatedNotes) ? asset.relatedNotes.map(note => ({
            title: redactText(note && note.title, 160),
            addedAt: note && note.addedAt || null,
        })) : [],
    };
    if (summaryOnly) return output;
    if (asset.status !== ASSET_STATUS.WISHLIST) {
        output.financials = projectFormalFinancials(asset, domain.financialEvents.filter(event => event && event.assetId === asset.id));
    }
    if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && asset.status !== ASSET_STATUS.WISHLIST) {
        output.subscription = projectFormalSubscription(asset, domain.subscriptionPeriods.filter(period => period && period.assetId === asset.id), today);
        if (output.subscription) {
            output.subscription = {
                state: output.subscription.state,
                currentPeriod: output.subscription.currentPeriod ? {
                    startDate: output.subscription.currentPeriod.startDate,
                    endDate: output.subscription.currentPeriod.endDate,
                } : null,
                latestPeriod: output.subscription.latestPeriod ? {
                    startDate: output.subscription.latestPeriod.startDate,
                    endDate: output.subscription.latestPeriod.endDate,
                } : null,
                plannedRenewalDate: output.subscription.plannedRenewalDate,
                isTrial: output.subscription.isTrial,
            };
        }
    }
    if ((asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT)
        && asset.status !== ASSET_STATUS.WISHLIST) {
        output.prepaid = projectFormalPrepaid(
            asset,
            domain.prepaidTransactions.filter(record => record && record.assetId === asset.id),
            domain.financialEvents.filter(event => event && event.assetId === asset.id),
        );
    }
    if (output.risk.importantDate) output.expiry = { date: output.risk.importantDate, type: output.risk.importantType };
    if (opts.includeNotes === true) output.notes = redactText(asset.notes, NOTE_MAX_CHARS);
    return output;
}

function queryCount(args, domain) {
    const matching = domain.assets.filter(asset => matchesAsset(asset, args, domain.tags));
    const byStatus = Object.create(null);
    const byKind = Object.create(null);
    const byCurrency = Object.create(null);
    matching.forEach(asset => {
        byStatus[asset.status] = (byStatus[asset.status] || 0) + 1;
        byKind[asset.kind] = (byKind[asset.kind] || 0) + 1;
        byCurrency[asset.currency] = (byCurrency[asset.currency] || 0) + 1;
    });
    return { value: { count: matching.length, byStatus: byStatus, byKind: byKind, byCurrency: byCurrency, display: displayMaps(args.locale) }, total: matching.length };
}

function querySearch(args, domain) {
    const matching = domain.assets.filter(asset => matchesAsset(asset, args, domain.tags));
    const pageItems = matching.slice(args.offset, args.offset + args.pageSize);
    const today = new Date().toISOString().slice(0, 10);
    return {
        // Search is a fast summary path. Ask for detail by exact assetId when
        // the Agent needs financial, subscription, or prepaid projections.
        value: pageItems.map(asset => projectSafeAsset(asset, domain, { today, summaryOnly: true, locale: args.locale })),
        total: matching.length,
        offset: args.offset,
        pageSize: args.pageSize,
        hasMore: args.offset + pageItems.length < matching.length,
    };
}

function queryDetail(args, domain) {
    const asset = domain.assets.find(item => item && item.id === args.assetId);
    if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found; search results are not a substitute for an exact ID');
    return { value: projectSafeAsset(asset, domain, { includeNotes: args.includeNotes, today: new Date().toISOString().slice(0, 10), locale: args.locale }), total: 1 };
}

function queryTags(domain, locale) {
    return { value: safeTagCatalog(domain.tags), total: Array.isArray(domain.tags) ? domain.tags.length : 0 };
}

function displayMaps(locale) {
    const mapOf = group => Object.keys(DISPLAY_LABELS[group] || {}).reduce((result, key) => {
        result[key] = displayLabel(group, key, locale);
        return result;
    }, Object.create(null));
    return { locale: locale, kind: mapOf('kind'), status: mapOf('status'), category: mapOf('category'), cycle: mapOf('cycle') };
}

function querySummary(domain, locale) {
    const today = new Date().toISOString().slice(0, 10);
    const byStatus = Object.create(null);
    const byKind = Object.create(null);
    const byCurrency = Object.create(null);
    domain.assets.forEach(asset => {
        byStatus[asset.status] = (byStatus[asset.status] || 0) + 1;
        byKind[asset.kind] = (byKind[asset.kind] || 0) + 1;
        byCurrency[asset.currency] = (byCurrency[asset.currency] || 0) + 1;
    });
    let stats = {};
    try {
        stats = computeStats(domain.assets, domain.financialEvents, domain.subscriptionPeriods) || {};
    } catch (error) {
        // Summary remains useful when a derived statistics field is unavailable.
        stats = {};
    }
    const reportAssets = domain.assets.filter(asset => asset.status !== ASSET_STATUS.WISHLIST);
    const minDate = reportAssets.reduce((min, asset) => !min || asset.acquiredOn < min ? asset.acquiredOn : min, today);
    let report = null;
    try {
        report = buildFormalReport(domain, { dateFrom: minDate, endDate: today }, { now: new Date().toISOString() });
    } catch (error) {
        // Do not expose report validation paths or stacks to the Agent. The
        // stable count projection above is still returned with empty derived data.
        report = null;
    }
    const risks = report && isPlainObject(report.risks) ? report.risks : {};
    const amounts = report && isPlainObject(report.amounts) ? report.amounts : {};
    const prepaid = report && isPlainObject(report.prepaid) ? report.prepaid : {};
    return {
        value: {
            counts: { total: domain.assets.length, byStatus: byStatus, byKind: byKind, byCurrency: byCurrency, stats: stats, display: displayMaps(locale) },
            risk: risks,
            expiry: isPlainObject(risks.expiry) ? risks.expiry : {},
            prepaid: prepaid,
            financial: {
                recordedByCurrency: amounts.recordedFinancialsByCurrency && isPlainObject(amounts.recordedFinancialsByCurrency)
                    ? amounts.recordedFinancialsByCurrency : {},
                netByCurrency: amounts.netByCurrency && isPlainObject(amounts.netByCurrency)
                    ? amounts.netByCurrency : {},
            },
        },
        total: domain.assets.length,
    };
}

function validateCreateArgs(raw) {
    const optionKeys = ['purchaseAmountMinor', 'prepaidInitialAmountMinor', 'prepaidOpeningCount', 'subscriptionPeriodEnd'];
    assertKnownKeys(raw, ['data', 'options'].concat(optionKeys), 'args');
    if (!isPlainObject(raw.data)) throw actionError('INVALID_ARGS', 'data is required and must be an object');
    const legacyOptions = raw.options == null ? {} : raw.options;
    assertKnownKeys(legacyOptions, optionKeys, 'options');
    optionKeys.forEach(key => {
        if (hasOwn(raw, key) && hasOwn(legacyOptions, key)) {
            throw actionError('INVALID_ARGS', key + ' must not be supplied both at top level and in options');
        }
    });
    const providedOptionKeys = optionKeys.filter(key => hasOwn(raw, key) || hasOwn(legacyOptions, key));
    if (raw.data.status === ASSET_STATUS.WISHLIST && providedOptionKeys.length) throw actionError('INVALID_ARGS', 'wishlist creation does not accept opening options');
    const optionValue = key => hasOwn(raw, key) ? raw[key] : legacyOptions[key];
    const options = {};
    const purchaseAmountMinor = optionalAmount(optionValue('purchaseAmountMinor'), 'purchaseAmountMinor', false);
    const prepaidInitialAmountMinor = optionalAmount(optionValue('prepaidInitialAmountMinor'), 'prepaidInitialAmountMinor', false);
    if (purchaseAmountMinor !== undefined) options.purchaseAmountMinor = purchaseAmountMinor;
    if (prepaidInitialAmountMinor !== undefined) options.prepaidInitialAmountMinor = prepaidInitialAmountMinor;
    const prepaidOpeningCount = optionValue('prepaidOpeningCount');
    if (prepaidOpeningCount != null) {
        const normalizedOpeningCount = safeIntegerLike(prepaidOpeningCount);
        if (normalizedOpeningCount == null || normalizedOpeningCount < 0) {
            throw actionError('INVALID_AMOUNT', 'prepaidOpeningCount must be a non-negative safe integer');
        }
        options.prepaidOpeningCount = normalizedOpeningCount;
    }
    const subscriptionPeriodEnd = optionalBusinessDate(optionValue('subscriptionPeriodEnd'), 'subscriptionPeriodEnd');
    if (subscriptionPeriodEnd !== undefined) options.subscriptionPeriodEnd = subscriptionPeriodEnd;
    let data;
    try { data = newFormalV2Asset(raw.data, { now: new Date().toISOString(), today: new Date().toISOString().slice(0, 10) }); }
    catch (error) { throw actionError('INVALID_ASSET', safeMessage(error)); }
    if (data.status !== ASSET_STATUS.WISHLIST && options.subscriptionPeriodEnd && data.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
        throw actionError('INVALID_ARGS', 'subscriptionPeriodEnd is only accepted for subscriptions');
    }
    if (options.prepaidInitialAmountMinor != null && data.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT) {
        throw actionError('INVALID_ARGS', 'prepaidInitialAmountMinor is only accepted for prepaidAmount');
    }
    if (options.prepaidOpeningCount != null && data.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) {
        throw actionError('INVALID_ARGS', 'prepaidOpeningCount is only accepted for prepaidCount');
    }
    return { data: data, options: Object.assign({}, options) };
}

function validateUpdateArgs(raw, domain) {
    assertKnownKeys(raw, ['assetId', 'patch'], 'args');
    const id = assetId(raw.assetId);
    const current = domain.assets.find(asset => asset && asset.id === id);
    if (!current) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
    if (!isPlainObject(raw.patch)) throw actionError('INVALID_ARGS', 'patch is required and must be an object');
    assertKnownKeys(raw.patch, ['name', 'category', 'categoryId', 'tagIds', 'notes', 'acquiredOn', 'details'], 'patch');
    const patch = Object.assign({}, raw.patch);
    if (hasOwn(patch, 'name')) optionalString(patch.name, 'patch.name', 200);
    if (hasOwn(patch, 'category') && hasOwn(patch, 'categoryId')) throw actionError('INVALID_ARGS', 'use either category or categoryId, not both');
    if (hasOwn(patch, 'category') || hasOwn(patch, 'categoryId')) {
        patch.categoryId = resolveCategoryId(hasOwn(patch, 'category') ? patch.category : patch.categoryId, current.kind);
        delete patch.category;
    }
    if (hasOwn(patch, 'acquiredOn')) {
        if (current.status === ASSET_STATUS.WISHLIST) throw actionError('INVALID_STATUS', 'acquiredOn requires an owned asset');
        if (current.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
            throw actionError('SUBSCRIPTION_START_DATE_USE_LIFECYCLE', 'subscription start dates use asset_lifecycle updateStartDate');
        }
        optionalBusinessDate(patch.acquiredOn, 'patch.acquiredOn');
    }
    if (hasOwn(patch, 'tagIds')) {
        if (!Array.isArray(patch.tagIds) || patch.tagIds.length > 3 || patch.tagIds.some(idValue => typeof idValue !== 'string' || !isUUID(idValue.toLowerCase()))) {
            throw actionError('INVALID_ARGS', 'patch.tagIds must contain at most 3 UUIDs');
        }
        const tagIds = new Set((Array.isArray(domain.tags) ? domain.tags : []).map(tag => String(tag && tag.id || '').toLowerCase()));
        if (patch.tagIds.some(idValue => !tagIds.has(String(idValue).trim().toLowerCase()))) {
            throw actionError('TAG_CREATE_REQUIRED', 'patch.tagIds must refer to existing tags');
        }
    }
    if (hasOwn(patch, 'notes')) optionalString(patch.notes, 'patch.notes', 5000);
    if (hasOwn(patch, 'details')) {
        if (!isPlainObject(patch.details)) throw actionError('INVALID_ARGS', 'patch.details must be an object');
        const allowed = current.kind === FORMAL_ASSET_KIND.PHYSICAL
            ? ['warrantyEndsOn', 'costGoal']
            : current.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
                ? ['planName', 'billingPlan']
                : (current.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || current.kind === FORMAL_ASSET_KIND.PREPAID_COUNT)
                    ? ['provider', 'expiresOn'] : [];
        assertKnownKeys(patch.details, allowed, 'patch.details');
        if (hasOwn(patch.details, 'warrantyEndsOn') && patch.details.warrantyEndsOn !== null) optionalBusinessDate(patch.details.warrantyEndsOn, 'patch.details.warrantyEndsOn');
        if (hasOwn(patch.details, 'expiresOn') && patch.details.expiresOn !== null) optionalBusinessDate(patch.details.expiresOn, 'patch.details.expiresOn');
        if (hasOwn(patch.details, 'planName')) optionalString(patch.details.planName, 'patch.details.planName', 200);
        if (hasOwn(patch.details, 'provider') && patch.details.provider !== null) optionalString(patch.details.provider, 'patch.details.provider', 200);
        if (hasOwn(patch.details, 'billingPlan')) {
            assertKnownKeys(patch.details.billingPlan, ['cycle'], 'patch.details.billingPlan');
            enumValue(patch.details.billingPlan.cycle, FORMAL_BILLING_CYCLES, 'patch.details.billingPlan.cycle');
        }
        if (hasOwn(patch.details, 'costGoal') && patch.details.costGoal !== null) {
            assertKnownKeys(patch.details.costGoal, ['targetDailyAmountMinor', 'targetEndsOn'], 'patch.details.costGoal');
            amount(patch.details.costGoal.targetDailyAmountMinor, 'patch.details.costGoal.targetDailyAmountMinor', true);
            if (patch.details.costGoal.targetEndsOn != null) validBusinessDate(patch.details.costGoal.targetEndsOn, 'patch.details.costGoal.targetEndsOn');
        }
    }
    if (!Object.keys(patch).length) throw actionError('INVALID_ARGS', 'patch must contain at least one supported field');
    try { mergeFormalV2AssetPatch(current, patch, { now: new Date().toISOString(), today: new Date().toISOString().slice(0, 10) }); }
    catch (error) { throw actionError('INVALID_PATCH', safeMessage(error)); }
    return { id: id, patch: patch };
}

function normalizeTagLabels(value) {
    if (!Array.isArray(value)) throw actionError('INVALID_ARGS', 'labels must be an array');
    const seen = new Set();
    const labels = [];
    value.forEach((item, index) => {
        if (typeof item !== 'string') throw actionError('INVALID_ARGS', 'labels[' + index + '] must be a string');
        const label = item.trim();
        if (!label || label.length > 20) throw actionError('INVALID_ARGS', 'labels[' + index + '] is invalid');
        const key = label.toLowerCase();
        if (!seen.has(key)) { seen.add(key); labels.push(label); }
    });
    return labels;
}

function validateTagArgs(raw, domain, tool) {
    assertKnownKeys(raw, ['assetId', 'labels', 'mode'], 'args');
    const id = assetId(raw.assetId);
    const asset = domain.assets.find(item => item && item.id === id);
    if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
    const labels = normalizeTagLabels(raw.labels);
    const mode = raw.mode == null ? 'add' : enumValue(raw.mode, ['add', 'remove', 'replace'], 'mode');
    if (tool === 'create' && mode === 'remove') throw actionError('INVALID_ACTION', 'asset_tag_create supports add or replace');
    if (mode !== 'replace' && labels.length === 0) throw actionError('INVALID_ARGS', 'labels must not be empty for this mode');
    const catalog = new Map((Array.isArray(domain.tags) ? domain.tags : []).map(tag => [String(tag && tag.label || '').trim().toLowerCase(), tag]));
    if (tool === 'update') {
        labels.forEach(label => {
            if (!catalog.has(label.toLowerCase())) throw actionError('TAG_NOT_FOUND', 'tag label was not found by exact match');
        });
    }
    return { id: id, labels: labels, mode: mode, locale: normalizeQueryLocale(raw && raw.locale) };
}

async function validateLifecycleArgs(raw, domain, getSettings) {
    assertKnownKeys(raw, ['op', 'assetId', 'status', 'retiredDate', 'soldOn', 'priceMinor', 'startDate', 'endDate', 'amountMinor', 'cycle', 'enabled', 'note'], 'args');
    const op = enumValue(raw.op, LIFECYCLE_OPERATIONS, 'op');
    const id = assetId(raw.assetId);
    const asset = domain.assets.find(item => item && item.id === id);
    if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
    if (op === 'sale' || op === 'renewSubscription') await requirePermission(getSettings, 'aiAllowRecords');
    if (op === 'setStatus') {
        assertKnownKeys(raw, ['op', 'assetId', 'status'], 'args');
        enumValue(raw.status, ['active', 'retired'], 'status');
        if (raw.status === 'retired' && asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw actionError('INVALID_KIND', 'only physical assets support retired status');
        return { op, id, status: raw.status };
    }
    if (op === 'retire') {
        assertKnownKeys(raw, ['op', 'assetId', 'retiredDate', 'note'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw actionError('INVALID_KIND', 'retire requires a physical asset');
        return { op, id, retiredDate: optionalBusinessDate(raw.retiredDate, 'retiredDate'), note: optionalString(raw.note, 'note', 500) };
    }
    if (op === 'sale') {
        assertKnownKeys(raw, ['op', 'assetId', 'soldOn', 'priceMinor', 'note'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw actionError('INVALID_KIND', 'sale requires a physical asset');
        return { op, id, soldOn: optionalBusinessDate(raw.soldOn, 'soldOn'), priceMinor: amount(raw.priceMinor, 'priceMinor', true), note: optionalString(raw.note, 'note', 500) };
    }
    if (op === 'toggleAutoRenew') {
        assertKnownKeys(raw, ['op', 'assetId', 'enabled'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw actionError('INVALID_KIND', 'toggleAutoRenew requires a subscription');
        if (typeof raw.enabled !== 'boolean') throw actionError('INVALID_ARGS', 'enabled must be boolean');
        return { op, id, enabled: raw.enabled };
    }
    if (op === 'updateStartDate') {
        assertKnownKeys(raw, ['op', 'assetId', 'startDate', 'endDate'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw actionError('INVALID_KIND', 'updateStartDate requires a subscription');
        const startDate = validBusinessDate(raw.startDate, 'startDate');
        const endDate = optionalBusinessDate(raw.endDate, 'endDate');
        if (endDate && endDate < startDate) throw actionError('SUBSCRIPTION_PERIOD_INVALID', 'endDate must not be before startDate');
        return { op, id, startDate, endDate };
    }
    if (op === 'updatePeriodEnd') {
        assertKnownKeys(raw, ['op', 'assetId', 'endDate'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw actionError('INVALID_KIND', 'updatePeriodEnd requires a subscription');
        return { op, id, endDate: validBusinessDate(raw.endDate, 'endDate') };
    }
    assertKnownKeys(raw, ['op', 'assetId', 'startDate', 'endDate', 'amountMinor', 'cycle'], 'args');
    if (asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw actionError('INVALID_KIND', 'renewSubscription requires a subscription');
    const startDate = optionalBusinessDate(raw.startDate, 'startDate');
    const endDate = optionalBusinessDate(raw.endDate, 'endDate');
    if (startDate && endDate && endDate < startDate) throw actionError('INVALID_DATE', 'endDate must not be before startDate');
    if (raw.amountMinor == null) throw actionError('INVALID_AMOUNT', 'amountMinor is required for renewSubscription');
    return { op, id, startDate, endDate, amountMinor: amount(raw.amountMinor, 'amountMinor', false), cycle: raw.cycle == null ? undefined : enumValue(raw.cycle, FORMAL_BILLING_CYCLES, 'cycle') };
}

function validateRecordArgs(raw, domain) {
    assertKnownKeys(raw, ['op', 'assetId', 'type', 'date', 'amountMinor', 'count', 'paymentAmountMinor', 'direction', 'targetCount', 'effectiveDate', 'note'], 'args');
    const op = enumValue(raw.op, RECORD_OPERATIONS, 'op');
    const id = assetId(raw.assetId);
    const asset = domain.assets.find(item => item && item.id === id);
    if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
    if (op === 'purchaseAmount') {
        assertKnownKeys(raw, ['op', 'assetId', 'amountMinor'], 'args');
        if (asset.status === ASSET_STATUS.WISHLIST) throw actionError('INVALID_STATUS', 'purchaseAmount requires an owned asset');
        if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
            throw actionError('INVALID_KIND', 'subscriptions use renewSubscription payment records');
        }
        if (raw.amountMinor == null) throw actionError('INVALID_AMOUNT', 'amountMinor is required for purchaseAmount');
        return { op, id, amountMinor: amount(raw.amountMinor, 'amountMinor', false) };
    }
    if (op === 'subscriptionPaymentAmount') {
        assertKnownKeys(raw, ['op', 'assetId', 'amountMinor'], 'args');
        if (asset.status === ASSET_STATUS.WISHLIST) throw actionError('INVALID_STATUS', 'subscriptionPaymentAmount requires an owned asset');
        if (asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
            throw actionError('INVALID_KIND', 'subscriptionPaymentAmount requires a subscription');
        }
        if (raw.amountMinor == null) throw actionError('INVALID_AMOUNT', 'amountMinor is required for subscriptionPaymentAmount');
        return { op, id, amountMinor: amount(raw.amountMinor, 'amountMinor', true) };
    }
    if (op === 'maintenance') {
        assertKnownKeys(raw, ['op', 'assetId', 'type', 'date', 'amountMinor', 'note'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw actionError('INVALID_KIND', 'maintenance requires a physical asset');
        enumValue(raw.type, ['repair', 'maintain'], 'type');
        return { op, id, type: raw.type, date: optionalBusinessDate(raw.date, 'date'), amountMinor: raw.amountMinor == null ? 0 : amount(raw.amountMinor, 'amountMinor', false), note: optionalString(raw.note, 'note', 500) };
    }
    if (op === 'prepaidAdjust') {
        assertKnownKeys(raw, ['op', 'assetId', 'targetCount', 'effectiveDate', 'note'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw actionError('INVALID_KIND', 'prepaidAdjust requires a prepaidCount asset');
        if (!Number.isSafeInteger(raw.targetCount) || raw.targetCount < 0) throw actionError('INVALID_AMOUNT', 'targetCount must be a non-negative safe integer');
        return { op, id, targetCount: raw.targetCount, effectiveDate: optionalBusinessDate(raw.effectiveDate, 'effectiveDate'), note: optionalString(raw.note, 'note', 500) };
    }
    if (op === 'prepaidConsumption') {
        assertKnownKeys(raw, ['op', 'assetId', 'count', 'effectiveDate', 'note'], 'args');
        if (asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw actionError('INVALID_KIND', 'prepaidConsumption requires a prepaidCount asset');
        if (!Number.isSafeInteger(raw.count) || raw.count <= 0) throw actionError('INVALID_AMOUNT', 'count must be a positive safe integer');
        return { op, id, count: raw.count, effectiveDate: optionalBusinessDate(raw.effectiveDate, 'effectiveDate'), note: optionalString(raw.note, 'note', 500) };
    }
    assertKnownKeys(raw, ['op', 'assetId', 'type', 'date', 'amountMinor', 'count', 'paymentAmountMinor', 'direction', 'note'], 'args');
    if (asset.kind !== FORMAL_ASSET_KIND.PREPAID_AMOUNT && asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw actionError('INVALID_KIND', 'prepaidTransaction requires a prepaid asset');
    enumValue(raw.type, asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT ? ['inflow', 'outflow', 'adjust', 'refund'] : ['inflow', 'outflow', 'adjust'], 'type');
    if (raw.type === 'adjust') enumValue(raw.direction, ['inflow', 'outflow'], 'direction');
    if (asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT) {
        if (raw.amountMinor == null) throw actionError('INVALID_AMOUNT', 'amountMinor is required for amount transactions');
        return { op, id, type: raw.type, date: optionalBusinessDate(raw.date, 'date'), amountMinor: amount(raw.amountMinor, 'amountMinor', false), direction: raw.direction, note: optionalString(raw.note, 'note', 500) };
    }
    if (!Number.isSafeInteger(raw.count) || raw.count < 0) throw actionError('INVALID_AMOUNT', 'count must be a non-negative safe integer');
    const paymentAmountMinor = raw.paymentAmountMinor == null ? undefined : amount(raw.paymentAmountMinor, 'paymentAmountMinor', false);
    if (raw.paymentAmountMinor != null && raw.type !== 'inflow') throw actionError('INVALID_ARGS', 'paymentAmountMinor is only accepted for count inflow');
    return { op, id, type: raw.type, date: optionalBusinessDate(raw.date, 'date'), count: raw.count, paymentAmountMinor, direction: raw.direction, note: optionalString(raw.note, 'note', 500) };
}

function writeResult(operation, value) {
    return success(operation, value, 1, 0, 1, false);
}

function createAgentActionHandlers(options) {
    const opts = isPlainObject(options) ? options : {};
    const getSettings = opts.getSettings;
    const getDomain = opts.getDomain;
    const getQueryDomain = opts.getQueryDomain || getDomain;
    const configuredLocale = opts.locale;
    const getLocale = opts.getLocale;
    const methods = isPlainObject(opts.methods) ? opts.methods : {};
    const call = async (name, args) => {
        if (typeof methods[name] !== 'function') throw actionError('METHOD_UNAVAILABLE', name + ' is unavailable');
        return methods[name].apply(null, args);
    };
    const wrap = (operation, permission, fn) => async raw => {
        const hasRequestLocale = isPlainObject(raw) && hasOwn(raw, 'locale');
        let locale = hasRequestLocale
            ? requestLocale(raw, configuredLocale)
            : (configuredLocale == null ? undefined : normalizeAgentLocale(configuredLocale));
        if (!hasRequestLocale && locale == null) {
            try {
                const dynamicLocale = typeof getLocale === 'function' ? await getLocale(raw) : undefined;
                if (dynamicLocale != null) locale = normalizeAgentLocale(dynamicLocale);
            } catch (cause) {
                // Locale lookup is presentation-only and must never block an action.
            }
        }
        try {
            await requirePermission(getSettings, permission);
            const value = await fn(withoutRequestLocale(raw), locale);
            return { result: value };
        } catch (error) {
            return { error: failure(error, locale) };
        }
    };
    const query = wrap('asset_query', 'aiAllowQuery', async (raw, locale) => {
        const args = normalizeQueryArgs(Object.assign({}, raw, { locale: locale || 'zh-CN' }));
        const domain = await requireDomain(
            args.op === 'count' || args.op === 'search' || args.op === 'tags' ? getQueryDomain : getDomain,
            args,
        );
        let result;
        if (args.op === 'count') result = queryCount(args, domain);
        else if (args.op === 'search') result = querySearch(args, domain);
        else if (args.op === 'detail') result = queryDetail(args, domain);
        else if (args.op === 'tags') result = queryTags(domain, locale || args.locale);
        else result = querySummary(domain, locale || args.locale);
        return success('asset_query.' + args.op, result.value, result.total, result.offset || 0, result.pageSize || 0, result.hasMore === true);
    });
    const create = wrap('asset_create', 'aiAllowCreate', async raw => {
        const domain = await requireDomain(getDomain);
        const args = validateCreateArgs(raw);
        const asset = await call('addAsset', [args.data, args.options]);
        return writeResult('asset_create', projectSafeAsset(asset, Object.assign({}, domain, { assets: domain.assets.concat(asset) })));
    });
    const update = wrap('asset_update', 'aiAllowModify', async raw => {
        const domain = await requireDomain(getDomain);
        const args = validateUpdateArgs(raw, domain);
        const asset = await call('updateAsset', [args.id, args.patch]);
        if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        return writeResult('asset_update', projectSafeAsset(asset, Object.assign({}, domain, { assets: domain.assets.map(item => item.id === asset.id ? asset : item) })));
    });
    const lifecycle = wrap('asset_lifecycle', 'aiAllowLifecycle', async raw => {
        const domain = await requireDomain(getDomain);
        const args = await validateLifecycleArgs(raw, domain, getSettings);
        let value;
        if (args.op === 'setStatus') value = await call('setStatus', [args.id, args.status]);
        else if (args.op === 'retire') value = await call('retirePhysicalAsset', [args.id, { retiredDate: args.retiredDate, note: args.note }]);
        else if (args.op === 'sale') {
            await requirePermission(getSettings, 'aiAllowRecords');
            value = await call('recordPhysicalSaleAsset', [args.id, { soldOn: args.soldOn, priceMinor: args.priceMinor, note: args.note }]);
        } else if (args.op === 'renewSubscription') {
            await requirePermission(getSettings, 'aiAllowRecords');
            value = await call('renewSubscription', [args.id, { startDate: args.startDate, endDate: args.endDate, amountMinor: args.amountMinor, cycle: args.cycle }]);
        } else if (args.op === 'toggleAutoRenew') value = await call('toggleSubscriptionAutoRenew', [args.id, args.enabled]);
        else if (args.op === 'updateStartDate') value = await call('updateSubscriptionStartDate', [args.id, { startDate: args.startDate, endDate: args.endDate }]);
        else value = await call('updateSubscriptionPeriodEnd', [args.id, { endDate: args.endDate }]);
        const resultAsset = value && value.asset ? value.asset : value;
        if (!resultAsset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        return writeResult('asset_lifecycle.' + args.op, projectSafeAsset(resultAsset, Object.assign({}, domain, { assets: domain.assets.map(item => item.id === resultAsset.id ? resultAsset : item) })));
    });
    const tagUpdate = wrap('asset_tag_update', 'aiAllowModify', async raw => {
        const domain = await requireDomain(getDomain);
        const args = validateTagArgs(raw, domain, 'update');
        const asset = await call('updateAssetTags', [args.id, { labels: args.labels, mode: args.mode }]);
        if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        return writeResult('asset_tag_update', projectSafeAsset(asset, Object.assign({}, domain, {
            assets: domain.assets.map(item => item.id === asset.id ? asset : item),
        }), { locale: args.locale }));
    });
    const tagCreate = wrap('asset_tag_create', ['aiAllowCreate', 'aiAllowModify'], async raw => {
        const domain = await requireDomain(getDomain);
        const args = validateTagArgs(raw, domain, 'create');
        const value = await call('createAndBindAssetTags', [args.id, { labels: args.labels, mode: args.mode }]);
        const asset = value && value.asset ? value.asset : value;
        if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        const nextTags = value && Array.isArray(value.tags) ? value.tags : domain.tags;
        return writeResult('asset_tag_create', projectSafeAsset(asset, Object.assign({}, domain, {
            assets: domain.assets.map(item => item.id === asset.id ? asset : item), tags: nextTags,
        }), { locale: args.locale }));
    });
    const record = wrap('asset_record', 'aiAllowRecords', async raw => {
        const domain = await requireDomain(getDomain);
        const args = validateRecordArgs(raw, domain);
        let value;
        if (args.op === 'purchaseAmount') value = await call('correctPurchaseAmount', [args.id, { amountMinor: args.amountMinor }]);
        else if (args.op === 'subscriptionPaymentAmount') value = await call('correctSubscriptionPaymentAmount', [args.id, { amountMinor: args.amountMinor }]);
        else if (args.op === 'maintenance') value = await call('addMaintenanceRecord', [args.id, { type: args.type, date: args.date, amountMinor: args.amountMinor, note: args.note }]);
        else if (args.op === 'prepaidAdjust') value = await call('recordPrepaidCountAdjustment', [args.id, { targetCount: args.targetCount, effectiveDate: args.effectiveDate, note: args.note }]);
        else if (args.op === 'prepaidConsumption') value = await call('recordPrepaidConsumption', [args.id, { count: args.count, effectiveDate: args.effectiveDate, note: args.note }]);
        else {
            const input = { type: args.type, date: args.date, amountMinor: args.amountMinor, count: args.count, direction: args.direction, note: args.note };
            if (args.paymentAmountMinor != null) input.paymentAmount = minorToMajorString(args.paymentAmountMinor, domain.assets.find(item => item.id === args.id).currency);
            value = await call('addPrepaidTransaction', [args.id, input]);
        }
        return writeResult('asset_record.' + args.op, clone(value));
    });
    const priceUpdate = wrap('asset_price_update', 'aiAllowRecords', async raw => {
        assertKnownKeys(raw, ['action', 'assetId', 'amountMinor'], 'args');
        if (raw.action != null && raw.action !== 'update') throw actionError('INVALID_ACTION', 'asset_price_update requires action=update');
        const id = assetId(raw.assetId);
        const domain = await requireDomain(getDomain);
        const asset = domain.assets.find(item => item && item.id === id);
        if (!asset) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        if (asset.status === ASSET_STATUS.WISHLIST) throw actionError('INVALID_STATUS', 'asset_price_update requires an owned asset');
        const amountMinor = amount(raw.amountMinor, 'amountMinor', asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION);
        const subscription = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION;
        const method = subscription ? 'correctSubscriptionPaymentAmount' : 'correctPurchaseAmount';
        await call(method, [id, { amountMinor }]);
        return writeResult('asset_price_update', {
            assetId: id,
            kind: asset.kind,
            amountMinor,
            eventType: subscription ? 'subscriptionPayment' : 'purchase',
            correction: 'void-and-replace',
        });
    });
    const remove = wrap('asset_delete', 'aiAllowDelete', async raw => {
        assertKnownKeys(raw, ['assetId'], 'args');
        const id = assetId(raw.assetId);
        const domain = await requireDomain(getDomain);
        if (!domain.assets.some(asset => asset.id === id)) throw actionError('ASSET_NOT_FOUND', 'assetId was not found');
        const value = await call('deleteAsset', [id]);
        return writeResult('asset_delete', { assetId: id, deleted: !!value });
    });
    return {
        asset_query: query,
        asset_create: create,
        asset_update: update,
        asset_lifecycle: lifecycle,
        asset_record: record,
        asset_price_update: priceUpdate,
        asset_delete: remove,
        asset_tag_update: tagUpdate,
        asset_tag_create: tagCreate,
    };
}

const AGENT_ACTION_DESCRIPTIONS = Object.freeze({
    asset_query: 'Call with JSON args {"action":"query","op":"count|search|detail|summary|tags","locale":"zh_CN|zh-CN|en_US|en-US"}. For "how many and what are they", call search once: it returns the page plus meta.total, so do not call count first or request detail for every row unless the user asks. count accepts status/kind/categoryId (digital/appliance/home/otherPhysical/member/software/service/domain/ai/otherVirtual/prepaidAmount/prepaidCount, matching the asset kind)/tag/tagId/currency filters and returns complete aggregates. search accepts the same filters plus search, offset, pageSize (default 50, max 200), and returns raw machine fields plus localized display labels and tag labels. tags returns a safe tag directory. detail requires exact assetId and optional includeNotes. summary takes only action and op. Query first, then use the explicit assetId for every write; names are never identifiers.',
    asset_create: 'Call with JSON args {"action":"create","data":<formal-v2 asset object>,"purchaseAmountMinor":<optional integer>,...}. Never put priceMinor or any price field inside data. Opening fields are top-level: purchaseAmountMinor (for CNY 99.00 use 9900), prepaidInitialAmountMinor, prepaidOpeningCount, subscriptionPeriodEnd. data accepts name, kind, currency, categoryId, tagIds (existing tag UUIDs, max 3; prefer tag tools by label), notes, acquiredOn (YYYY-MM-DD start date anchoring the first subscription period; defaults to today; pair with top-level subscriptionPeriodEnd for an exact first period), and details by kind: physical {warrantyEndsOn, costGoal{targetDailyAmountMinor, targetEndsOn}}; virtualSubscription {planName, accountLabel, billingPlan{cycle: monthly|quarterly|halfYearly|yearly}, autoRenew}; virtualPerpetual {licenseAccountLabel}; prepaidAmount/prepaidCount {provider, expiresOn}. categoryId must match kind: digital/appliance/home/otherPhysical (physical), member/software/service/domain/ai/otherVirtual (virtual), prepaidAmount/prepaidCount (prepaid). For a wishlist item use data.status="wishlist" with data.wishlist {expectedAmountMinor, reason, targetGroup: physical|virtual|prepaid, heartbeatTarget 1-999}; wishlist mode accepts no categoryId/tagIds/notes/details or opening fields. Query first when choosing an existing asset; writes always use explicit IDs.',
    asset_update: 'Call with JSON args {"action":"update","assetId":"<exact lowercase UUID>","patch":<limited patch>}. patch allows name, acquiredOn for owned non-subscriptions, categoryId or an exact category label, tagIds (existing tag UUIDs, max 3), notes, and restricted details by kind: physical {warrantyEndsOn, costGoal{targetDailyAmountMinor, targetEndsOn}}; virtualSubscription {planName, billingPlan{cycle}}; prepaidAmount/prepaidCount {provider, expiresOn}; virtualPerpetual has no agent-editable details. Subscription acquiredOn must use asset_lifecycle op=updateStartDate. It cannot change kind, status, currency, IDs, index links, related notes, cover paths, accounts, or credentials. For tag labels use asset_tag_update or asset_tag_create. For price correction use asset_price_update first. Query first and never guess a duplicate name.',
    asset_lifecycle: 'Call with JSON args {"action":"update","op":"setStatus|retire|sale|renewSubscription|toggleAutoRenew|updateStartDate|updatePeriodEnd","assetId":"<exact lowercase UUID>",...}. setStatus requires status; retire accepts retiredDate/note; sale requires positive priceMinor and accepts soldOn/note; renewSubscription requires amountMinor and accepts startDate/endDate/cycle; toggleAutoRenew requires boolean enabled; updateStartDate changes a subscription start date (required startDate; optional endDate re-anchors the first period end); updatePeriodEnd changes the latest subscription period end date (required endDate). sale and renewSubscription also require records permission. Query first and use an explicit assetId.',
    asset_record: 'Call with JSON args {"action":"create|update","op":"purchaseAmount|subscriptionPaymentAmount|maintenance|prepaidTransaction|prepaidAdjust|prepaidConsumption","assetId":"<exact lowercase UUID>",...}. For price correction use action=update: purchaseAmount handles physical/virtualPerpetual/prepaid assets with non-negative amountMinor; subscriptionPaymentAmount handles the latest subscription payment with positive amountMinor (>0), so CNY 20.00 is 2000. Price correction uses formal replacement audit, never maintenance, renewSubscription, or a difference event. For maintenance/prepaidTransaction/prepaidAdjust/prepaidConsumption use action=create. maintenance requires type repair|maintain and non-negative amountMinor/date/note; prepaidTransaction requires a kind-specific type (amount kind: inflow|outflow|adjust|refund; count kind: inflow|outflow|adjust) and non-negative amountMinor or count; paymentAmountMinor is only accepted for count inflow; prepaidAdjust requires targetCount; prepaidConsumption requires positive count. Dates are YYYY-MM-DD and amounts are safe integer minor units. Query first and use an explicit assetId.',
    asset_price_update: 'Use this dedicated tool first for any price correction. Call with JSON args {"action":"update","assetId":"<exact lowercase UUID>","amountMinor":<integer>}. It automatically routes physical/virtualPerpetual/prepaid to the purchase event and virtualSubscription to the latest subscription payment. CNY 20.00 is 2000. It performs a formal void-and-replace correction, keeps one active financial event, does not create a maintenance difference or a new subscription period, and requires the records permission. Query first and use an explicit assetId; do not use asset_update.patch, maintenance, or renewSubscription for price correction.',
    asset_delete: 'Call with JSON args {"action":"delete","assetId":"<exact lowercase UUID>"}. This permanently deletes the asset and its formal sidecar records through the plugin transaction. Query first, require an explicit assetId, and never infer an ID from a name.',
    asset_tag_update: 'Call with JSON args {"action":"update","assetId":"<exact lowercase UUID>","labels":["Exact tag label"],"mode":"add|remove|replace"}. Labels are trimmed and matched case-insensitively by exact label only; fuzzy guesses are rejected. mode defaults to add, and replace runs only when explicitly supplied. Existing tags only; requires modify permission. An asset may have at most three tags.',
    asset_tag_create: 'Call with JSON args {"action":"create","assetId":"<exact lowercase UUID>","labels":["Tag label"],"mode":"add|replace"}. Missing labels are created and bound in one formal transaction; concurrent requests reuse an existing exact-match tag instead of creating an orphan. Requires both create and modify permissions plus Agent write confirmation. Labels are trimmed, case-insensitive exact matches, and an asset may have at most three tags.',
});

module.exports = {
    AGENT_SCHEMA,
    AGENT_PERMISSION_KEYS,
    AGENT_DEFAULT_SETTINGS,
    AGENT_DEFAULT_LOCALE,
    AGENT_ERROR_DEFINITIONS,
    LEGACY_AGENT_SETTING_KEYS,
    AGENT_ACTION_NAMES,
    QUERY_OPERATIONS,
    LIFECYCLE_OPERATIONS,
    RECORD_OPERATIONS,
    AGENT_ACTION_DESCRIPTIONS,
    normalizeAgentSettings,
    stripLegacyAgentSettings,
    completeDomain,
    projectSafeAsset,
    createAgentActionHandlers,
    normalizeAgentLocale,
    inferAgentErrorDefinition,
    success,
    failure,
};
