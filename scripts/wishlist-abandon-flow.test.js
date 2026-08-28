'use strict';

const assert = require('node:assert/strict');
const { createStorage, STORAGE_FILES } = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset } = require('../api/assets');

const NOW = '2026-07-20T00:00:00.000Z';
const clone = value => value == null ? value : structuredClone(value);
const WISH_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

function wish() {
    return newFormalV2Asset({ id: WISH_ID, name: 'Formal wish', kind: 'virtualSubscription', status: 'wishlist', currency: 'USD', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW, wishlist: { expectedAmountMinor: 900, reason: 'work need', targetGroup: 'virtual' } });
}
function stateFor(source) {
    return {
        [STORAGE_FILES.assets]: createFormalV2AssetWrapper([source], { updatedAt: NOW }),
        [STORAGE_FILES.tags]: { schemaVersion: 1, tags: [], updatedAt: NOW },
        [STORAGE_FILES.maintenance]: { schemaVersion: 1, records: [], updatedAt: NOW }, [STORAGE_FILES.usage]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.prepaidTransactions]: { schemaVersion: 1, records: [], updatedAt: NOW }, [STORAGE_FILES.wishlistEvents]: { schemaVersion: 1, events: [], updatedAt: NOW },
        [STORAGE_FILES.operationLogs]: { schemaVersion: 1, logs: [], updatedAt: NOW }, [STORAGE_FILES.financialEvents]: { schemaVersion: 1, events: [], updatedAt: NOW },
        [STORAGE_FILES.lifecycleEvents]: { schemaVersion: 1, events: [], updatedAt: NOW }, [STORAGE_FILES.subscriptionPeriods]: { schemaVersion: 1, records: [], updatedAt: NOW },
        [STORAGE_FILES.exchangeRates]: { schemaVersion: 1, baseCurrency: 'CNY', rates: {}, updatedAt: NOW },
    };
}
function storageFor(state, failFile) {
    let failed = false;
    return createStorage({
        async loadData(name) { return Object.hasOwn(state, name) ? clone(state[name]) : null; },
        async saveData(name, payload) { if (name === failFile && !failed) { failed = true; return false; } state[name] = clone(payload); return true; },
        async removeData(name) { delete state[name]; return true; },
    });
}
function abandon(storage) {
    return storage.mutateFormalAssetDomain(snapshot => {
        const source = snapshot.assets.find(item => item.id === WISH_ID && item.status === 'wishlist');
        assert.ok(source, 'canonical wishlist source must still exist');
        const event = { id: EVENT_ID, eventType: 'abandoned', sourceWishlistId: source.id, targetAssetId: null, targetKind: source.kind, sourceTargetGroup: 'virtual', occurredAt: NOW, financialEventId: null, abandonReason: 'budget changed', currency: source.currency, sourceSnapshot: source };
        return { change: { assets: snapshot.assets.filter(item => item.id !== source.id), wishlistEvents: snapshot.wishlistEvents.concat(event), lifecycleEvents: snapshot.lifecycleEvents.filter(item => item.assetId !== source.id) }, context: { event } };
    });
}

async function main() {
    const source = wish(); const state = stateFor(source);
    const result = await abandon(storageFor(state));
    assert.equal(result.assets.length, 0);
    const event = state[STORAGE_FILES.wishlistEvents].events[0];
    assert.deepEqual(event.sourceSnapshot, source, 'abandon event retains the canonical formal wishlist snapshot');
    assert.equal(event.eventType, 'abandoned'); assert.equal(event.targetAssetId, null); assert.equal(event.abandonReason, 'budget changed');

    const failedState = stateFor(source); const before = clone(failedState);
    await assert.rejects(() => abandon(storageFor(failedState, STORAGE_FILES.wishlistEvents)), error => error && error.code === 'FORMAL_PERSISTENCE_TRANSACTION_FAILED');
    assert.deepEqual(failedState, before, 'failed canonical wishlist-event write restores the source and every sidecar');
    console.log('[wishlist-abandon-flow] passed');
}
main().catch(error => { console.error('[wishlist-abandon-flow] failed:', error); process.exitCode = 1; });
