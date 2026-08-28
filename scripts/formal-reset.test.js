'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { createStorage, STORAGE_FILES, FORMAL_SIDECAR_DEFINITIONS } = require('../api/storage');

const root = path.resolve(__dirname, '..');
const clone = value => value == null ? value : structuredClone(value);

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {}, body: {} }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = originalLoad;
        if (navigatorDescriptor) Object.defineProperty(global, 'navigator', navigatorDescriptor); else delete global.navigator;
        if (documentDescriptor) Object.defineProperty(global, 'document', documentDescriptor); else delete global.document;
    }
}

function oldState() {
    const state = {
        [STORAGE_FILES.assets]: { schemaVersion: 10, assets: [{ id: 'old', assetType: 'physical', name: 'Old' }] },
        [STORAGE_FILES.tags]: { schemaVersion: 9, tags: [{ id: 'old-tag' }] },
        [STORAGE_FILES.settings]: {
            schemaVersion: 1, defaultSort: 'newest', defaultViewMode: 'matrix', viewMode: 'matrix', preferredCurrency: 'USD',
            filters: { stale: true }, runtime: { stale: true }, markdownExportTarget: { documentId: '20260719000000-aaaaaaa' },
            resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: '20260719000000-ccccccc', documentTitle: 'Keep target', targetVerified: true, managedBlockId: '20260719000000-ddddddd', status: 'error', lastError: 'old' },
        },
    };
    for (const [key, definition] of Object.entries(FORMAL_SIDECAR_DEFINITIONS)) {
        state[definition.file] = definition.objectPayload
            ? { schemaVersion: 99, rates: { USD: 1 } }
            : { schemaVersion: 99, [definition.recordKey]: [{ id: key + '-old' }] };
    }
    return state;
}

function adapter(state, options) {
    const writes = [], removes = [];
    let writeCount = 0;
    const storage = createStorage({
        async loadData(name) { return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : null; },
        async saveData(name, payload) {
            writes.push(name); writeCount++;
            if (options && options.failAt === writeCount) return false;
            state[name] = clone(payload); return true;
        },
        async removeData(name) { removes.push(name); delete state[name]; return true; },
    });
    return { storage, writes, removes };
}

async function storageContract() {
    const state = oldState();
    const beforeSettings = clone(state[STORAGE_FILES.settings]);
    const { storage, writes } = adapter(state);
    await assert.rejects(() => storage.readFormalAssets(), error => error && error.code === 'FORMAL_SCHEMA_RESET_REQUIRED');
    const result = await storage.initializeFormalStorageReset({ confirmReset: true });
    assert.equal(result.previousAssets.length, 1, 'old-schema assets are returned for post-commit media cleanup');
    assert.equal(result.counts.assets, 1);
    assert.deepEqual(result.committedSnapshot.assets, []);
    assert.deepEqual(result.committedSnapshot.tags, []);
    for (const [key, definition] of Object.entries(FORMAL_SIDECAR_DEFINITIONS)) {
        const payload = state[definition.file];
        assert.equal(payload.schemaVersion, 1, key + ' has a formal wrapper');
        assert.deepEqual(definition.objectPayload ? payload.rates : payload[definition.recordKey], definition.objectPayload ? {} : [], key + ' is empty');
    }
    const settings = state[STORAGE_FILES.settings];
    assert.equal(settings.defaultSort, beforeSettings.defaultSort);
    assert.equal(settings.defaultViewMode, beforeSettings.defaultViewMode);
    assert.equal(settings.resourceIndex.notebookId, beforeSettings.resourceIndex.notebookId);
    assert.equal(settings.resourceIndex.documentId, beforeSettings.resourceIndex.documentId);
    assert.equal(settings.resourceIndex.managedBlockId, null);
    assert.equal(settings.resourceIndex.pendingCleanupBlockId, beforeSettings.resourceIndex.managedBlockId);
    assert.equal(settings.resourceIndex.status, 'idle');
    assert.equal(settings.filters, undefined, 'runtime filters are removed');
    assert.equal(settings.runtime, undefined, 'runtime state is removed');
    assert.equal(writes.some(name => String(name).startsWith('backups/')), false, 'reset never creates backups');
    assert.equal(writes.length, 12, 'all 11 formal domain files and settings are committed exactly once');
}

async function rollbackContract() {
    const state = oldState();
    const before = clone(state);
    const { storage, writes } = adapter(state, { failAt: 4 });
    await assert.rejects(() => storage.initializeFormalStorageReset({ confirmReset: true }), error => {
        assert.equal(error.code, 'FORMAL_PERSISTENCE_TRANSACTION_FAILED');
        assert.equal(error.compensation.rolledBack, true);
        return true;
    });
    assert.deepEqual(state, before, 'failed reset compensates every attempted file');
    assert.equal(writes.some(name => String(name).startsWith('backups/')), false);
}

async function pluginContract(PluginClass) {
    const plugin = new PluginClass({});
    plugin._assetLoadError = { code: 'FORMAL_SCHEMA_RESET_REQUIRED' };
    plugin.assets = [];
    plugin._tags = [];
    plugin.wishlistEvents = [];
    plugin._opLogs = [];
    plugin._maintenanceRecords = [];
    plugin._usageRecords = [];
    plugin._prepaidTransactions = [];
    plugin._financialEvents = [];
    plugin._lifecycleEvents = [];
    plugin._subscriptionPeriods = [];
    plugin.bulkSelected = new Set(['stale']); plugin.bulkMode = true;
    plugin._closeHomeFilterDropdown = () => {}; plugin._closeItemMenu = () => {}; plugin.closeProductCard = () => {};
    plugin._onDataCommitted = () => {}; plugin._runGuardedUiEffects = () => {};
    let resets = 0, release;
    plugin.storage = { initializeFormalStorageReset: async options => {
        resets++; assert.equal(options.confirmReset, true);
        await new Promise(resolve => { release = resolve; });
        return { previousAssets: [], previousResourceIndex: {}, committedSnapshot: { assets: [], tags: [], settings: { defaultSort: 'default' } } };
    } };
    plugin._cleanupFormalResetResources = async () => [];
    const first = plugin.resetAllFormalData();
    const second = plugin.resetAllFormalData();
    assert.equal(resets, 1, 'double-click shares one in-flight reset');
    release();
    await Promise.all([first, second]);
    assert.equal(plugin._assetLoadError, null, 'reset is reachable while old-schema load is blocked');
    assert.equal(plugin.bulkMode, false);
    assert.equal(plugin.bulkSelected.size, 0);

    plugin.storage.initializeFormalStorageReset = async () => ({
        previousAssets: [], previousResourceIndex: {},
        committedSnapshot: { assets: [], tags: [], settings: { defaultSort: 'default' } },
    });
    plugin._cleanupFormalResetResources = async () => [{ type: 'resourceIndex', message: 'injected cleanup failure' }];
    const partial = await plugin.resetAllFormalData();
    assert.equal(partial.partial, true, 'post-commit cleanup failures report a partial reset');
    assert.equal(partial.cleanupFailures.length, 1);
}

function staticContract() {
    const source = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
    // v0.18 阶段 7：「初始化正式数据」UI 触发器已从数据 Tab 移除；
    // reset 底层函数（openFormalResetConfirm/resetAllFormalData）保留作死代码，下方断言仍成立。
    assert.doesNotMatch(source, /data-action="formal-reset-all"/, 'initialize-formal-data UI trigger removed');
    assert.match(source, /readRawFormalResetBackup/);
    assert.match(source, /downloadRawFormalResetBackup/);
    assert.match(source, /backupReady && backupAcknowledgement\.checked/);
    assert.match(source, /data-formal-reset-backup-confirm/);
    assert.match(source, /formalResetUploadsNote/);
    assert.match(source, /initializeFormalStorageReset\(\{ confirmReset: true \}\)/);
    assert.doesNotMatch(source, /data-action="clear-all-assets"|async clearAllAssets\(/, 'there is only one dangerous reset semantic');
    assert.match(source, /retryPendingResourceIndexCleanup/);
    assert.match(source, /media\.isOwnedUploadCover/);
    assert.doesNotMatch(source, /removeData\(|backups\//, 'UI reset does not enumerate storage or backups');
}

(async () => {
    await storageContract();
    await rollbackContract();
    await pluginContract(loadPluginClass());
    staticContract();
    console.log('[formal-reset] passed');
})().catch(error => { console.error('[formal-reset] failed:', error); process.exit(1); });
