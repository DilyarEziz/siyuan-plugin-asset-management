'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { createStorage, STORAGE_FILES } = require('../api/storage');
const { FORMAL_ASSET_KIND, newFormalV2Asset } = require('../api/assets');

const FROZEN_FILES = new Set([
    STORAGE_FILES.financialEvents,
    STORAGE_FILES.lifecycleEvents,
    STORAGE_FILES.subscriptionPeriods,
    STORAGE_FILES.wishlistEvents,
    STORAGE_FILES.operationLogs,
]);

function clone(value) {
    return structuredClone(value);
}

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') {
            return { Plugin: class Plugin { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve('../index.js')];
        return require('../index.js');
    } finally {
        Module._load = originalLoad;
        if (navigatorDescriptor) Object.defineProperty(global, 'navigator', navigatorDescriptor);
        else delete global.navigator;
    }
}

function assertSimplifiedWishlistCardMarkup() {
    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    const start = template.indexOf('    _renderWishlistPoolAssetItem(a) {');
    const end = template.indexOf('    /**', start);
    assert.ok(start >= 0 && end > start, 'wishlist card renderer boundaries must exist');
    const card = template.slice(start, end);

    assert.match(card, /data-action="wishlist-buy"/, 'wishlist card must expose the formal purchase route');
    assert.match(card, /data-wishlist-abandon-id/, 'wishlist card must expose the local abandon-sheet closure');
    assert.doesNotMatch(card, /data-action="wishlist-(?:edit|delete)"/,
        'the pool stays limited to the two prepared terminal actions');
}

async function testWishlistPurchaseUsesFormalRoute() {
    const AssetPlugin = loadPluginClass();
    const wishlist = newFormalV2Asset({
        id: 'a1000000-0000-4000-8000-000000000001', name: 'Subscription wishlist',
        kind: FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION,
        status: 'wishlist', currency: 'CNY', cover: { kind: 'none' },
        wishlist: { expectedAmountMinor: 1800, reason: '', targetGroup: 'virtual' },
    });
    const state = { [STORAGE_FILES.assets]: { schemaGeneration: 'formal-v2', schemaVersion: 1, assets: [wishlist], updatedAt: wishlist.updatedAt } };
    const reads = [];
    const writes = [];
    const plugin = new AssetPlugin({
        async loadData(name) {
            reads.push(name);
            if (FROZEN_FILES.has(name)) throw new Error('frozen ledger read: ' + name);
            return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : null;
        },
        async saveData(name, payload) {
            writes.push(name);
            if (FROZEN_FILES.has(name)) throw new Error('frozen ledger write: ' + name);
            state[name] = clone(payload);
            return true;
        },
    });
    plugin.storage = createStorage(plugin);
    plugin.assets = [wishlist];
    plugin._assetsLoadedOk = true;
    plugin.scheduleResourceIndexReconcile = () => {};
    plugin.renderDock = () => {};
    plugin.refreshModal = () => {};
    plugin.showToast = () => {};
    plugin.openFormalAssetSheet = (kind, opts) => { plugin._purchaseRoute = [kind, opts]; };

    const poolHtml = plugin.renderWishlistPoolPage();
    assert.match(poolHtml, /wishlist-abandon-id/, 'wishlist pool must render the local abandon-sheet route');
    assert.match(poolHtml, /wishlist-buy/, 'wishlist pool must render the purchase route');
    assert.doesNotMatch(poolHtml, /data-action="wishlist-(?:edit|delete)"/, 'wishlist pool must not add edit/delete routes');

    await plugin.purchaseWishlistAsset(wishlist.id);
    assert.equal(plugin._purchaseRoute[0], FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION);
    assert.equal(plugin._purchaseRoute[1].wishlistSource.id, wishlist.id);
    assert.equal(plugin._purchaseRoute[1].lockedKind, true);
    assert.deepEqual(reads, []);
    assert.deepEqual(writes, []);
}

Promise.resolve()
    .then(assertSimplifiedWishlistCardMarkup)
    .then(testWishlistPurchaseUsesFormalRoute)
    .then(() => console.log('reviewer stage4 wishlist purchase route: ok'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
