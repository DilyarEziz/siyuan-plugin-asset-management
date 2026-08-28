'use strict';

const assert = require('node:assert/strict');
const { createStorage, createFormalResetSnapshot, STORAGE_FILES, FORMAL_BACKUP_FORMAT } = require('../api/storage');

const clone = value => value == null ? value : structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

function initialState() {
    const reset = createFormalResetSnapshot({ updatedAt: '2026-07-19T00:00:00.000Z' });
    return {
        [STORAGE_FILES.assets]: reset.assets, [STORAGE_FILES.tags]: reset.tags,
        [STORAGE_FILES.wishlistEvents]: reset.wishlistEvents, [STORAGE_FILES.operationLogs]: reset.operationLogs,
        [STORAGE_FILES.maintenance]: reset.maintenance, [STORAGE_FILES.usage]: reset.usage,
        [STORAGE_FILES.prepaidTransactions]: reset.prepaidTransactions, [STORAGE_FILES.financialEvents]: reset.financialEvents,
        [STORAGE_FILES.lifecycleEvents]: reset.lifecycleEvents, [STORAGE_FILES.subscriptionPeriods]: reset.subscriptionPeriods,
        [STORAGE_FILES.exchangeRates]: reset.exchangeRates,
        [STORAGE_FILES.settings]: { schemaVersion: 1, defaultSort: 'default' },
    };
}

function adapter(state, hooks) {
    const saves = [];
    const plugin = {
        async loadData(name) { return hooks && hooks.loadData ? hooks.loadData(name, state) : clone(state[name]); },
        async saveData(name, payload) {
            saves.push(name);
            if (hooks && hooks.saveData) return hooks.saveData(name, payload, state);
            state[name] = clone(payload); return true;
        },
        async removeData(name) { delete state[name]; return true; },
    };
    return { storage: createStorage(plugin), saves };
}

async function conflictHasZeroOverwrite() {
    const state = initialState();
    let tagReads = 0;
    const external = { schemaVersion: 1, tags: [], updatedAt: '2026-07-19T01:00:00.000Z' };
    const { storage, saves } = adapter(state, { loadData(name, durable) {
        if (name === STORAGE_FILES.tags && ++tagReads === 3) durable[name] = clone(external);
        return clone(durable[name]);
    } });
    await assert.rejects(() => storage.mutateFormalAssetDomain(snapshot => ({ change: { tags: snapshot.tags } })), error => {
        assert.equal(error.code, 'FORMAL_PERSISTENCE_CONFLICT'); return true;
    });
    assert.deepEqual(state[STORAGE_FILES.tags], external);
    assert.deepEqual(saves, [], 'conflict detection must not overwrite or compensate an external rewrite');
}

async function queuedTaskStopsBeforeStart() {
    const gate = deferred(), started = deferred();
    const first = adapter(initialState()).storage;
    const second = adapter(initialState()).storage;
    const running = first.mutateFormalAssetDomain(async () => { started.resolve(); await gate.promise; return { change: { tags: [] } }; });
    await started.promise;
    const queued = second.readFormalAssetWrapper();
    second.stopPersistence(); gate.resolve(); await running;
    await assert.rejects(queued, error => error && error.code === 'STORAGE_CLOSED');
}

async function authorizedStartedTaskCompletesAfterStop() {
    const entered = deferred(), release = deferred();
    const { storage } = adapter(initialState());
    const task = storage.mutateFormalAssetDomain(async snapshot => { entered.resolve(); await release.promise; return { change: { tags: snapshot.tags } }; });
    await entered.promise; storage.stopPersistence(); release.resolve();
    const result = await task;
    assert.equal(result.ok, true);
}

async function startedFailureRollsBackAfterStop() {
    const state = initialState(), before = clone(state);
    const firstSave = deferred(); let saves = 0;
    const { storage } = adapter(state, { async saveData(name, payload, durable) {
        saves++;
        if (saves === 1) { durable[name] = clone(payload); firstSave.resolve(); return true; }
        if (saves === 2) return false;
        durable[name] = clone(payload); return true;
    } });
    const task = storage.mutateFormalAssetDomain(snapshot => ({ change: { tags: snapshot.tags, assets: snapshot.assets } }));
    await firstSave.promise; storage.stopPersistence();
    await assert.rejects(task, error => error && error.code === 'FORMAL_PERSISTENCE_TRANSACTION_FAILED'
        && error.compensation && error.compensation.rolledBack === true);
    assert.deepEqual(state, before, 'an admitted transaction retains rollback authority after stop');
}

async function failedTailDoesNotBlockOtherInstance() {
    const bad = adapter(initialState()).storage;
    const good = adapter(initialState()).storage;
    await assert.rejects(() => bad.mutateFormalAssetDomain(() => { throw new Error('expected'); }));
    const wrapper = await good.readFormalAssetWrapper();
    assert.deepEqual(wrapper.assets, []);
}

async function settingsPatchMergesLatestRuntime() {
    const state = initialState();
    state[STORAGE_FILES.settings] = { schemaVersion: 1, defaultSort: 'default', runtimeFlag: 'new',
        resourceIndex: { documentId: '20260719000000-ccccccc', notebookId: '20260719000000-bbbbbbb',
            pendingCleanupBlockId: '20260719000000-ddddddd' } };
    const { storage } = adapter(state);
    const next = await storage.mutateFormalSettings(() => ({ defaultSort: 'newest' }));
    assert.equal(next.defaultSort, 'newest');
    assert.equal(state[STORAGE_FILES.settings].runtimeFlag, 'new', 'ordinary preference patch preserves latest runtime fields');
    assert.equal(next.resourceIndex.pendingCleanupBlockId, '20260719000000-ddddddd');
}

async function resetAndSettingsPatchKeepPending() {
    const state = initialState();
    state[STORAGE_FILES.settings] = { schemaVersion: 1, defaultSort: 'default',
        resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: '20260719000000-ccccccc',
            managedBlockId: '20260719000000-ddddddd' } };
    const entered = deferred(), release = deferred(); let held = false;
    const { storage } = adapter(state, { async saveData(name, payload, durable) {
        if (!held && name === STORAGE_FILES.tags) { held = true; entered.resolve(); await release.promise; }
        durable[name] = clone(payload); return true;
    } });
    const reset = storage.initializeFormalStorageReset({ confirmReset: true });
    await entered.promise;
    const preference = storage.mutateFormalSettings(() => ({ defaultSort: 'newest' }));
    release.resolve(); await reset; await preference;
    assert.equal(state[STORAGE_FILES.settings].defaultSort, 'newest');
    assert.equal(state[STORAGE_FILES.settings].resourceIndex.pendingCleanupBlockId, '20260719000000-ddddddd');
}

async function importAndSettingsPatchKeepPending() {
    const state = initialState();
    state[STORAGE_FILES.settings] = { schemaVersion: 1, defaultSort: 'default',
        resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: '20260719000000-ccccccc',
            pendingCleanupBlockId: '20260719000000-ddddddd' } };
    const empty = createFormalResetSnapshot({ updatedAt: '2026-07-19T00:00:00.000Z' });
    const backup = { format: FORMAL_BACKUP_FORMAT, schemaGeneration: 'formal-v1', schemaVersion: 1,
        exportedAt: '2026-07-19T00:00:00.000Z', pluginVersion: '0.17.0', data: empty,
        settings: { defaultSort: 'default', defaultStatus: 'all', defaultViewMode: 'list', viewMode: 'list',
            preferredCurrency: 'CNY', currencyDisplayMode: 'native', notificationsEnabled: true,
            notificationDays: [7, 30], notificationIntervalMinutes: 5,
            resourceIndex: { notebookId: '20260719000000-bbbbbbb', documentId: '20260719000000-ccccccc', documentTitle: 'Target' },
            markdownExportTarget: { notebookId: null, documentId: null, documentTitle: null } } };
    const entered = deferred(), release = deferred(); let held = false;
    const { storage } = adapter(state, { async saveData(name, payload, durable) {
        if (!held && name === STORAGE_FILES.tags) { held = true; entered.resolve(); await release.promise; }
        durable[name] = clone(payload); return true;
    } });
    const imported = storage.replaceFormalDomainFromBackup(backup);
    await entered.promise;
    const preference = storage.mutateFormalSettings(() => ({ defaultSort: 'oldest' }));
    release.resolve(); await imported; await preference;
    assert.equal(state[STORAGE_FILES.settings].defaultSort, 'oldest');
    assert.equal(state[STORAGE_FILES.settings].resourceIndex.pendingCleanupBlockId, '20260719000000-ddddddd');
}

(async () => {
    await conflictHasZeroOverwrite();
    await queuedTaskStopsBeforeStart();
    await authorizedStartedTaskCompletesAfterStop();
    await startedFailureRollsBackAfterStop();
    await failedTailDoesNotBlockOtherInstance();
    await settingsPatchMergesLatestRuntime();
    await resetAndSettingsPatchKeepPending();
    await importAndSettingsPatchKeepPending();
    console.log('[formal-concurrency-recovery] passed');
})().catch(error => { console.error('[formal-concurrency-recovery] failed:', error); process.exit(1); });
