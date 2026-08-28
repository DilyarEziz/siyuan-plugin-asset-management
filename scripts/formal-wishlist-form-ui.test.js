'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { parseHTML } = require('linkedom');
const { newFormalV2Asset, FORMAL_ASSET_KIND } = require('../api/assets');

function loadPlugin() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = (request, parent, isMain) => request === 'siyuan'
        ? { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} }
        : original.call(Module, request, parent, isMain);
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = original; }
}

function dom() {
    const parsed = parseHTML('<!doctype html><html><body></body></html>');
    const host = parsed.document.body; let mask;
    const append = host.appendChild.bind(host); host.appendChild = node => { mask = node; return append(node); };
    return { document: parsed.document, host, get mask() { return mask; } };
}

(async () => {
    const Plugin = loadPlugin(); const original = global.document; const page = dom(); global.document = page.document;
    const plugin = new Plugin({}); plugin.showToast = () => {}; plugin._runGuardedUiEffects = () => {};
    let added; plugin.addAsset = async dto => { added = dto; return dto; };
    plugin.openWishlistFormalSheet();
    const document = parseHTML(page.mask.innerHTML).document;
    const form = document.querySelector('[data-wishlist-form]');
    assert.deepEqual(Array.from(form.querySelectorAll('input, select')).map(item => item.name).sort(), ['expectedAmount', 'heartbeatTarget', 'name']);
    assert.ok(form.querySelector('select[name="targetGroup"]') === null, 'wishlist form no longer exposes a target-group select');
    assert.deepEqual(Array.from(form.querySelectorAll('[data-wishlist-target]')).map(item => item.getAttribute('data-wishlist-target')).sort(), ['physical', 'prepaid', 'virtual'], 'wishlist form exposes three target-group pills');
    assert.ok(form.querySelector('[data-formal-cover-toggle]'), 'wishlist form exposes the shared cover picker toggle');
    assert.ok(form.querySelector('[name="status"]') === null); assert.ok(form.querySelector('[name="notes"]') === null);
    const virtualWish = newFormalV2Asset({ id: 'd1000000-0000-4000-8000-000000000001', kind: FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION, name: 'Virtual wish', status: 'wishlist', currency: 'CNY', wishlist: { expectedAmountMinor: 100, reason: '' } });
    let selectedKind; plugin.openFormalAssetSheet = (kind, options) => { selectedKind = { kind, options }; };
    plugin.openWishlistPurchaseKindSheet(virtualWish);
    const picker = parseHTML(page.mask.innerHTML).document;
    assert.ok(picker.querySelector('[data-purchase-kind="virtualSubscription"]'));
    assert.ok(picker.querySelector('[data-purchase-kind="virtualPerpetual"]'));
    assert.ok(picker.querySelector('[data-purchase-kind="prepaidAmount"]') === null);
    global.document = original;
    console.log('[formal-wishlist-form-ui] passed');
})().catch(error => { console.error('[formal-wishlist-form-ui] failed:', error); process.exit(1); });
