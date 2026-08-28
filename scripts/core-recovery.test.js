'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createFormalV2AssetWrapper } = require('../api/assets');

const clone = value => value == null ? value : structuredClone(value);
function loadPlugin() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = (request, parent, isMain) => request === 'siyuan' ? {
        Plugin: class { constructor(options) { Object.assign(this, options || {}); } addIcons() {} addTopBar() {} addCommand() {} addDock() {} }, Dialog: class {}, Menu: class {},
    } : original.call(Module, request, parent, isMain);
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = original; }
}
function formalState() {
    const now = '2026-07-20T00:00:00.000Z';
    return {
        'assets.json': createFormalV2AssetWrapper([], { updatedAt: now }), 'tags.json': { schemaVersion: 1, tags: [], updatedAt: now },
        'maintenance.json': { schemaVersion: 1, records: [], updatedAt: now }, 'usage.json': { schemaVersion: 1, records: [], updatedAt: now },
        'prepaidTransactions.json': { schemaVersion: 1, records: [], updatedAt: now }, 'wishlistEvents.json': { schemaVersion: 1, events: [], updatedAt: now },
        'operationLogs.json': { schemaVersion: 1, logs: [], updatedAt: now }, 'financialEvents.json': { schemaVersion: 1, events: [], updatedAt: now },
        'lifecycleEvents.json': { schemaVersion: 1, events: [], updatedAt: now }, 'subscriptionPeriods.json': { schemaVersion: 1, records: [], updatedAt: now },
        'exchangeRates.json': { schemaVersion: 1, baseCurrency: 'CNY', rates: {}, updatedAt: now },
    };
}
async function main() {
    const Plugin = loadPlugin(); const state = formalState(); let fail = true;
    const plugin = new Plugin({
        async loadData(name) { if (name === 'assets.json' && fail) throw new Error('injected formal read failure'); return clone(state[name]); },
        async saveData(name, payload) { state[name] = clone(payload); return true; },
    });
    plugin.storage = require('../api/storage').createStorage(plugin); plugin.showToast = () => {}; plugin.renderDock = () => {};
    await plugin.loadAssets();
    assert.equal(plugin._formalDomainLoaded, false); assert.equal(plugin._assetsLoadedOk, false);
    await assert.rejects(() => plugin.addAsset({ name: 'blocked' }), error => error.code === 'ASSET_MUTATION_BLOCKED');
    fail = false; await plugin._retryFormalDashboard();
    assert.equal(plugin._formalDomainLoaded, true); assert.equal(plugin._assetsLoadedOk, true);
    assert.deepEqual(plugin.assets, [], 'retry recovers the complete strict formal snapshot');
    console.log('[core-recovery] passed');
}
main().catch(error => { console.error('[core-recovery] failed:', error); process.exitCode = 1; });
