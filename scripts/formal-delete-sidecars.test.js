'use strict';

const assert = require('node:assert/strict');
const { createHarness, asset } = require('./formal-workflow-harness');
const { newFormalV2Asset } = require('../api/assets');

const IDS = {
    physical: 'b2000000-0000-4000-8000-000000000001',
    subscription: 'b2000000-0000-4000-8000-000000000002',
    prepaid: 'b2000000-0000-4000-8000-000000000003',
    retained: 'b2000000-0000-4000-8000-000000000004',
    physicalFinancial: 'b3000000-0000-4000-8000-000000000001',
    subscriptionFinancial: 'b3000000-0000-4000-8000-000000000002',
    lifecycle: 'b3000000-0000-4000-8000-000000000003',
    maintenance: 'b3000000-0000-4000-8000-000000000004',
    usage: 'b3000000-0000-4000-8000-000000000005',
    period: 'b3000000-0000-4000-8000-000000000006',
    prepaidTransaction: 'b3000000-0000-4000-8000-000000000007',
    wishlist: 'b3000000-0000-4000-8000-000000000008',
    retainedLog: 'b3000000-0000-4000-8000-000000000009',
    purchaseLog: 'b3000000-0000-4000-8000-000000000010',
    sourceWishlist: 'b2000000-0000-4000-8000-000000000099',
};
const NOW = '2026-07-19T08:00:00.000Z';
const TODAY = '2026-07-19';

async function main() {
    const physical = asset(IDS.physical, 'physical', 'Delete physical');
    const subscription = asset(IDS.subscription, 'virtualSubscription', 'Delete subscription');
    const prepaid = asset(IDS.prepaid, 'prepaidCount', 'Delete prepaid');
    const retained = asset(IDS.retained, 'physical', 'Keep');
    const sourceWishlist = newFormalV2Asset({ id: IDS.sourceWishlist, kind: 'physical', name: 'Wish source',
        status: 'wishlist', currency: 'CNY', cover: { kind: 'none' },
        wishlist: { expectedAmountMinor: 1000, reason: '', targetGroup: 'physical' } }, { now: NOW, today: TODAY });
    const h = createHarness([physical, subscription, prepaid, retained]);

    await h.plugin.storage.mutateFormalV2AssetDomain(snapshot => ({ change: {
        financialEvents: [
            { id: IDS.physicalFinancial, schemaVersion: 1, assetId: physical.id, occurredAt: NOW, effectiveDate: TODAY,
                createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null,
                voidedAt: null, direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor: 1000 },
            { id: IDS.subscriptionFinancial, schemaVersion: 1, assetId: subscription.id, occurredAt: NOW, effectiveDate: TODAY,
                createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null,
                voidedAt: null, direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 1000 },
        ],
        lifecycleEvents: [{ id: IDS.lifecycle, schemaVersion: 1, assetId: physical.id, occurredAt: NOW,
            effectiveDate: TODAY, createdAt: NOW, source: 'user', correlationId: null, note: '', replacesEventId: null,
            voidedAt: null, kind: 'created', details: {} }],
        maintenance: [{ id: IDS.maintenance, assetId: physical.id, type: 'repair', date: TODAY, note: '',
            createdAt: NOW, financialEventId: null, details: {} }],
        usage: [{ id: IDS.usage, assetId: physical.id, date: TODAY, durationMinutes: 5, action: 'use', note: '', createdAt: NOW }],
        subscriptionPeriods: [{ id: IDS.period, schemaVersion: 1, assetId: subscription.id, occurredAt: NOW,
            effectiveDate: TODAY, createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {},
            replacesEventId: null, voidedAt: null, kind: 'billing', startDate: TODAY, endDate: '2026-08-18', paymentEventId: IDS.subscriptionFinancial }],
        prepaidTransactions: [{ id: IDS.prepaidTransaction, assetId: prepaid.id, type: 'opening', dimension: 'count',
            direction: 'inflow', count: 3, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: null }],
        operationLogs: [
            { id: IDS.purchaseLog, type: 'wishlist-purchase', assetId: sourceWishlist.id, assetName: sourceWishlist.name,
                field: 'wishlist', oldValue: sourceWishlist, newValue: physical, ts: NOW },
            { id: IDS.retainedLog, type: 'update', assetId: retained.id, assetName: retained.name,
                field: null, oldValue: retained, newValue: retained, ts: NOW },
        ],
    } }));

    await h.plugin.updateAsset(physical.id, { name: 'Delete physical renamed' });

    // A valid historical purchase is retained until its target is hard-deleted,
    // then leaves with that target and its financial proof.
    await h.plugin.storage.mutateFormalV2AssetDomain(snapshot => ({ change: {
        wishlistEvents: [{ id: IDS.wishlist, eventType: 'purchased', sourceWishlistId: sourceWishlist.id,
            targetAssetId: physical.id, targetKind: 'physical', sourceTargetGroup: 'physical', occurredAt: NOW, financialEventId: IDS.physicalFinancial,
            abandonReason: '', currency: 'CNY', sourceSnapshot: sourceWishlist }],
    } }));

    // The public production API is exercised through its formal transaction
    // boundary; no private prepare helper is observed.
    for (const id of [physical.id, subscription.id, prepaid.id]) await h.plugin.deleteAsset(id);
    const committed = await h.plugin.storage.readFormalV2AssetDomainSnapshot();
    assert.deepEqual(committed.assets.map(item => item.id), [retained.id]);
    ['financialEvents', 'lifecycleEvents', 'maintenance', 'usage', 'subscriptionPeriods', 'prepaidTransactions']
        .forEach(key => assert.deepEqual(committed[key], [], `${key} records owned by deleted assets are removed`));
    assert.ok(committed.wishlistEvents.every(event => event.targetAssetId !== physical.id && event.sourceWishlistId !== physical.id),
        'hard deletion removes directly related wishlist history');
    assert.equal(committed.operationLogs.filter(log => log.type === 'delete').length, 3,
        'terminal formal delete logs remain after all owned sidecars are removed');
    assert.deepEqual(committed.operationLogs.map(log => log.assetId).sort(),
        [physical.id, physical.id, subscription.id, prepaid.id, retained.id, sourceWishlist.id].sort());
    assert.ok(committed.operationLogs.some(log => log.id === IDS.purchaseLog),
        'wishlist purchase history survives target deletion with terminal delete proof');
    assert.ok(committed.operationLogs.some(log => log.id === IDS.retainedLog),
        'unrelated formal operation history survives a hard delete');
    console.log('[formal-delete-sidecars] passed');
}

main().catch(error => { console.error('[formal-delete-sidecars] failed:', error); process.exit(1); });


