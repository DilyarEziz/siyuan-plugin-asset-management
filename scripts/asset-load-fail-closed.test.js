'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createStorage, STORAGE_FILES } = require('../api/storage');

function clone(value) { return structuredClone(value); }

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

function makePlugin(PluginClass, state) {
    const writes = [];
    const toasts = [];
    const plugin = new PluginClass({
        async loadData(name) { return Object.hasOwn(state, name) ? clone(state[name]) : null; },
        async saveData(name, payload) { writes.push(name); state[name] = clone(payload); return true; },
        async removeData(name) { delete state[name]; return true; },
    });
    plugin.storage = createStorage(plugin);
    plugin.showToast = message => toasts.push(message);
    plugin._runGuardedUiEffects = () => {};
    return { plugin, writes, toasts };
}

async function main() {
    const PluginClass = loadPluginClass();
    const cold = makePlugin(PluginClass, {});
    cold.plugin._assetsLoadedOk = false;
    cold.plugin._assetLoadError = null;
    cold.plugin._formalDomainLoaded = false;
    ['_financialEvents', '_subscriptionPeriods', '_prepaidTransactions', '_maintenanceRecords', '_usageRecords', '_lifecycleEvents', 'wishlistEvents', '_opLogs']
        .forEach(key => { cold.plugin[key] = undefined; });
    const pending = cold.plugin.renderMainPanel();
    assert.match(pending, /data-asset-load-pending="true"/,
        'cold dock render must not read a partial formal-domain snapshot');

    const legacy = makePlugin(PluginClass, {
        [STORAGE_FILES.assets]: {
            schemaVersion: 10,
            assets: [{ id: 'legacy-load', name: 'Legacy', tags: ['old-label'] }],
        },
        [STORAGE_FILES.tags]: { schemaVersion: 1, tags: [] },
    });
    await legacy.plugin.loadAssets();
    assert.equal(legacy.plugin._assetsLoadedOk, false);
    assert.equal(legacy.plugin._assetLoadError.code, 'FORMAL_SCHEMA_RESET_REQUIRED');
    assert.deepEqual(legacy.plugin.assets, [], 'empty assets is only an in-memory placeholder');
    const blocked = legacy.plugin.renderMainPanel();
    assert.match(blocked, /data-asset-load-blocked="FORMAL_SCHEMA_RESET_REQUIRED"/);
    assert.match(blocked, /检测到不兼容的开发期数据/);
    assert.match(blocked, /设置与重置入口仍可使用/);
    assert.doesNotMatch(blocked, /还没有资产|emptyAssets/);
    await assert.rejects(
        () => legacy.plugin.addAsset({ id: 'must-not-write', name: 'Blocked' }),
        error => error && error.code === 'ASSET_MUTATION_BLOCKED'
            && error.assetLoadError.code === 'FORMAL_SCHEMA_RESET_REQUIRED'
    );
    assert.equal(legacy.writes.length, 0, 'blocked mutation never reaches persistence');
    assert.ok(legacy.toasts.some(message => message.includes('资产操作已阻断')));

    const empty = makePlugin(PluginClass, {
        [STORAGE_FILES.assets]: { schemaGeneration: 'formal-v2', schemaVersion: 1, assets: [], updatedAt: '2026-07-19T08:00:00.000Z' },
        [STORAGE_FILES.tags]: { schemaVersion: 1, tags: [] },
    });
    let settledEffects;
    empty.plugin._runGuardedUiEffects = effects => { settledEffects = effects; };
    await empty.plugin.loadAssets();
    assert.equal(empty.plugin._assetsLoadedOk, true);
    assert.equal(empty.plugin._assetLoadError, null);
    assert.deepEqual(empty.plugin.assets, []);
    assert.deepEqual(settledEffects, { refreshMainContent: true },
        'a settled formal domain refreshes both a restored dock and a dialog opened while loading');
    const normal = empty.plugin.renderMainPanel();
    assert.doesNotMatch(normal, /data-asset-load-blocked/);
    assert.match(normal, /class="am-empty"[\s\S]*emptyAssets/);
    console.log('[asset-load-fail-closed] passed');
}

main().catch(error => { console.error('[asset-load-fail-closed] failed:', error); process.exit(1); });


