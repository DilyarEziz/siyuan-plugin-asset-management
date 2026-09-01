"use strict";

const assert = require("node:assert/strict");
const { buildFormalReport, buildFormalDashboard } = require("../api/report");
const { newFormalV2Asset, createFormalV2AssetWrapper } = require("../api/assets");

const NOW = "2026-07-19T00:00:00.000Z";
const TODAY = "2026-07-19";
const ids = ["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000003","10000000-0000-4000-8000-000000000004","10000000-0000-4000-8000-000000000005","10000000-0000-4000-8000-000000000006"];
const options = { now: NOW, today: TODAY, currency: "CNY" };

function makeAsset(kind, index, extra) {
    return newFormalV2Asset(Object.assign({ id: ids[index], kind, name: kind, tagIds: [] }, extra || {}), options);
}

const physical = makeAsset("physical", 0, { details: { warrantyEndsOn: TODAY, costGoal: null } });
const subscription = makeAsset("virtualSubscription", 1, { details: { billingPlan: { cycle: "monthly" }, autoRenew: true, planName: "Plan", accountLabel: null } });
const perpetual = makeAsset("virtualPerpetual", 2, { details: { licenseAccountLabel: "lic" } });
const prepaidA = makeAsset("prepaidAmount", 3, { details: { provider: "Prov", expiresOn: null } });
const prepaidC = makeAsset("prepaidCount", 4, { details: { provider: "Cafe", expiresOn: null } });
// v2.6.2：退役实物资产——净额/日均只在役口径 + 退役回收（转让所得）独立聚合。
const retiredPhysical = makeAsset("physical", 5, { status: "retired", acquiredOn: "2026-04-01", statusChangedOn: "2026-06-30", details: { warrantyEndsOn: null, costGoal: null } });

const financialEvents = [];
financialEvents.push({ id: "20000000-0000-4000-8000-000000000001", schemaVersion: 1, assetId: physical.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "purchase", currency: "CNY", amountMinor: 50000 });
financialEvents.push({ id: "20000000-0000-4000-8000-000000000002", schemaVersion: 1, assetId: subscription.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "subscriptionPayment", currency: "CNY", amountMinor: 3000 });
financialEvents.push({ id: "20000000-0000-4000-8000-000000000003", schemaVersion: 1, assetId: perpetual.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "purchase", currency: "CNY", amountMinor: 20000 });
financialEvents.push({ id: "20000000-0000-4000-8000-000000000004", schemaVersion: 1, assetId: prepaidA.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "purchase", currency: "CNY", amountMinor: 5000 });
financialEvents.push({ id: "20000000-0000-4000-8000-000000000005", schemaVersion: 1, assetId: prepaidC.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "purchase", currency: "CNY", amountMinor: 2000 });
// 退役实物资产的购买流出与转让卖出流入（退役回收口径验证数据）。
financialEvents.push({ id: "20000000-0000-4000-8000-000000000006", schemaVersion: 1, assetId: retiredPhysical.id, occurredAt: NOW, effectiveDate: "2026-04-01", createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "purchase", currency: "CNY", amountMinor: 40000 });
financialEvents.push({ id: "20000000-0000-4000-8000-000000000007", schemaVersion: 1, assetId: retiredPhysical.id, occurredAt: NOW, effectiveDate: "2026-06-30", createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "inflow", eventType: "sale", currency: "CNY", amountMinor: 30000 });

const lifecycleEvents = [{ id: "30000000-0000-4000-8000-000000000001", schemaVersion: 1, assetId: physical.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", replacesEventId: null, voidedAt: null, kind: "created", details: {} }];

const subscriptionPeriods = [{ id: "40000000-0000-4000-8000-000000000001", schemaVersion: 1, assetId: subscription.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, kind: "billing", startDate: "2026-07-01", endDate: "2026-07-31", paymentEventId: "20000000-0000-4000-8000-000000000002" }];

const prepaidTransactions = [];
prepaidTransactions.push({ id: "50000000-0000-4000-8000-000000000001", assetId: prepaidA.id, type: "opening", dimension: "amount", direction: "inflow", effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: "", financialEventId: "20000000-0000-4000-8000-000000000004" });
prepaidTransactions.push({ id: "50000000-0000-4000-8000-000000000002", assetId: prepaidC.id, type: "opening", dimension: "count", direction: "inflow", count: 10, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: "", financialEventId: "20000000-0000-4000-8000-000000000005" });
prepaidTransactions.push({ id: "50000000-0000-4000-8000-000000000003", assetId: prepaidC.id, type: "outflow", dimension: "count", direction: "outflow", count: 2, effectiveDate: TODAY, occurredAt: NOW, createdAt: NOW, note: "", financialEventId: null });

function buildSnapshot() {
    return {
        assets: createFormalV2AssetWrapper([physical, subscription, perpetual, prepaidA, prepaidC, retiredPhysical], { updatedAt: NOW }),
        tags: { schemaVersion: 1, tags: [], updatedAt: NOW },
        financialEvents: { schemaVersion: 1, events: financialEvents, updatedAt: NOW },
        lifecycleEvents: { schemaVersion: 1, events: lifecycleEvents, updatedAt: NOW },
        subscriptionPeriods: { schemaVersion: 1, records: subscriptionPeriods, updatedAt: NOW },
        prepaidTransactions: { schemaVersion: 1, records: prepaidTransactions, updatedAt: NOW },
        maintenance: { schemaVersion: 1, records: [], updatedAt: NOW },
        wishlistEvents: { schemaVersion: 1, events: [], updatedAt: NOW },
        operationLogs: { schemaVersion: 1, logs: [], updatedAt: NOW },
        exchangeRates: { schemaVersion: 1, baseCurrency: "CNY", rates: {}, updatedAt: NOW },
    };
}

const snapshot = buildSnapshot();
const before = JSON.parse(JSON.stringify(snapshot));

const report = buildFormalReport(snapshot, { months: 6, dateFrom: "2026-03-01", endDate: TODAY }, { now: NOW });

assert.equal(report.schemaGeneration, "formal-v2");
assert.equal(report.counts.total, 6);
assert.deepEqual(Object.assign({}, report.counts.byKind), { physical: 2, virtualSubscription: 1, virtualPerpetual: 1, prepaidAmount: 1, prepaidCount: 1 });
assert.deepEqual(Object.assign({}, report.counts.byStatus), { active: 5, retired: 1 });
// recordedFinancials 保持全量口径（含退役资产）：购买流出 80000 + 退役资产购买 40000；转让流入 30000。
assert.equal(report.amounts.recordedFinancialsByCurrency.CNY.outflowAmountMinor, 120000);
assert.equal(report.amounts.recordedFinancialsByCurrency.CNY.inflowAmountMinor, 30000);
// v2.6.2 只在役口径：退役资产净成本不计入总金额，5 个在役资产净额合计保持原值 80000。
assert.equal(report.amounts.netByCurrency.CNY.netAmountMinor, 80000);
assert.equal(report.amounts.netByCurrency.CNY.assetCount, 5);
// v2.6.2 退役回收：退役资产转让流入独立聚合。
assert.equal(report.amounts.retiredSaleByCurrency.CNY.saleAmountMinor, 30000);
assert.equal(report.amounts.retiredSaleByCurrency.CNY.assetCount, 1);
assert.equal(report.amounts.retiredSaleByCurrency.CNY.currency, "CNY");
// v2.6.2 负向断言：现有用例恰好只有 CNY 一笔转让——在役资产与无转让退役资产不得产生幽灵 bucket。
assert.equal(Object.keys(report.amounts.retiredSaleByCurrency).join(","), "CNY");
// v2.6.3 次数维实付金额并入金额桶：次数卡 ¥2000 买 10 次、已用 2 次 → 摊销消费
// 400、余额 1600；金额卡余额 5000 不变。桶值 = 金额卡 + 次数卡（摊销口径）。
assert.equal(report.prepaid.amountByCurrency.CNY.balanceAmountMinor, 6600);
const firstAssetEntry = Object.values(report.prepaid.countByAsset)[0];
assert.equal(firstAssetEntry.remainingCount, 8);
assert.equal(Object.isFrozen(report), true);
assert.equal(Object.isFrozen(report.assets[0]), true);
assert.throws(function() { report.counts.total = 0; }, TypeError);
assert.equal(Object.getPrototypeOf(report.counts.byKind), null);
assert.equal(Object.getPrototypeOf(report.prepaid.countByAsset), null);
assert.deepEqual(snapshot, before, "formal report must not mutate snapshot");

// v2.6.3 订阅专属聚合：total 含退役；byState 只数在役（月付且在期 → subscribed）；
// 累计支出 = 未作废订阅付款合计；月度支出（v2.6.4 口径）= 当期付款 ÷ 当期周期
// 实际天数（含两端）× 30.4375：3000 ÷ 31 天 × 30.4375 = 2945.56… → 2946。
assert.equal(report.subscription.total, 1);
assert.equal(report.subscription.byState.subscribed, 1);
assert.equal(report.subscription.byState.trial, 0);
assert.equal(report.subscription.byState.expired, 0);
assert.equal(report.subscription.byState.pendingConfirmation, 0);
assert.equal(report.subscription.byCurrency.CNY.currency, "CNY");
assert.equal(report.subscription.byCurrency.CNY.paidAmountMinor, 3000);
assert.equal(report.subscription.byCurrency.CNY.monthlyAmountMinor, 2946); // v2.6.4：3000/31 天 × 30.4375
assert.equal(report.subscription.byCurrency.CNY.activeCount, 1);
assert.equal(report.subscription.upcomingRenewals.length, 1);
assert.equal(report.subscription.upcomingRenewals[0].assetId, subscription.id);
assert.equal(report.subscription.upcomingRenewals[0].date, "2026-08-01");
assert.equal(report.subscription.upcomingRenewals[0].amountMinor, 3000);
assert.equal(report.subscription.upcomingRenewals[0].currency, "CNY");

// v2.6.3 预付扩展：金额维 charge = 期初 + 追加，consume = 消费，利用率原始比值；
// 次数维合计；夹具 expiresOn 均为 null → 30 天内到期列表为空。
// v2.6.3 次数维实付：charge 7000 = 金额卡 5000 + 次数卡购买 2000；
// consume 400 = 次数卡摊销（2000 × 2/10）；utilization = 400/7000。
assert.equal(report.prepaid.amountByCurrency.CNY.chargeAmountMinor, 7000);
assert.equal(report.prepaid.amountByCurrency.CNY.consumeAmountMinor, 400);
assert.equal(Math.abs(report.prepaid.amountByCurrency.CNY.utilizationRate - 400 / 7000) < 1e-9, true);
assert.deepEqual(Object.assign({}, report.prepaid.countTotals), { assetCount: 1, remainingCount: 8, chargeCount: 10, consumeCount: 2 });
assert.equal(report.prepaid.expiringWithin30Days.length, 0);

const dashboard = buildFormalDashboard(snapshot, "6m", { now: NOW });
assert.equal(dashboard.schemaGeneration, "formal-v2");
assert.equal(dashboard.range, "6m");
assert.equal(dashboard.composition.byKind.prepaidAmount, 1);
assert.equal(Object.isFrozen(dashboard), true);

assert.doesNotThrow(function() { buildFormalReport({ assets: [] }, { dateFrom: TODAY, endDate: TODAY }, { now: NOW }); });

// v2.6.3 空快照：新增结构必须建好空桶/空数组，不得缺键。
const emptyReport = buildFormalReport({ assets: [] }, { dateFrom: TODAY, endDate: TODAY }, { now: NOW });
assert.equal(emptyReport.subscription.total, 0);
assert.deepEqual(Object.assign({}, emptyReport.subscription.byState), { subscribed: 0, expired: 0, pendingConfirmation: 0, trial: 0 });
assert.deepEqual(Object.keys(emptyReport.subscription.byCurrency), []);
assert.deepEqual(emptyReport.subscription.upcomingRenewals, []);
assert.deepEqual(Object.assign({}, emptyReport.prepaid.countTotals), { assetCount: 0, remainingCount: 0, chargeCount: 0, consumeCount: 0 });
assert.deepEqual(emptyReport.prepaid.expiringWithin30Days, []);
assert.equal(Object.isFrozen(emptyReport.subscription), true);

// ---------------------------------------------------------------------------
// v2.6.4 订阅月度支出按「当期周期实际天数（含两端）」摊算的专项用例。
// 每个用例使用独立最小快照，避免与主快照互相干扰。
// ---------------------------------------------------------------------------
function monthlyCaseSnapshot(periods, cycle) {
    const sub = makeAsset("virtualSubscription", 1, { details: { billingPlan: { cycle: cycle || "yearly" }, autoRenew: false, planName: "Plan", accountLabel: null } });
    const payment = { id: "20000000-0000-4000-8000-000000000002", schemaVersion: 1, assetId: sub.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, direction: "outflow", eventType: "subscriptionPayment", currency: "CNY", amountMinor: 20000 };
    const basePeriod = { id: "40000000-0000-4000-8000-000000000001", schemaVersion: 1, assetId: sub.id, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: "user", correlationId: null, note: "", metadata: {}, replacesEventId: null, voidedAt: null, kind: "billing", paymentEventId: payment.id };
    return {
        assets: createFormalV2AssetWrapper([sub], { updatedAt: NOW }),
        tags: { schemaVersion: 1, tags: [], updatedAt: NOW },
        financialEvents: { schemaVersion: 1, events: [payment], updatedAt: NOW },
        lifecycleEvents: { schemaVersion: 1, events: [], updatedAt: NOW },
        subscriptionPeriods: { schemaVersion: 1, records: periods.map(p => Object.assign({}, basePeriod, p)), updatedAt: NOW },
        prepaidTransactions: { schemaVersion: 1, records: [], updatedAt: NOW },
        maintenance: { schemaVersion: 1, records: [], updatedAt: NOW },
        wishlistEvents: { schemaVersion: 1, events: [], updatedAt: NOW },
        operationLogs: { schemaVersion: 1, logs: [], updatedAt: NOW },
        exchangeRates: { schemaVersion: 1, baseCurrency: "CNY", rates: {}, updatedAt: NOW },
    };
}
function subscriptionMonthlyOf(snapshot) {
    const r = buildFormalReport(snapshot, { months: 6, dateFrom: "2026-03-01", endDate: TODAY }, { now: NOW });
    return r.subscription.byCurrency.CNY ? r.subscription.byCurrency.CNY.monthlyAmountMinor : 0;
}

// 用例 1：年付 20000 分、实际周期 2026-01-01 → 2026-12-31（含两端 365 天）
// → 月度 = Math.round(20000 / 365 × 30.4375) = Math.round(1667.81…) = 1668。
assert.equal(subscriptionMonthlyOf(monthlyCaseSnapshot([{ startDate: "2026-01-01", endDate: "2026-12-31" }], "yearly")), 1668);

// 用例 2：cycle 名义 halfYearly（6 个月）但实际周期 364 天（2026-01-01 → 2026-12-30）
// → 按实际天数折算 = Math.round(20000 / 364 × 30.4375) = 1672，
// 不再受名义 cycle 影响（旧口径会得 20000 / 6 = 3333）。
assert.equal(subscriptionMonthlyOf(monthlyCaseSnapshot([{ startDate: "2026-01-01", endDate: "2026-12-30" }], "halfYearly")), 1672);

// 用例 3：无当期周期（周期 2026-01-01 → 2026-01-31 不覆盖 today 2026-07-19）
// → currentPeriod 为 null → 月度支出贡献 0，不新增计入。
assert.equal(subscriptionMonthlyOf(monthlyCaseSnapshot([{ startDate: "2026-01-01", endDate: "2026-01-31" }], "yearly")), 0);

// 用例 4：起止倒挂周期（startDate > endDate）在报表入口即被周期记录校验拒绝
// （startDate must not be after endDate），不可能进入月度折算；此处锁定该
// 防线不回归。月度折算内部的 periodDays ≤ 0 回落分支因此为纯防御路径。
assert.throws(function() {
    buildFormalReport(monthlyCaseSnapshot([{ startDate: "2026-07-31", endDate: "2026-07-01" }], "yearly"), { months: 6, dateFrom: "2026-03-01", endDate: TODAY }, { now: NOW });
});

console.log("[formal-report] passed");
