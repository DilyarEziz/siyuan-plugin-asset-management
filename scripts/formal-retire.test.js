'use strict';

/**
 * formal-v2 physical retire / sale + subscription auto-renew regression test.
 *
 * 目标（锁定 storage opLog type 白名单，防止未来重构回退）：
 *   - retirePhysicalAsset(id, { retiredDate }) 单事务内 status=retired +
 *     operationLog type='physical-retire' 通过 assertFormalOperationLog 白名单并落盘
 *   - recordPhysicalSaleAsset(id, { priceMinor, soldOn }) 单事务内 status=retired +
 *     financial event (sale) + operationLog type='physical-sale' 落盘
 *   - toggleSubscriptionAutoRenew(id, enabled) 单事务内 details.autoRenew 切换 +
 *     operationLog type='subscription-auto-renew-toggle' 落盘
 *   - 编辑表单点退役 pill 保存后 status=retired（bug：白名单缺失曾导致事务回滚）
 *   - 新建表单点退役 pill 保存后 status=retired（bug：onsubmit 曾硬编码 active）
 *   - 编辑表单购买价从 financialEvents sidecar 投影回填到 readonly 金额字段
 *
 * 走 production 路径：openFormalAssetSheet -> _commitAssetAuditMutation ->
 * storage.mutateFormalAssetDomain -> assertFormalDomainSnapshot -> assertFormalOperationLog。
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { createHarness, asset, wireForms } = require('./formal-workflow-harness.js');
const { createStableId } = require('../api/algorithms.js');

(async () => {
    // T1: retirePhysicalAsset -> 'physical-retire' opLog passes whitelist + status retired
    {
        const a = asset(createStableId(), 'physical', '退役测试');
        const h = createHarness([a]);
        await h.plugin.retirePhysicalAsset(a.id, { retiredDate: '2026-07-20', note: '' });
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.equal(after.status, 'retired', 'retirePhysicalAsset should set status retired');
        assert.equal(after.statusChangedOn, '2026-07-20', 'retirePhysicalAsset should set statusChangedOn');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(l => l.type === 'physical-retire' && l.assetId === a.id), 'physical-retire opLog should persist through whitelist');
    }

    // T2: recordPhysicalSaleAsset -> 'physical-sale' opLog + sale financial event
    {
        const a = asset(createStableId(), 'physical', '转让测试');
        const h = createHarness([a]);
        await h.plugin.recordPhysicalSaleAsset(a.id, { priceMinor: 50000, soldOn: '2026-07-20', note: '' });
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.equal(after.status, 'retired', 'recordPhysicalSaleAsset should set status retired');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(l => l.type === 'physical-sale' && l.assetId === a.id), 'physical-sale opLog should persist through whitelist');
        const sales = (h.state['financialEvents.json'].events || []).filter(e => e.assetId === a.id && e.eventType === 'sale');
        assert.equal(sales.length, 1, 'sale financial event should persist');
        assert.equal(sales[0].amountMinor, 50000, 'sale amountMinor should match priceMinor');
    }

    // T3: toggleSubscriptionAutoRenew -> 'subscription-auto-renew-toggle' opLog
    {
        const a = asset(createStableId(), 'virtualSubscription', '订阅测试');
        const h = createHarness([a]);
        await h.plugin.toggleSubscriptionAutoRenew(a.id, false);
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.equal(after.details.autoRenew, false, 'autoRenew should toggle to false');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(l => l.type === 'subscription-auto-renew-toggle' && l.assetId === a.id), 'subscription-auto-renew-toggle opLog should persist through whitelist');
    }

    // T4: form EDIT retire end-to-end (regression: whitelist missing once rolled this back)
    {
        const a = asset(createStableId(), 'physical', '表单编辑退役');
        const h = createHarness([a]);
        const mask = h.plugin.openFormalAssetSheet('physical', { asset: a });
        wireForms(mask);
        const form = mask.querySelector('form');
        mask.querySelector('[data-status-pill="retired"]').onclick();
        const rd = mask.querySelector('[name="retiredDate"]'); if (rd) rd.value = '2026-07-20';
        const sp = mask.querySelector('[name="salePrice"]'); if (sp) sp.value = '500';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.equal(after.status, 'retired', 'form edit retire should set status retired');
        assert.equal(h.plugin.toasts.length, 0, 'form edit retire should have no error toast');
    }

    // T5: form NEW retire end-to-end (regression: onsubmit once hard-coded active for new assets)
    {
        const h = createHarness([]);
        const mask = h.plugin.openFormalAssetSheet('physical', {});
        wireForms(mask);
        const form = mask.querySelector('form');
        const nameInput = mask.querySelector('[name="name"]'); if (nameInput) nameInput.value = '新建退役';
        const amountInput = mask.querySelector('[name="amount"]'); if (amountInput) amountInput.value = '1000';
        mask.querySelector('[data-status-pill="retired"]').onclick();
        const rd = mask.querySelector('[name="retiredDate"]'); if (rd) rd.value = '2026-07-20';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        const after = h.plugin.assets[0];
        assert.equal(after.status, 'retired', 'form new retire should set status retired');
        assert.equal(h.plugin.toasts.length, 0, 'form new retire should have no error toast');
    }

    // T6: price backfill on edit (financial sidecar -> readonly amount field)
    {
        const h = createHarness([]);
        const dto = { kind: 'physical', name: '价格回填', status: 'active', currency: 'CNY', acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' }, notes: '', details: { warrantyEndsOn: null, costGoal: null } };
        await h.plugin.addAsset(dto, { purchaseAmountMinor: 9950 });
        const created = h.plugin.assets[0];
        const mask = h.plugin.openFormalAssetSheet('physical', { asset: created });
        wireForms(mask);
        const amountInput = mask.querySelector('[name="amount"]');
        assert.equal(amountInput && amountInput.value, '99.5', 'edit price should backfill from financial sidecar');
    }

    console.log('formal-retire.test.js: ALL PASSED');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
