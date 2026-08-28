'use strict';

const assert = require('node:assert/strict');
const model = require('../api/assets');

const NOW = '2026-07-19T00:00:00.000Z';
const TODAY = '2026-07-19';
const ID = 'd1000000-0000-4000-8000-000000000001';
const asset = model.newFormalV2Asset({ id: ID, kind: 'physical', name: 'Camera', currency: 'CNY',
    acquiredOn: TODAY, statusChangedOn: TODAY, details: {} }, { now: NOW, today: TODAY });
function event(id, amountMinor, extra) {
    return model.normalizeFinancialRecord(Object.assign({ id, assetId: ID, occurredAt: NOW,
        effectiveDate: TODAY, createdAt: NOW, source: 'user', direction: 'outflow',
        eventType: 'purchase', currency: 'CNY', amountMinor }, extra || {}), { now: NOW });
}
const original = event('d2000000-0000-4000-8000-000000000001', 1000, { voidedAt: NOW });
const replacement = event('d2000000-0000-4000-8000-000000000002', 1200, { replacesEventId: original.id });
const corrected = model.projectFormalFinancials(asset, [original, replacement]);
assert.equal(corrected.acquisitionAmountMinor, 1200);
assert.equal(corrected.cashTotals.outflowAmountMinor, 1200);
assert.equal(corrected.recordedTotals.eventCount, 1);

assert.equal(model.validateFinancialReplacementChain([original, replacement]).valid, true);
assert.equal(model.validateFinancialReplacementChain([Object.assign({}, original, { voidedAt: null }), replacement]).valid, false);
assert.equal(model.validateFinancialReplacementChain([original, Object.assign({}, replacement, { eventType: 'refund', direction: 'inflow' })]).valid, false);
assert.equal(model.validateFinancialReplacementChain([original, replacement, Object.assign({}, replacement, {
    id: 'd2000000-0000-4000-8000-000000000003', amountMinor: 1300,
})]).valid, false, 'one original cannot have multiple replacements');
const cycleA = Object.assign({}, original, { replacesEventId: replacement.id });
assert.equal(model.validateFinancialReplacementChain([cycleA, replacement]).valid, false);

const ordinaryAdjustment = event('d2000000-0000-4000-8000-000000000004', 50, {
    eventType: 'adjustment', metadata: { scope: 'other' }, replacesEventId: null, voidedAt: null,
});
const acquisitionAdjustment = event('d2000000-0000-4000-8000-000000000005', 25, {
    eventType: 'adjustment', metadata: { scope: 'acquisition' }, replacesEventId: null, voidedAt: null,
});
assert.equal(model.projectFormalFinancials(asset, [original, replacement, ordinaryAdjustment]).acquisitionAmountMinor, 1200);
assert.equal(model.projectFormalFinancials(asset, [original, replacement, acquisitionAdjustment]).acquisitionAmountMinor, 1225);
assert.equal(model.validateFinancialReplacementChain([original, Object.assign({}, replacement, {
    eventType: 'adjustment', direction: 'outflow', metadata: { scope: 'acquisition' },
})]).valid, false, 'adjustment events cannot act as replacements');

const prepaid = model.newFormalV2Asset({ id: 'd1000000-0000-4000-8000-000000000002', kind: 'prepaidAmount',
    name: 'Stored value', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, details: {} }, { now: NOW, today: TODAY });
const prepaidPurchase = model.normalizeFinancialRecord({ id: 'd3000000-0000-4000-8000-000000000001', assetId: prepaid.id,
    occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user', direction: 'outflow', eventType: 'purchase',
    currency: 'CNY', amountMinor: 800 }, { now: NOW });
const prepaidOpening = model.normalizeFinancialRecord({ id: 'd3000000-0000-4000-8000-000000000002', assetId: prepaid.id,
    occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user', direction: 'inflow', eventType: 'adjustment',
    currency: 'CNY', amountMinor: 1000, metadata: { scope: 'entitlement', affectsCash: false } }, { now: NOW });
const prepaidConsume = model.normalizeFinancialRecord({ id: 'd3000000-0000-4000-8000-000000000003', assetId: prepaid.id,
    occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user', direction: 'outflow', eventType: 'prepaidConsumption',
    currency: 'CNY', amountMinor: 200, metadata: { affectsCash: false } }, { now: NOW });
const prepaidTransactions = [
    { id: 'd4000000-0000-4000-8000-000000000001', assetId: prepaid.id, type: 'opening', dimension: 'amount',
        direction: 'inflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: prepaidOpening.id },
    { id: 'd4000000-0000-4000-8000-000000000002', assetId: prepaid.id, type: 'outflow', dimension: 'amount',
        direction: 'outflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: prepaidConsume.id },
];
assert.equal(model.projectFormalPrepaid(prepaid, prepaidTransactions, [prepaidPurchase, prepaidOpening, prepaidConsume]).balanceAmountMinor, 800);
assert.throws(() => model.projectFormalPrepaid(prepaid, prepaidTransactions.concat([Object.assign({}, prepaidTransactions[0], {
    id: 'd4000000-0000-4000-8000-000000000003', type: 'inflow', direction: 'inflow',
})]), [prepaidPurchase, prepaidOpening, prepaidConsume]), /already linked/,
'one financial event cannot back multiple prepaid transactions');
const prepaidFinancials = model.projectFormalFinancials(prepaid, [prepaidPurchase, prepaidOpening, prepaidConsume]);
assert.equal(prepaidFinancials.cashTotals.outflowAmountMinor, 800);
assert.equal(prepaidFinancials.cashTotals.eventCount, 1, 'entitlement opening/consumption are not cash flow');
assert.equal(model.validateFinancialRecord(Object.assign({}, prepaidConsume, { metadata: {} })).valid, false);

const currencies = ['CNY', 'USD', 'JPY', 'KWD'];
const assets = currencies.map((currency, index) => model.newFormalV2Asset({
    id: `e1000000-0000-4000-8000-00000000000${index + 1}`, kind: 'physical', name: currency,
    currency, acquiredOn: TODAY, statusChangedOn: TODAY, details: {},
}, { now: NOW, today: TODAY }));
const events = assets.map((owner, index) => model.normalizeFinancialRecord({
    id: `e2000000-0000-4000-8000-00000000000${index + 1}`, assetId: owner.id,
    occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user', direction: 'outflow',
    eventType: 'purchase', currency: owner.currency, amountMinor: index + 1,
}, { now: NOW }));
const stats = model.computeStats(assets, events);
assert.deepEqual(Object.keys(stats.byCurrency).sort(), currencies.sort());
assert.equal(Object.hasOwn(stats, 'totalValueMinor'), false, 'home stats cannot cross-sum currencies');
const sorted = model.sortAssets([assets[1], assets[0], assets[3], assets[2]], 'priceHigh', events);
assert.deepEqual(sorted.map(item => item.currency), ['CNY', 'JPY', 'KWD', 'USD']);

const report = require('../api/report').buildFormalDashboard({ assets, financialEvents: events,
    subscriptionPeriods: [], prepaidTransactions: [], usage: [], maintenance: [], lifecycleEvents: [] }, '12m', { now: NOW });
assert.deepEqual(Object.keys(report.currencies).sort(), currencies.sort());
assert.equal(Object.hasOwn(report.currencies, 'total'), false);
assert.equal(report.currencies.JPY.amountMinor, 3);
assert.equal(report.currencies.KWD.amountMinor, 4);

console.log('[formal-financial-reviewer] passed');
