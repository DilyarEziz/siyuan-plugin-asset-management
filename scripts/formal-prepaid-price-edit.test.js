'use strict';

/**
 * formal-v2 R1 — 预付权益编辑「购买成本」价格修复 regression test.
 *
 * 背景（R1）：用户反馈预付编辑时无法修改价格。经验性复现发现：购买成本对应的
 * purchase 事件 void-and-replace 本身正确（correctPurchaseAmount），但金额权益
 *（prepaidAmount）保存路径在 correctPurchaseAmount 之后还会执行"剩余金额目标校正"
 *（src.template.js onsubmit 末段）。剩余金额字段在渲染时预填为【当时投影余额】，
 * 编辑购买成本会改变投影余额却不改动该字段，于是 (目标-当前投影) 产生一笔幻影
 * adjust 流水把余额拉回旧值：purchase 已改成新值但余额/可见价格不变，用户感知
 * "价格改不了"。次数权益（prepaidCount）的剩余次数校正对零差额 noop，故不受影响。
 *
 * 修复：剩余金额校正仅在用户【实际修改】该字段时执行（与渲染原始值
 * data-original-remaining-minor 按 minor 比对，未改动即跳过）。
 *
 * 覆盖：
 *   P-1 prepaidAmount 改价：purchase void+replace（replacesEventId 指旧）、
 *       acquisitionAmountMinor=新值、余额随新成本（无幻影 adjust，流水仍 1 条）、
 *       重开表单购买成本回显新值。
 *   P-2 prepaidAmount 同时改价 + 改剩余金额：显式剩余编辑仍生效（余额=目标）。
 *   P-3 prepaidAmount 未改价保存：不新增任何财务事件。
 *   P-4 prepaidCount 改价：purchase void+replace、acquisition=新值、剩余次数不变、
 *       无幻影次数流水（仍 1 条）、重开回显新值。
 *   P-5 prepaidAmount 编辑日期（acquiredOn）仍正常（ guarding 上批次日期修复）。
 *
 * 走 production 路径：addAsset / openFormalAssetSheet -> onsubmit -> correctPurchaseAmount
 * / addPrepaidTransaction -> _commitAssetAuditMutation。
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { createHarness, wireForms } = require('./formal-workflow-harness.js');
const { projectFormalPrepaid, projectFormalFinancials } = require('../api/assets.js');

function amountDto() {
    return { kind: 'prepaidAmount', name: '储值卡', status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' },
        notes: '', details: { provider: 'Store', expiresOn: null } };
}
function countDto() {
    return { kind: 'prepaidCount', name: '次卡', status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' },
        notes: '', details: { provider: 'Gym', expiresOn: null } };
}
const eventsOf = (h, id) => (h.plugin._financialEvents || []).filter(e => e.assetId === id);
const txOf = (h, id) => (h.plugin._prepaidTransactions || []).filter(t => t.assetId === id);
const activePurchasesOf = (h, id) => eventsOf(h, id).filter(e => e.eventType === 'purchase' && !e.voidedAt);

(async () => {
    // P-1 — prepaidAmount 改价：purchase 替换 + 余额随新成本 + 无幻影 adjust
    {
        const h = createHarness([]);
        await h.plugin.addAsset(amountDto(), { purchaseAmountMinor: 50000 });
        const asset = h.plugin.assets[0];
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        const amountInput = mask.querySelector('[name="amount"]');
        assert.equal(amountInput.hasAttribute('readonly'), false, 'P-1 购买成本 editable');
        assert.equal(amountInput.value, '500', 'P-1 pre-filled purchase cost');
        amountInput.value = '600'; // 仅改购买成本，剩余金额不动
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'P-1 submit must not toast: ' + h.plugin.toasts.join(' | '));
        const active = activePurchasesOf(h, asset.id);
        assert.equal(active.length, 1, 'P-1 exactly one active purchase');
        assert.equal(active[0].amountMinor, 60000, 'P-1 purchase amount changed to 600');
        const voided = eventsOf(h, asset.id).filter(e => e.eventType === 'purchase' && e.voidedAt);
        assert.equal(voided.length, 1, 'P-1 old purchase voided');
        assert.equal(active[0].replacesEventId, voided[0].id, 'P-1 replacement.replacesEventId points to old purchase');
        const fin = projectFormalFinancials(asset, eventsOf(h, asset.id));
        assert.equal(fin.acquisitionAmountMinor, 60000, 'P-1 acquisition reflects new cost');
        const prepaid = projectFormalPrepaid(asset, txOf(h, asset.id), eventsOf(h, asset.id));
        assert.equal(prepaid.balanceAmountMinor, 60000, 'P-1 balance follows new cost (no phantom adjust)');
        assert.equal(txOf(h, asset.id).length, 1, 'P-1 no phantom adjust transaction (still only the opening)');
        assert.equal(eventsOf(h, asset.id).filter(e => e.eventType === 'adjustment').length, 0, 'P-1 no adjustment financial event');
        // 重开表单回显新值
        const mask2 = h.plugin.openFormalAssetSheet('prepaidAmount', { asset: h.plugin.assets.find(a => a.id === asset.id), id: asset.id });
        wireForms(mask2);
        assert.equal(mask2.querySelector('[name="amount"]').value, '600', 'P-1 re-open shows new purchase cost');
        assert.equal(mask2.querySelector('[name="targetRemainingAmount"]').value, '600', 'P-1 re-open remaining reflects new balance');
    }

    // P-2 — prepaidAmount 同时改价 + 显式改剩余金额：剩余编辑仍生效
    {
        const h = createHarness([]);
        await h.plugin.addAsset(amountDto(), { purchaseAmountMinor: 50000 });
        const asset = h.plugin.assets[0];
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        mask.querySelector('[name="amount"]').value = '600';
        mask.querySelector('[name="targetRemainingAmount"]').value = '400'; // 用户显式改剩余
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'P-2 submit must not toast: ' + h.plugin.toasts.join(' | '));
        const prepaid = projectFormalPrepaid(asset, txOf(h, asset.id), eventsOf(h, asset.id));
        assert.equal(prepaid.balanceAmountMinor, 40000, 'P-2 explicit remaining target still applied (balance=400)');
        assert.equal(projectFormalFinancials(asset, eventsOf(h, asset.id)).acquisitionAmountMinor, 60000, 'P-2 acquisition=600');
    }

    // P-3 — prepaidAmount 未改价保存：不新增任何财务事件
    {
        const h = createHarness([]);
        await h.plugin.addAsset(amountDto(), { purchaseAmountMinor: 50000 });
        const asset = h.plugin.assets[0];
        const before = eventsOf(h, asset.id).length;
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        // 不改任何金额字段，直接保存
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'P-3 submit must not toast: ' + h.plugin.toasts.join(' | '));
        assert.equal(eventsOf(h, asset.id).length, before, 'P-3 no new financial event when price unchanged');
        assert.equal(txOf(h, asset.id).length, 1, 'P-3 no new transaction when nothing changed');
    }

    // P-4 — prepaidCount 改价：purchase 替换 + 剩余次数不变 + 无幻影次数流水
    {
        const h = createHarness([]);
        await h.plugin.addAsset(countDto(), { purchaseAmountMinor: 50000, prepaidOpeningCount: 10 });
        const asset = h.plugin.assets[0];
        const mask = h.plugin.openFormalAssetSheet('prepaidCount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        assert.equal(mask.querySelector('[name="amount"]').value, '500', 'P-4 pre-filled purchase cost');
        mask.querySelector('[name="amount"]').value = '600';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'P-4 submit must not toast: ' + h.plugin.toasts.join(' | '));
        const active = activePurchasesOf(h, asset.id);
        assert.equal(active.length, 1, 'P-4 exactly one active purchase');
        assert.equal(active[0].amountMinor, 60000, 'P-4 purchase changed to 600');
        assert.equal(projectFormalFinancials(asset, eventsOf(h, asset.id)).acquisitionAmountMinor, 60000, 'P-4 acquisition=600');
        const prepaid = projectFormalPrepaid(asset, txOf(h, asset.id), eventsOf(h, asset.id));
        assert.equal(prepaid.remainingCount, 10, 'P-4 remaining count unchanged');
        assert.equal(txOf(h, asset.id).length, 1, 'P-4 no phantom count transaction');
        const mask2 = h.plugin.openFormalAssetSheet('prepaidCount', { asset: h.plugin.assets.find(a => a.id === asset.id), id: asset.id });
        wireForms(mask2);
        assert.equal(mask2.querySelector('[name="amount"]').value, '600', 'P-4 re-open shows new purchase cost');
    }

    // P-5 — prepaidAmount 编辑日期（acquiredOn）仍正常（guard 上批次日期修复）
    {
        const h = createHarness([]);
        await h.plugin.addAsset(amountDto(), { purchaseAmountMinor: 50000 });
        const asset = h.plugin.assets[0];
        const mask = h.plugin.openFormalAssetSheet('prepaidAmount', { asset, id: asset.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        mask.querySelector('[name="acquiredOn"]').value = '2026-07-20';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'P-5 submit must not toast: ' + h.plugin.toasts.join(' | '));
        const updated = h.plugin.assets.find(a => a.id === asset.id);
        assert.equal(updated.acquiredOn, '2026-07-20', 'P-5 acquiredOn edit persists');
    }

    console.log('[formal-prepaid-price-edit] passed');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
