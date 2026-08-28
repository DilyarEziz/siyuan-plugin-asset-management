/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — algorithms.js
 *
 * 已实现：
 *   - daysBetween / daysUntil / formatDate / todayISO（日期工具）
 *   - formatRemainingBadge（到期徽章，单点真相）
 *   - formatCNY（zh-CN 千分位 + 2 位小数，alias = fmtPrice，主代码仍兼容用）
 *   - currencySymbol / formatCurrency（多币种 M4：CNY / USD / EUR / GBP）
 *   - escapeHtml / genId
 *
 * 规划中（v0.15+ / v1 方案补）：
 *   - lruCache / memoize —— 1000+ 资产虚拟列表（M17）启用时实现
 *   - exchangeRateConvert —— 汇率转换（M9 + 双币种显示依赖）
 *
 * 依赖：无
 */

'use strict';

function daysBetween(a, b) {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
    const ms = db.getTime() - da.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * 把任意输入（YYYY-MM-DD 字符串 / Date 对象 / datetime 字符串）归一为
 * 本地日历日 YYYY-MM-DD 纯日期串。无效输入返回空串。
 * 内部 helper，不导出。
 */
function toDateString(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? '' : formatDate(dt);
    }
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? '' : formatDate(value);
    }
    return '';
}

/**
 * 剩余天数（endDate - today），可负值表示已过期。
 * 两端一律先归一为 YYYY-MM-DD 纯日期串，再用 UTC 零点相减，
 * 杜绝"到期日当天传 Date 对象导致差值为负小时数 → 误判已过期"的时刻陷阱。
 * 加固后 daysUntil(date, new Date()) 与 daysUntil(date, todayISO()) 结果一致。
 * @returns {number}
 */
function daysUntil(endDate, today) {
    if (!endDate) return 0;
    const endStr = toDateString(endDate);
    const todayStr = toDateString(today == null ? new Date() : today);
    if (!endStr || !todayStr) return 0;
    const de = new Date(endStr + 'T00:00:00.000Z');
    const dt = new Date(todayStr + 'T00:00:00.000Z');
    if (isNaN(de.getTime()) || isNaN(dt.getTime())) return 0;
    return Math.round((de.getTime() - dt.getTime()) / 86400000);
}

function formatDate(date) {
    if (!date) return '';
    const dt = date instanceof Date ? date : new Date(date);
    if (isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function todayISO() {
    return formatDate(new Date());
}

/**
 * 到期徽章等级（方案 M3 + M9 共同依赖）。
 * @param {number} daysLeft 剩余天数（可负值）
 * @param {string} type 'subscription' | 'oneTime'
 * @param {string} t i18n 函数（可选，用于本地化标签）
 * @returns {{tier: string, label: string}}
 *   tier ∈ {'expired','urgent','soon','normal','permanent'}
 */
function formatRemainingBadge(daysLeft, type, t) {
    const _t = t || ((k, fb) => fb || k);
    if (type === 'oneTime') {
        return { tier: 'permanent', label: _t('badgePermanent', '永久') };
    }
    if (daysLeft < 0) return { tier: 'expired', label: _t('badgeExpired', '已过期') };
    if (daysLeft === 0) return { tier: 'urgent', label: _t('badgeToday', '今日到期') };
    if (daysLeft <= 7) return { tier: 'urgent', label: daysLeft + ' ' + _t('badgeDaysLeft', '天后到期') };
    if (daysLeft <= 30) return { tier: 'soon', label: daysLeft + ' ' + _t('badgeDaysLeft', '天后到期') };
    return { tier: 'normal', label: daysLeft + ' ' + _t('badgeDaysLeft', '天后到期') };
}

function formatCNY(price) {
    const n = Number(price);
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function genId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Domain-contract primitives. Keep these independent from the current UI model.
const ISO4217_BASE_EXPONENT_2 = (
    'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD '
    + 'CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL '
    + 'GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW '
    + 'KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD '
    + 'NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP '
    + 'SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW '
    + 'UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR '
    + 'ZMW ZWG'
).trim().split(/\s+/);

// ISO 4217 minor-unit exponents. Most currencies use 2; only exceptions need
// to be listed. The map is the single precision truth for parsing/formatting.
const ISO4217_EXPONENTS = Object.freeze(Object.assign(
    Object.fromEntries(ISO4217_BASE_EXPONENT_2.map(code => [code, 2])),
    {
        BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
        PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
        BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
        CLF: 4, UYW: 4,
    }
));
const ISO4217_CODES = Object.freeze(new Set(Object.keys(ISO4217_EXPONENTS)));

function currencyExponent(currency) {
    const code = normalizeISO4217Currency(currency);
    if (!code) throw new RangeError('currency must be ISO 4217');
    if (!Object.prototype.hasOwnProperty.call(ISO4217_EXPONENTS, code)) {
        throw new RangeError('currency has no known ISO 4217 minor-unit definition');
    }
    return ISO4217_EXPONENTS[code];
}

function safeMinorAdd(left, right) {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
        throw new RangeError('minor amount operands must be safe integers');
    }
    const result = left + right;
    if (!Number.isSafeInteger(result)) throw new RangeError('minor amount exceeds safe integer range');
    return result;
}

function safeMinorSubtract(left, right) {
    return safeMinorAdd(left, -right);
}

/** Exact decimal-string parser; deliberately never uses Number(value) * factor. */
function parseMajorToMinor(value, currency) {
    const text = String(value == null ? '' : value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw new RangeError('amount format is invalid');
    const exponent = currencyExponent(currency);
    const parts = text.split('.');
    const fraction = parts[1] || '';
    if (fraction.length > exponent) throw new RangeError('amount exceeds currency precision');
    const digits = (parts[0].replace(/^0+(?=\d)/, '') || '0') + fraction.padEnd(exponent, '0');
    const amount = Number(digits);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('amount exceeds safe integer range');
    return amount;
}

function minorToMajorString(value, currency) {
    if (!isAmountMinor(value)) throw new RangeError('amountMinor must be a non-negative safe integer');
    const exponent = currencyExponent(currency);
    if (exponent === 0) return String(value);
    const digits = String(value).padStart(exponent + 1, '0');
    const result = digits.slice(0, -exponent) + '.' + digits.slice(-exponent);
    return result.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatAmountMinor(value, currency, locale) {
    if (!isAmountMinor(value)) throw new RangeError('amountMinor must be a non-negative safe integer');
    const code = normalizeISO4217Currency(currency);
    const exponent = currencyExponent(code);
    const digits = String(value).padStart(exponent + 1, '0');
    const integerDigits = exponent === 0 ? digits : digits.slice(0, -exponent);
    const fractionDigits = exponent === 0 ? '' : digits.slice(-exponent);
    const targetLocale = locale || 'en-US';
    const integerParts = new Intl.NumberFormat(targetLocale, { useGrouping: true, maximumFractionDigits: 0 })
        .formatToParts(BigInt(integerDigits));
    const groupedInteger = integerParts.filter(part => part.type === 'integer' || part.type === 'group')
        .map(part => part.value).join('');
    // Prefer narrowSymbol so CNY renders as the bare ¥ glyph (without the CN
    // prefix) under en-US. Very old engines that reject currencyDisplay fall
    // back to a clean symbol + grouped number.
    let currencyParts;
    try {
        currencyParts = new Intl.NumberFormat(targetLocale, {
            style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: exponent, maximumFractionDigits: exponent,
        }).formatToParts(0n);
    } catch (e) {
        const decimalSep = exponent > 0
            ? (new Intl.NumberFormat(targetLocale, { minimumFractionDigits: exponent, maximumFractionDigits: exponent }).formatToParts(0).find(part => part.type === 'decimal') || { value: '.' }).value
            : '';
        return currencySymbol(code) + groupedInteger + (exponent > 0 ? decimalSep + fractionDigits : '');
    }
    const numericTypes = new Set(['integer', 'group', 'decimal', 'fraction']);
    const firstNumeric = currencyParts.findIndex(part => numericTypes.has(part.type));
    let lastNumeric = currencyParts.length - 1;
    while (lastNumeric >= 0 && !numericTypes.has(currencyParts[lastNumeric].type)) lastNumeric--;
    const prefix = currencyParts.slice(0, firstNumeric).map(part => part.value).join('');
    const suffix = currencyParts.slice(lastNumeric + 1).map(part => part.value).join('');
    const decimal = exponent > 0
        ? (currencyParts.find(part => part.type === 'decimal') || { value: '.' }).value + fractionDigits
        : '';
    return prefix + groupedInteger + decimal + suffix;
}

function getWebCrypto() {
    if (typeof globalThis === 'undefined' || !globalThis.crypto) return null;
    return globalThis.crypto;
}

function createUuidV4Fallback() {
    const bytes = new Uint8Array(16);
    const webCrypto = getWebCrypto();
    if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
        webCrypto.getRandomValues(bytes);
    } else {
        // Legacy WebViews without Web Crypto retain uniqueness but cannot provide cryptographic entropy.
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
        + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/** Stable domain identifier: native UUID first, RFC 4122 v4 fallback otherwise. */
function createStableId() {
    const webCrypto = getWebCrypto();
    if (webCrypto && typeof webCrypto.randomUUID === 'function') {
        try { return webCrypto.randomUUID(); } catch (e) {}
    }
    return createUuidV4Fallback();
}

/** RFC 4122 UUID with an explicit version and variant. */
function isUUID(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isForeignKey(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
}

function normalizeForeignKey(value, fallback) {
    if (!isForeignKey(value)) return fallback == null ? null : fallback;
    const normalized = value.trim();
    // Foreign keys may be legacy asset ids or domain UUIDs. Only canonicalize the
    // UUID form so case-sensitive legacy asset ids retain their identity.
    return isUUID(normalized) ? normalized.toLowerCase() : normalized;
}

function enumValues(enumLike) {
    if (Array.isArray(enumLike)) return enumLike;
    return enumLike && typeof enumLike === 'object' ? Object.keys(enumLike).map(key => enumLike[key]) : [];
}

function isEnumValue(value, enumLike) {
    return enumValues(enumLike).indexOf(value) >= 0;
}

function normalizeEnum(value, enumLike, fallback) {
    return isEnumValue(value, enumLike) ? value : fallback;
}

function isBusinessDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0]
        && date.getUTCMonth() === parts[1] - 1
        && date.getUTCDate() === parts[2];
}

function normalizeBusinessDate(value, fallback) {
    if (isBusinessDate(value)) return value;
    if (fallback == null) return null;
    if (isBusinessDate(fallback)) return fallback;
    const date = fallback instanceof Date ? fallback : new Date(fallback);
    return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function isUTCInstant(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
    if (!match) return false;
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;
    return date.getUTCFullYear() === Number(match[1])
        && date.getUTCMonth() + 1 === Number(match[2])
        && date.getUTCDate() === Number(match[3])
        && date.getUTCHours() === Number(match[4])
        && date.getUTCMinutes() === Number(match[5])
        && date.getUTCSeconds() === Number(match[6]);
}

function normalizeUTCInstant(value, fallback) {
    if (isUTCInstant(value)) return new Date(value).toISOString();
    if (fallback == null) return null;
    const date = fallback instanceof Date ? fallback : new Date(fallback);
    return isNaN(date.getTime()) ? null : date.toISOString();
}

function isISO4217Currency(value) {
    return typeof value === 'string' && ISO4217_CODES.has(value.trim().toUpperCase());
}

function normalizeISO4217Currency(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (isISO4217Currency(normalized)) return normalized;
    return isISO4217Currency(fallback) ? String(fallback).toUpperCase() : null;
}

function isAmountMinor(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function normalizeAmountMinor(value, fallback) {
    const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    if (isAmountMinor(parsed)) return parsed;
    return isAmountMinor(fallback) ? fallback : 0;
}

/**
 * v0.15-T6：货币符号（仅支持 CNY / USD / EUR / GBP，未知币种 fallback CNY）
 * @param {string} currency 'CNY' | 'USD' | 'EUR' | 'GBP'
 * @returns {string} '¥' | '$' | '€' | '£'
 */
function currencySymbol(currency) {
    switch (currency) {
        case 'USD': return '$';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'CNY':
        default: return '¥';
    }
}

/**
 * v0.15-T6：格式化金额（千分位 + 2 位小数 + 货币符号）
 * @param {number} price
 * @param {string} currency 'CNY' | 'USD' | 'EUR' | 'GBP'
 * @returns {string} e.g. '¥1,234.50' / '$1,234.50'
 */
function formatCurrency(price, currency) {
    const n = Number(price) || 0;
    return currencySymbol(currency) + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Exchange-rate conversion (display-layer projection, never persisted) ----------

/** Built-in reference rate: 1 USD = 7.20 CNY. Used only when no user rate exists. */
const DEFAULT_USD_CNY_RATE = 7.20;

/**
 * Convert an amount (minor units) to CNY minor units using the supplied rates object.
 *
 * ratesObj shape: { schemaVersion, baseCurrency, rates: { <CUR>: positiveFiniteNumber }, updatedAt? }
 * rates[X] semantics: 1 baseCurrency (CNY) buys X units of foreign currency.
 * Therefore foreign → CNY factor = 1 / rates[currency].
 *
 * @param {number} amountMinor  Safe integer (may be negative for net refunds).
 * @param {string} currency     ISO 4217 code of the source amount.
 * @param {object} ratesObj     Exchange-rates sidecar payload (read-only).
 * @returns {{ cnyMinor: number, cnyPerUnit: number, isFallback: boolean } | null}
 *   null when no rate is available (currency is neither base nor USD with fallback).
 */
function convertToCNYMinor(amountMinor, currency, ratesObj) {
    if (!Number.isSafeInteger(amountMinor)) return null;
    const cur = normalizeISO4217Currency(currency);
    if (!cur) return null;
    const base = (ratesObj && normalizeISO4217Currency(ratesObj.baseCurrency)) || 'CNY';
    // Identity: source currency equals the base currency (typically CNY).
    if (cur === base) return { cnyMinor: amountMinor, cnyPerUnit: 1, isFallback: false };
    // User-provided rate.
    const rates = (ratesObj && ratesObj.rates && typeof ratesObj.rates === 'object' && !Array.isArray(ratesObj.rates))
        ? ratesObj.rates : {};
    const rate = rates[cur];
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        const cnyPerUnit = 1 / rate;
        const cnyMinor = Math.sign(amountMinor) * Math.round(Math.abs(amountMinor * cnyPerUnit));
        return { cnyMinor: cnyMinor, cnyPerUnit: cnyPerUnit, isFallback: false };
    }
    // Built-in USD fallback (no user rate set).
    if (cur === 'USD') {
        const cnyPerUnit = DEFAULT_USD_CNY_RATE;
        const cnyMinor = Math.sign(amountMinor) * Math.round(Math.abs(amountMinor * cnyPerUnit));
        return { cnyMinor: cnyMinor, cnyPerUnit: cnyPerUnit, isFallback: true };
    }
    // No rate available for this currency.
    return null;
}

/**
 * Format a small "≈ ¥x,xxx.xx" hint for non-CNY amounts.
 * Returns '' when currency is the base currency (no conversion needed) or no rate exists.
 */
function formatCNYApproxHint(amountMinor, currency, ratesObj) {
    const cur = normalizeISO4217Currency(currency);
    if (!cur) return '';
    const base = (ratesObj && normalizeISO4217Currency(ratesObj.baseCurrency)) || 'CNY';
    if (cur === base) return '';
    const result = convertToCNYMinor(amountMinor, currency, ratesObj);
    if (!result) return '';
    const abs = Math.abs(result.cnyMinor);
    if (!Number.isSafeInteger(abs)) return '';
    const formatted = formatAmountMinor(abs, 'CNY');
    return (result.cnyMinor < 0 ? '-' : '') + '≈ ' + formatted;
}

module.exports = {
    daysBetween: daysBetween,
    daysUntil: daysUntil,
    formatDate: formatDate,
    todayISO: todayISO,
    formatRemainingBadge: formatRemainingBadge,
    formatCNY: formatCNY,
    currencySymbol: currencySymbol,
    formatCurrency: formatCurrency,
    escapeHtml: escapeHtml,
    genId: genId,
    ISO4217_CODES: ISO4217_CODES,
    createStableId: createStableId,
    createUuidV4Fallback: createUuidV4Fallback,
    isUUID: isUUID,
    isForeignKey: isForeignKey,
    normalizeForeignKey: normalizeForeignKey,
    isEnumValue: isEnumValue,
    normalizeEnum: normalizeEnum,
    isBusinessDate: isBusinessDate,
    normalizeBusinessDate: normalizeBusinessDate,
    isUTCInstant: isUTCInstant,
    normalizeUTCInstant: normalizeUTCInstant,
    isISO4217Currency: isISO4217Currency,
    normalizeISO4217Currency: normalizeISO4217Currency,
    isAmountMinor: isAmountMinor,
    normalizeAmountMinor: normalizeAmountMinor,
    ISO4217_EXPONENTS: ISO4217_EXPONENTS,
    currencyExponent: currencyExponent,
    safeMinorAdd: safeMinorAdd,
    safeMinorSubtract: safeMinorSubtract,
    parseMajorToMinor: parseMajorToMinor,
    minorToMajorString: minorToMajorString,
    formatAmountMinor: formatAmountMinor,
    DEFAULT_USD_CNY_RATE: DEFAULT_USD_CNY_RATE,
    convertToCNYMinor: convertToCNYMinor,
    formatCNYApproxHint: formatCNYApproxHint,
};
