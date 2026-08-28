'use strict';

/**
 * formal-v2 Stage 3 — 金额权益（储值卡）初始金额可调 regression test.
 *
 * 背景：购买成本与初始金额可能不同（商家赠送 → 初始 > 成本；折损 → 初始 < 成本）。
 * 初始金额在创建时定死（编辑只读），余额 thereafter 由流水投影。
 *
 * 数据契约（不改 api/assets.js 投影/校验，选项 2）：
 *   addAsset 金额分支在购买 PURCHASE 事件 + 第 1 条 opening 流水之外，当
 *   初始金额 ≠ 购买成本时追加第 2 条「非现金 ADJUSTMENT 财务事件 + 伴随流水」：
 *     - 差额 > 0（赠送）→ 第 2 条 type='opening'，event.direction='inflow'
 *       （opening 投影只做加法，正向差额走 opening 车道；事件方向 = 流水方向）。
 *     - 差额 < 0（折损）→ 第 2 条 type='adjust'，event.direction='outflow'
 *       （opening 不能为负，负向差额走 adjust 车道）。
 *   ADJUSTMENT 事件 metadata.affectsCash=false 且不带 scope，因此既不计入
 *   cashTotals，也不计入 acquisitionAmountMinor（仅 PURCHASE 计购买成本）。
 *
 * 覆盖 PRODUCT_SPEC A-1~A-10：
 *   A-1 balance=初始；A-2 acquisition=购买成本；A-3 cash outflow=购买成本；
 *   A-4 赠送第 2 条 opening+adjustment(affectsCash=false)；A-5 折损第 2 条 adjust+outflow；
 *   A-6 相等无第 2 条；A-7 编辑初始金额只读；A-8 编辑剩余金额走 adjust 且不动初始投影；
 *   A-9 投影不抛 formalError；A-10 JSON round-trip 投影不变。
 *
 * 走 production 路径：addAsset / openFormalAssetSheet -> _commitAssetAuditMutation ->
 * storage.mutateFormalAssetDomain（含 assertFormalDomainSnapshot 严格校验）。
 */

const assert = require('node:assert/strict');
const { createHarness, wireForms } = require('./formal-workflow-harness.js');
const { newFormalV2Asset, projectFormalPrepaid, projectFormalFinancials } = require('../api/assets.js');
const { createStableId } = require('../api/algorithms.js');

function amountDto(name) {
    return { kind: 'prepaidAmount', name: name || '储值卡', status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' },
        notes: '', details: { provider: 'Store', expiresOn: null } };
}

async function createAmountAsset(purchaseMinor, initialMinor) {
    const h = createHarness([]);
    const opts = { purchaseAmountMinor: purchaseMinor };
    if (initialMinor != null) opts.prepaidInitialAmountMinor = initialMinor;
    await h.plugin.addAsset(amountDto(), opts);
    assert.equal(h.plugin.toasts.length, 0, 'addAsset must not raise an error toast: ' + h.plugin.toasts.join(' | '));
    const asset = h.plugin.assets[0];
    assert.ok(asset, 'asset must be created');
    const transactions = (h.plugin._prepaidTransactions || []).filter(t => t.assetId === asset.id);
    const events = (h.plugin._financialEvents || []).filter(e => e.assetId === asset.id);
    return { h, asset, transactions, events };
}

(async () => {
    // A-1 / A-2 / A-3 / A-4 — gift (initial 550 > cost 500)
    {
        const { asset, transactions, events } = await createAmountAsset(50000, 55000);
        const prepaid = projectFormalPrepaid(asset, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 55000, 'A-1 balance must equal initial 550.00');
        assert.equal(prepaid.openingAmountMinor, 55000, 'opening sums purchase + gift openings');
        const fin = projectFormalFinancials(asset, events);
        assert.equal(fin.acquisitionAmountMinor, 50000, 'A-2 acquisition stays at purchase 500.00');
        assert.equal(fin.cashTotals.outflowAmountMinor, 50000, 'A-3 cash outflow excludes non-cash adjustment');
        assert.equal(transactions.length, 2, 'A-4 creates a 2nd prepaid transaction');
        const second = transactions[1];
        assert.equal(second.type, 'opening', 'A-4 gift 2nd transaction type=opening');
        assert.equal(second.direction, 'inflow', 'A-4 gift 2nd transaction direction=inflow');
        assert.equal(second.effectiveDate, asset.acquiredOn, 'A-4 transaction effectiveDate=acquiredOn');
        const adj = events.find(e => e.id === second.financialEventId);
        assert.ok(adj, 'A-4 2nd transaction links a financial event');
        assert.equal(adj.eventType, 'adjustment', 'A-4 linked event eventType=adjustment');
        assert.equal(adj.direction, 'inflow', 'A-4 gift adjustment direction=inflow');
        assert.equal(adj.amountMinor, 5000, 'A-4 adjustment amountMinor=|550-500|');
        assert.equal(adj.metadata.affectsCash, false, 'A-4 adjustment metadata.affectsCash=false');
        assert.equal(Object.prototype.hasOwnProperty.call(adj.metadata, 'scope'), false, 'A-4 adjustment carries no scope');
        assert.equal(adj.voidedAt, null, 'A-4 adjustment is active');
        assert.equal(adj.replacesEventId, null, 'A-4 adjustment replaces nothing');
        assert.notEqual(transactions[0].financialEventId, transactions[1].financialEventId, 'A-4 unique financialEventId per transaction');
    }

    // A-5 — loss (initial 450 < cost 500)
    {
        const { asset, transactions, events } = await createAmountAsset(50000, 45000);
        const prepaid = projectFormalPrepaid(asset, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 45000, 'A-5 balance must equal initial 450.00');
        assert.equal(prepaid.openingAmountMinor, 50000, 'A-5 opening stays at purchase cost');
        assert.equal(prepaid.adjustAmountMinor, -5000, 'A-5 adjust lane carries the -50.00 reduction');
        const second = transactions[1];
        assert.equal(second.type, 'adjust', 'A-5 loss 2nd transaction type=adjust');
        assert.equal(second.direction, 'outflow', 'A-5 loss 2nd transaction direction=outflow');
        const adj = events.find(e => e.id === second.financialEventId);
        assert.equal(adj.eventType, 'adjustment', 'A-5 linked event eventType=adjustment');
        assert.equal(adj.direction, 'outflow', 'A-5 loss adjustment direction=outflow');
        assert.equal(adj.amountMinor, 5000, 'A-5 adjustment amountMinor=|450-500|');
        assert.equal(adj.metadata.affectsCash, false, 'A-5 adjustment metadata.affectsCash=false');
        const fin = projectFormalFinancials(asset, events);
        assert.equal(fin.acquisitionAmountMinor, 50000, 'A-5 acquisition stays at purchase 500.00');
        assert.equal(fin.cashTotals.outflowAmountMinor, 50000, 'A-5 cash outflow excludes non-cash adjustment');
    }

    // A-6 — equal (initial == cost) -> single transaction
    {
        const { asset, transactions, events } = await createAmountAsset(50000, 50000);
        const prepaid = projectFormalPrepaid(asset, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 50000, 'A-6 balance equals cost when initial==cost');
        assert.equal(transactions.length, 1, 'A-6 no 2nd transaction when initial==cost');
        assert.equal(events.length, 1, 'A-6 only the purchase event exists');
    }

    // A-6b — omitted option defaults to cost (back-compat with pre-Stage-3 callers)
    {
        const { asset, transactions, events } = await createAmountAsset(50000, null);
        const prepaid = projectFormalPrepaid(asset, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 50000, 'A-6b balance equals cost when option omitted');
        assert.equal(transactions.length, 1, 'A-6b omitting prepaidInitialAmountMinor keeps single opening');
    }

    // A-9 — projection raises no formalError across all three scenarios
    {
        for (const [cost, initial] of [[50000, 55000], [50000, 45000], [50000, 50000]]) {
            const { asset, transactions, events } = await createAmountAsset(cost, initial);
            let prepaid, fin;
            try {
                prepaid = projectFormalPrepaid(asset, transactions, events);
                fin = projectFormalFinancials(asset, events);
            } catch (error) {
                assert.fail('A-9 projection threw for cost=' + cost + ' initial=' + initial + ': ' + error.message);
            }
            assert.ok(Number.isSafeInteger(prepaid.balanceAmountMinor), 'A-9 balance is a safe integer');
            assert.ok(Number.isSafeInteger(fin.acquisitionAmountMinor), 'A-9 acquisition is a safe integer');
        }
    }

    // A-10 — JSON round-trip stability of persisted records
    {
        const { asset, transactions, events } = await createAmountAsset(50000, 55000);
        const before = projectFormalPrepaid(asset, transactions, events);
        const beforeFin = projectFormalFinancials(asset, events);
        const after = projectFormalPrepaid(JSON.parse(JSON.stringify(asset)), JSON.parse(JSON.stringify(transactions)), JSON.parse(JSON.stringify(events)));
        const afterFin = projectFormalFinancials(JSON.parse(JSON.stringify(asset)), JSON.parse(JSON.stringify(events)));
        assert.deepEqual(after, before, 'A-10 prepaid projection survives JSON round-trip');
        assert.deepEqual(afterFin, beforeFin, 'A-10 financial projection survives JSON round-trip');
    }

    // Form NEW end-to-end — field name + onsubmit wiring (gift 550)
    {
        const h = createHarness([]);
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', {});
        wireForms(mask);
        const initialInput = mask.querySelector('[name="initialAmount"]');
        assert.ok(initialInput, 'new form exposes name="initialAmount"');
        assert.ok(!initialInput.hasAttribute('readonly'), 'new initialAmount is editable');
        const form = mask.querySelector('form');
        mask.querySelector('[name="name"]').value = '表单储值卡';
        mask.querySelector('[name="amount"]').value = '500';
        initialInput.value = '550';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'form new submit must not toast error: ' + h.plugin.toasts.join(' | '));
        const asset = h.plugin.assets[0];
        const transactions = (h.plugin._prepaidTransactions || []).filter(t => t.assetId === asset.id);
        const events = (h.plugin._financialEvents || []).filter(e => e.assetId === asset.id);
        assert.equal(projectFormalPrepaid(asset, transactions, events).balanceAmountMinor, 55000, 'form new gift projects balance 550.00');
        assert.equal(transactions.length, 2, 'form new gift creates 2 transactions');
    }

    // A-7 — edit form keeps 初始金额 readonly (opening projection)
    {
        const { h, asset } = await createAmountAsset(50000, 55000);
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        assert.ok(!mask.querySelector('[name="initialAmount"]'), 'A-7 edit form has no editable initialAmount');
        const roInitial = mask.querySelector('[data-prepaid-initial-amount]');
        assert.ok(roInitial, 'A-7 edit form renders the initial-amount display');
        assert.ok(roInitial.hasAttribute('readonly'), 'A-7 edit initialAmount is readonly');
        assert.equal(roInitial.value, '550', 'A-7 edit initialAmount shows opening projection (550)');
        assert.ok(mask.querySelector('[name="targetRemainingAmount"]'), 'A-7/A-8 edit form exposes editable remaining target');
    }

    // A-8 — edit remaining amount uses existing adjust logic; initial projection unchanged
    {
        const { h, asset } = await createAmountAsset(50000, 55000);
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        mask.querySelector('[name="targetRemainingAmount"]').value = '400';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'A-8 edit submit must not toast error: ' + h.plugin.toasts.join(' | '));
        const transactions = (h.plugin._prepaidTransactions || []).filter(t => t.assetId === asset.id);
        const events = (h.plugin._financialEvents || []).filter(e => e.assetId === asset.id);
        const prepaid = projectFormalPrepaid(asset, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 40000, 'A-8 balance moves to target 400.00');
        assert.equal(prepaid.openingAmountMinor, 55000, 'A-8 opening (initial) projection stays 550.00');
    }

    // ---- Wishlist purchase (种草池拔草) path must honor 初始金额 too (reviewer FAIL fix) ----
    // completeWishlistPurchase reuses the same _buildOpeningDeltaSidecars helper as addAsset,
    // so the gift/loss projection shape is identical to the new-form path.
    async function purchaseWishlistViaForm(initialMajor) {
        const wish = newFormalV2Asset({ id: createStableId(), kind: 'prepaidAmount', name: '种草储值卡',
            status: 'wishlist', currency: 'CNY', cover: { kind: 'none' }, createdAt: '2026-07-19T08:00:00.000Z',
            updatedAt: '2026-07-19T08:00:00.000Z', wishlist: { expectedAmountMinor: 50000, reason: '', targetGroup: 'prepaid' } });
        const h = createHarness([wish]);
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { wishlistSource: wish, lockedKind: true });
        wireForms(mask);
        const form = mask.querySelector('form');
        const initialInput = mask.querySelector('[name="initialAmount"]');
        assert.ok(initialInput && !initialInput.hasAttribute('readonly'), 'wishlist-purchase form exposes editable initialAmount');
        mask.querySelector('[name="name"]').value = '储值卡';
        mask.querySelector('[name="amount"]').value = '500';
        mask.querySelector('[name="acquiredOn"]').value = '2026-07-19';
        if (initialMajor != null) initialInput.value = initialMajor;
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'wishlist purchase must not toast error: ' + h.plugin.toasts.join(' | '));
        assert.ok(!h.plugin.assets.some(a => a.id === wish.id), 'wishlist source must be consumed');
        const owned = h.plugin.assets.find(a => a.kind === 'prepaidAmount' && a.status === 'active');
        const transactions = (h.plugin._prepaidTransactions || []).filter(t => t.assetId === owned.id);
        const events = (h.plugin._financialEvents || []).filter(e => e.assetId === owned.id);
        return { owned, transactions, events };
    }

    // W-gift: initial 550 > cost 500 → 2 transactions, 2nd opening+adjustment(affectsCash=false)
    {
        const { owned, transactions, events } = await purchaseWishlistViaForm('550');
        const prepaid = projectFormalPrepaid(owned, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 55000, 'wishlist gift balance=550.00');
        assert.equal(prepaid.openingAmountMinor, 55000, 'wishlist gift opening includes the gift');
        const fin = projectFormalFinancials(owned, events);
        assert.equal(fin.acquisitionAmountMinor, 50000, 'wishlist gift acquisition=500.00');
        assert.equal(fin.cashTotals.outflowAmountMinor, 50000, 'wishlist gift cash outflow=500.00');
        assert.equal(transactions.length, 2, 'wishlist gift creates 2 transactions');
        const second = transactions[1];
        assert.equal(second.type, 'opening', 'wishlist gift 2nd type=opening');
        const adj = events.find(e => e.id === second.financialEventId);
        assert.equal(adj.eventType, 'adjustment', 'wishlist gift 2nd event=adjustment');
        assert.equal(adj.direction, 'inflow', 'wishlist gift adjustment direction=inflow');
        assert.equal(adj.metadata.affectsCash, false, 'wishlist gift adjustment affectsCash=false');
    }

    // W-loss: initial 450 < cost 500 → 2nd adjust+outflow
    {
        const { owned, transactions, events } = await purchaseWishlistViaForm('450');
        const prepaid = projectFormalPrepaid(owned, transactions, events);
        assert.equal(prepaid.balanceAmountMinor, 45000, 'wishlist loss balance=450.00');
        const second = transactions[1];
        assert.equal(second.type, 'adjust', 'wishlist loss 2nd type=adjust');
        assert.equal(second.direction, 'outflow', 'wishlist loss 2nd direction=outflow');
        const adj = events.find(e => e.id === second.financialEventId);
        assert.equal(adj.eventType, 'adjustment', 'wishlist loss 2nd event=adjustment');
        assert.equal(adj.metadata.affectsCash, false, 'wishlist loss adjustment affectsCash=false');
    }

    // W-equal: initial 500 == cost → single transaction
    {
        const { owned, transactions, events } = await purchaseWishlistViaForm('500');
        assert.equal(projectFormalPrepaid(owned, transactions, events).balanceAmountMinor, 50000, 'wishlist equal balance=500.00');
        assert.equal(transactions.length, 1, 'wishlist equal creates a single transaction');
    }

    // W-empty: 初始金额留空 → 默认=成本（向后兼容，无第 2 条）
    {
        const { owned, transactions } = await purchaseWishlistViaForm(null);
        assert.equal(transactions.length, 1, 'wishlist empty initial defaults to cost (single transaction)');
    }

    console.log('[formal-prepaid-initial-amount] passed');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
