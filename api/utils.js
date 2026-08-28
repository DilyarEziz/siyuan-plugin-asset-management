/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — utils.js
 *
 * 通用工具：
 *   - safe / safeAsync — try/catch 错误包装
 *   - toast — 思源 eventBus 通知（与 src.template.js 的 showToast 走 fetch /api/notification 是两套通道）
 *   - formatRelativeTime — "3 天前" / "2 个月后"
 *
 * 注：utils.toast 当前未在 main template 中使用（main template 自带 showToast 走 HTTP API），
 *     保留是为 v0.15+ 抽离的 exporter.js 等独立模块复用。
 */

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

module.exports = {
    safe,
    safeAsync,
    toast,
    formatRelativeTime,
};
