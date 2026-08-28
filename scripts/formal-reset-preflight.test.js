'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createStorage, STORAGE_FILES } = require('../api/storage');

const clone = value => value == null ? value : structuredClone(value);

function rawState() {
    return {
        [STORAGE_FILES.assets]: { schemaVersion: 3, items: [
            { imageUrl: 'assets/siyuan-plugin-asset-management/a.png' },
            { cover: { kind: 'upload', assetPath: 'assets/siyuan-plugin-asset-management/b.png' } },
            { coverPath: 'assets/siyuan-plugin-asset-management/c.png' },
        ] },
        [STORAGE_FILES.tags]: [{ id: 'a' }, { id: 'b' }],
        [STORAGE_FILES.maintenance]: { schemaVersion: 7, maintenance: [{}, {}, {}] },
        [STORAGE_FILES.usage]: { records: [{}] },
        [STORAGE_FILES.prepaidTransactions]: { transactions: [{}, {}] },
        [STORAGE_FILES.wishlistEvents]: { events: [{}] },
        [STORAGE_FILES.operationLogs]: { logs: [{}, {}] },
        [STORAGE_FILES.financialEvents]: { records: [{}] },
        [STORAGE_FILES.lifecycleEvents]: [{}],
        [STORAGE_FILES.subscriptionPeriods]: { periods: [{}, {}, {}] },
        [STORAGE_FILES.exchangeRates]: { rates: { USD: 1, EUR: 2 } },
        [STORAGE_FILES.settings]: { schemaVersion: 99 },
    };
}

function storageFor(state, failFile, rawReads) {
    const writes = [];
    const storage = createStorage({
        async loadData(name) {
            if (name === failFile) throw new Error('injected read failure');
            return rawReads ? state[name] : clone(state[name]);
        },
        async saveData(name) { writes.push(name); throw new Error('preflight is read-only'); },
    });
    storage._testWriteCalls = writes;
    return storage;
}

class FakeNode {
    constructor() { this.disabled = false; this.parentNode = null; this.attributes = {}; this._innerHTML = ''; this.textContent = ''; }
    set innerHTML(value) {
        this._innerHTML = String(value);
        if (this._innerHTML.includes('data-formal-reset-title')) {
            this.nodes = {
                '[data-formal-reset-title]': new FakeNode(), '[data-formal-reset-text]': new FakeNode(),
                '[data-formal-reset-cancel]': new FakeNode(), '[data-formal-reset-confirm]': new FakeNode(),
                '[data-formal-reset-upload-note]': new FakeNode(), '[data-formal-reset-backup-status]': new FakeNode(),
                '[data-formal-reset-backup]': new FakeNode(), '[data-formal-reset-backup-confirm]': new FakeNode(),
            };
            this.nodes['[data-formal-reset-confirm]'].disabled = /data-formal-reset-confirm disabled/.test(this._innerHTML);
            this.nodes['[data-formal-reset-backup]'].disabled = /data-formal-reset-backup disabled/.test(this._innerHTML);
            this.nodes['[data-formal-reset-backup-confirm]'].disabled = /data-formal-reset-backup-confirm disabled/.test(this._innerHTML);
        }
    }
    get innerHTML() { return this._innerHTML; }
    querySelector(selector) { return this.nodes && this.nodes[selector] || null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { if (this.parentNode) this.parentNode.child = null; this.parentNode = null; }
}

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {}, body: new FakeNode(), createElement() { return new FakeNode(); } }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = originalLoad; global._testNavigatorDescriptor = navigatorDescriptor; global._testDocumentDescriptor = documentDescriptor; }
}

const flush = () => new Promise(resolve => setImmediate(resolve));

async function main() {
    const state = rawState();
    const preflightStorage = storageFor(state);
    const preflight = await preflightStorage.readFormalResetPreflight();
    assert.deepEqual(preflight.counts, { assets: 3, tags: 2, maintenance: 3, usage: 1, prepaidTransactions: 2,
        wishlistEvents: 1, operationLogs: 2, financialEvents: 1, lifecycleEvents: 1, subscriptionPeriods: 3, exchangeRates: 2 });
    assert.equal(preflight.total, 21);
    assert.equal(preflight.uploads, 3, 'legacy imageUrl, legacy coverPath, and formal upload covers are counted');
    assert.deepEqual(preflightStorage._testWriteCalls, [], 'preflight performs no writes');
    assert.deepEqual(state, rawState(), 'old wrappers are counted raw without normalization or migration');
    await assert.rejects(() => storageFor(state, STORAGE_FILES.usage).readFormalResetPreflight(), error => error.code === 'FORMAL_STORAGE_READ_FAILED');

    const rawBefore = clone(state);
    const rawBackup = await preflightStorage.readRawFormalResetBackup({ createdAt: '2026-07-20T00:00:00.000Z', pluginVersion: '0.17.0' });
    assert.equal(rawBackup.format, 'siyuan-asset-management-raw-reset-backup');
    assert.equal(rawBackup.createdAt, '2026-07-20T00:00:00.000Z');
    assert.deepEqual(rawBackup.payload.assets, rawState()[STORAGE_FILES.assets], 'old/mixed assets are preserved without formal validation');
    assert.deepEqual(rawBackup.payload.settings, rawState()[STORAGE_FILES.settings], 'raw settings are preserved as read');
    assert.deepEqual(state, rawBefore, 'raw backup does not mutate, normalize, migrate, or write storage');
    assert.deepEqual(preflightStorage._testWriteCalls, [], 'raw backup remains read-only');

    let getterCalls = 0;
    const hostile = rawState();
    const inherited = { assets: [{}, {}, {}], rates: { inherited: 1 } };
    hostile[STORAGE_FILES.assets] = Object.create(inherited);
    Object.defineProperty(hostile[STORAGE_FILES.assets], 'assets', { enumerable: true, get() { getterCalls++; throw new Error('getter executed'); } });
    hostile[STORAGE_FILES.exchangeRates] = Object.create(inherited);
    const hostileRates = JSON.parse('{"USD":1,"__proto__":2,"constructor":3,"prototype":4}');
    Object.defineProperty(hostile[STORAGE_FILES.exchangeRates], 'rates', { enumerable: true, value: hostileRates });
    Object.defineProperty(hostileRates, 'EUR', { enumerable: true, get() { getterCalls++; throw new Error('rate getter executed'); } });
    const hostilePreflight = await storageFor(hostile, null, true).readFormalResetPreflight();
    assert.equal(hostilePreflight.counts.assets, 0);
    assert.equal(hostilePreflight.counts.exchangeRates, 1, 'only safe own data rate properties are counted');
    assert.equal(getterCalls, 0, 'preflight never executes getters or reads inherited wrapper fields');

    const PluginClass = loadPluginClass();
    try {
        const host = new FakeNode(); host.appendChild = node => { host.child = node; node.parentNode = host; };
        const settingsRoot = { querySelector(selector) { return selector === '.b3-dialog__container' ? host : null; } };
        const plugin = new PluginClass(); plugin._t = (_key, fallback, params) => String(fallback).replace(/\{(\w+)\}/g, (_, key) => params && params[key] != null ? params[key] : `{${key}}`);
        plugin.storage = storageFor(state);
        const downloads = [];
        plugin._downloadTextFile = async (_name, text) => { downloads.push(JSON.parse(text)); };
        plugin.openFormalResetConfirm(settingsRoot);
        let confirm = host.child.querySelector('[data-formal-reset-confirm]');
        assert.equal(confirm.disabled, true, 'dialog opens in loading state with confirmation disabled');
        await flush();
        const backupButton = host.child.querySelector('[data-formal-reset-backup]');
        const acknowledgement = host.child.querySelector('[data-formal-reset-backup-confirm]');
        assert.equal(confirm.disabled, true, 'preflight alone cannot enable reset');
        assert.equal(backupButton.disabled, false, 'preflight enables raw backup generation');
        assert.match(host.child.querySelector('[data-formal-reset-text]').innerHTML, /汇率: <strong>2<\/strong>/);
        assert.match(host.child.querySelector('[data-formal-reset-text]').innerHTML, /合计 21 条记录/);
        assert.match(host.child.querySelector('[data-formal-reset-upload-note]').textContent, /3 个上传封面/);
        await backupButton.onclick();
        assert.equal(downloads.length, 1, 'reset gate downloads the raw snapshot before confirmation');
        assert.equal(acknowledgement.disabled, false);
        assert.equal(confirm.disabled, true, 'download alone cannot enable reset');
        acknowledgement.checked = true; acknowledgement.onchange();
        assert.equal(confirm.disabled, false, 'only a downloaded backup plus explicit acknowledgement enables reset');

        plugin._closeSettingsFormalResetConfirm();
        plugin.storage = storageFor(state, STORAGE_FILES.usage);
        plugin.openFormalResetConfirm(settingsRoot);
        confirm = host.child.querySelector('[data-formal-reset-confirm]');
        await flush();
        assert.equal(confirm.disabled, true, 'read failure keeps confirmation disabled');
        assert.equal(host.child.querySelector('[data-formal-reset-text]').attributes['data-formal-reset-error'], 'true');
    } finally {
        if (global._testNavigatorDescriptor) Object.defineProperty(global, 'navigator', global._testNavigatorDescriptor); else delete global.navigator;
        if (global._testDocumentDescriptor) Object.defineProperty(global, 'document', global._testDocumentDescriptor); else delete global.document;
        delete global._testNavigatorDescriptor; delete global._testDocumentDescriptor;
    }
    console.log('[formal-reset-preflight] passed');
}

main().catch(error => { console.error('[formal-reset-preflight] failed:', error); process.exit(1); });
