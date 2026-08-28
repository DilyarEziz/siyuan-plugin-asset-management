/**
 * SiYuan 资产管理插件 — exchange-rate-api.js
 *
 * v2.6.4 汇率自动更新 · 阶段1（P1 数据层）：
 *   - open.er-api.com（免凭证、CORS 全开、每日更新）响应的严格解析；
 *   - 汇率新鲜度判断（自动刷新 24h 阈值）；
 *   - 汇率来源（'auto' | 'manual'）归一。
 *
 * rates[X] 语义 =「1 CNY 兑换 X 单位外币」，与 exchangeRates.json 的存储语义
 * 逐字一致（algorithms.convertToCNYMinor 用 1/rates[X] 折算），解析结果可直存，
 * 无需换算。
 *
 * 本模块为纯函数集合：零依赖、无 fetch、无副作用（fetch 调用与 UI 在后续阶段）。
 *
 * 依赖：无
 */

'use strict';

// open.er-api.com v6：CNY 基准，免 key，每日更新；响应含 result / base_code /
// rates / time_last_update_unix 等字段。
const EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest/CNY';

// 插件只跟踪这三个目标币种（与设置页展示一致）。冻结数组，防运行时篡改。
const EXCHANGE_RATE_TARGET_CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP']);

// 自动刷新阈值：provider 更新时间距今超过 24h 视为过期，允许触发自动刷新。
const EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS = 24 * 3600 * 1000;

/**
 * 严格解析 open.er-api.com /v6/latest/CNY 的 JSON 响应。
 *
 * 失败一律 throw Error（消息带 [exchange-rate-api] 前缀），调用方自行 try/catch：
 *   - json 非对象/数组 → 'response is not an object'
 *   - result !== 'success' → 消息含 result 值
 *   - base_code !== 'CNY' → 消息含 base_code 值
 *   - rates 非对象，或任一目标币种缺失/非有限正数 → 消息含币种代码
 *
 * @param {*} json 已 JSON.parse 的响应体
 * @returns {{ rates: {USD:number,EUR:number,GBP:number}, providerUpdatedAt: string|null }}
 *   rates 只包含三个目标币种（其余币种丢弃，深拷贝普通对象）；
 *   providerUpdatedAt = time_last_update_unix（安全整数）转 ISO 串，否则 null。
 *   返回值整体 Object.freeze。
 */
function parseExchangeRateApiResponse(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('[exchange-rate-api] response is not an object');
    }
    if (json.result !== 'success') {
        throw new Error('[exchange-rate-api] response result is not success: ' + String(json.result));
    }
    if (json.base_code !== 'CNY') {
        throw new Error('[exchange-rate-api] response base_code is not CNY: ' + String(json.base_code));
    }
    if (!json.rates || typeof json.rates !== 'object' || Array.isArray(json.rates)) {
        throw new Error('[exchange-rate-api] response rates is not an object');
    }
    const rates = {};
    EXCHANGE_RATE_TARGET_CURRENCIES.forEach(currency => {
        const value = json.rates[currency];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new Error('[exchange-rate-api] response rate for ' + currency + ' is invalid');
        }
        rates[currency] = value;
    });
    let providerUpdatedAt = null;
    const unix = json.time_last_update_unix;
    if (typeof unix === 'number' && Number.isSafeInteger(unix) && unix > 0) {
        providerUpdatedAt = new Date(unix * 1000).toISOString();
    }
    return Object.freeze({
        rates: Object.freeze(rates),
        providerUpdatedAt: providerUpdatedAt,
    });
}

/**
 * 判断已保存的汇率是否过期（供自动刷新决策）。
 *
 * @param {*} updatedAt ISO 时间串（exchangeRates.providerUpdatedAt 或本地写入时间）
 * @param {number} [nowMs] 当前时间戳（缺省 Date.now()，测试可注入固定值）
 * @returns {boolean} updatedAt 缺失/非法/解析失败 → true；
 *   now - updatedAt > EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS → true；否则 false。
 */
function isExchangeRateStale(updatedAt, nowMs) {
    if (typeof updatedAt !== 'string' || !updatedAt) return true;
    const parsed = Date.parse(updatedAt);
    if (!Number.isFinite(parsed)) return true;
    const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    return now - parsed > EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS;
}

/**
 * 汇率来源归一：仅接受 'auto' / 'manual'，其它一律 null。
 * null 表示存量数据（≤2.6.3 无此字段），由调用方决定展示语义。
 *
 * @param {*} value
 * @returns {'auto'|'manual'|null}
 */
function normalizeExchangeRateSource(value) {
    if (value === 'auto' || value === 'manual') return value;
    return null;
}

// =====
// 模块导出
// =====
module.exports = {
    EXCHANGE_RATE_API_URL: EXCHANGE_RATE_API_URL,
    EXCHANGE_RATE_TARGET_CURRENCIES: EXCHANGE_RATE_TARGET_CURRENCIES,
    EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS: EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS,
    parseExchangeRateApiResponse: parseExchangeRateApiResponse,
    isExchangeRateStale: isExchangeRateStale,
    normalizeExchangeRateSource: normalizeExchangeRateSource,
};
