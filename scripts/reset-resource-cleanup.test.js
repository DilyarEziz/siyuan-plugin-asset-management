'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const indexApi = require('../api/resource-index');

const DOCUMENT_ID = '20260719000000-ccccccc';
const BLOCK_ID = '20260719000000-ddddddd';

function response(data) { return { ok: true, async json() { return { code: 0, data }; } }; }
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

async function deletionFailureReloadRetrySuccess(PluginClass) {
    let durable = { resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: DOCUMENT_ID, targetVerified: true,
        documentTitle: 'Target', managedBlockId: null, pendingCleanupBlockId: BLOCK_ID, status: 'idle' } };
    let deleteAttempts = 0;
    const previousFetch = global.fetch;
    global.fetch = async (path) => {
        if (path === '/api/block/getBlockInfo') return response({ rootID: DOCUMENT_ID });
        if (path === '/api/block/getBlockKramdown') return response({ kramdown: indexApi.resourceIndexMarker(DOCUMENT_ID) });
        if (path === '/api/block/deleteBlock') {
            deleteAttempts++;
            if (deleteAttempts === 1) throw new Error('offline');
            return response(null);
        }
        throw new Error('unexpected API ' + path);
    };
    try {
        const makePlugin = () => {
            const plugin = new PluginClass({});
            plugin.storage = {
                async readSettings() { return structuredClone(durable); },
                async mutateFormalSettings(patchFn) {
                    durable = Object.assign({}, durable, structuredClone(await patchFn(structuredClone(durable))));
                    return structuredClone(durable);
                },
            };
            plugin._onDataCommitted = () => {};
            return plugin;
        };
        const first = makePlugin();
        await first.loadSettings();
        assert.equal(durable.resourceIndex.pendingCleanupBlockId, BLOCK_ID, 'failed delete remains durable');
        assert.equal(durable.resourceIndex.status, 'error');
        const reloaded = makePlugin();
        await reloaded.loadSettings();
        assert.equal(deleteAttempts, 2, 'settings load retries pending cleanup');
        assert.equal(durable.resourceIndex.pendingCleanupBlockId, null, 'only successful delete clears pending cleanup');
    } finally { global.fetch = previousFetch; }
}

async function nonMarkerNeverDeletes() {
    let deletes = 0;
    const state = { documentId: DOCUMENT_ID, pendingCleanupBlockId: BLOCK_ID };
    const fetch = async path => {
        if (path === '/api/block/getBlockInfo') return response({ rootID: DOCUMENT_ID });
        if (path === '/api/block/getBlockKramdown') return response({ kramdown: 'ordinary user content' });
        if (path === '/api/block/deleteBlock') { deletes++; return response(null); }
        throw new Error('unexpected API ' + path);
    };
    await assert.rejects(() => indexApi.clearPendingCleanupBlock(state, { fetch }), error => error.code === 'RESOURCE_INDEX_BLOCK_NOT_MANAGED');
    assert.equal(deletes, 0);
    assert.equal(indexApi.normalizeResourceIndex(state).pendingCleanupBlockId, BLOCK_ID);
}

async function verificationStates() {
    const state = { documentId: DOCUMENT_ID, pendingCleanupBlockId: BLOCK_ID };
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => ({ ok: false, status: 404 }) }), 'missing');
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => response(null) }), 'missing');
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => { throw new Error('offline'); } }), 'unknown');
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => ({ ok: false, status: 500 }) }), 'unknown');
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => ({ ok: true, async json() { throw new Error('invalid json'); } }) }), 'unknown');
    assert.equal(await indexApi.verifyManagedBlock(BLOCK_ID, DOCUMENT_ID, { fetch: async () => ({ ok: true, async json() { return { code: -1, msg: 'block not found' }; } }) }), 'missing');
    await assert.rejects(() => indexApi.clearPendingCleanupBlock(state, {
        fetch: async () => { throw new Error('offline'); },
    }), error => error.code === 'RESOURCE_INDEX_BLOCK_VERIFICATION_UNKNOWN');
    const missing = await indexApi.clearPendingCleanupBlock(state, { fetch: async () => ({ ok: false, status: 404 }) });
    assert.equal(missing.pendingCleanupBlockId, null);
}

async function deleteSuccessSettingsFailureReloadMissing(PluginClass) {
    let durable = { resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: DOCUMENT_ID, targetVerified: true,
        documentTitle: 'Target', managedBlockId: null, pendingCleanupBlockId: BLOCK_ID, status: 'idle' } };
    let deletes = 0, settingsWrites = 0, blockExists = true;
    const previousFetch = global.fetch;
    global.fetch = async path => {
        if (path === '/api/block/getBlockInfo') return blockExists ? response({ rootID: DOCUMENT_ID }) : response(null);
        if (path === '/api/block/getBlockKramdown') return response({ kramdown: indexApi.resourceIndexMarker(DOCUMENT_ID) });
        if (path === '/api/block/deleteBlock') { deletes++; blockExists = false; return response(null); }
        throw new Error('unexpected API ' + path);
    };
    const makePlugin = failWrites => {
        const plugin = new PluginClass({});
        plugin.storage = {
            async readSettings() { return structuredClone(durable); },
            async mutateFormalSettings(patchFn) {
                settingsWrites++;
                if (failWrites) throw new Error('settings write failed');
                durable = Object.assign({}, durable, structuredClone(await patchFn(structuredClone(durable))));
                return structuredClone(durable);
            },
        };
        plugin._onDataCommitted = () => {};
        return plugin;
    };
    try {
        await makePlugin(true).loadSettings();
        assert.equal(deletes, 1);
        assert.equal(durable.resourceIndex.pendingCleanupBlockId, BLOCK_ID, 'failed settings commit leaves durable pending intact');
        await makePlugin(false).loadSettings();
        assert.equal(deletes, 1, 'reload observes missing block and does not delete twice');
        assert.equal(durable.resourceIndex.pendingCleanupBlockId, null);
        assert.ok(settingsWrites >= 2);
    } finally { global.fetch = previousFetch; }
}

(async () => {
    await deletionFailureReloadRetrySuccess(loadPluginClass());
    await deleteSuccessSettingsFailureReloadMissing(loadPluginClass());
    await nonMarkerNeverDeletes();
    await verificationStates();
    console.log('[reset-resource-cleanup] passed');
})().catch(error => { console.error('[reset-resource-cleanup] failed:', error); process.exit(1); });
