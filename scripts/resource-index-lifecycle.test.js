'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class Plugin { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = originalLoad;
        if (navigatorDescriptor) Object.defineProperty(global, 'navigator', navigatorDescriptor);
        else delete global.navigator;
    }
}

function resourceIndexState() {
    return {
        notebookId: '20260713000000-aaaaaaa', documentId: '20260713000000-bbbbbbb', documentTitle: 'Assets',
        managedBlockId: null, status: 'idle', updatedAt: null, lastError: null,
    };
}

function response(data) { return { ok: true, json: async () => ({ code: 0, data }) }; }

async function testConcurrentReconcileSkipsEmptyFormalDomain() {
    const Plugin = loadPluginClass();
    const plugin = new Plugin({});
    const previousFetch = global.fetch;
    const calls = [];
    let releaseInitialSave;
    let saveCalls = 0;
    plugin.settings = { resourceIndex: resourceIndexState() };
    plugin.assets = [];
    plugin.saveSettings = () => {
        saveCalls++;
        if (saveCalls === 1) return new Promise(resolve => { releaseInitialSave = resolve; });
        return Promise.resolve();
    };
    global.fetch = async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        if (url === '/api/filetree/listDocTree') return response({ tree: [{ id: plugin.settings.resourceIndex.documentId }] });
        if (url === '/api/block/appendBlock') return response([{ doOperations: [{ id: '20260713000000-ccccccc' }] }]);
        throw new Error('unexpected API ' + url);
    };
    try {
        const first = plugin.reconcileResourceIndex();
        const second = plugin.reconcileResourceIndex();
        assert.strictEqual(first, second);
        releaseInitialSave();
        await first;
        assert.equal(calls.filter(call => call.url === '/api/block/appendBlock').length, 0,
            'an empty formal domain does not create a managed resource block');
        assert.equal(saveCalls, 2);
        assert.equal(plugin._resourceIndexReconcilePromise, null);
    } finally { global.fetch = previousFetch; }
}

async function testUnloadCancelsScheduledReconcile() {
    const Plugin = loadPluginClass();
    const plugin = new Plugin({});
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'document', { configurable: true, value: { removeEventListener() {}, querySelectorAll() { return []; } } });
    let reconcileCalls = 0;
    plugin.reconcileResourceIndex = () => { reconcileCalls++; return Promise.resolve(); };
    try {
        plugin.scheduleResourceIndexReconcile();
        plugin.onunload();
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(reconcileCalls, 0);
    } finally {
        if (documentDescriptor) Object.defineProperty(global, 'document', documentDescriptor);
        else delete global.document;
    }
}

Promise.resolve()
    .then(testConcurrentReconcileSkipsEmptyFormalDomain)
    .then(testUnloadCancelsScheduledReconcile)
    .then(() => console.log('resource index lifecycle: ok'))
    .catch(error => { console.error(error); process.exitCode = 1; });
