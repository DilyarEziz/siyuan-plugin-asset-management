'use strict';

/**
 * formal-v2 订阅完善 阶段 1（域 / 数据层）持久回归测试。
 *
 * 背景：阶段 1 给订阅域加了三项编辑能力 + addAsset 首期到期日覆盖，本测试把
 * 阶段 1 评审通过的 9 组断言固化下来，防止后续阶段（2a/2b/3/4）重构时回退。
 *
 * 覆盖：
 *   S1-1 addAsset opts.subscriptionPeriodEnd 覆盖首期 endDate（指定值落盘）
 *   S1-2 addAsset 不传 subscriptionPeriodEnd → getSubscriptionPeriodEnd 自动算（回归）
 *   S1-3 addAsset subscriptionPeriodEnd < startDate → throw 且未落盘
 *   S1-4 _formalRenewSubscription cycle:'yearly' → endDate 按年度 + details.billingPlan.cycle 持久化
 *   S1-5 correctSubscriptionPaymentAmount → 旧付款 void、新事件 replacesEventId、替换链 valid、
 *        周期 paymentEventId 重指、金额投影更新
 *   S1-6 updateSubscriptionStartDate → acquiredOn 更新、首期重锚、endDate 重算
 *   S1-7 updateSubscriptionStartDate 致重叠 → throw 且 assets/subscriptionPeriods/financialEvents 无变更（回滚）
 *   S1-8 updateSubscriptionPeriodEnd → 最近期 endDate 更新、旧期 void
 *   S1-9 守卫：amountMinor<=0、非法日期 throw
 *
 * 走 production 路径：addAsset / _formalRenewSubscription / correctSubscriptionPaymentAmount /
 * updateSubscriptionStartDate / updateSubscriptionPeriodEnd -> _commitAssetAuditMutation ->
 * storage.mutateFormalAssetDomain（含 assertFormalDomainSnapshot 严格校验）。
 */

const assert = require('node:assert/strict');
const { createHarness } = require('./formal-workflow-harness.js');
const { createStableId } = require('../api/algorithms.js');
const { getSubscriptionPeriodEnd, validateFinancialReplacementChain, projectFormalFinancials } = require('../api/assets.js');

/** 虚拟订阅 dto（formal-v2 白名单：planName / accountLabel / billingPlan / autoRenew）。 */
function subDto(overrides) {
    return Object.assign({
        kind: 'virtualSubscription', name: '订阅测试', status: 'active', currency: 'CNY',
        acquiredOn: '2026-01-01', statusChangedOn: '2026-01-01', tagIds: [], cover: { kind: 'none' },
        notes: '', details: { billingPlan: { cycle: 'monthly' }, autoRenew: false, planName: 'Pro', accountLabel: null },
    }, overrides || {});
}

/** 通过 addAsset 创建订阅（带首期付款 + billing 周期），返回创建后的资产。 */
async function createSub(h, dtoOverrides, opts) {
    const purchase = Object.assign({ purchaseAmountMinor: 1000 }, opts || {});
    const created = await h.plugin.addAsset(subDto(dtoOverrides), purchase);
    assert.equal(h.plugin.toasts.length, 0, 'addAsset must not raise an error toast: ' + h.plugin.toasts.join(' | '));
    assert.ok(created && created.id, 'subscription asset must be created');
    return created;
}

const activePeriods = (h, id) => (h.plugin._subscriptionPeriods || []).filter(p => p && p.assetId === id && !p.voidedAt);
const activePayments = (h, id) => (h.plugin._financialEvents || []).filter(e => e && e.assetId === id && !e.voidedAt && e.eventType === 'subscriptionPayment');

(async () => {
    // S1-1 — addAsset subscriptionPeriodEnd 覆盖首期 endDate
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }, { subscriptionPeriodEnd: '2026-02-15' });
        const periods = activePeriods(h, created.id);
        assert.equal(periods.length, 1, 'S1-1 exactly one active billing period');
        assert.equal(periods[0].startDate, '2026-01-01', 'S1-1 period startDate = acquiredOn');
        assert.equal(periods[0].endDate, '2026-02-15', 'S1-1 period endDate = opts.subscriptionPeriodEnd override');
        assert.equal(periods[0].kind, 'billing', 'S1-1 period kind = billing');
    }

    // S1-2 — addAsset 不传 subscriptionPeriodEnd → 自动算（回归）
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' });
        const periods = activePeriods(h, created.id);
        assert.equal(periods.length, 1, 'S1-2 exactly one active billing period');
        assert.equal(periods[0].endDate, getSubscriptionPeriodEnd('2026-01-01', 'monthly'), 'S1-2 endDate auto-computed (monthly inclusive)');
        assert.equal(periods[0].endDate, '2026-01-31', 'S1-2 monthly 2026-01-01 → 2026-01-31');
    }

    // S1-3 — addAsset subscriptionPeriodEnd < startDate → throw 且未落盘
    {
        const h = createHarness([]);
        await assert.rejects(
            () => h.plugin.addAsset(subDto({ acquiredOn: '2026-01-01' }), { purchaseAmountMinor: 1000, subscriptionPeriodEnd: '2025-12-31' }),
            /subscriptionPeriodEnd must not be before startDate/,
            'S1-3 endDate before startDate must throw'
        );
        assert.equal(h.plugin.assets.length, 0, 'S1-3 no asset persisted on throw');
        assert.equal((h.plugin._subscriptionPeriods || []).length, 0, 'S1-3 no period persisted on throw');
        assert.equal((h.plugin._financialEvents || []).length, 0, 'S1-3 no financial event persisted on throw');
    }

    // S1-4 — _formalRenewSubscription cycle:'yearly' → endDate 按年度 + details.billingPlan.cycle 持久化
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }); // 首期 [2026-01-01, 2026-01-31]
        const renewed = await h.plugin._formalRenewSubscription(created.id, { startDate: '2026-02-01', cycle: 'yearly', amountMinor: 9900 });
        assert.equal(h.plugin.toasts.length, 0, 'S1-4 renew must not toast error: ' + h.plugin.toasts.join(' | '));
        assert.equal(renewed.details.billingPlan.cycle, 'yearly', 'S1-4 details.billingPlan.cycle persisted as yearly');
        const periods = activePeriods(h, created.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
        assert.equal(periods.length, 2, 'S1-4 two active billing periods after renew');
        const renewedPeriod = periods[1];
        assert.equal(renewedPeriod.startDate, '2026-02-01', 'S1-4 renewed period startDate');
        assert.equal(renewedPeriod.endDate, getSubscriptionPeriodEnd('2026-02-01', 'yearly'), 'S1-4 renewed endDate computed with yearly cycle');
        assert.equal(renewedPeriod.endDate, '2027-01-31', 'S1-4 yearly 2026-02-01 → 2027-01-31');
        const payments = activePayments(h, created.id);
        assert.ok(payments.some(e => e.amountMinor === 9900), 'S1-4 renew payment 99.00 persisted');
    }

    // S1-5 — correctSubscriptionPaymentAmount → void + replace + 替换链 + 周期重指 + 金额投影
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }, { purchaseAmountMinor: 1000 }); // 首期付款 10.00
        const beforePayments = activePayments(h, created.id);
        assert.equal(beforePayments.length, 1, 'S1-5 one active payment before correction');
        const oldPayment = beforePayments[0];
        await h.plugin.correctSubscriptionPaymentAmount(created.id, { amountMinor: 2500 });
        assert.equal(h.plugin.toasts.length, 0, 'S1-5 correction must not toast error: ' + h.plugin.toasts.join(' | '));
        // 旧付款被 void
        const voidedOld = (h.plugin._financialEvents || []).find(e => e.id === oldPayment.id);
        assert.ok(voidedOld && voidedOld.voidedAt, 'S1-5 old payment is voided');
        // 新事件 replacesEventId 指向旧事件，未 void
        const newPayments = activePayments(h, created.id);
        assert.equal(newPayments.length, 1, 'S1-5 exactly one active payment after correction');
        const replacement = newPayments[0];
        assert.equal(replacement.amountMinor, 2500, 'S1-5 replacement amountMinor = 25.00');
        assert.equal(replacement.replacesEventId, oldPayment.id, 'S1-5 replacement replacesEventId points to old payment');
        assert.equal(replacement.voidedAt, null, 'S1-5 replacement is active');
        // 替换链 valid
        const chain = validateFinancialReplacementChain(h.plugin._financialEvents || []);
        assert.equal(chain.valid, true, 'S1-5 financial replacement chain valid: ' + chain.errors.join('; '));
        // 周期 paymentEventId 重指到替换事件
        const period = activePeriods(h, created.id)[0];
        assert.equal(period.paymentEventId, replacement.id, 'S1-5 period paymentEventId re-pointed to replacement');
        // 金额投影更新（voided 旧付款被排除）
        const fin = projectFormalFinancials(created, (h.plugin._financialEvents || []).filter(e => e.assetId === created.id));
        assert.equal(fin.acquisitionAmountMinor, 2500, 'S1-5 acquisition projection updated to 25.00');
        assert.equal(fin.cashTotals.outflowAmountMinor, 2500, 'S1-5 cash outflow projection updated to 25.00');
    }

    // S1-6 — updateSubscriptionStartDate → acquiredOn 更新 + 首期重锚 + endDate 重算
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }); // 首期 [2026-01-01, 2026-01-31]
        const beforePeriod = activePeriods(h, created.id)[0];
        await h.plugin.updateSubscriptionStartDate(created.id, { startDate: '2026-03-05' });
        assert.equal(h.plugin.toasts.length, 0, 'S1-6 start-date update must not toast error: ' + h.plugin.toasts.join(' | '));
        const updated = h.plugin.assets.find(a => a.id === created.id);
        assert.equal(updated.acquiredOn, '2026-03-05', 'S1-6 acquiredOn re-anchored');
        const periods = activePeriods(h, created.id);
        assert.equal(periods.length, 1, 'S1-6 still one active period after re-anchor');
        assert.equal(periods[0].startDate, '2026-03-05', 'S1-6 period startDate re-anchored');
        assert.equal(periods[0].endDate, getSubscriptionPeriodEnd('2026-03-05', 'monthly'), 'S1-6 period endDate recomputed');
        assert.equal(periods[0].endDate, '2026-04-04', 'S1-6 monthly 2026-03-05 → 2026-04-04');
        const voidedOld = (h.plugin._subscriptionPeriods || []).find(p => p.id === beforePeriod.id);
        assert.ok(voidedOld && voidedOld.voidedAt, 'S1-6 old period voided');
        assert.equal(periods[0].replacesEventId, beforePeriod.id, 'S1-6 replacement replacesEventId points to old period');
    }

    // S1-7 — updateSubscriptionStartDate 致重叠 → throw 且三者 JSON 无变更（回滚）
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }); // 首期 [2026-01-01, 2026-01-31]
        await h.plugin._formalRenewSubscription(created.id, { startDate: '2026-02-01', amountMinor: 1000 }); // 二期 [2026-02-01, 2026-02-28]
        const assetsBefore = JSON.stringify(h.state['assets.json']);
        const periodsBefore = JSON.stringify(h.state['subscriptionPeriods.json']);
        const financialBefore = JSON.stringify(h.state['financialEvents.json']);
        // 把首期重锚到 2026-02-15 → 新首期 [2026-02-15, 2026-03-14] 与二期 [2026-02-01, 2026-02-28] 重叠
        await assert.rejects(
            () => h.plugin.updateSubscriptionStartDate(created.id, { startDate: '2026-02-15' }),
            /overlaps an existing billing period/,
            'S1-7 overlap must throw'
        );
        assert.equal(JSON.stringify(h.state['assets.json']), assetsBefore, 'S1-7 assets.json unchanged on rollback');
        assert.equal(JSON.stringify(h.state['subscriptionPeriods.json']), periodsBefore, 'S1-7 subscriptionPeriods.json unchanged on rollback');
        assert.equal(JSON.stringify(h.state['financialEvents.json']), financialBefore, 'S1-7 financialEvents.json unchanged on rollback');
    }

    // S1-8 — updateSubscriptionPeriodEnd → 最近期 endDate 更新 + 旧期 void
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' }); // 首期 [2026-01-01, 2026-01-31]
        const beforePeriod = activePeriods(h, created.id)[0];
        await h.plugin.updateSubscriptionPeriodEnd(created.id, { endDate: '2026-02-10' });
        assert.equal(h.plugin.toasts.length, 0, 'S1-8 period-end update must not toast error: ' + h.plugin.toasts.join(' | '));
        const periods = activePeriods(h, created.id);
        assert.equal(periods.length, 1, 'S1-8 still one active period after edit');
        assert.equal(periods[0].startDate, '2026-01-01', 'S1-8 startDate preserved');
        assert.equal(periods[0].endDate, '2026-02-10', 'S1-8 endDate updated');
        assert.equal(periods[0].replacesEventId, beforePeriod.id, 'S1-8 replacement replacesEventId points to old period');
        const voidedOld = (h.plugin._subscriptionPeriods || []).find(p => p.id === beforePeriod.id);
        assert.ok(voidedOld && voidedOld.voidedAt, 'S1-8 old period voided');
        assert.equal(periods[0].paymentEventId, beforePeriod.paymentEventId, 'S1-8 paymentEventId preserved');
    }

    // S1-9 — 守卫：amountMinor<=0、非法日期 throw
    {
        const h = createHarness([]);
        const created = await createSub(h, { acquiredOn: '2026-01-01' });
        // amountMinor <= 0
        await assert.rejects(() => h.plugin.correctSubscriptionPaymentAmount(created.id, { amountMinor: 0 }), /invalid subscription payment amount/, 'S1-9 amountMinor=0 must throw');
        await assert.rejects(() => h.plugin.correctSubscriptionPaymentAmount(created.id, { amountMinor: -5 }), /invalid subscription payment amount/, 'S1-9 amountMinor<0 must throw');
        // 非法日期（格式不合法）
        await assert.rejects(() => h.plugin.updateSubscriptionStartDate(created.id, { startDate: 'not-a-date' }), /invalid subscription start date/, 'S1-9 invalid startDate must throw');
        await assert.rejects(() => h.plugin.updateSubscriptionPeriodEnd(created.id, { endDate: 'bad' }), /invalid subscription period end date/, 'S1-9 invalid endDate format must throw');
        // endDate 早于该期 startDate
        await assert.rejects(() => h.plugin.updateSubscriptionPeriodEnd(created.id, { endDate: '2025-12-31' }), /must not be before its start date/, 'S1-9 endDate before startDate must throw');
        // addAsset subscriptionPeriodEnd 非法格式
        await assert.rejects(
            () => h.plugin.addAsset(subDto({ acquiredOn: '2026-01-01', id: createStableId() }), { purchaseAmountMinor: 1000, subscriptionPeriodEnd: 'not-a-date' }),
            /invalid subscriptionPeriodEnd/,
            'S1-9 addAsset invalid subscriptionPeriodEnd format must throw'
        );
    }

    // S1-10 — halfYearly 周期沿用 inclusive end-date 口径（+6 个月 - 1 天）
    {
        const h = createHarness([]);
        const created = await createSub(h, {
            acquiredOn: '2026-01-01',
            details: { billingPlan: { cycle: 'halfYearly' }, autoRenew: false, planName: 'Half year', accountLabel: null },
        });
        const period = activePeriods(h, created.id)[0];
        assert.equal(period.endDate, getSubscriptionPeriodEnd('2026-01-01', 'halfYearly'), 'S1-10 halfYearly end date computed');
        assert.equal(period.endDate, '2026-06-30', 'S1-10 2026-01-01 halfYearly → 2026-06-30');
    }

    console.log('[formal-subscription-stage1] passed');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
