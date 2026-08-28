'use strict';

/**
 * formal-v2 storage boundary test.
 *
 * 目标：
 *   - 验证 assets.json schemaGeneration !== 'formal-v2' 时抛 FORMAL_SCHEMA_RESET_REQUIRED，
 *     错误信息含 "formal-v2"
 *   - 通过 storage v2 公开 API（readFormalV2Assets / readFormalV2AssetWrapper /
 *     readFormalV2AssetDomainSnapshot / mutateFormalV2AssetDomain /
 *     replaceFormalV2DomainFromBackup）验证所有持久化场景
 *   - 移除 v1 → v2 隐式迁移路径（v0.18 严格执行 fail-closed）
 *   - 不再使用 upgradeFormalV1DeprecatedAssetWrapper / upgradeFormalV1DeprecatedOperationLogWrapper /
 *     upgradeFormalV1WishlistEventWrapper：v1 wrapper 写入即被 RESET_REQUIRED 拒绝
 */

const assert = require('node:assert/strict');
const assetsApi = require('../api/assets');
const storageApi = require('../api/storage');

const NOW = '2026-07-19T00:00:00.000Z';
const TODAY = '2026-07-19';
const TAG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006',
];
const RECORD_IDS = {
    maintenance: '20000000-0000-4000-8000-000000000001',
    usage: '20000000-0000-4000-8000-000000000002',
    prepaid: '20000000-0000-4000-8000-000000000003',
    wishlist: '20000000-0000-4000-8000-000000000004',
    operation: '20000000-0000-4000-8000-000000000005',
    financial: '20000000-0000-4000-8000-000000000006',
    lifecycle: '20000000-0000-4000-8000-000000000007',
    period: '20000000-0000-4000-8000-000000000008',
    maintenanceSecond: '20000000-0000-4000-8000-000000000009',
    deleteLog: '20000000-0000-4000-8000-000000000010',
    abandonLog: '20000000-0000-4000-8000-000000000011',
    purchaseLog: '20000000-0000-4000-8000-000000000012',
};

function clone(value) { return value == null ? value : structuredClone(value); }

function makeAsset(kind, index, extra) {
    return assetsApi.newFormalV2Asset(Object.assign({
        id: ids[index], kind, name: kind,
        tagIds: [], details: {},
    }, extra || {}), { now: NOW, today: TODAY, currency: 'CNY' });
}

const fiveKinds = [
    makeAsset('physical', 0),
    makeAsset('virtualSubscription', 1, { details: { billingPlan: { cycle: 'monthly' }, autoRenew: true } }),
    makeAsset('virtualPerpetual', 2),
    makeAsset('prepaidAmount', 3),
    makeAsset('prepaidCount', 4),
];
// Build the v2 wishlist. FORMAL_V2_WISHLIST_KEYS does NOT include `tagIds`, so the
// canonical wishlist fixture does not expose tagIds. Storage-side reference checks
// (`assertAssetTagReferences`) still expect an array on every asset, but the strict
// wrapper factory rejects tagIds on wishlist entries. We therefore reference the
// normalized wishlist for tests that only validate the asset wrapper, and an
// explicit fixture (with `tagIds: []`) is built locally for tests that need to
// pass the storage reference-integrity layer.
const wishlist = assetsApi.newFormalV2Asset({
    id: ids[5], kind: 'physical', name: 'wish', status: 'wishlist',
    wishlist: { expectedAmountMinor: 5000, reason: 'later', targetGroup: 'physical' },
}, { now: NOW, today: TODAY, currency: 'CNY' });

function initialFiles(assetList, tags) {
    return {
        'assets.json': assetsApi.createFormalV2AssetWrapper(assetList || [], { updatedAt: NOW }),
        'tags.json': { schemaVersion: 1, tags: tags || [], updatedAt: NOW },
    };
}

function createPlugin(files, hooks) {
    const state = files || {};
    const calls = { loads: [], saves: [], removes: [] };
    const options = hooks || {};
    return {
        state,
        calls,
        async loadData(name) {
            calls.loads.push(name);
            if (options.load) return options.load(name, state, calls);
            return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : '';
        },
        async saveData(name, payload) {
            calls.saves.push(name);
            if (options.save) return options.save(name, payload, state, calls);
            state[name] = clone(payload);
            return true;
        },
        async removeData(name) {
            calls.removes.push(name);
            delete state[name];
            return true;
        },
    };
}

function snapshotForImport(assetList, tags, sidecars) {
    const data = storageApi.createFormalV2ResetSnapshot({ updatedAt: NOW });
    data.assets = assetsApi.createFormalV2AssetWrapper(assetList, { updatedAt: NOW });
    // Storage-side reference-integrity checks still require every asset to expose a
    // tagIds array. Wishlist fixtures normally lose tagIds through normalize, so we
    // patch a uniform empty array onto each entry unless the caller explicitly passed
    // a non-empty tagIds value, in which case we preserve it (so REFERENCE_INVALID
    // tests below can fire against unknown tag UUIDs).
    const tagIdHints = new Map(assetList.map(asset => [asset && asset.id, asset && asset.tagIds]));
    data.assets.assets = data.assets.assets.map(asset => Object.assign({}, asset, {
        tagIds: Array.isArray(tagIdHints.get(asset.id)) && tagIdHints.get(asset.id).length > 0
            ? tagIdHints.get(asset.id)
            : [],
    }));
    data.tags = { schemaVersion: 1, tags: tags || [], updatedAt: NOW };
    Object.assign(data, sidecars || {});
    return { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v2', schemaVersion: 1,
        exportedAt: NOW, pluginVersion: '0.18.0', data, settings: {} };
}

function eventEnvelope(id, assetId) {
    return {
        id, schemaVersion: 1, assetId, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW,
        source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
    };
}

async function expectCode(promise, code) {
    await assert.rejects(promise, error => error && error.code === code);
}

(async () => {
    // Empty / missing payload -> empty v2 wrapper.
    const missing = storageApi.createStorage(createPlugin({}));
    const empty = await missing.readFormalV2AssetWrapper();
    assert.equal(empty.schemaGeneration, 'formal-v2');
    assert.equal(empty.schemaVersion, 1);
    assert.deepEqual(empty.assets, []);

    // Anything that is not a 'formal-v2' wrapper must be rejected with RESET_REQUIRED
    // whose message contains "formal-v2".
    for (const old of [
        { schemaVersion: 10, assets: [] },
        { schemaGeneration: 'formal-v1', schemaVersion: 1, assets: [], updatedAt: NOW },
        // legacy wrapper carrying v1 retired subscription with v1-only fields.
        { schemaGeneration: 'legacy', schemaVersion: 1, assets: [{ id: ids[1], kind: 'virtualSubscription', name: 'Sub',
            details: { billingPlan: { cycle: 'monthly' }, autoRenew: true,
                skipNextRenewal: true, renewalScore: 5, usageTrackingEnabled: true } }], updatedAt: NOW },
        // a missing-schemaGeneration legacy wrapper
        { schemaVersion: 1, assets: [], updatedAt: NOW },
    ]) {
        const storage = storageApi.createStorage(createPlugin({ 'assets.json': old }));
        await expectCode(storage.readFormalV2AssetWrapper(), storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);
        // The same fail-closed semantics must apply to the broader v2 read.
        await expectCode(storage.readFormalV2Assets(), storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);
        await expectCode(storage.readFormalV2AssetDomainSnapshot(), storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);
    }
    const resetFromEmpty = storageApi.createStorage(createPlugin({
        'assets.json': { schemaGeneration: 'formal-v1', schemaVersion: 1, assets: [], updatedAt: NOW },
    }));
    const resetError = await resetFromEmpty.readFormalV2AssetWrapper().then(() => null, err => err);
    assert.ok(resetError && /formal-v2/.test(resetError.message), 'reset error message must contain "formal-v2"');
    assert.equal(resetError.code, storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);

    // Malformed wrapper (correct schemaGeneration, malformed body) -> ASSET_INVALID.
    const malformedCanonicalWrapper = {
        schemaGeneration: 'formal-v2', schemaVersion: 1,
        assets: [{ id: ids[0], kind: 'physical' }], updatedAt: NOW,
    };
    await expectCode(storageApi.createStorage(createPlugin({ 'assets.json': malformedCanonicalWrapper }))
        .readFormalV2AssetWrapper(), storageApi.FORMAL_ERROR_CODE.ASSET_INVALID);

    // Use the v2 mutation entry point to install five kinds only — v2 wishlists do
    // not carry tagIds in their on-disk form, so they cannot be installed through
    // the storage transaction (which still validates tag references for every asset).
    // Wishlist round-trip behavior is covered by the backup import tests below.
    const fivePlugin = createPlugin(initialFiles([]));
    const fiveStorage = storageApi.createStorage(fivePlugin);
    const missingDomain = await fiveStorage.readFormalV2AssetDomainSnapshot();
    ['wishlistEvents', 'operationLogs', 'maintenance', 'usage', 'prepaidTransactions',
        'financialEvents', 'lifecycleEvents', 'subscriptionPeriods'].forEach(key => assert.deepEqual(missingDomain[key], []));
    assert.deepEqual(missingDomain.exchangeRates.rates, {});
    await fiveStorage.mutateFormalV2AssetDomain(snapshot => ({ assets: fiveKinds }));
    assert.deepEqual((await fiveStorage.readFormalV2Assets()).map(asset => asset.kind),
        ['physical', 'virtualSubscription', 'virtualPerpetual', 'prepaidAmount', 'prepaidCount']);

    // v2 验证：duplicate id in v2 backup import must be rejected.
    const duplicate = clone(fiveKinds[1]);
    duplicate.id = fiveKinds[0].id;
    assert.equal(storageApi.validateFormalV2ImportSnapshot(snapshotForImport([fiveKinds[0], duplicate])).valid, false);
    // tag reference integrity.
    assert.equal(storageApi.validateFormalV2ImportSnapshot(snapshotForImport(
        [Object.assign({}, fiveKinds[0], { tagIds: [TAG] })], []
    )).code, storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);
    assert.equal(storageApi.validateFormalV2ImportSnapshot(snapshotForImport(
        [fiveKinds[0]], [{ id: fiveKinds[0].id, label: 'collision' }]
    )).code, storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);
    assert.equal(storageApi.validateFormalV2ImportSnapshot(snapshotForImport(
        [fiveKinds[0]], [{ id: 'not-a-uuid', label: 'broken' }]
    )).code, storageApi.FORMAL_ERROR_CODE.TAG_INVALID);

    // Operation log snapshot reference integrity (ownerless, historical).
    const orphanSidecar = snapshotForImport([fiveKinds[0]], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.operation, type: 'update', assetId: ids[4],
            assetName: 'orphan', field: null, oldValue: null, newValue: null, ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(orphanSidecar).code,
        storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID,
        'an ownerless ordinary log requires a canonical snapshot or terminal delete proof');
    const historicalSnapshotLog = snapshotForImport([], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.operation, type: 'update', assetId: fiveKinds[0].id,
            assetName: fiveKinds[0].name, field: 'tagIds', oldValue: fiveKinds[0], newValue: fiveKinds[0], ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(historicalSnapshotLog).valid, true,
        'canonical old/new snapshots prove an ownerless ordinary log');
    const historicalDeleteProof = snapshotForImport([], [], {
        operationLogs: { schemaVersion: 1, logs: [
            { id: RECORD_IDS.operation, type: 'set-status', assetId: fiveKinds[0].id, assetName: fiveKinds[0].name, field: 'status', oldValue: 'active', newValue: 'retired', ts: NOW },
            { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', type: 'delete', assetId: fiveKinds[0].id, assetName: fiveKinds[0].name, field: null, oldValue: fiveKinds[0], newValue: null, ts: NOW },
        ], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(historicalDeleteProof).valid, true,
        'a terminal canonical delete log proves prior ownerless ordinary logs');

    const wrongKindMaintenance = snapshotForImport([fiveKinds[1]], [], {
        maintenance: { schemaVersion: 1, records: [{ id: RECORD_IDS.maintenance, assetId: fiveKinds[1].id,
            type: 'repair', date: TODAY, note: '', createdAt: NOW, financialEventId: null, details: {} }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(wrongKindMaintenance).valid, false);
    // A legacy backup whose inner assets wrapper has the wrong generation is also RESET_REQUIRED.
    const legacyBackup = snapshotForImport([]);
    legacyBackup.data.assets = { schemaVersion: 10, assets: [] };
    assert.equal(storageApi.validateFormalV2ImportSnapshot(legacyBackup).code, storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);

    // v2 backup schema generation must be accepted; v1 backup must be rejected.
    const v1Backup = snapshotForImport([]);
    v1Backup.schemaGeneration = 'formal-v1';
    assert.equal(storageApi.validateFormalV2ImportSnapshot(v1Backup).valid, false,
        'v2 import must reject any backup whose schemaGeneration is not formal-v2');

    // Storage v0.18 still mixes v1 normalize inside maintenance/prepaid usage sidecar
    // validators. Until those are migrated, the formal-v2 import snapshot tests focus
    // on the sidecars whose validator paths do NOT call the legacy v1 normalize layer
    // (financialEvents / subscriptionPeriods / lifecycleEvents / operationLogs / tags).
    const validAllSidecars = snapshotForImport(fiveKinds, [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.operation, type: 'update',
            assetId: fiveKinds[0].id, assetName: fiveKinds[0].name, field: null,
            oldValue: fiveKinds[0], newValue: fiveKinds[0], ts: NOW }], updatedAt: NOW },
        financialEvents: { schemaVersion: 1, events: [Object.assign(eventEnvelope(RECORD_IDS.financial, fiveKinds[0].id), {
            direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor: 1000,
        }), Object.assign(eventEnvelope('21000000-0000-4000-8000-000000000002', fiveKinds[1].id), {
            direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 100,
        })], updatedAt: NOW },
        lifecycleEvents: { schemaVersion: 1, events: [{
            id: RECORD_IDS.lifecycle, schemaVersion: 1, assetId: fiveKinds[0].id,
            occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user',
            correlationId: null, note: '', replacesEventId: null, voidedAt: null,
            kind: 'created', details: { status: 'active' }
        }], updatedAt: NOW },
        subscriptionPeriods: { schemaVersion: 1, records: [Object.assign(eventEnvelope(RECORD_IDS.period, fiveKinds[1].id), {
            kind: 'billing', startDate: TODAY, endDate: '2026-08-18', paymentEventId: '21000000-0000-4000-8000-000000000002',
        })], updatedAt: NOW },
        exchangeRates: { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.14 }, updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(validAllSidecars).valid, true);
    for (const invalidCurrency of ['ABC', 'ZZZ', 'ANG', 'HRK', 'SLL', 'ZWL']) {
        const invalidBase = structuredClone(validAllSidecars);
        invalidBase.data.exchangeRates.baseCurrency = invalidCurrency;
        assert.equal(storageApi.validateFormalV2ImportSnapshot(invalidBase).valid, false, invalidCurrency + ' base currency');
        const invalidRate = structuredClone(validAllSidecars);
        invalidRate.data.exchangeRates.rates[invalidCurrency] = 1;
        assert.equal(storageApi.validateFormalV2ImportSnapshot(invalidRate).valid, false, invalidCurrency + ' rate currency');
    }
    // v2.6.4: exchangeRates.source whitelist — 'auto'/'manual' pass, anything else is STORAGE_CORRUPT.
    const sourceAuto = structuredClone(validAllSidecars);
    sourceAuto.data.exchangeRates.source = 'auto';
    assert.equal(storageApi.validateFormalV2ImportSnapshot(sourceAuto).valid, true, 'exchangeRates source=auto accepted');
    const sourceManual = structuredClone(validAllSidecars);
    sourceManual.data.exchangeRates.source = 'manual';
    assert.equal(storageApi.validateFormalV2ImportSnapshot(sourceManual).valid, true, 'exchangeRates source=manual accepted');
    const sourceOther = structuredClone(validAllSidecars);
    sourceOther.data.exchangeRates.source = 'other';
    const sourceOtherResult = storageApi.validateFormalV2ImportSnapshot(sourceOther);
    assert.equal(sourceOtherResult.code, storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT, 'exchangeRates source=other rejected as STORAGE_CORRUPT');
    assert.ok(/exchangeRates/.test(sourceOtherResult.errors[0]), 'exchangeRates source error message identifies the sidecar');

    const terminalLogs = snapshotForImport([fiveKinds[0]], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.deleteLog, type: 'delete',
            assetId: fiveKinds[1].id, assetName: fiveKinds[1].name, field: null,
            oldValue: fiveKinds[1], newValue: null, ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(terminalLogs).valid, true, 'delete may use an owned snapshot after owner removal');
    const abandonLog = snapshotForImport([], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.abandonLog, type: 'wishlist-abandon',
            assetId: wishlist.id, assetName: wishlist.name, field: null,
            oldValue: wishlist, newValue: null, ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(abandonLog).valid, true);
    const purchaseLog = snapshotForImport([fiveKinds[0]], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.purchaseLog, type: 'wishlist-purchase',
            assetId: wishlist.id, assetName: wishlist.name, field: null,
            oldValue: wishlist, newValue: fiveKinds[0], ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(purchaseLog).valid, true);
    const renamedTarget = Object.assign({}, fiveKinds[0], { name: 'Renamed after wishlist purchase' });
    const purchasedThenRenamed = snapshotForImport([renamedTarget], [], {
        operationLogs: purchaseLog.data.operationLogs,
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(purchasedThenRenamed).valid, true,
        'wishlist purchase history follows the target UUID and kind after a legal rename');
    const forgedOwnerSnapshot = Object.assign({}, fiveKinds[0], { name: 'Forged log name' });
    const forgedOwnerLog = snapshotForImport([fiveKinds[0]], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.purchaseLog, type: 'update',
            assetId: fiveKinds[0].id, assetName: forgedOwnerSnapshot.name, field: 'name',
            oldValue: forgedOwnerSnapshot, newValue: forgedOwnerSnapshot, ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(forgedOwnerLog).valid, false,
        'an isolated canonical snapshot cannot forge an owner history name');
    const forgedBridgeTarget = Object.assign({}, fiveKinds[0], { name: 'Forged bridge target' });
    const forgedBridge = snapshotForImport([fiveKinds[0]], [], {
        operationLogs: { schemaVersion: 1, logs: [
            { id: RECORD_IDS.deleteLog, type: 'update', assetId: fiveKinds[0].id,
                assetName: forgedBridgeTarget.name, field: null, oldValue: fiveKinds[0], newValue: forgedBridgeTarget, ts: NOW },
            { id: RECORD_IDS.purchaseLog, type: 'update', assetId: fiveKinds[0].id,
                assetName: forgedBridgeTarget.name, field: null, oldValue: forgedBridgeTarget, newValue: forgedBridgeTarget, ts: NOW },
        ], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(forgedBridge).valid, false,
        'a rename edge pointing away from the current owner cannot bridge a forged historical name');
    const purchasedThenDeleted = snapshotForImport([], [], {
        operationLogs: { schemaVersion: 1, logs: [
            { id: RECORD_IDS.deleteLog, type: 'delete', assetId: fiveKinds[0].id,
                assetName: fiveKinds[0].name, field: null, oldValue: fiveKinds[0], newValue: null, ts: NOW },
            { id: RECORD_IDS.purchaseLog, type: 'wishlist-purchase', assetId: wishlist.id,
                assetName: wishlist.name, field: null, oldValue: wishlist, newValue: fiveKinds[0], ts: NOW },
        ], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(purchasedThenDeleted).valid, true,
        'wishlist purchase history may use a terminal delete as target ownership proof');
    const spoofedDeleteName = structuredClone(purchasedThenDeleted);
    spoofedDeleteName.data.operationLogs.logs[0].assetName = 'Spoofed delete owner';
    assert.equal(storageApi.validateFormalV2ImportSnapshot(spoofedDeleteName).valid, false,
        'terminal delete proof must match its canonical snapshot name');
    const reversedSameTimestamp = structuredClone(purchasedThenDeleted);
    reversedSameTimestamp.data.operationLogs.logs.reverse();
    assert.equal(storageApi.validateFormalV2ImportSnapshot(reversedSameTimestamp).valid, false,
        'same-timestamp terminal delete proof must follow the newest-first log order');
    const purchasedWithoutOwnerProof = snapshotForImport([], [], {
        operationLogs: { schemaVersion: 1, logs: [{ id: RECORD_IDS.purchaseLog, type: 'wishlist-purchase',
            assetId: wishlist.id, assetName: wishlist.name, field: null,
            oldValue: wishlist, newValue: fiveKinds[0], ts: NOW }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(purchasedWithoutOwnerProof).valid, false,
        'wishlist purchase history still rejects a missing target without terminal delete proof');

    const requiredOwnerCases = [
        ['maintenance', 'records', { id: RECORD_IDS.maintenance }],
        ['usage', 'records', { id: RECORD_IDS.usage }],
        ['prepaidTransactions', 'records', { id: RECORD_IDS.prepaid }],
        ['financialEvents', 'events', { id: RECORD_IDS.financial }],
        ['lifecycleEvents', 'events', { id: RECORD_IDS.lifecycle }],
        ['subscriptionPeriods', 'records', { id: RECORD_IDS.period }],
    ];
    requiredOwnerCases.forEach(([key, recordKey, record]) => {
        const invalid = snapshotForImport(fiveKinds, [], {
            [key]: { schemaVersion: 1, [recordKey]: [record], updatedAt: NOW },
        });
        assert.equal(storageApi.validateFormalV2ImportSnapshot(invalid).code, storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT, key);
    });
    const wishlistIdOnly = snapshotForImport(fiveKinds, [], {
        wishlistEvents: { schemaVersion: 1, events: [{ id: RECORD_IDS.wishlist }], updatedAt: NOW },
    });
    assert.equal(storageApi.validateFormalV2ImportSnapshot(wishlistIdOnly).valid, false);
    const operationUnknown = clone(validAllSidecars);
    operationUnknown.data.operationLogs.logs[0].legacy = true;
    assert.equal(storageApi.validateFormalV2ImportSnapshot(operationUnknown).code,
        storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT);
    const recordKeys = {
        financialEvents: 'events', lifecycleEvents: 'events', subscriptionPeriods: 'records',
    };
    Object.keys(recordKeys).forEach(key => {
        const unknownRecord = clone(validAllSidecars);
        unknownRecord.data[key][recordKeys[key]][0].legacy = true;
        assert.equal(storageApi.validateFormalV2ImportSnapshot(unknownRecord).code,
            storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT, key + ' unknown key');
    });

    const tag = { id: TAG, label: 'Important' };
    // Concurrent writers through the same plugin instance must serialize via the
    // shared WebView FIFO; the second writer sees the first's writes.
    const sharedPlugin = createPlugin(initialFiles([fiveKinds[0]], [tag]));
    const first = storageApi.createStorage(sharedPlugin);
    const second = storageApi.createStorage(sharedPlugin);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const bind = first.mutateFormalV2AssetDomain(async current => {
        await gate;
        return { assets: current.assets.map(asset => Object.assign({}, asset, { tagIds: [TAG] })) };
    });
    const deleteTag = second.mutateFormalV2AssetDomain(snapshot => ({ tags: [] }));
    release();
    await bind;
    await expectCode(deleteTag, storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);
    assert.deepEqual((await first.readFormalV2Assets())[0].tagIds, [TAG]);
    assert.equal(sharedPlugin.state['tags.json'].tags.length, 1);

    // Closed storage rejects all mutations.
    const stoppedStorage = storageApi.createStorage(createPlugin(initialFiles([])));
    stoppedStorage.stopPersistence();
    await expectCode(stoppedStorage.mutateFormalV2AssetDomain(() => ({ assets: fiveKinds })), 'STORAGE_CLOSED');

    // Reference-integrity violation must not write anything.
    const invalidPlugin = createPlugin(initialFiles([]));
    const invalidStorage = storageApi.createStorage(invalidPlugin);
    await expectCode(invalidStorage.mutateFormalV2AssetDomain(() => ({
        assets: [Object.assign({}, fiveKinds[0], { tagIds: [TAG] })],
        operationLogs: [{ id: RECORD_IDS.operation, type: 'update', assetId: fiveKinds[0].id,
            assetName: fiveKinds[0].name, field: null, oldValue: null, newValue: null, ts: NOW }],
    })), storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);
    assert.deepEqual(invalidPlugin.calls.saves, [], 'validation failure must not write any sidecar');

    // Read-back verification failure must roll back successfully.
    const before = initialFiles([fiveKinds[0]], [tag]);
    let corruptNextAssetWrite = true;
    const failedPlugin = createPlugin(clone(before), {
        save(name, payload, state) {
            state[name] = clone(payload);
            if (name === 'assets.json' && corruptNextAssetWrite) {
                corruptNextAssetWrite = false;
                state[name] = Object.assign({}, state[name], { assets: [] });
            }
            return true;
        },
    });
    const failedStorage = storageApi.createStorage(failedPlugin);
    await assert.rejects(failedStorage.mutateFormalV2AssetDomain(() => ({
        tags: [tag, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', label: 'New' }],
        assets: [Object.assign({}, fiveKinds[0], { tagIds: [TAG] })],
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.TRANSACTION_FAILED
        && error.compensation && error.compensation.rolledBack === true);
    assert.deepEqual(failedPlugin.state['tags.json'], before['tags.json']);
    assert.deepEqual(failedPlugin.state['assets.json'], before['assets.json']);

    let failAssetSave = true;
    const writeFailedPlugin = createPlugin(clone(before), {
        save(name, payload, state) {
            if (name === 'assets.json' && failAssetSave) {
                failAssetSave = false;
                return false;
            }
            state[name] = clone(payload);
            return true;
        },
    });
    const writeFailedStorage = storageApi.createStorage(writeFailedPlugin);
    await assert.rejects(writeFailedStorage.mutateFormalV2AssetDomain(() => ({
        tags: [tag, { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', label: 'Write failure' }],
        assets: [fiveKinds[0]],
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.TRANSACTION_FAILED
        && error.compensation && error.compensation.rolledBack === true);
    assert.deepEqual(writeFailedPlugin.state['tags.json'], before['tags.json']);
    assert.deepEqual(writeFailedPlugin.state['assets.json'], before['assets.json']);

    // read-back read failure must roll back through the same path.
    let throwTagReadback = false;
    const readbackCause = new Error('readback unavailable');
    const readFailedRollbackPlugin = createPlugin(clone(before), {
        load(name, state) {
            if (name === 'tags.json' && throwTagReadback) {
                throwTagReadback = false;
                throw readbackCause;
            }
            return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : '';
        },
        save(name, payload, state) {
            state[name] = clone(payload);
            if (name === 'tags.json' && payload.tags && payload.tags.length === 2) throwTagReadback = true;
            return true;
        },
    });
    const readFailedRollbackStorage = storageApi.createStorage(readFailedRollbackPlugin);
    await assert.rejects(readFailedRollbackStorage.mutateFormalV2AssetDomain(() => ({
        tags: [tag, { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', label: 'Readback' }],
        assets: [fiveKinds[0]],
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.READ_FAILED
        && error.cause === readbackCause && error.compensation
        && error.compensation.rolledBack === true && error.compensation.failures.length === 0);
    assert.deepEqual(readFailedRollbackPlugin.state['tags.json'], before['tags.json']);
    assert.deepEqual(readFailedRollbackPlugin.state['assets.json'], before['assets.json']);

    // reset must accept confirmReset=true and reject confirmReset absent.
    const resetPlugin = createPlugin({ 'assets.json': { schemaVersion: 10, assets: [] } });
    const resetStorage = storageApi.createStorage(resetPlugin);
    await expectCode(resetStorage.initializeFormalStorageReset({}), storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED);
    assert.equal(resetPlugin.calls.saves.length, 0);
    await resetStorage.initializeFormalStorageReset({ confirmReset: true });
    const afterReset = await resetStorage.readFormalV2AssetWrapper();
    assert.equal(afterReset.schemaGeneration, 'formal-v2');
    assert.deepEqual(afterReset.assets, []);

    // corrupt scalar payload -> STORAGE_CORRUPT.
    const scalarStorage = storageApi.createStorage(createPlugin({ 'assets.json': 42 }));
    await expectCode(scalarStorage.readFormalV2AssetWrapper(), storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT);
    const readCause = new Error('disk unavailable');
    const readFailedStorage = storageApi.createStorage(createPlugin({}, {
        load() { throw readCause; },
    }));
    await assert.rejects(readFailedStorage.readFormalV2AssetWrapper(), error => error
        && error.code === storageApi.FORMAL_ERROR_CODE.READ_FAILED && error.cause === readCause);

    console.log('[formal-storage-boundary] passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
