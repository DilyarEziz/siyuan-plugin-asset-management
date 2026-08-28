'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStorage, STORAGE_FILES } = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset } = require('../api/assets');

const NOW = '2026-07-20T00:00:00.000Z';
const clone = value => value == null ? value : structuredClone(value);

function asset(id, name) {
    return newFormalV2Asset({
        id, name, kind: 'physical', status: 'active', currency: 'CNY', categoryId: 'digital',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [],
        cover: { kind: 'none' }, notes: '',
        createdAt: NOW, updatedAt: NOW,
        details: { warrantyEndsOn: null, costGoal: null },
    });
}

function stateFor(assets) {
    return {
        [STORAGE_FILES.assets]: createFormalV2AssetWrapper(assets, { updatedAt: NOW }),
        [STORAGE_FILES.tags]: { schemaVersion: 1, tags: [], updatedAt: NOW },
        [STORAGE_FILES.maintenance]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.usage]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.prepaidTransactions]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.wishlistEvents]: { schemaVersion: 1, events: [], updatedAt: NOW },
        [STORAGE_FILES.operationLogs]: { schemaVersion: 1, logs: [], updatedAt: NOW },
        [STORAGE_FILES.financialEvents]: { schemaVersion: 1, events: [], updatedAt: NOW },
        [STORAGE_FILES.lifecycleEvents]: { schemaVersion: 1, events: [], updatedAt: NOW },
        [STORAGE_FILES.subscriptionPeriods]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.exchangeRates]: { schemaVersion: 1, baseCurrency: 'CNY', rates: {}, updatedAt: NOW },
    };
}

function storageFor(state, options = {}) {
    let failed = false;
    return createStorage({
        async loadData(name) { return Object.hasOwn(state, name) ? clone(state[name]) : null; },
        async saveData(name, payload) {
            if (name === options.failFile && !failed) { failed = true; return false; }
            if (name === options.silentDropFile) return true;
            state[name] = clone(payload);
            return true;
        },
        async removeData(name) { delete state[name]; return true; },
    });
}

async function testFormalTransactionReadbackAndRollback() {
    const source = asset('11111111-1111-4111-8111-111111111111', 'Original');
    const state = stateFor([source]);
    const storage = storageFor(state);
    const committed = await storage.mutateFormalAssetDomain(snapshot => ({
        assets: snapshot.assets.map(item => Object.assign({}, item, { status: 'retired', statusChangedOn: '2026-07-20', updatedAt: NOW })),
    }));
    assert.equal(committed.assets[0].status, 'retired');
    assert.equal(state[STORAGE_FILES.assets].assets[0].status, 'retired', 'formal commit writes strict wrapper');

    const before = clone(state);
    await assert.rejects(() => storageFor(state, { failFile: STORAGE_FILES.operationLogs }).mutateFormalAssetDomain(snapshot => ({
        assets: snapshot.assets.map(item => Object.assign({}, item, { status: 'active', statusChangedOn: '2026-07-20' })),
        operationLogs: [{
            id: '22222222-2222-4222-8222-222222222222', type: 'update', assetId: source.id, assetName: source.name,
            field: null, oldValue: snapshot.assets[0], newValue: Object.assign({}, snapshot.assets[0], { status: 'active' }), ts: NOW,
        }],
    })), error => error && error.code === 'FORMAL_PERSISTENCE_TRANSACTION_FAILED');
    assert.deepEqual(state, before, 'a failed formal sidecar write rolls every prior formal write back');

    const readbackState = stateFor([source]);
    await assert.rejects(() => storageFor(readbackState, { silentDropFile: STORAGE_FILES.assets }).mutateFormalAssetDomain(snapshot => ({
        assets: snapshot.assets.map(item => Object.assign({}, item, { status: 'retired', statusChangedOn: '2026-07-20' })),
    })), /read-back verification failed/);
    assert.deepEqual(readbackState[STORAGE_FILES.assets], stateFor([source])[STORAGE_FILES.assets], 'read-back failure restores the strict assets snapshot');
}

function testProductionWriteBoundary() {
    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    const production = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const commit = template.slice(template.indexOf('    async _commitAssetAuditMutation(prepare) {'), template.indexOf('    _newFormalOperationLog(', template.indexOf('    async _commitAssetAuditMutation(prepare) {')));
    assert.match(commit, /storage\.mutateFormalAssetDomain\(/, 'formal production mutations use the formal transaction boundary');
    [template, production].forEach((artifact, index) => assert.doesNotMatch(artifact, /_legacyRemoved[A-Za-z0-9_]*/,
        `${index ? 'generated plugin' : 'template'} contains no isolated legacy implementation`));
}

Promise.resolve()
    .then(testFormalTransactionReadbackAndRollback)
    .then(testProductionWriteBoundary)
    .then(() => console.log('[transaction-write-boundary] passed'))
    .catch(error => { console.error('[transaction-write-boundary] failed:', error); process.exitCode = 1; });
