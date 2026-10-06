'use strict';

/**
 * v2.6.8 回归测试（续订周期可编辑可删除 + 续订后到期日展示修正 + 手机端下拉修复）：
 *   1. 提前续订（存在 startDate 晚于今天的未来周期）→ 到期日投影取最新周期 endDate：
 *      getFormalExpiryOn / projectFormalAsset.expiryOn / getFormalNextImportantDate 同步；
 *      无未来周期时保持当期 endDate 旧口径不变。
 *   2. 列表卡：renewedAhead 徽章保持「已续订」；详情卡到期日行显示最新周期 endDate。
 *   3. 订阅历程逐期操作：每期渲染「编辑」；「删除」仅渲染在最新一期且共 ≥2 期时。
 *   4. updateSubscriptionPeriod：改起止日期 void-and-replace；与相邻周期重叠 throw 回滚。
 *   5. deleteSubscriptionPeriod：删最新一期 + 同事务作废其付款（净成本回退）；
 *      拒绝删非最新一期；仅剩一期时拒绝删除；opLog type 'subscription-period-delete'
 *      通过存储校验（readFormalV2DomainSnapshot 不抛）。
 *   6. prepaid-delete 白名单补录：deleteFormalWorkflowRecord('prepaid') 不再因
 *      operationLogs[].type is invalid 失败（v2.6.3 起的潜在缺陷）。
 *   7. 手机端下拉：_placeAmFloatingPanel 统一放置（视口钳制 + 空间不足翻上方），
 *      玻璃下拉与日期面板 open/重定位/外点关闭（pointerdown）均接新逻辑；CSS max-width 钳制。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./formal-workflow-harness');
const {
    newFormalV2Asset, normalizeSubscriptionPeriodRecord, normalizeFinancialRecord,
    projectFormalAsset, getFormalExpiryOn, getFormalNextImportantDate,
} = require('../api/assets');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');

function dateKeyOffset(days) {
    const date = new Date(Date.now() + days * 86400000);
    return date.toISOString().slice(0, 10);
}

const NOW = new Date().toISOString();
const SUB_ID = 'e2000000-0000-4000-8000-000000000001';
const PERIOD_A_ID = 'e3000000-0000-4000-8000-000000000001';
const PERIOD_B_ID = 'e3000000-0000-4000-8000-000000000002';
const PAY_A_ID = 'e4000000-0000-4000-8000-000000000001';
const PAY_B_ID = 'e4000000-0000-4000-8000-000000000002';

function subscriptionAsset(id) {
    return newFormalV2Asset({
        id, kind: 'virtualSubscription', name: 'Sub ' + id.slice(-4), status: 'active', currency: 'CNY',
        acquiredOn: dateKeyOffset(-40), statusChangedOn: dateKeyOffset(-40), tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: NOW, updatedAt: NOW,
        details: { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: true },
    });
}

function payment(id, assetId, effectiveDate, amountMinor) {
    return normalizeFinancialRecord({
        id, assetId, occurredAt: NOW, effectiveDate, createdAt: NOW, source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor,
    });
}

function period(id, assetId, startDate, endDate, paymentEventId) {
    return normalizeSubscriptionPeriodRecord({
        id, assetId, occurredAt: NOW, effectiveDate: startDate, createdAt: NOW, source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        kind: 'billing', startDate, endDate, paymentEventId,
    }, { now: NOW });
}

/** 当期 [-40d, +5d] + 提前续订的下一期 [+6d, +36d]，各自带一笔付款。 */
function renewedAheadFixture() {
    const startA = dateKeyOffset(-40);
    const endA = dateKeyOffset(5);
    const startB = dateKeyOffset(6);
    const endB = dateKeyOffset(36);
    return {
        asset: subscriptionAsset(SUB_ID),
        payA: payment(PAY_A_ID, SUB_ID, startA, 3000),
        payB: payment(PAY_B_ID, SUB_ID, startB, 3000),
        periodA: period(PERIOD_A_ID, SUB_ID, startA, endA, PAY_A_ID),
        periodB: period(PERIOD_B_ID, SUB_ID, startB, endB, PAY_B_ID),
    };
}

(async () => {
    // ---------- 1：提前续订 → 到期日投影取最新周期 endDate ----------
    {
        const fixture = renewedAheadFixture();
        const periods = [fixture.periodA, fixture.periodB];
        assert.equal(getFormalExpiryOn(fixture.asset, periods, dateKeyOffset(0)), fixture.periodB.endDate,
            'renewed-ahead subscription projects the latest period end as expiry');
        assert.deepEqual(getFormalNextImportantDate(fixture.asset, periods, dateKeyOffset(0)),
            { date: fixture.periodB.endDate, type: 'subscriptionExpiry' },
            'next important date follows the renewed end date');
        const projection = projectFormalAsset(fixture.asset, {
            subscriptionPeriods: periods, financialEvents: [fixture.payA, fixture.payB],
        }, dateKeyOffset(0));
        assert.equal(projection.expiryOn, fixture.periodB.endDate, 'projectFormalAsset.expiryOn uses the renewed end date');
        assert.equal(projection.subscription.currentPeriod.id, fixture.periodA.id, 'current period stays the running period');
        assert.equal(projection.subscription.latestPeriod.id, fixture.periodB.id, 'latest period is the future renewal');

        // 无未来周期：单期含今天 → 旧口径不变
        const single = renewedAheadFixture();
        assert.equal(getFormalExpiryOn(single.asset, [single.periodA], dateKeyOffset(0)), single.periodA.endDate,
            'without a future period expiry stays on the running period end');
    }

    // ---------- 2/3：列表卡徽章 + 详情卡到期日 / 逐期操作 ----------
    {
        const fixture = renewedAheadFixture();
        const { plugin } = createHarness([fixture.asset]);
        plugin._financialEvents = [fixture.payA, fixture.payB];
        plugin._subscriptionPeriods = [fixture.periodA, fixture.periodB];
        plugin._formalDomainStateSnapshot.financialEvents = plugin._financialEvents;
        plugin._formalDomainStateSnapshot.subscriptionPeriods = plugin._subscriptionPeriods;

        const listHtml = plugin.renderFormalAssetListCard(fixture.asset);
        assert.match(listHtml, /已续订/, 'renewed-ahead list card keeps the renewed badge');

        await plugin.openFormalProductCard(fixture.asset.id);
        const card = plugin._productCardHost && plugin._productCardHost.querySelector('.am-product-card-mask .am-product-card');
        assert.ok(card, 'subscription detail card rendered');
        assert.ok(card.innerHTML.indexOf(fixture.periodB.endDate) >= 0,
            'detail card expiry row shows the renewed end date');
        const editButtons = card.querySelectorAll('[data-period-edit]');
        assert.equal(editButtons.length, 2, 'every period row renders an edit button');
        assert.deepEqual(Array.from(editButtons).map(b => b.dataset.periodEdit).sort(), [PERIOD_A_ID, PERIOD_B_ID].sort());
        const deleteButtons = card.querySelectorAll('[data-period-delete]');
        assert.equal(deleteButtons.length, 1, 'only the latest period renders a delete button');
        assert.equal(deleteButtons[0].dataset.periodDelete, PERIOD_B_ID, 'delete targets the latest period');
        assert.match(card.innerHTML, /最新/, 'latest period is labeled');
    }

    // ---------- 4：updateSubscriptionPeriod 编辑 + 重叠回滚 ----------
    {
        const fixture = renewedAheadFixture();
        const { plugin, state } = createHarness([fixture.asset]);
        await plugin.storage.mutateFormalV2AssetDomain(() => ({ change: {
            financialEvents: [fixture.payA, fixture.payB],
            subscriptionPeriods: [fixture.periodA, fixture.periodB],
        } }));
        plugin._financialEvents = [fixture.payA, fixture.payB];
        plugin._subscriptionPeriods = [fixture.periodA, fixture.periodB];
        plugin._formalDomainStateSnapshot.financialEvents = plugin._financialEvents;
        plugin._formalDomainStateSnapshot.subscriptionPeriods = plugin._subscriptionPeriods;

        const newStart = dateKeyOffset(8);
        const newEnd = dateKeyOffset(38);
        await plugin.updateSubscriptionPeriod(SUB_ID, { periodId: PERIOD_B_ID, startDate: newStart, endDate: newEnd });
        const active = state['subscriptionPeriods.json'].records.filter(r => !r.voidedAt);
        assert.equal(active.length, 2, 'edit keeps two active periods (void-and-replace)');
        const edited = active.find(r => r.startDate === newStart);
        assert.ok(edited, 'edited period persisted with the new start date');
        assert.equal(edited.endDate, newEnd, 'edited period persisted with the new end date');
        assert.equal(edited.paymentEventId, PAY_B_ID, 'edited period keeps its payment link');
        const replaced = state['subscriptionPeriods.json'].records.find(r => r.id === PERIOD_B_ID);
        assert.ok(replaced.voidedAt, 'original period record is voided (audit trail)');

        // 与当期重叠 → throw 且数据无变更（void-and-replace 后周期 id 已换新，需重取）
        const before = JSON.stringify(state['subscriptionPeriods.json'].records);
        const currentB = active.find(r => r.startDate === newStart);
        await assert.rejects(
            () => plugin.updateSubscriptionPeriod(SUB_ID, { periodId: currentB.id, startDate: dateKeyOffset(-10), endDate: dateKeyOffset(10) }),
            /overlap/,
            'overlapping edit is rejected');
        assert.equal(JSON.stringify(state['subscriptionPeriods.json'].records), before, 'rejected edit leaves periods untouched');
    }

    // ---------- 5：deleteSubscriptionPeriod ----------
    {
        const fixture = renewedAheadFixture();
        const { plugin, state } = createHarness([fixture.asset]);
        await plugin.storage.mutateFormalV2AssetDomain(() => ({ change: {
            financialEvents: [fixture.payA, fixture.payB],
            subscriptionPeriods: [fixture.periodA, fixture.periodB],
        } }));
        plugin._financialEvents = [fixture.payA, fixture.payB];
        plugin._subscriptionPeriods = [fixture.periodA, fixture.periodB];
        plugin._formalDomainStateSnapshot.financialEvents = plugin._financialEvents;
        plugin._formalDomainStateSnapshot.subscriptionPeriods = plugin._subscriptionPeriods;

        // 拒绝删非最新一期
        await assert.rejects(() => plugin.deleteSubscriptionPeriod(SUB_ID, PERIOD_A_ID), /latest/,
            'deleting a non-latest period is rejected');

        // 删最新一期：周期移除 + 付款作废
        await plugin.deleteSubscriptionPeriod(SUB_ID, PERIOD_B_ID);
        const records = state['subscriptionPeriods.json'].records;
        assert.equal(records.filter(r => !r.voidedAt).length, 1, 'latest period removed, earlier period kept');
        const voidedPay = state['financialEvents.json'].events.find(e => e.id === PAY_B_ID);
        assert.ok(voidedPay.voidedAt, 'linked subscription payment is voided');
        assert.equal(voidedPay.replacesEventId, null, 'voided payment heals replacesEventId for the replacement chain');
        const activePay = state['financialEvents.json'].events.find(e => e.id === PAY_A_ID);
        assert.ok(!activePay.voidedAt, 'other payments stay untouched');
        const opLog = state['operationLogs.json'].logs.find(l => l.type === 'subscription-period-delete');
        assert.ok(opLog, 'deletion writes a subscription-period-delete opLog');
        assert.equal(opLog.assetId, SUB_ID, 'opLog references the asset');
        // 存储校验：readFormalV2DomainSnapshot 内部跑完整断言（opLog 白名单 / 周期不变式）
        const snapshot = await plugin.storage.readFormalV2DomainSnapshot();
        assert.equal(snapshot.subscriptionPeriods.records.filter(r => !r.voidedAt).length, 1,
            'post-delete snapshot passes strict storage validation');

        // 仅剩一期 → 拒绝删除
        await assert.rejects(() => plugin.deleteSubscriptionPeriod(SUB_ID, PERIOD_A_ID), /only subscription period/,
            'deleting the only remaining period is rejected');

        // 详情卡随之刷新：只剩一期 → 无删除按钮
        await plugin.openFormalProductCard(fixture.asset.id);
        const card = plugin._productCardHost && plugin._productCardHost.querySelector('.am-product-card-mask .am-product-card');
        assert.ok(card, 'detail card re-rendered after delete');
        assert.equal(card.querySelectorAll('[data-period-edit]').length, 1, 'remaining period still editable');
        assert.equal(card.querySelectorAll('[data-period-delete]').length, 0, 'single period has no delete button');
    }

    // ---------- 6：prepaid-delete 白名单补录 ----------
    {
        const PREPAID_ID = 'e2000000-0000-4000-8000-000000000002';
        const TXN_ID = 'e4000000-0000-4000-8000-000000000003';
        const prepaid = newFormalV2Asset({
            id: PREPAID_ID, kind: 'prepaidCount', name: 'Gym', status: 'active', currency: 'CNY',
            acquiredOn: dateKeyOffset(-30), statusChangedOn: dateKeyOffset(-30), tagIds: [], cover: { kind: 'none' }, notes: '',
            createdAt: NOW, updatedAt: NOW, details: { provider: 'Gym', expiresOn: null },
        });
        const { plugin, state } = createHarness([prepaid]);
        await plugin.storage.mutateFormalV2AssetDomain(snapshot => ({ change: {
            prepaidTransactions: [{ id: TXN_ID, assetId: PREPAID_ID, type: 'inflow', dimension: 'count',
                direction: 'inflow', count: 3, effectiveDate: dateKeyOffset(-1), occurredAt: NOW, createdAt: NOW, note: '', financialEventId: null }],
        } }));
        const deleted = await plugin.deleteFormalWorkflowRecord(PREPAID_ID, 'prepaid', TXN_ID);
        assert.equal(deleted, true, 'prepaid transaction delete succeeds now that prepaid-delete is whitelisted');
        assert.equal(state['prepaidTransactions.json'].records.filter(r => r.id === TXN_ID).length, 0,
            'deleted transaction is removed from storage');
    }

    // ---------- 7：手机端下拉修复（静态源断言 + CSS） ----------
    {
        assert.match(source, /_placeAmFloatingPanel\(panel, trigger\) \{/, 'shared floating-panel placement helper exists');
        assert.match(source, /spaceBelow >= ph \|\| spaceBelow >= spaceAbove/, 'placement flips above when the trigger sits low');
        assert.match(source, /Math\.min\(Math\.max\(top, margin\), Math\.max\(vh - ph - margin, margin\)\)/, 'placement clamps the panel inside the viewport');
        assert.match(source, /_bindAmGlassSelects\(scope\)[\s\S]{0,6000}?self\._placeAmFloatingPanel\(panel, trigger\)/, 'glass select opens through the shared placement');
        assert.match(source, /_bindAmDatepickers\(kindBody\)[\s\S]{0,8000}?self\._placeAmFloatingPanel\(panel, trigger\)/, 'datepicker opens through the shared placement');
        const outside = source.match(/const outsideEvent = \(typeof window !== 'undefined' && 'PointerEvent' in window\) \? 'pointerdown' : 'mousedown';/g) || [];
        assert.ok(outside.length >= 2, 'glass select and datepicker both close on pointerdown outside');
        assert.match(source, /if \(window\.visualViewport\) window\.visualViewport\.addEventListener\('resize', repositionPanel\)/, 'panels reposition on visualViewport resize (soft keyboard)');
        assert.match(css, /\.am-glass-select-popover \{[\s\S]*?max-width: calc\(100vw - 16px\)/, 'popover width is clamped on narrow screens');
    }
    console.log('[v2608-regression] passed');
})().catch(error => { console.error('[v2608-regression] failed:', error.stack || error.message); process.exit(1); });
