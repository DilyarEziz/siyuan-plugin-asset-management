'use strict';

const assert = require('node:assert/strict');
const model = require('../api/assets');

const TODAY = '2026-07-19';
const NOW = '2026-07-19T00:00:00.000Z';
const IDS = {
    physical: '10000000-0000-4000-8000-000000000001',
    subscription: '10000000-0000-4000-8000-000000000002',
    perpetual: '10000000-0000-4000-8000-000000000003',
    amount: '10000000-0000-4000-8000-000000000004',
    count: '10000000-0000-4000-8000-000000000005',
};

function formal(kind, id, details, overrides) {
    return model.newFormalV2Asset(Object.assign({
        id, kind, name: kind, status: 'active', currency: kind === 'prepaidAmount' ? 'USD' : 'CNY',
        acquiredOn: '2026-01-01', statusChangedOn: '2026-01-01',
        details: details || {},
    }, overrides || {}), { now: NOW, today: TODAY });
}

const assets = {
    physical: formal('physical', IDS.physical, {
        warrantyEndsOn: '2027-01-01',
        costGoal: { targetDailyAmountMinor: 100, targetEndsOn: null },
    }),
    subscription: formal('virtualSubscription', IDS.subscription, {
        billingPlan: { cycle: 'monthly' }, autoRenew: true,
    }),
    perpetual: formal('virtualPerpetual', IDS.perpetual, {
        licenseAccountLabel: 'license@example.test',
    }),
    amount: formal('prepaidAmount', IDS.amount, { expiresOn: '2026-07-25' }),
    count: formal('prepaidCount', IDS.count, { expiresOn: null }),
};

assert.equal(model.isFormalKind('physical'), true);
assert.equal(model.isFormalKind('virtual'), false);
assert.equal(model.getFormalKind(assets.subscription), 'virtualSubscription');
assert.equal(model.getFormalDisplayGroup(assets.subscription), 'virtual');
assert.equal(model.getFormalDisplayGroup(assets.amount), 'prepaid');
assert.equal(model.getFormalAcquiredOn(assets.physical), '2026-01-01');
assert.equal(model.getFormalWarrantyEndsOn(assets.physical), '2027-01-01');
assert.equal(model.getFormalWarrantyEndsOn(assets.perpetual), null);
assert.equal(model.getFormalExpiryOn(assets.amount), '2026-07-25');
assert.deepEqual(model.getFormalNextImportantDate(assets.amount), { date: '2026-07-25', type: 'prepaidExpiry' });
assert.equal(model.supportsFormalCostGoal(assets.perpetual), false);
const perpetualWithoutGoal = formal('virtualPerpetual', '10000000-0000-4000-8000-000000000006', {});
assert.equal(model.supportsFormalCostGoal(perpetualWithoutGoal), false, 'buy-once assets do not support cost goals');
assert.equal(model.projectFormalCostGoal(perpetualWithoutGoal, TODAY), null);

function period(id, startDate, endDate, kind) {
    return model.normalizeSubscriptionPeriodRecord({
        id, assetId: IDS.subscription, occurredAt: NOW, effectiveDate: startDate, createdAt: NOW,
        source: 'user', kind: kind || 'billing', startDate, endDate,
        paymentEventId: (kind || 'billing') === 'billing' ? '22000000-0000-4000-8000-000000000001' : null,
    }, { now: NOW });
}

const trial = period('20000000-0000-4000-8000-000000000001', '2026-07-01', '2026-07-20', 'trial');
let subscription = model.projectFormalSubscription(assets.subscription, [trial], TODAY);
assert.equal(subscription.state, 'subscribed');
assert.equal(subscription.isTrial, true);
assert.equal(subscription.plannedRenewalDate, '2026-07-21');
assert.equal(model.getFormalExpiryOn(assets.subscription, [trial], TODAY), '2026-07-20');
assert.deepEqual(model.getFormalNextImportantDate(assets.subscription, [trial], TODAY), { date: '2026-07-20', type: 'subscriptionExpiry' });
assert.deepEqual(model.getFormalNextImportantDate(assets.physical), { date: '2027-01-01', type: 'warranty' });

subscription = model.projectFormalSubscription(assets.subscription, [trial], '2026-07-22');
assert.equal(subscription.state, 'pendingConfirmation');
assert.equal(subscription.isTrial, false, 'historical trial must not project current trial state');
assert.equal(subscription.latestPeriodWasTrial, true);
assert.equal(subscription.latestPeriod.endDate, '2026-07-20');
const noPeriod = model.projectFormalSubscription(assets.subscription, [], TODAY);
assert.equal(noPeriod.state, 'pendingConfirmation');
assert.equal(noPeriod.plannedRenewalDate, null);
assert.equal(noPeriod.indeterminate, true);
const billing = period('20000000-0000-4000-8000-000000000002', '2026-07-21', '2026-08-20', 'billing');
subscription = model.projectFormalSubscription(assets.subscription, [trial, billing], '2026-07-22');
assert.equal(subscription.isTrial, false, 'billing after trial is not a trial');
assert.equal(subscription.latestPeriodWasTrial, false);
const voidedBilling = Object.assign({}, billing, { voidedAt: '2026-07-21T12:00:00.000Z' });
subscription = model.projectFormalSubscription(assets.subscription, [trial, voidedBilling], '2026-07-22');
assert.equal(subscription.state, 'pendingConfirmation');
assert.equal(subscription.latestPeriodWasTrial, true);
assert.throws(() => model.projectFormalSubscription(assets.subscription, [Object.assign({}, trial, { assetId: IDS.perpetual })], TODAY), /must equal asset.id/);

const amountTransactions = [
    { id: '70000000-0000-4000-8000-000000000001', assetId: IDS.amount, type: 'opening', dimension: 'amount', direction: 'inflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: '71000000-0000-4000-8000-000000000001' },
    { id: '70000000-0000-4000-8000-000000000002', assetId: IDS.amount, type: 'inflow', dimension: 'amount', direction: 'inflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: '71000000-0000-4000-8000-000000000002' },
    { id: '70000000-0000-4000-8000-000000000003', assetId: IDS.amount, type: 'outflow', dimension: 'amount', direction: 'outflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: '71000000-0000-4000-8000-000000000003' },
    { id: '70000000-0000-4000-8000-000000000004', assetId: IDS.amount, type: 'adjust', dimension: 'amount', direction: 'outflow', effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '', financialEventId: '71000000-0000-4000-8000-000000000004' },
];
const amountFinancialEvents = [
    financial(IDS.amount, 'USD', 'outflow', 1000, 'purchase', '71000000-0000-4000-8000-000000000001'),
    financial(IDS.amount, 'USD', 'outflow', 500, 'prepaidCharge', '71000000-0000-4000-8000-000000000002'),
    financial(IDS.amount, 'USD', 'outflow', 300, 'prepaidConsumption', '71000000-0000-4000-8000-000000000003'),
    financial(IDS.amount, 'USD', 'outflow', 50, 'adjustment', '71000000-0000-4000-8000-000000000004'),
];
const amountBefore = structuredClone(amountTransactions);
const amountProjection = model.projectFormalPrepaid(assets.amount, amountTransactions, amountFinancialEvents);
assert.deepEqual(amountProjection, {
    dimension: 'amount', currency: 'USD', openingAmountMinor: 1000, inflowAmountMinor: 500,
    outflowAmountMinor: 300, adjustAmountMinor: -50, balanceAmountMinor: 1150, transactionCount: 4,
});
assert.deepEqual(amountTransactions, amountBefore, 'prepaid projection must not mutate records');

const countProjection = model.projectFormalPrepaid(assets.count, [
    { id: '70000000-0000-4000-8000-000000000005', assetId: IDS.count, type: 'opening', dimension: 'count', direction: 'inflow', count: 10, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '' },
    { id: '70000000-0000-4000-8000-000000000006', assetId: IDS.count, type: 'outflow', dimension: 'count', direction: 'outflow', count: 3, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '' },
]);
assert.equal(countProjection.remainingCount, 7);
assert.throws(() => model.projectFormalPrepaid(assets.count, [
    { id: '70000000-0000-4000-8000-000000000007', assetId: IDS.count, type: 'opening', dimension: 'count', direction: 'inflow', count: 1, amountMinor: 1, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: '' },
]), /unknown field/);
assert.throws(() => model.projectFormalPrepaid(assets.amount, [Object.assign({}, amountTransactions[0], { assetId: IDS.count })], amountFinancialEvents), /must equal asset.id/);
assert.throws(() => model.projectFormalPrepaid(assets.amount, [Object.assign({}, amountTransactions[0], { direction: undefined })], amountFinancialEvents), /direction is invalid/);
assert.throws(() => model.projectFormalPrepaid(assets.amount, [Object.assign({}, amountTransactions[0], { amountMinor: 1 })], amountFinancialEvents), /unknown field/);

const usage = [{ id: '80000000-0000-4000-8000-000000000001', assetId: IDS.physical, date: '2026-07-01', durationMinutes: 10, action: 'historical', note: '', createdAt: NOW }];
assert.equal(model.validateFormalUsageRecord(usage[0], assets.physical).valid, true, 'legacy usage stays readable but is not projected');
assert.throws(() => model.projectFormalFinancials(assets.physical, [financial(IDS.perpetual, 'CNY', 'outflow', 1, 'purchase', '30000000-0000-4000-8000-000000000099')]), /must equal asset.id/);

function financial(assetId, currency, direction, amountMinor, eventType, id) {
    return model.normalizeFinancialRecord({
        id, assetId, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user',
        direction, eventType, currency, amountMinor,
        metadata: eventType === 'prepaidConsumption' || eventType === 'adjustment' ? { affectsCash: false } : {},
    }, { now: NOW });
}
const financialEvents = [
    financial(IDS.physical, 'CNY', 'outflow', 10000, 'purchase', '30000000-0000-4000-8000-000000000001'),
    financial(IDS.physical, 'CNY', 'outflow', 500, 'maintenance', '30000000-0000-4000-8000-000000000002'),
    financial(IDS.physical, 'CNY', 'inflow', 1000, 'income', '30000000-0000-4000-8000-000000000003'),
    financial(IDS.physical, 'USD', 'outflow', 999, 'purchase', '30000000-0000-4000-8000-000000000004'),
    financial(IDS.perpetual, 'CNY', 'outflow', 777, 'purchase', '30000000-0000-4000-8000-000000000005'),
];
const physicalFinancialEvents = financialEvents.filter(event => event.assetId === IDS.physical);
assert.throws(() => model.projectFormalFinancials(assets.physical, physicalFinancialEvents), error => {
    assert.equal(error.code, 'FORMAL_ASSET_INVALID');
    assert.match(error.message, /financialEvents\[3\]\.currency is USD; expected owner currency CNY/);
    return true;
});
const matchingFinancialEvents = physicalFinancialEvents.filter(event => event.currency === assets.physical.currency);
const financialProjection = model.projectFormalFinancials(assets.physical, matchingFinancialEvents);
assert.equal(financialProjection.acquisitionAmountMinor, 10000, 'purchase events define acquisition truth');
assert.deepEqual(financialProjection.recordedTotals, {
    inflowAmountMinor: 1000, outflowAmountMinor: 10500, netAmountMinor: 9500, eventCount: 3,
});

const card = model.projectFormalAsset(assets.physical, { usage, financialEvents: matchingFinancialEvents }, TODAY);
assert.equal(card.kind, 'physical');
assert.equal(card.acquisition.amountMinor, 10000);
assert.deepEqual(card.tagIds, []);
['assetType', 'type', 'category', 'price', 'tags'].forEach(key => assert.equal(Object.hasOwn(card, key), false));
assert.equal(card.costGoal.achieved, true);
assert.equal(Object.hasOwn(card, 'usageTrackingEnabled'), false);
assert.equal(Object.hasOwn(card, 'usage'), false);
assert.throws(() => model.projectFormalAsset(Object.assign({}, assets.physical, { category: 'legacy' }), {}, TODAY), /canonical formal-v2/);

/* ===== Stage 5: SPEC B 目标日均价对比 B1-B8 ===== */

// Helper: create a physical asset with costGoal for B-tests
function physicalWithGoal(id, acquiredOn, goalDetails, overrides) {
    return model.newFormalV2Asset(Object.assign({
        id, kind: 'physical', name: 'goal-test', status: 'active', currency: 'CNY',
        acquiredOn, statusChangedOn: acquiredOn,
        details: { costGoal: goalDetails },
    }, overrides || {}), { now: NOW, today: TODAY });
}
function goalFinancial(assetId, amountMinor, id) {
    return model.normalizeFinancialRecord({
        id, assetId, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user',
        direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor,
        metadata: {},
    }, { now: NOW });
}

// B1: N=¥1000 (100000 minor), 今天购入, T=¥5 (500 minor)
// elapsedDays=1, currentDaily=100000, D_target=200, daysToTarget=199, targetDate=acquiredOn+199
const b1Asset = physicalWithGoal('b1000000-0000-4000-8000-000000000001', TODAY, { targetDailyAmountMinor: 500, targetEndsOn: null });
const b1Fin = [goalFinancial(b1Asset.id, 100000, 'b1f00000-0000-4000-8000-000000000001')];
const b1 = model.projectFormalCostGoal(b1Asset, TODAY, b1Fin);
assert.equal(b1.currentDailyAmountMinor, 100000, 'B1 currentDaily = ceil(100000/1)');
assert.equal(b1.achieved, false, 'B1 not achieved');
assert.equal(b1.daysToTarget, 199, 'B1 daysToTarget = ceil(100000/500) - 1 = 199');
assert.equal(b1.targetDate, model.addBusinessDays(TODAY, 199), 'B1 targetDate = acquiredOn + 199 days');
assert.equal(b1.targetDate, '2027-02-03', 'B1 targetDate exact');

// B2: 已过 200 天 → achieved, daysToTarget=0
const b2Asset = physicalWithGoal('b2000000-0000-4000-8000-000000000001', '2026-01-01', { targetDailyAmountMinor: 500, targetEndsOn: null });
const b2Fin = [goalFinancial(b2Asset.id, 100000, 'b2f00000-0000-4000-8000-000000000001')];
const b2 = model.projectFormalCostGoal(b2Asset, TODAY, b2Fin);
assert.equal(b2.currentDailyAmountMinor, 500, 'B2 currentDaily = ceil(100000/200)');
assert.equal(b2.achieved, true, 'B2 achieved (500 <= 500)');
assert.equal(b2.daysToTarget, 0, 'B2 daysToTarget = 0');
assert.equal(b2.targetDate, '2026-07-19', 'B2 targetDate = acquiredOn + 199 = today');

// B3: T 高于当前日均 → achieved
const b3Asset = physicalWithGoal('b3000000-0000-4000-8000-000000000001', '2026-01-01', { targetDailyAmountMinor: 1000, targetEndsOn: null });
const b3Fin = [goalFinancial(b3Asset.id, 100000, 'b3f00000-0000-4000-8000-000000000001')];
const b3 = model.projectFormalCostGoal(b3Asset, TODAY, b3Fin);
assert.equal(b3.currentDailyAmountMinor, 500, 'B3 currentDaily = 500');
assert.equal(b3.achieved, true, 'B3 achieved (500 <= 1000)');
assert.equal(b3.daysToTarget, 0, 'B3 daysToTarget = 0 (already past D_target)');

// B4: N=0 → achieved, targetDate=null, 不崩
const b4Asset = physicalWithGoal('b4000000-0000-4000-8000-000000000001', '2026-01-01', { targetDailyAmountMinor: 500, targetEndsOn: null });
const b4 = model.projectFormalCostGoal(b4Asset, TODAY, []);
assert.equal(b4.currentDailyAmountMinor, 0, 'B4 currentDaily = 0');
assert.equal(b4.achieved, true, 'B4 achieved (0 <= 500)');
assert.equal(b4.daysToTarget, 0, 'B4 daysToTarget = 0');
assert.equal(b4.targetDate, null, 'B4 targetDate = null (N<=0)');

// B5: 无 costGoal / 虚拟 / wishlist → null
assert.equal(model.projectFormalCostGoal(assets.subscription, TODAY, []), null, 'B5 virtual → null');
assert.equal(model.projectFormalCostGoal(assets.perpetual, TODAY, []), null, 'B5 perpetual → null');
const b5Wishlist = model.newFormalV2Asset({
    id: 'b5000000-0000-4000-8000-000000000001', kind: 'physical', name: 'wish', status: 'wishlist', currency: 'CNY',
}, { now: NOW, today: TODAY });
assert.equal(model.projectFormalCostGoal(b5Wishlist, TODAY, []), null, 'B5 wishlist → null');
const b5NoGoal = model.newFormalV2Asset({
    id: 'b5000000-0000-4000-8000-000000000002', kind: 'physical', name: 'no-goal', status: 'active', currency: 'CNY',
    acquiredOn: '2026-01-01', statusChangedOn: '2026-01-01', details: {},
}, { now: NOW, today: TODAY });
assert.equal(model.projectFormalCostGoal(b5NoGoal, TODAY, []), null, 'B5 no costGoal → null');

// B6: targetEndsOn 早于 targetDate → 晚于提示数据条件成立
const b6Asset = physicalWithGoal('b6000000-0000-4000-8000-000000000001', TODAY, { targetDailyAmountMinor: 500, targetEndsOn: '2026-12-31' });
const b6Fin = [goalFinancial(b6Asset.id, 100000, 'b6f00000-0000-4000-8000-000000000001')];
const b6 = model.projectFormalCostGoal(b6Asset, TODAY, b6Fin);
assert.equal(b6.achieved, false, 'B6 not achieved');
assert.ok(b6.targetDate > b6.targetEndsOn, 'B6 targetDate (' + b6.targetDate + ') > targetEndsOn (' + b6.targetEndsOn + ') → late warning condition');

// B7: 既有字段不回归
assert.equal(b1.targetDailyAmountMinor, 500, 'B7 targetDailyAmountMinor preserved');
assert.equal(b1.targetEndsOn, null, 'B7 targetEndsOn preserved');
assert.equal(typeof b1.currentDailyAmountMinor, 'number', 'B7 currentDailyAmountMinor is number');
assert.equal(typeof b1.achieved, 'boolean', 'B7 achieved is boolean');
assert.equal(b6.targetEndsOn, '2026-12-31', 'B7 targetEndsOn preserved with value');

// B8: 与 report.risks.costGoal 分桶一致（achieved → achieved bucket, !achieved → pending bucket）
assert.equal(b1.achieved, false, 'B8 b1 → pending bucket');
assert.equal(b2.achieved, true, 'B8 b2 → achieved bucket');
assert.equal(b4.achieved, true, 'B8 b4 (N=0) → achieved bucket');
// report.js line 449: card.costGoal.achieved ? 'achieved' : 'pending' — projection achieved field is the single truth

console.log('[formal-projection] passed');
