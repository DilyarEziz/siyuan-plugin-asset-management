'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createFormalV2AssetWrapper, newFormalV2Asset, FORMAL_ASSET_KIND } = require('../api/assets');

const clone = value => structuredClone(value);
const now = '2026-07-19T08:00:00.000Z';
const ids = Object.values(FORMAL_ASSET_KIND).map((_, index) => `30000000-0000-4000-8000-00000000000${index + 1}`);
function loadPlugin() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = function(request, parent, isMain) { if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} }; return original.call(this, request, parent, isMain); };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); } finally { Module._load = original; }
}
function details(kind) {
    if (kind === 'physical') return { warrantyEndsOn: null, costGoal: null };
    if (kind === 'virtualSubscription') return { planName: '', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: false };
    if (kind === 'virtualPerpetual') return { licenseAccountLabel: null };
    return { provider: null, expiresOn: null };
}
function wish(kind, index) { const targetGroup = kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical' : (kind.indexOf('virtual') === 0 ? 'virtual' : 'prepaid'); return newFormalV2Asset({ id: ids[index], kind, name: 'Wish ' + index, status: 'wishlist', currency: 'CNY', cover: { kind: 'none' }, createdAt: now, updatedAt: now, wishlist: { expectedAmountMinor: 1234, reason: 'Reason', targetGroup } }); }
function ownedFrom(source, targetId) { return newFormalV2Asset({ id: targetId, kind: source.kind, name: source.name, status: 'active', currency: source.currency, acquiredOn: '2026-07-19', statusChangedOn: '2026-07-19', tagIds: source.tagIds, cover: source.cover, notes: source.notes, createdAt: now, updatedAt: now, details: details(source.kind) }); }

async function main() {
    const wishes = Object.values(FORMAL_ASSET_KIND).map(wish);
    const state = { 'assets.json': createFormalV2AssetWrapper(wishes, { updatedAt: now }), 'tags.json': { schemaVersion: 1, tags: [], updatedAt: now } };
    const Plugin = loadPlugin();
    const plugin = new Plugin({ async loadData(name) { return clone(state[name] == null ? null : state[name]); }, async saveData(name, value) { state[name] = clone(value); return true; } });
    plugin.storage = require('../api/storage').createStorage(plugin);
    plugin.assets = await plugin.storage.readFormalV2Assets();
    plugin._assetsLoadedOk = true;
    plugin.showToast = () => {};
    plugin.scheduleResourceIndexReconcile = () => {};
    plugin._runGuardedUiEffects = () => {};

    for (let index = 0; index < wishes.length; index++) {
        const source = plugin.assets.find(item => item.id === ids[index]);
        const targetId = `40000000-0000-4000-8000-00000000000${index + 1}`;
        const target = await plugin.completeWishlistPurchase(source, ownedFrom(source, targetId), 1200, {
            openingAmountMinor: source.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT ? 1200 : 0,
            openingCount: source.kind === FORMAL_ASSET_KIND.PREPAID_COUNT ? 1 : 0,
            periodStart: source.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION ? '2026-07-19' : null,
        });
        assert.equal(target.kind, source.kind);
        assert.equal(plugin.assets.some(item => item.id === source.id), false);
    }
    assert.equal(state['wishlistEvents.json'].events.filter(event => event.eventType === 'purchased').length, 5);

    const abandon = wish(FORMAL_ASSET_KIND.PHYSICAL, 0);
    abandon.id = '50000000-0000-4000-8000-000000000001';
    await plugin.addAsset(abandon);
    const event = await plugin.abandonWishlistAsset(abandon.id, 'No longer needed');
    assert.equal(event.eventType, 'abandoned');
    assert.equal(plugin.assets.some(item => item.id === abandon.id), false);
    assert.match(plugin._renderWishlistPoolAssetItem(wish(FORMAL_ASSET_KIND.PREPAID_COUNT, 4)), /金额|期望价|Expected/);
    console.log('[five-kind-form-wishlist] passed');
}

main().catch(error => { console.error('[five-kind-form-wishlist] failed:', error); process.exit(1); });


