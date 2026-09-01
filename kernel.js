/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 v2.6.0 — kernel.template.js（内核插件模板，不带 api IIFE）
 *
 * 通过 scripts/concat.js 把 6 个 api 模块 IIFE（algorithms / utils / media / assets /
 * report / agent-actions）+ 2 行别名注入到下方占位符，生成单文件 kernel.js。
 *
 * 运行环境：思源 3.8.0+ 内核插件 Goja 沙箱。
 *   - 全局对象 `siyuan`（storage / agent / plugin.lifecycle），不能 require，无 DOM，无 console 保障
 *   - `siyuan.storage.get(path)` 返回 Response 风格对象（用 .text() 取字符串）；
 *     `siyuan.storage.put(path, jsonString)` 整文件覆盖写
 *   - 存储目录与前端插件共享：data/storage/petal/siyuan-plugin-asset-management/<path>
 *
 * 职责（v2.6.0 内核 Agent 工具）：
 *   - onload 时优先通过 siyuan.mcp.registerTool 注册 9 个资产工具，
 *     并为 3.8.0 运行时保留 siyuan.agent.registerCapability 回退
 *     （asset_query / asset_create / asset_update / asset_lifecycle / asset_record / asset_price_update / asset_delete / asset_tag_update / asset_tag_create），
 *     最终暴露名 plugin__siyuan-plugin-asset-management__<name>（前缀内核自动加），内置 Agent 与 MCP 均可调用
 *   - 查询类工具实时读 storage 投影（复用 api/agent-actions.js 的脱敏投影）
 *   - 写入类工具经 agent-writes/pending/<requestId>.json 文件桥转发，
 *     由前端插件（index.js 轮询）委托既有业务方法执行后写回 completed/<requestId>.json
 */

(function () {
    'use strict';

    // ============================================================
// v2.6.0 自动生成：内核插件 kernel.js 的 6 个 api 模块 IIFE 内联
// 源文件：algorithms / utils / media / assets / report / agent-actions
// 构建脚本：scripts/concat.js
// 注意：不要手动改这块，改完请重新跑 `node scripts/concat.js`
// ============================================================

const __am_algos = (function() {

'use strict';

function daysBetween(a, b) {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
    const ms = db.getTime() - da.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
}
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
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
        + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
function createStableId() {
    const webCrypto = getWebCrypto();
    if (webCrypto && typeof webCrypto.randomUUID === 'function') {
        try { return webCrypto.randomUUID(); } catch (e) {}
    }
    return createUuidV4Fallback();
}
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
function currencySymbol(currency) {
    switch (currency) {
        case 'USD': return '$';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'CNY':
        default: return '¥';
    }
}
function formatCurrency(price, currency) {
    const n = Number(price) || 0;
    return currencySymbol(currency) + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DEFAULT_USD_CNY_RATE = 7.20;
function convertToCNYMinor(amountMinor, currency, ratesObj) {
    if (!Number.isSafeInteger(amountMinor)) return null;
    const cur = normalizeISO4217Currency(currency);
    if (!cur) return null;
    const base = (ratesObj && normalizeISO4217Currency(ratesObj.baseCurrency)) || 'CNY';
    if (cur === base) return { cnyMinor: amountMinor, cnyPerUnit: 1, isFallback: false };
    const rates = (ratesObj && ratesObj.rates && typeof ratesObj.rates === 'object' && !Array.isArray(ratesObj.rates))
        ? ratesObj.rates : {};
    const rate = rates[cur];
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        const cnyPerUnit = 1 / rate;
        const cnyMinor = Math.sign(amountMinor) * Math.round(Math.abs(amountMinor * cnyPerUnit));
        return { cnyMinor: cnyMinor, cnyPerUnit: cnyPerUnit, isFallback: false };
    }
    if (cur === 'USD') {
        const cnyPerUnit = DEFAULT_USD_CNY_RATE;
        const cnyMinor = Math.sign(amountMinor) * Math.round(Math.abs(amountMinor * cnyPerUnit));
        return { cnyMinor: cnyMinor, cnyPerUnit: cnyPerUnit, isFallback: true };
    }
    return null;
}
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

    return {daysBetween: daysBetween,
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
    formatCNYApproxHint: formatCNYApproxHint,};

})();

const __am_utils = (function() {

'use strict';

function safe(fn, fallback) {
    try { return fn(); }
    catch (e) { console.error('[AssetManagement] safe:', e && e.message ? e.message : e); return fallback; }
}

async function safeAsync(fn, fallback) {
    try { return await fn(); }
    catch (e) { console.error('[AssetManagement] safeAsync:', e && e.message ? e.message : e); return fallback; }
}

function toast(plugin, msg, level) {
    try {
        const lv = level || 'info';
        if (plugin && plugin.eventBus && typeof plugin.eventBus.emit === 'function') {
            plugin.eventBus.emit('message', msg, lv);
        } else {
            console.log(`[AssetManagement] toast (${lv}):`, msg);
        }
    } catch (e) {
        console.warn('[AssetManagement] toast failed:', e && e.message ? e.message : e);
    }
}

function formatRelativeTime(date, now) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const n = now instanceof Date ? now : new Date();
    const diffSec = Math.floor((n.getTime() - d.getTime()) / 1000);
    const future = diffSec < 0;
    const abs = Math.abs(diffSec);
    if (abs < 60) return future ? '即将' : '刚刚';
    const min = Math.floor(abs / 60);
    if (min < 60) return future ? `${min} 分钟后` : `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return future ? `${hr} 小时后` : `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return future ? `${day} 天后` : `${day} 天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return future ? `${month} 个月后` : `${month} 个月前`;
    const year = Math.floor(day / 365);
    return future ? `${year} 年后` : `${year} 年前`;
}

    return {safe,
    safeAsync,
    toast,
    formatRelativeTime,};

})();

const __am_media = (function() {

'use strict';

const MEDIA_ROOT = 'public/siyuan-plugin-asset-management';
const LEGACY_MEDIA_ROOT = 'assets/siyuan-plugin-asset-management';
let legacyMediaMigrated = false;
const WORKSPACE_DATA_ROOT = 'data/';
const PRESET_ICON_ROOT = 'assets/preset-icons';
const DEFAULT_PRESET_ICON_ID = 'icons8-box';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const COVER_MAX_DIMENSION = 1280;
const COVER_QUALITY = 0.92;
const COVER_COMPRESSED_THRESHOLD = 1024 * 1024;
const COVER_QUALITY_LADDER = [0.92, 0.82, 0.75];
const COVER_DEFAULT_OUTPUT_SIZE = 1280;
const ALLOWED_IMAGE_TYPES = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
});
const ALLOWED_IMAGE_EXTENSIONS = Object.freeze({
    jpg: 'jpg',
    jpeg: 'jpg',
    png: 'png',
    webp: 'webp',
});
const COVER_KINDS = Object.freeze({
    UPLOAD: 'upload',
    WORKSPACE_ASSET: 'workspaceAsset',
    PRESET: 'preset',
    EMOJI: 'emoji',
    NONE: 'none',
});

function mediaError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function getFileExtension(name) {
    const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

function normalizeWorkspaceAssetPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    if (!path || (path.indexOf('assets/') !== 0 && path.indexOf('public/') !== 0)
        || /(^|\/)\.\.?(\/|$)/.test(path) || /[?#\\]/.test(path)) {
        return null;
    }
    return path;
}

function isLegacyMediaMigrated() {
    return legacyMediaMigrated;
}

function resolvePhysicalAssetPath(assetPath) {
    const path = String(assetPath || '').trim();
    if (!legacyMediaMigrated) return path;
    const legacyPrefix = LEGACY_MEDIA_ROOT + '/';
    if (path.indexOf(legacyPrefix) !== 0) return path;
    return MEDIA_ROOT + '/' + path.slice(legacyPrefix.length);
}

function toWorkspaceFilePath(assetPath) {
    const normalized = normalizeWorkspaceAssetPath(assetPath);
    return normalized ? WORKSPACE_DATA_ROOT + resolvePhysicalAssetPath(normalized) : null;
}

function normalizePresetId(value) {
    const presetId = String(value || '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(presetId) ? presetId : null;
}

function isLegacyIconParkPreset(value) {
    return /^ip-outline-[a-z0-9-]+$/i.test(String(value || '').trim());
}

function normalizePresetCoverId(value) {
    const presetId = normalizePresetId(value);
    if (!presetId) return null;
    return isLegacyIconParkPreset(presetId) ? DEFAULT_PRESET_ICON_ID : presetId;
}

function normalizeEmoji(value) {
    const emoji = String(value || '').trim();
    return emoji && emoji.length <= 32 && /[^\x00-\x7F]/.test(emoji) ? emoji : null;
}

function isMediaAssetId(value) {
    return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || '').trim());
}

function isMediaUuid(value) {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(String(value || '').trim().toLowerCase());
}
function isOwnedMediaPath(value, assetId) {
    const path = String(value || '').trim();
    const id = String(assetId || '').trim();
    if (!isMediaAssetId(id)) return false;
    const match = path.match(/^(assets|public)\/siyuan-plugin-asset-management\/([A-Za-z0-9_-]{1,128})\/([a-f0-9-]{36})\.(jpg|jpeg|png|webp)$/i);
    return !!match && match[2] === id && isMediaUuid(match[3]);
}

function normalizeCover(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const kind = source.kind;
    if (kind === COVER_KINDS.UPLOAD) {
        const assetPath = normalizeWorkspaceAssetPath(source.assetPath);
        return assetPath ? { kind: COVER_KINDS.UPLOAD, assetPath: assetPath } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.WORKSPACE_ASSET) {
        const assetPath = normalizeWorkspaceAssetPath(source.assetPath);
        return assetPath ? { kind: COVER_KINDS.WORKSPACE_ASSET, assetPath: assetPath } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.PRESET) {
        const presetId = normalizePresetCoverId(source.presetId);
        return presetId ? { kind: COVER_KINDS.PRESET, presetId: presetId } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.EMOJI) {
        const emoji = normalizeEmoji(source.emoji);
        return emoji ? { kind: COVER_KINDS.EMOJI, emoji: emoji } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.NONE) return { kind: COVER_KINDS.NONE };
    return { kind: COVER_KINDS.NONE };
}

function isUploadCover(cover) {
    return !!cover && cover.kind === COVER_KINDS.UPLOAD && !!normalizeWorkspaceAssetPath(cover.assetPath);
}

function isWorkspaceAssetCover(cover) {
    return !!cover && cover.kind === COVER_KINDS.WORKSPACE_ASSET && !!normalizeWorkspaceAssetPath(cover.assetPath);
}

function isOwnedUploadCover(cover, assetId) {
    return !!cover && cover.kind === COVER_KINDS.UPLOAD && isOwnedMediaPath(cover.assetPath, assetId);
}

function resolveCoverUrl(cover, presetManifest) {
    const normalized = normalizeCover(cover);
    if (normalized.kind === COVER_KINDS.UPLOAD || normalized.kind === COVER_KINDS.WORKSPACE_ASSET) {
        return '/' + resolvePhysicalAssetPath(normalized.assetPath);
    }
    if (normalized.kind !== COVER_KINDS.PRESET) return null;
    const manifest = presetManifest && typeof presetManifest === 'object' ? presetManifest : {};
    const items = Array.isArray(manifest.icons) ? manifest.icons : [];
    const item = items.find(icon => icon && icon.id === normalized.presetId);
    const filename = item && String(item.filename || '').trim();
    if ((!filename || /[\\/]/.test(filename)) && normalized.presetId === DEFAULT_PRESET_ICON_ID) {
        return '/plugins/siyuan-plugin-asset-management/' + PRESET_ICON_ROOT + '/icons8-box-64.png';
    }
    if (!filename || /[\\/]/.test(filename)) return null;
    return '/plugins/siyuan-plugin-asset-management/' + PRESET_ICON_ROOT + '/' + filename;
}

function createMediaPath(assetId, extension, uuid) {
    const id = String(assetId || '').trim();
    const ext = ALLOWED_IMAGE_EXTENSIONS[String(extension || '').toLowerCase()];
    const token = String(uuid || '').trim().toLowerCase();
    if (!isMediaAssetId(id)) throw mediaError('MEDIA_ASSET_ID_INVALID', 'Invalid asset id for media upload');
    if (!ext) throw mediaError('MEDIA_EXTENSION_INVALID', 'Unsupported image extension');
    if (!isMediaUuid(token)) {
        throw mediaError('MEDIA_UUID_INVALID', 'Invalid media upload id');
    }
    return MEDIA_ROOT + '/' + id + '/' + token + '.' + ext;
}

function createUploadId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const random = Math.floor(Math.random() * 16);
        return (c === 'x' ? random : ((random & 0x3) | 0x8)).toString(16);
    });
}
function createUploadSession() {
    return { type: 'cover-upload-session', cancelled: false };
}

function cancelUploadSession(session) {
    if (!session || session.type !== 'cover-upload-session') return false;
    session.cancelled = true;
    return true;
}

function isUploadSessionActive(session) {
    return !!session && session.type === 'cover-upload-session' && session.cancelled !== true;
}

function validateImageFile(file) {
    if (!file || typeof file !== 'object') throw mediaError('MEDIA_FILE_REQUIRED', 'Image file is required');
    const size = Number(file.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_UPLOAD_BYTES) {
        throw mediaError('MEDIA_FILE_SIZE_INVALID', 'Image must not exceed 5 MiB');
    }
    const mimeType = String(file.type || '').toLowerCase();
    const extension = getFileExtension(file.name);
    const mimeExtension = ALLOWED_IMAGE_TYPES[mimeType];
    const nameExtension = ALLOWED_IMAGE_EXTENSIONS[extension];
    if ((mimeType && !mimeExtension) || (extension && !nameExtension) || (!mimeExtension && !nameExtension)) {
        throw mediaError('MEDIA_FILE_TYPE_INVALID', 'Only JPEG, PNG, and WebP images are supported');
    }
    if (mimeExtension && nameExtension && mimeExtension !== nameExtension) {
        throw mediaError('MEDIA_FILE_TYPE_INVALID', 'Image MIME type does not match its filename');
    }
    return { extension: mimeExtension || nameExtension, size: size };
}

function createCoverCanvas(width, height) {
    const w = width;
    const h = height;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

function drawCroppedToCanvas(ctx, source, crop, outW, outH) {
    const sourceWidth = Number(source && source.width);
    const sourceHeight = Number(source && source.height);
    const cropX = Math.max(0, Math.min(Number(crop.x), sourceWidth));
    const cropY = Math.max(0, Math.min(Number(crop.y), sourceHeight));
    const cropW = Math.max(0, Math.min(Number(crop.width), sourceWidth - cropX));
    const cropH = Math.max(0, Math.min(Number(crop.height), sourceHeight - cropY));
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
}

function encodeCanvasToBlob(canvas, type, quality) {
    const encodeQuality = type === 'image/png' ? undefined : quality;
    if (typeof canvas.convertToBlob === 'function') {
        return canvas.convertToBlob({ type: type, quality: encodeQuality });
    }
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob
        ? resolve(blob)
        : reject(mediaError('MEDIA_ENCODE_FAILED', 'canvas.toBlob returned null')),
    type, encodeQuality));
}

async function decodeCoverImage(file, options) {
    const opts = options || {};
    const bitmapFn = opts.createImageBitmap || (typeof createImageBitmap !== 'undefined' ? createImageBitmap : null);
    if (typeof bitmapFn !== 'function') throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    let bitmap;
    try {
        bitmap = await bitmapFn(file, { imageOrientation: 'from-image' });
    } catch (e) {
        throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    }
    if (!bitmap || typeof bitmap.width !== 'number' || typeof bitmap.height !== 'number') {
        try { bitmap && bitmap.close && bitmap.close(); } catch (_) {}
        throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    }
    return { bitmap: bitmap, width: bitmap.width, height: bitmap.height };
}

async function cropAndEncodeCoverImage(options) {
    const opts = options || {};
    const bitmap = opts.bitmap;
    const sourceWidth = Number(opts.sourceWidth);
    const sourceHeight = Number(opts.sourceHeight);
    const crop = opts.crop || {};
    if (!bitmap) throw mediaError('MEDIA_DECODE_FAILED', 'Bitmap missing');
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw mediaError('MEDIA_CROP_INVALID', 'Invalid source dimensions');
    }
    const cropX = Number(crop.x);
    const cropY = Number(crop.y);
    const cropW = Number(crop.width);
    const cropH = Number(crop.height);
    if (!Number.isFinite(cropX) || !Number.isFinite(cropY) || !Number.isFinite(cropW) || !Number.isFinite(cropH)) {
        throw mediaError('MEDIA_CROP_INVALID', 'Invalid crop coordinates');
    }
    if (cropW !== cropH) throw mediaError('MEDIA_CROP_INVALID', 'Cover crop must be 1:1');
    if (cropX < 0 || cropY < 0 || cropW <= 0 || cropH <= 0 || cropX + cropW > sourceWidth || cropY + cropH > sourceHeight) {
        throw mediaError('MEDIA_CROP_INVALID', 'Crop exceeds source bounds');
    }
    const outputSize = Number(opts.outputSize) || COVER_DEFAULT_OUTPUT_SIZE;
    const maxDimension = Number(opts.maxDimension) || COVER_MAX_DIMENSION;
    const threshold = Number(opts.threshold) || COVER_COMPRESSED_THRESHOLD;
    const type = opts.type || 'image/jpeg';
    const isPng = type === 'image/png';
    const requestedQuality = Number.isFinite(opts.quality) ? opts.quality : COVER_QUALITY;
    const finalDimension = Math.max(1, Math.min(outputSize, maxDimension));
    const outW = finalDimension;
    const outH = finalDimension;
    let canvas;
    try {
        canvas = createCoverCanvas(outW, outH);
    } catch (e) {
        throw mediaError('MEDIA_ENCODE_FAILED', 'Failed to create canvas');
    }
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) throw mediaError('MEDIA_ENCODE_FAILED', '2D context unavailable');
    const drawOnce = (q) => {
        try {
            ctx.clearRect(0, 0, outW, outH);
            drawCroppedToCanvas(ctx, bitmap, { x: cropX, y: cropY, width: cropW, height: cropH }, outW, outH);
        } catch (e) {
            throw mediaError('MEDIA_ENCODE_FAILED', 'drawImage failed');
        }
        return encodeCanvasToBlob(canvas, type, isPng ? undefined : q);
    };
    let blob;
    let usedQuality = requestedQuality;
    try {
        blob = await drawOnce(requestedQuality);
    } catch (e) {
        if (e && e.code) throw e;
        throw mediaError('MEDIA_ENCODE_FAILED', 'encode failed');
    }
    let processedSize = blob.size;
    if (!isPng && blob.size > threshold) {
        const ladder = COVER_QUALITY_LADDER;
        const startIdx = ladder.indexOf(requestedQuality);
        const retryList = startIdx >= 0 ? ladder.slice(startIdx + 1) : ladder.slice(1);
        for (const q of retryList) {
            let next;
            try { next = await drawOnce(q); } catch (e) { continue; }
            processedSize = next.size;
            usedQuality = q;
            blob = next;
            if (next.size <= threshold) break;
        }
    }
    const sourceSize = Number(opts.sourceSize) || 0;
    const compressed = processedSize < sourceSize;
    return {
        blob: blob,
        width: outW,
        height: outH,
        sourceSize: sourceSize,
        processedSize: processedSize,
        compressed: compressed,
        quality: isPng ? null : usedQuality,
    };
}

async function processCoverImage(file, options) {
    const opts = options || {};
    const decoded = await decodeCoverImage(file, opts);
    let result;
    try {
        result = await cropAndEncodeCoverImage(Object.assign({}, opts, {
            bitmap: decoded.bitmap,
            sourceWidth: decoded.width,
            sourceHeight: decoded.height,
            sourceSize: (file && file.size) || 0,
        }));
    } finally {
        try { decoded.bitmap && decoded.bitmap.close && decoded.bitmap.close(); } catch (_) {}
    }
    return {
        blob: result.blob,
        width: result.width,
        height: result.height,
        sourceSize: (file && file.size) || 0,
        processedSize: result.processedSize,
        compressed: result.compressed,
        type: (opts && opts.type) || 'image/jpeg',
        ratio: '1:1',
    };
}

async function parseKernelResponse(response) {
    if (!response || !response.ok) throw mediaError('MEDIA_API_FAILED', 'SiYuan file API request failed');
    const payload = await response.json();
    if (!payload || payload.code !== 0) {
        throw mediaError('MEDIA_API_FAILED', (payload && payload.msg) || 'SiYuan file API request failed');
    }
    return payload;
}

function getFetch(options) {
    const fetchFn = options && options.fetch;
    if (typeof fetchFn === 'function') return fetchFn;
    if (typeof fetch === 'function') return fetch;
    throw mediaError('MEDIA_FETCH_UNAVAILABLE', 'Fetch is unavailable');
}
async function migrateLegacyMediaRoot(options) {
    let response;
    try {
        response = await getFetch(options)('/api/file/renameFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: WORKSPACE_DATA_ROOT + LEGACY_MEDIA_ROOT,
                newPath: WORKSPACE_DATA_ROOT + MEDIA_ROOT,
            }),
        });
    } catch (e) {
        legacyMediaMigrated = false;
        return { status: 'failed', code: 'NETWORK', message: (e && e.message) || 'Network error during media migration' };
    }
    let payload = null;
    try {
        payload = response && typeof response.json === 'function' ? await response.json() : null;
    } catch (e) {
        payload = null;
    }
    const code = payload && typeof payload.code === 'number' ? payload.code : ((response && response.status) || -1);
    if (code === 0) {
        legacyMediaMigrated = true;
        return { status: 'migrated' };
    }
    if (code === 404 || (response && response.status === 404)) {
        legacyMediaMigrated = true;
        return { status: 'absent' };
    }
    legacyMediaMigrated = false;
    return {
        status: 'failed',
        code: code,
        message: (payload && payload.msg) || ('Media migration failed with HTTP ' + ((response && response.status) || 0)),
    };
}

async function uploadImage(assetId, file, options) {
    const validated = validateImageFile(file);
    const opts = options || {};
    const assetPath = createMediaPath(assetId, validated.extension, opts.uuid || createUploadId());
    const FormDataCtor = opts.FormData || (typeof FormData !== 'undefined' ? FormData : null);
    if (!FormDataCtor) throw mediaError('MEDIA_FORM_DATA_UNAVAILABLE', 'FormData is unavailable');
    const body = new FormDataCtor();
    body.append('path', toWorkspaceFilePath(assetPath));
    body.append('file', file, file.name || ('cover.' + validated.extension));
    await parseKernelResponse(await getFetch(opts)('/api/file/putFile', { method: 'POST', body: body }));
    return { kind: COVER_KINDS.UPLOAD, assetPath: assetPath };
}

async function removeUploadCover(cover, assetId, options) {
    const normalized = normalizeCover(cover);
    if (!isOwnedUploadCover(normalized, assetId)) return false;
    const response = await getFetch(options)('/api/file/removeFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toWorkspaceFilePath(normalized.assetPath) }),
    });
    await parseKernelResponse(response);
    return true;
}

async function renameUploadCover(cover, assetId, newAssetPath, options) {
    const normalized = normalizeCover(cover);
    const targetPath = String(newAssetPath || '').trim();
    if (!isOwnedUploadCover(normalized, assetId) || !isOwnedMediaPath(targetPath, assetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid owned upload cover path');
    }
    const response = await getFetch(options)('/api/file/renameFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: toWorkspaceFilePath(normalized.assetPath),
            newPath: toWorkspaceFilePath(targetPath),
        }),
    });
    await parseKernelResponse(response);
    return { kind: COVER_KINDS.UPLOAD, assetPath: targetPath };
}

async function copyUploadCoverToOwner(cover, sourceAssetId, targetAssetId, options) {
    const normalized = normalizeCover(cover);
    if (!isOwnedUploadCover(normalized, sourceAssetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid source upload cover path');
    }
    const filename = normalized.assetPath.split('/').pop();
    const targetPath = MEDIA_ROOT + '/' + String(targetAssetId || '').trim() + '/' + filename;
    if (!isOwnedMediaPath(targetPath, targetAssetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid target upload cover path');
    }
    const opts = options || {};
    const fetchFn = getFetch(opts);
    const sourceResponse = await fetchFn('/api/file/getFile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toWorkspaceFilePath(normalized.assetPath) }),
    });
    if (!sourceResponse || !sourceResponse.ok || typeof sourceResponse.blob !== 'function') {
        throw mediaError('MEDIA_API_FAILED', 'Failed to read source upload cover');
    }
    const blob = await sourceResponse.blob();
    const FormDataCtor = opts.FormData || (typeof FormData !== 'undefined' ? FormData : null);
    if (!FormDataCtor) throw mediaError('MEDIA_FORM_DATA_UNAVAILABLE', 'FormData is unavailable');
    const body = new FormDataCtor();
    body.append('path', toWorkspaceFilePath(targetPath));
    body.append('file', blob, filename);
    await parseKernelResponse(await fetchFn('/api/file/putFile', { method: 'POST', body: body }));
    return { kind: COVER_KINDS.UPLOAD, assetPath: targetPath };
}

async function cleanupReplacedCover(previousCover, nextCover, assetId, options) {
    const previous = normalizeCover(previousCover);
    const next = normalizeCover(nextCover);
    if (!isUploadCover(previous) || previous.assetPath === (next && next.assetPath)) return false;
    return removeUploadCover(previous, assetId, options);
}

async function cleanupDeletedCover(cover, assetId, options) {
    const normalized = normalizeCover(cover);
    if (!isOwnedUploadCover(normalized, assetId)) return false;
    return removeUploadCover(normalized, assetId, options);
}

    return {MEDIA_ROOT: MEDIA_ROOT,
    LEGACY_MEDIA_ROOT: LEGACY_MEDIA_ROOT,
    WORKSPACE_DATA_ROOT: WORKSPACE_DATA_ROOT,
    PRESET_ICON_ROOT: PRESET_ICON_ROOT,
    DEFAULT_PRESET_ICON_ID: DEFAULT_PRESET_ICON_ID,
    MAX_UPLOAD_BYTES: MAX_UPLOAD_BYTES,
    COVER_MAX_DIMENSION: COVER_MAX_DIMENSION,
    COVER_QUALITY: COVER_QUALITY,
    COVER_COMPRESSED_THRESHOLD: COVER_COMPRESSED_THRESHOLD,
    COVER_QUALITY_LADDER: COVER_QUALITY_LADDER,
    COVER_DEFAULT_OUTPUT_SIZE: COVER_DEFAULT_OUTPUT_SIZE,
    decodeCoverImage: decodeCoverImage,
    cropAndEncodeCoverImage: cropAndEncodeCoverImage,
    processCoverImage: processCoverImage,
    ALLOWED_IMAGE_TYPES: ALLOWED_IMAGE_TYPES,
    COVER_KINDS: COVER_KINDS,
    normalizeWorkspaceAssetPath: normalizeWorkspaceAssetPath,
    toWorkspaceFilePath: toWorkspaceFilePath,
    isLegacyMediaMigrated: isLegacyMediaMigrated,
    resolvePhysicalAssetPath: resolvePhysicalAssetPath,
    migrateLegacyMediaRoot: migrateLegacyMediaRoot,
    isLegacyIconParkPreset: isLegacyIconParkPreset,
    normalizeCover: normalizeCover,
    isUploadCover: isUploadCover,
    isWorkspaceAssetCover: isWorkspaceAssetCover,
    isOwnedMediaPath: isOwnedMediaPath,
    isOwnedUploadCover: isOwnedUploadCover,
    resolveCoverUrl: resolveCoverUrl,
    createMediaPath: createMediaPath,
    createUploadSession: createUploadSession,
    cancelUploadSession: cancelUploadSession,
    isUploadSessionActive: isUploadSessionActive,
    validateImageFile: validateImageFile,
    uploadImage: uploadImage,
    removeUploadCover: removeUploadCover,
    renameUploadCover: renameUploadCover,
    copyUploadCoverToOwner: copyUploadCoverToOwner,
    cleanupReplacedCover: cleanupReplacedCover,
    cleanupDeletedCover: cleanupDeletedCover,};

})();

const __am_assets = (function() {

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
} = __am_algos;
const { normalizeCover } = __am_media;

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
        const inferredTargetGroup = kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
            : (kind.indexOf('virtual') === 0 ? 'virtual' : 'prepaid');
        const targetGroup = wish.targetGroup == null ? inferredTargetGroup : wish.targetGroup;
        if (FORMAL_WISHLIST_TARGET_GROUPS.indexOf(targetGroup) < 0) {
            throw formalError('wishlist.targetGroup is invalid');
        }
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
    return Object.assign({}, baseFields, {
        categoryId: normalizeFormalCategoryId(kind, source.categoryId),
        tagIds: normalizeFormalTagIds(source.tagIds),
        notes: formalString(source.notes, '', 5000, false, 'notes'),
        acquiredOn: formalDate(source.acquiredOn, opts.today || now, false, 'acquiredOn', formalHasOwn(source, 'acquiredOn')),
        statusChangedOn: formalDate(source.statusChangedOn, opts.today || now, false, 'statusChangedOn', formalHasOwn(source, 'statusChangedOn')),
        details: details,
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
        let expected = value;
        if (value.status === ASSET_STATUS.WISHLIST
            && isPlainObject(value.wishlist)
            && !Object.prototype.hasOwnProperty.call(value.wishlist, 'heartbeatTarget')) {
            expected = Object.assign({}, value, {
                wishlist: Object.assign({}, value.wishlist, { heartbeatTarget: null }),
            });
        }
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

const FORMAL_DISPLAY_GROUP = Object.freeze({ physical: 'physical', virtualSubscription: 'virtual', virtualPerpetual: 'virtual', prepaidAmount: 'prepaid', prepaidCount: 'prepaid' });
const FORMAL_PREPAID_TRANSACTION_TYPES = Object.freeze(['opening', 'inflow', 'outflow', 'refund', 'adjust']);
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
    if (Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
        const ids = new Set(filter.tagIds.map(id => String(id).trim().toLowerCase()));
        list = list.filter(a => Array.isArray(a.tagIds) && a.tagIds.some(id => ids.has(id)));
    }
    return sortAssets(list, filter.sort || 'default', filter.financialEvents);
}
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

    return {STATUSES: STATUSES,
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
    applyFilter: applyFilter,};

})();

const __am_reports = (function() {

'use strict';
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
} = __am_assets;
const { isUUID, daysUntil } = __am_algos;

const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 120;
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
            netByCurrency: createDict(),
            retiredSaleByCurrency: createDict(),
            recordedFinancialsByCurrency: createDict(),
        },
        rankings: { byCurrency: createDict() },
        prepaid: {
            amountByCurrency: createDict(),
            countByAsset: createDict(),
            countTotals: { assetCount: 0, remainingCount: 0, chargeCount: 0, consumeCount: 0 },
            expiringWithin30Days: [],
        },
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
            report.prepaid.countTotals.assetCount = safeAddFormal(report.prepaid.countTotals.assetCount, 1, 'prepaid.countTotals.assetCount');
            report.prepaid.countTotals.remainingCount = safeAddFormal(report.prepaid.countTotals.remainingCount, card.prepaid.remainingCount, 'prepaid.countTotals.remainingCount');
            report.prepaid.countTotals.chargeCount = safeAddFormal(report.prepaid.countTotals.chargeCount,
                safeAddFormal(card.prepaid.openingCount, card.prepaid.inflowCount, 'prepaid.countTotals.chargeCount'), 'prepaid.countTotals.chargeCount');
            report.prepaid.countTotals.consumeCount = safeAddFormal(report.prepaid.countTotals.consumeCount, card.prepaid.outflowCount, 'prepaid.countTotals.consumeCount');
            const countLinkedEventIds = new Set(sidecars.prepaidTransactions
                .filter(record => record && record.assetId === card.id && record.financialEventId != null)
                .map(record => record.financialEventId));
            let countCashMinor = 0;
            if (countLinkedEventIds.size) {
                sidecars.financialEvents.forEach(event => {
                    if (!event || event.assetId !== card.id || event.voidedAt || !countLinkedEventIds.has(event.id)) return;
                    if (event.metadata && event.metadata.affectsCash === false) return;
                    if (event.direction === FINANCIAL_DIRECTION.OUTFLOW) countCashMinor = safeAddFormal(countCashMinor, event.amountMinor, 'prepaid.countCashOutflow');
                    else if (event.direction === FINANCIAL_DIRECTION.INFLOW) countCashMinor = safeAddFormal(countCashMinor, -event.amountMinor, 'prepaid.countCashRefund');
                });
            }
            if (countCashMinor > 0) {
                if (!hasOwn(report.prepaid.amountByCurrency, card.currency)) {
                    report.prepaid.amountByCurrency[card.currency] = { currency: card.currency, balanceAmountMinor: 0, assetCount: 0, transactionCount: 0, chargeAmountMinor: 0, consumeAmountMinor: 0 };
                }
                const countMoneyBucket = report.prepaid.amountByCurrency[card.currency];
                const countGranted = safeAddFormal(
                    safeAddFormal(card.prepaid.openingCount, card.prepaid.inflowCount, 'prepaid.countGranted'),
                    Math.max(0, Number(card.prepaid.adjustCount) || 0), 'prepaid.countGranted');
                const countUsed = Math.min(Math.max(0, Number(card.prepaid.outflowCount) || 0), countGranted);
                const countConsumedMinor = countGranted > 0 ? Math.round(countCashMinor * countUsed / countGranted) : 0;
                countMoneyBucket.chargeAmountMinor = safeAddFormal(countMoneyBucket.chargeAmountMinor, countCashMinor, 'prepaid.chargeAmountMinor');
                countMoneyBucket.consumeAmountMinor = safeAddFormal(countMoneyBucket.consumeAmountMinor, countConsumedMinor, 'prepaid.consumeAmountMinor');
                countMoneyBucket.balanceAmountMinor = safeAddFormal(countMoneyBucket.balanceAmountMinor, countCashMinor - countConsumedMinor, 'prepaid.balanceAmountMinor');
            }
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
        const stateKey = card.subscription.isTrial ? 'trial'
            : (hasOwn(report.subscription.byState, card.subscription.state) ? card.subscription.state : null);
        if (stateKey) report.subscription.byState[stateKey] = safeAddFormal(report.subscription.byState[stateKey], 1, 'subscription.byState.' + stateKey);
        const periodAmount = periodPaymentAmountMinor(card.subscription.currentPeriod);
        if (periodAmount > 0) {
            const period = card.subscription.currentPeriod;
            const periodStart = parseRecordedDate(period.startDate);
            const periodEnd = parseRecordedDate(period.endDate);
            const periodDays = periodStart && periodEnd ? Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1 : 0;
            const monthly = periodDays > 0
                ? Math.round(periodAmount / periodDays * 30.4375)
                : Math.round(periodAmount / billingCycleMonths(entry.asset));
            currencyBucket.monthlyAmountMinor = safeAddFormal(currencyBucket.monthlyAmountMinor, monthly, 'subscription.monthlyAmountMinor');
        }
    });
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

function deriveWishlistHeartbeat(events, assetId) {
    if (!Array.isArray(events)) return { count: 0 };
    let count = 0;
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        if (event && event.eventType === 'heartbeat' && event.sourceWishlistId === assetId) count += 1;
    }
    return { count: count };
}

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

    return {DASHBOARD_RANGES: DASHBOARD_RANGES,
    normalizeDashboardRange: normalizeDashboardRange,
    normalizeFormalReportFilter: normalizeFormalReportFilter,
    buildFormalReport: buildFormalReport,
    buildFormalDashboard: buildFormalDashboard,
    deriveWishlistHeartbeat: deriveWishlistHeartbeat,
    describeWishlistHeartbeat: describeWishlistHeartbeat,};

})();

const __am_agent_actions = (function() {

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
} = __am_assets;
const { buildFormalReport } = __am_reports;
const {
    isUUID,
    isISO4217Currency,
    daysUntil,
    minorToMajorString,
} = __am_algos;

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

async function requireDomain(getDomain, request) {
    const domain = await (typeof getDomain === 'function' ? getDomain(request) : null);
    if (!completeDomain(domain)) throw actionError('DOMAIN_UNAVAILABLE', 'formal asset data is not fully loaded');
    return domain;
}

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
        stats = {};
    }
    const reportAssets = domain.assets.filter(asset => asset.status !== ASSET_STATUS.WISHLIST);
    const minDate = reportAssets.reduce((min, asset) => !min || asset.acquiredOn < min ? asset.acquiredOn : min, today);
    let report = null;
    try {
        report = buildFormalReport(domain, { dateFrom: minDate, endDate: today }, { now: new Date().toISOString() });
    } catch (error) {
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

    return {AGENT_SCHEMA,
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
    failure,};

})();

// ============================================================
// kernel 侧别名：kernel.template.js 只用这两个符号
// ============================================================
const agentActions = __am_agent_actions;
const { createStableId } = __am_algos;


    // ---------- 常量（文件名与 api/storage.js STORAGE_FILES 保持一致） ----------

    var KERNEL_STORAGE_FILES = Object.freeze({
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
    });

    // sidecar 文件 → 域键 / 信封内数组键 的映射（与前端 formal 域快照形状一致）
    var DOMAIN_RECORD_FILES = Object.freeze([
        ['wishlistEvents', KERNEL_STORAGE_FILES.wishlistEvents, 'events'],
        ['operationLogs', KERNEL_STORAGE_FILES.operationLogs, 'logs'],
        ['maintenance', KERNEL_STORAGE_FILES.maintenance, 'records'],
        ['usage', KERNEL_STORAGE_FILES.usage, 'records'],
        ['prepaidTransactions', KERNEL_STORAGE_FILES.prepaidTransactions, 'records'],
        ['financialEvents', KERNEL_STORAGE_FILES.financialEvents, 'events'],
        ['lifecycleEvents', KERNEL_STORAGE_FILES.lifecycleEvents, 'events'],
        ['subscriptionPeriods', KERNEL_STORAGE_FILES.subscriptionPeriods, 'records'],
    ]);

    var WRITE_ROOT = 'agent-writes/';
    var WRITE_PENDING_DIR = WRITE_ROOT + 'pending/';
    var WRITE_PROCESSING_DIR = WRITE_ROOT + 'processing/';
    var WRITE_COMPLETED_DIR = WRITE_ROOT + 'completed/';
    var WRITE_MANIFEST_FILE = WRITE_ROOT + 'pending-manifest.json';
    // 旧文件仅供已在途请求收尾，新请求绝不写入这些共享文件。
    var LEGACY_WRITE_QUEUE_FILE = 'agent-write-queue.json';
    var LEGACY_WRITE_RESULTS_FILE = 'agent-write-results.json';
    var KERNEL_STATUS_FILE = 'agent-kernel-status.json';
    var WRITE_POLL_INTERVAL_MS = 250;
    var WRITE_TIMEOUT_MS = 30 * 1000;

    var WRITE_METHOD_NAMES = Object.freeze([
        'addAsset', 'updateAsset', 'setStatus', 'deleteAsset',
        'retirePhysicalAsset', 'recordPhysicalSaleAsset', 'renewSubscription',
        'toggleSubscriptionAutoRenew', 'addMaintenanceRecord', 'addPrepaidTransaction',
        'recordPrepaidCountAdjustment', 'recordPrepaidConsumption', 'correctPurchaseAmount',
        'correctSubscriptionPaymentAmount', 'updateSubscriptionStartDate', 'updateSubscriptionPeriodEnd',
        'updateAssetTags', 'createAndBindAssetTags',
    ]);

    var state = {
        registeredTools: new Set(),
        registrationApi: null,
        registrationPromise: null,
    };

    // manifest 只由内核追加，使用同一内核实例内的 FIFO 避免追加互相覆盖。
    var writeLane = { tail: Promise.resolve() };

    function enqueueWriteLane(task) {
        var run = writeLane.tail.then(function () { return task(); });
        writeLane.tail = run.then(function () { return undefined; }, function () { return undefined; });
        return run;
    }

    // ---------- storage 读写（仿 task-horizon readJsonState：missing 判定 + put 后读回校验） ----------

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function stableJson(value) {
        if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
        if (value && typeof value === 'object') {
            return '{' + Object.keys(value).sort().map(function (key) {
                return JSON.stringify(key) + ':' + stableJson(value[key]);
            }).join(',') + '}';
        }
        return JSON.stringify(value);
    }

    async function readJsonState(path, deadline) {
        var operationDeadline = Number.isFinite(Number(deadline))
            ? Number(deadline) : Date.now() + getWriteTimeoutMs();
        var raw;
        try {
            var response = await withDeadline(
                Promise.resolve().then(function () { return siyuan.storage.get(path); }),
                operationDeadline,
                createWriteTimeoutError()
            );
            raw = await withDeadline(
                Promise.resolve().then(function () { return response.text(); }),
                operationDeadline,
                createWriteTimeoutError()
            );
        } catch (error) {
            if (isWriteTimeout(error)) return { status: 'timeout', value: null, error: error };
            var message = text(error && error.message);
            var missing = /(?:not\s+found|not\s+exist|cannot\s+find|enoent|no\s+such\s+file(?:\s+or\s+directory)?|(?:file|directory)\s+does\s+not\s+exist|找不到|不存在)/i.test(message);
            return { status: missing ? 'missing' : 'unavailable', value: null, error: error };
        }
        if (!text(raw)) return { status: 'corrupt', value: null, error: new Error('empty file: ' + path) };
        try {
            return { status: 'valid', value: JSON.parse(raw), error: null };
        } catch (error) {
            return { status: 'corrupt', value: null, error: error };
        }
    }

    async function readJson(path, fallback, deadline) {
        var record = await readJsonState(path, deadline);
        return record.status === 'valid' ? record.value : fallback;
    }

    async function writeJson(path, value, deadline) {
        var operationDeadline = Number.isFinite(Number(deadline))
            ? Number(deadline) : Date.now() + getWriteTimeoutMs();
        var serialized = JSON.stringify(value, null, 2);
        await withDeadline(
            Promise.resolve().then(function () { return siyuan.storage.put(path, serialized); }),
            operationDeadline,
            createWriteTimeoutError()
        );
        var verified = await readJsonState(path, operationDeadline);
        if (verified.status === 'timeout') throw verified.error || createWriteTimeoutError();
        if (verified.status === 'corrupt') throw queueCorruptError(verified.error);
        if (verified.status !== 'valid') throw queueUnavailableError(verified.error);
        if (stableJson(verified.value) !== stableJson(JSON.parse(serialized))) throw queueCorruptError(new Error('write readback mismatch'));
    }

    // ---------- 设置 / formal 域读取（实时，无缓存） ----------

    async function readAgentSettings() {
        var raw = await readJson(KERNEL_STORAGE_FILES.settings, null);
        return agentActions.normalizeAgentSettings(raw && typeof raw === 'object' ? raw : {});
    }

    function domainUnavailableError(cause) {
        var error = new Error('formal asset data is not fully loaded');
        error.agentCode = 'DOMAIN_UNAVAILABLE';
        error.cause = cause;
        return error;
    }

    function validateCoreDomain(assets, tags) {
        if (!Array.isArray(assets) || !Array.isArray(tags)) {
            throw domainUnavailableError(new Error('core domain arrays are unavailable'));
        }
        for (var index = 0; index < assets.length; index++) {
            var validation = __am_assets.validateFormalV2Asset(assets[index]);
            if (!validation || validation.valid !== true) {
                throw domainUnavailableError(new Error('core asset validation failed'));
            }
        }
        for (var tagIndex = 0; tagIndex < tags.length; tagIndex++) {
            var tag = tags[tagIndex];
            if (!tag || typeof tag !== 'object' || typeof tag.id !== 'string' || typeof tag.label !== 'string') {
                throw domainUnavailableError(new Error('core tag validation failed'));
            }
        }
    }

    async function readWrapperArray(file, envelopeKey, required) {
        var record = await readJsonState(file);
        if (record.status === 'missing') {
            if (required === true) throw domainUnavailableError(new Error('required storage file is missing: ' + file));
            return [];
        }
        if (record.status !== 'valid') throw domainUnavailableError(record.error);
        var wrapper = record.value;
        if (!wrapper || typeof wrapper !== 'object' || !Array.isArray(wrapper[envelopeKey])) {
            throw domainUnavailableError(new Error('unexpected storage shape: ' + file));
        }
        return wrapper[envelopeKey];
    }

    async function readAgentDomain() {
        var domain = {};
        domain.assets = await readWrapperArray(KERNEL_STORAGE_FILES.assets, 'assets', true);
        domain.tags = await readWrapperArray(KERNEL_STORAGE_FILES.tags, 'tags', true);
        validateCoreDomain(domain.assets, domain.tags);
        await Promise.all(DOMAIN_RECORD_FILES.map(async function (entry) {
            domain[entry[0]] = await readWrapperArray(entry[1], entry[2]);
        }));
        if (!agentActions.completeDomain(domain)) throw domainUnavailableError(new Error('domain incomplete'));
        return domain;
    }

    // Count/search only need the canonical asset list and tag catalog. Keeping
    // the remaining arrays empty preserves the shared domain contract while
    // avoiding needless reads and JSON parsing of financial/event sidecars.
    async function readAgentQueryDomain(request) {
        var op = request && request.op;
        if (op !== 'count' && op !== 'search' && op !== 'tags') return readAgentDomain();
        var needsTagLabels = op === 'search' || op === 'tags'
            || (op === 'count' && request && typeof request.tag === 'string' && request.tag.trim());
        var values = await Promise.all([
            readWrapperArray(KERNEL_STORAGE_FILES.assets, 'assets', true),
            needsTagLabels ? readWrapperArray(KERNEL_STORAGE_FILES.tags, 'tags', true) : Promise.resolve([]),
        ]);
        validateCoreDomain(values[0], values[1]);
        var domain = {
            assets: values[0],
            tags: values[1],
            financialEvents: [],
            subscriptionPeriods: [],
            prepaidTransactions: [],
            maintenance: [],
            usage: [],
            lifecycleEvents: [],
            wishlistEvents: [],
            operationLogs: [],
        };
        if (!agentActions.completeDomain(domain)) throw domainUnavailableError(new Error('query domain incomplete'));
        return domain;
    }

    // ---------- 写队列桥（kernel → 前端插件） ----------

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function createWriteTimeoutError() {
        var error = new Error('kernel storage operation timed out');
        error.agentCode = 'WRITE_TIMEOUT';
        return error;
    }

    function getWriteTimeoutMs() {
        // The private hook keeps I/O tests fast without changing the production deadline.
        var injected = typeof siyuan !== 'undefined' && siyuan
            ? Number(siyuan.__assetManagementTestWriteTimeoutMs) : NaN;
        return Number.isFinite(injected) && injected > 0 ? injected : WRITE_TIMEOUT_MS;
    }

    function withDeadline(promise, deadline, timeoutError) {
        var error = timeoutError || createWriteTimeoutError();
        var remaining = Number(deadline) - Date.now();
        if (!(remaining > 0)) return Promise.reject(error);
        var timer;
        var timeout = new Promise(function (_, reject) {
            timer = setTimeout(function () { reject(error); }, remaining);
        });
        return Promise.race([Promise.resolve(promise), timeout]).then(function (value) {
            clearTimeout(timer);
            return value;
        }, function (failure) {
            clearTimeout(timer);
            throw failure;
        });
    }

    function isWriteTimeout(error) {
        return !!(error && error.agentCode === 'WRITE_TIMEOUT');
    }

    function writeTimeoutResult() {
        return {
            ok: false,
            error: {
                code: 'WRITE_TIMEOUT',
                message: '资产管理前端插件未响应写入请求。请确认插件已启用（重载插件或重启思源）后重试。',
            },
        };
    }

    function queueCorruptError(cause) {
        var error = new Error('写入队列文件不可读（可能已损坏）。请重载插件或重启思源后重试写入。');
        error.agentCode = 'QUEUE_CORRUPT';
        error.cause = cause;
        return error;
    }

    function queueUnavailableError(cause) {
        var error = new Error('写入队列暂时不可用（并发写入冲突，已重试仍失败）。请稍后重试该写入操作。');
        error.agentCode = 'QUEUE_UNAVAILABLE';
        error.cause = cause;
        return error;
    }

    function requestPath(dir, id) {
        return dir + encodeURIComponent(String(id)) + '.json';
    }

    function validateRequest(request, expectedId) {
        return !!(request && typeof request === 'object' && !Array.isArray(request)
            && typeof request.id === 'string' && request.id === expectedId
            && typeof request.method === 'string' && Array.isArray(request.args)
            && typeof request.createdAt === 'string');
    }

    async function appendPendingManifest(id, createdAt, deadline) {
        var record = await readJsonState(WRITE_MANIFEST_FILE, deadline);
        if (record.status === 'corrupt') throw queueCorruptError(record.error);
        if (record.status === 'timeout') throw record.error || createWriteTimeoutError();
        if (record.status === 'unavailable') throw queueUnavailableError(record.error);
        if (record.status !== 'valid' && record.status !== 'missing') throw queueUnavailableError(record.error);
        var manifest = record.status === 'valid' ? record.value : { schemaVersion: 1, requests: [] };
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.requests)) {
            throw queueCorruptError(new Error('unexpected pending manifest shape'));
        }
        var exists = manifest.requests.some(function (entry) {
            return entry && typeof entry.id === 'string' && entry.id === id;
        });
        if (!exists) manifest.requests.push({ id: id, createdAt: createdAt });
        await writeJson(WRITE_MANIFEST_FILE, manifest, deadline);
    }

    async function submitWrite(methodName, argsArray) {
        var deadline = Date.now() + getWriteTimeoutMs();
        var id = createStableId();
        var request = {
            id: id,
            method: methodName,
            args: Array.isArray(argsArray) ? argsArray : [],
            createdAt: new Date().toISOString(),
        };
        try {
            await withDeadline(enqueueWriteLane(async function () {
                if (Date.now() >= deadline) throw createWriteTimeoutError();
                // 先追加只由内核维护的 manifest，再写独立 pending 文件。manifest 先成功时
                // 最多留下一个待补齐的索引项，不会让已写入请求失去发现入口。
                await appendPendingManifest(id, request.createdAt, deadline);
                await writeJson(requestPath(WRITE_PENDING_DIR, id), request, deadline);
                var readback = await readJsonState(requestPath(WRITE_PENDING_DIR, id), deadline);
                if (readback.status === 'timeout') throw readback.error || createWriteTimeoutError();
                if (readback.status !== 'valid' || !validateRequest(readback.value, id)) {
                    throw new Error('pending request readback failed for ' + id);
                }
            }), deadline, createWriteTimeoutError());
        } catch (error) {
            if (isWriteTimeout(error)) return writeTimeoutResult();
            if (error && error.agentCode === 'QUEUE_CORRUPT') throw error;
            throw queueUnavailableError(error);
        }

        for (;;) {
            if (Date.now() >= deadline) return writeTimeoutResult();
            var completed = await readJsonState(requestPath(WRITE_COMPLETED_DIR, id), deadline);
            if (completed.status === 'valid') {
                var file = completed.value;
                if (!file || typeof file !== 'object' || file.id !== id
                    || !Object.prototype.hasOwnProperty.call(file, 'result')) {
                    throw queueCorruptError(new Error('unexpected completed request shape'));
                }
                return file.result;
            }
            // missing 是正常等待态；corrupt 与 unavailable 必须向调用方区分暴露。
            if (completed.status === 'corrupt') throw queueCorruptError(completed.error);
            if (completed.status === 'timeout') return writeTimeoutResult();
            if (completed.status !== 'missing') throw queueUnavailableError(completed.error);
            var remaining = deadline - Date.now();
            if (!(remaining > 0)) return writeTimeoutResult();
            await sleep(Math.min(WRITE_POLL_INTERVAL_MS, remaining));
        }
    }

    /**
     * agent-actions 期望 methods[name] 返回业务方法的原始返回值（如资产对象）、
     * 失败时 throw；这里把 submitWrite 的 {ok,data,error} 结果对象适配过去。
     */
    function createAgentWriteMethods() {
        var methods = {};
        WRITE_METHOD_NAMES.forEach(function (name) {
            methods[name] = async function () {
                var args = Array.prototype.slice.call(arguments);
                var result = await submitWrite(name, args);
                if (result && result.ok === true) return result.data;
                var failureBody = (result && result.error) || {};
                var error = new Error(failureBody.message || 'agent write failed');
                error.agentCode = failureBody.code || 'WRITE_FAILED';
                throw error;
            };
        });
        return methods;
    }

    var agentHandlers = null;

    function ensureAgentHandlers() {
        if (!agentHandlers) {
            agentHandlers = agentActions.createAgentActionHandlers({
                getSettings: readAgentSettings,
                getDomain: readAgentDomain,
                getQueryDomain: readAgentQueryDomain,
                methods: createAgentWriteMethods(),
            });
        }
        return agentHandlers;
    }

    // createAgentActionHandlers 返回 {result:jsonString} / {error:jsonString} 字符串信封；
    // registerCapability 的 handler 需要返回对象，这里 parse 回对象。
    var MCP_TOOL_ACTIONS = Object.freeze({
        asset_query: 'query',
        asset_create: 'create',
        asset_update: 'update',
        asset_lifecycle: 'update',
        asset_price_update: 'update',
        asset_delete: 'delete',
        asset_tag_update: 'update',
        asset_tag_create: 'create',
    });

    function expectedToolAction(name, args) {
        if (name === 'asset_record') {
            var op = args && args.op;
            return op === 'purchaseAmount' || op === 'subscriptionPaymentAmount' ? 'update' : 'create';
        }
        return MCP_TOOL_ACTIONS[name];
    }

    function createRegisteredHandler(name, handlers, requireAction) {
        return async function (args) {
            var transport;
            var expectedAction = expectedToolAction(name, args);
            if (requireAction === true && (!args || args.action !== expectedAction)) {
                var actionError = new Error('action must equal ' + expectedAction + ' for this operation');
                actionError.agentCode = 'INVALID_ACTION';
                return JSON.parse(agentActions.failure(actionError));
            }
            try {
                transport = await handlers[name](args == null ? {} : args);
            } catch (error) {
                return JSON.parse(agentActions.failure(error));
            }
            var encoded = transport && typeof transport === 'object'
                ? (typeof transport.result === 'string' ? transport.result : transport.error)
                : null;
            if (typeof encoded !== 'string') {
                return JSON.parse(agentActions.failure((function () {
                    var error = new Error('agent action returned an invalid transport');
                    error.agentCode = 'AGENT_TRANSPORT_INVALID';
                    return error;
                })()));
            }
            try {
                return JSON.parse(encoded);
            } catch (error) {
                return JSON.parse(agentActions.failure((function () {
                    var parseError = new Error('agent action result could not be parsed');
                    parseError.agentCode = 'RESULT_PARSE_FAILED';
                    return parseError;
                })()));
            }
        };
    }

    // ---------- 工具注册表（name / effects / inputSchema） ----------

    function stringSchema(description) {
        return { type: 'string', description: description };
    }

    function stringEnumSchema(values, description) {
        return { type: 'string', enum: values.slice(), description: description };
    }

    function integerSchema(description) {
        return { type: 'integer', description: description };
    }

    function actionSchema(value) {
        return stringEnumSchema([value], 'Required SiYuan Agent action classification');
    }

    function agentToolConfigs() {
        var kinds = __am_assets.FORMAL_ASSET_KINDS;
        var cycles = __am_assets.FORMAL_BILLING_CYCLES;
        return {
            asset_query: {
                effects: { localRead: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('query'),
                        op: stringEnumSchema(['count', 'search', 'detail', 'summary', 'tags'], 'Query operation'),
                        locale: stringEnumSchema(['zh_CN', 'zh-CN', 'en_US', 'en-US'], 'Display locale (default zh_CN)'),
                        assetId: stringSchema('Exact lowercase asset UUID (detail only)'),
                        search: stringSchema('Name substring filter'),
                        status: stringEnumSchema(['wishlist', 'active', 'retired'], 'Status filter'),
                        kind: stringEnumSchema(kinds, 'Asset kind filter'),
                        categoryId: stringSchema('Category filter: digital/appliance/home/otherPhysical (physical), member/software/service/domain/ai/otherVirtual (virtual), prepaidAmount/prepaidCount (prepaid)'),
                        currency: stringSchema('ISO 4217 currency filter'),
                        tag: stringSchema('Tag label filter'),
                        tagId: stringSchema('Tag UUID filter'),
                        offset: { type: 'integer', description: 'Search page offset' },
                        pageSize: { type: 'integer', description: 'Search page size (default 50, max 200)' },
                        includeNotes: { type: 'boolean', description: 'Include redacted notes in detail' },
                    },
                    required: ['action', 'op'],
                },
            },
            asset_create: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('create'),
                        data: { type: 'object', description: 'formal-v2 asset object; price fields are forbidden here. Owned assets accept name, kind, status, currency, categoryId (kind-matched fixed id), tagIds (existing tag UUIDs, max 3), notes, details (by kind: physical warrantyEndsOn/costGoal; virtualSubscription planName/accountLabel/billingPlan.cycle/autoRenew; virtualPerpetual licenseAccountLabel; prepaid provider/expiresOn), acquiredOn (YYYY-MM-DD start date anchoring the first subscription period; defaults to today). Wishlist items use status=wishlist with wishlist{expectedAmountMinor, reason, targetGroup, heartbeatTarget} only' },
                        purchaseAmountMinor: integerSchema('Optional purchase price in minor units; CNY 99.00 is 9900'),
                        prepaidInitialAmountMinor: integerSchema('Optional prepaid-amount opening balance in minor units'),
                        prepaidOpeningCount: integerSchema('Optional prepaid-count opening count'),
                        subscriptionPeriodEnd: stringSchema('Optional first subscription period end date, YYYY-MM-DD; the first period starts at data.acquiredOn (defaults to today) and must not end before it'),
                    },
                    required: ['action', 'data'],
                },
            },
            asset_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        patch: { type: 'object', description: 'Limited patch: name, acquiredOn for owned non-subscriptions, categoryId or exact category label, tagIds of existing tags, notes, restricted kind details (physical warrantyEndsOn/costGoal; virtualSubscription planName/billingPlan.cycle; prepaid provider/expiresOn; virtualPerpetual none); use tag tools for labels' },
                    },
                    required: ['action', 'assetId', 'patch'],
                },
            },
            asset_lifecycle: {
                actionEffects: {
                    setStatus: { localWrite: true },
                    retire: { localWrite: true },
                    sale: { localWrite: true },
                    renewSubscription: { localWrite: true },
                    toggleAutoRenew: { localWrite: true },
                    updateStartDate: { localWrite: true },
                    updatePeriodEnd: { localWrite: true },
                },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        op: stringEnumSchema(['setStatus', 'retire', 'sale', 'renewSubscription', 'toggleAutoRenew', 'updateStartDate', 'updatePeriodEnd'], 'Lifecycle operation'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        status: stringEnumSchema(['active', 'retired'], 'Target status (setStatus)'),
                        retiredDate: stringSchema('YYYY-MM-DD (retire)'),
                        soldOn: stringSchema('YYYY-MM-DD (sale)'),
                        priceMinor: { type: 'integer', description: 'Positive safe-integer minor units (sale)' },
                        startDate: stringSchema('YYYY-MM-DD (renewSubscription; required by updateStartDate)'),
                        endDate: stringSchema('YYYY-MM-DD (renewSubscription / updateStartDate optional re-anchor / updatePeriodEnd required)'),
                        amountMinor: { type: 'integer', description: 'Non-negative safe-integer minor units (renewSubscription)' },
                        cycle: stringEnumSchema(cycles, 'Billing cycle (renewSubscription)'),
                        enabled: { type: 'boolean', description: 'Auto-renew flag (toggleAutoRenew)' },
                        note: stringSchema('Optional note (retire / sale)'),
                    },
                    required: ['action', 'op', 'assetId'],
                },
            },
            asset_record: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: stringEnumSchema(['create', 'update'], 'Use update for purchaseAmount/subscriptionPaymentAmount; use create for all other record operations'),
                        op: stringEnumSchema(['purchaseAmount', 'subscriptionPaymentAmount', 'maintenance', 'prepaidTransaction', 'prepaidAdjust', 'prepaidConsumption'], 'Record operation'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        type: stringSchema('maintenance: repair|maintain; prepaidTransaction: amount kind inflow|outflow|adjust|refund, count kind inflow|outflow|adjust'),
                        date: stringSchema('YYYY-MM-DD (maintenance / prepaidTransaction)'),
                        effectiveDate: stringSchema('YYYY-MM-DD (prepaidAdjust / prepaidConsumption)'),
                        amountMinor: { type: 'integer', description: 'purchaseAmount, maintenance, prepaidTransaction: non-negative safe-integer minor units; subscriptionPaymentAmount: positive safe-integer minor units (>0)' },
                        count: { type: 'integer', description: 'Non-negative safe-integer count (prepaidTransaction / prepaidConsumption)' },
                        targetCount: { type: 'integer', description: 'Non-negative safe-integer target count (prepaidAdjust)' },
                        paymentAmountMinor: { type: 'integer', description: 'Optional cash payment for count inflow' },
                        direction: stringEnumSchema(['inflow', 'outflow'], 'Required when type is adjust'),
                        note: stringSchema('Optional note'),
                    },
                    required: ['action', 'op', 'assetId'],
                },
            },
            asset_price_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        amountMinor: integerSchema('New price in minor units; CNY 20.00 is 2000'),
                    },
                    required: ['action', 'assetId', 'amountMinor'],
                },
            },
            asset_delete: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('delete'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                    },
                    required: ['action', 'assetId'],
                },
            },
            asset_tag_update: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('update'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        labels: { type: 'array', items: stringSchema('Exact tag label') },
                        mode: stringEnumSchema(['add', 'remove', 'replace'], 'Tag binding mode; replace only runs when explicitly supplied'),
                    },
                    required: ['action', 'assetId', 'labels'],
                },
            },
            asset_tag_create: {
                effects: { localWrite: true },
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: actionSchema('create'),
                        assetId: stringSchema('Exact lowercase asset UUID'),
                        labels: { type: 'array', items: stringSchema('Tag label to create or reuse') },
                        mode: stringEnumSchema(['add', 'replace'], 'Tag binding mode; replace only runs when explicitly supplied'),
                    },
                    required: ['action', 'assetId', 'labels'],
                },
            },
        };
    }

    function agentToolTitle(name) {
        return 'Asset Management: ' + name;
    }

    function requireKernelRuntime() {
        if (typeof siyuan === 'undefined' || !siyuan || !siyuan.plugin || !siyuan.plugin.lifecycle) {
            throw new Error('siyuan.plugin.lifecycle is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
        if (!siyuan.storage || typeof siyuan.storage.get !== 'function' || typeof siyuan.storage.put !== 'function') {
            throw new Error('siyuan.storage is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
        var hasMcp = siyuan.mcp && typeof siyuan.mcp.registerTool === 'function' && typeof siyuan.mcp.unregisterTool === 'function';
        var hasAgent = siyuan.agent && typeof siyuan.agent.registerCapability === 'function' && typeof siyuan.agent.unregisterCapability === 'function';
        if (!hasMcp && !hasAgent) {
            throw new Error('siyuan.mcp.registerTool / siyuan.agent.registerCapability is unavailable; SiYuan 3.8.0+ kernel plugin runtime is required');
        }
    }

    function registrationRuntime() {
        if (siyuan.mcp && typeof siyuan.mcp.registerTool === 'function' && typeof siyuan.mcp.unregisterTool === 'function') {
            return {
                api: 'registerTool',
                register: function (name, config, handler) { return siyuan.mcp.registerTool(name, config, handler); },
                unregister: function (name) { return siyuan.mcp.unregisterTool(name); },
                requireAction: true,
            };
        }
        return {
            api: 'registerCapability',
            register: function (name, config, handler) { return siyuan.agent.registerCapability(name, config, handler); },
            unregister: function (name) { return siyuan.agent.unregisterCapability(name); },
            requireAction: false,
        };
    }

    function runtimeForApi(api) {
        if (api === 'registerTool' && siyuan.mcp
            && typeof siyuan.mcp.unregisterTool === 'function') {
            return {
                api: 'registerTool',
                unregister: function (name) { return siyuan.mcp.unregisterTool(name); },
            };
        }
        if (api === 'registerCapability' && siyuan.agent
            && typeof siyuan.agent.unregisterCapability === 'function') {
            return {
                api: 'registerCapability',
                unregister: function (name) { return siyuan.agent.unregisterCapability(name); },
            };
        }
        return null;
    }

    function registrationFailureMessage(error) {
        var message = text(error && (error.message || error.msg));
        if (!message || /(?:[A-Za-z]:[\\/]|(?:^|[\s(])[\\/][^\s)]*)/.test(message)) {
            return 'agent tool registration failed';
        }
        return message;
    }

    async function rollbackAgentTools(runtime, cause) {
        var names = Array.from(state.registeredTools).reverse();
        for (var index = 0; index < names.length; index++) {
            try {
                if (runtime) await runtime.unregister(names[index]);
            } catch (error) { /* 回滚继续清理其余工具 */ }
        }
        state.registeredTools.clear();
        var api = state.registrationApi || (runtime && runtime.api) || 'unknown';
        state.registrationApi = null;
        try {
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: api,
                failedAt: new Date().toISOString(),
                tools: [],
                error: { code: 'REGISTRATION_FAILED', message: registrationFailureMessage(cause) },
            });
        } catch (error) { /* 失败心跳写失败不应阻止上层重试 */ }
    }

    async function registerAgentTools() {
        requireKernelRuntime();
        var handlers = ensureAgentHandlers();
        var configs = agentToolConfigs();
        var names = agentActions.AGENT_ACTION_NAMES.slice();
        var runtime = registrationRuntime();
        state.registrationApi = runtime.api;
        try {
            for (var index = 0; index < names.length; index++) {
                var name = names[index];
                var config = configs[name];
                var description = agentActions.AGENT_ACTION_DESCRIPTIONS && agentActions.AGENT_ACTION_DESCRIPTIONS[name];
                if (!config || typeof description !== 'string' || !description || typeof handlers[name] !== 'function') {
                    throw new Error('agent tool definition is incomplete: ' + name);
                }
                var capability = {
                    title: agentToolTitle(name),
                    description: description,
                    inputSchema: config.inputSchema,
                };
                if (runtime.api === 'registerCapability') {
                    if (config.actionEffects) capability.actionEffects = config.actionEffects;
                    else capability.effects = config.effects;
                }
                state.registeredTools.add(name);
                await runtime.register(name, capability, createRegisteredHandler(name, handlers, runtime.requireAction));
            }
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: runtime.api,
                registeredAt: new Date().toISOString(),
                tools: names,
            });
        } catch (error) {
            await rollbackAgentTools(runtimeForApi(runtime.api) || runtime, error);
            throw error;
        }
    }

    async function unregisterAgentTools() {
        var runtime = runtimeForApi(state.registrationApi);
        if (!runtime) {
            try { runtime = registrationRuntime(); } catch (error) { runtime = null; }
        }
        var names = Array.from(state.registeredTools);
        for (var index = 0; index < names.length; index++) {
            try {
                if (runtime) await runtime.unregister(names[index]);
            } catch (error) { /* 卸载阶段尽力而为 */ }
        }
        state.registeredTools.clear();
        try {
            await writeJson(KERNEL_STATUS_FILE, {
                schemaVersion: 1,
                api: state.registrationApi || (runtime && runtime.api) || 'unknown',
                unloadedAt: new Date().toISOString(),
                tools: [],
            });
        } catch (error) { /* 心跳写失败不影响卸载 */ }
        state.registrationApi = null;
    }

    // ---------- 生命周期 ----------

    siyuan.plugin.lifecycle.onload = async function () {
        if (state.registrationPromise) return state.registrationPromise;
        if (state.registeredTools.size > 0) return; // 已注册完成：重复 onload 防重
        var attempt = registerAgentTools();
        state.registrationPromise = attempt;
        try {
            await attempt;
        } finally {
            if (state.registrationPromise === attempt) state.registrationPromise = null;
        }
    };

    siyuan.plugin.lifecycle.onrunning = function () {};

    siyuan.plugin.lifecycle.onunload = async function () {
        await unregisterAgentTools();
    };
})();
