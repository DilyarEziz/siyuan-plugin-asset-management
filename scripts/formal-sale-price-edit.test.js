'use strict';

/**
 * v2.6.2 修复批次 2 — 已退役实物资产编辑「转让价格」预填 + 更正 regression test.
 *
 * 背景：
 *   - formal-v2 的转让价存在 financialEvents sidecar（eventType='sale'、
 *     direction='inflow'），资产主记录没有 salePrice 键。
 *   - 编辑表单渲染时读 asset.salePrice（恒空）→ 创建时保存的转让价不回填（bug ①）。
 *   - 提交路径对「已退役 → 仍退役」的再编辑不处理 salePrice → 改价无法保存（bug ②）。
 *
 * 修复（production 路径 openFormalAssetSheet -> form.onsubmit）：
 *   - render 内 physicalEditSalePriceMajor 把最后一笔未作废 sale/inflow 事件的
 *     amountMinor 投影回 [name="salePrice"] 输入框（T1）。
 *   - 提交路径新增 retired→retired 分支：enteredMinor>0 且与现值不同 →
 *     _correctSalePrice void-and-replace（T2）；无 sale 事件 →
 *     recordPhysicalSaleAsset 补建；金额未变/输入为 0 → 保持现状（T3）。
 *
 * Cases:
 *   T1 预填：新建退役 + 转让价 300 的实物 → 打开编辑表单 →
 *      [name="salePrice"] value === '300'。
 *   T2 改价：编辑该资产把 salePrice 改为 500 提交 → 旧 sale 事件 voidedAt 非空、
 *      新 sale 事件 amountMinor=50000 且 replacesEventId=旧 id、effectiveDate 沿用
 *      原转让日、资产仍 retired、替换链合法、报表 retiredSaleByCurrency=50000、
 *      physical-sale/salePrice 更正日志过白名单、重开表单回显 500。
 *   T3 对照：不改价直接保存 → 无 void、无新事件（无审计噪声）。
 */

const assert = require('node:assert/strict');
const { createHarness, wireForms, NOW } = require('./formal-workflow-harness.js');
const { buildFormalReport } = require('../api/report.js');
const { validateFinancialReplacementChain } = require('../api/assets.js');

async function createRetiredWithSale(h, name, priceMinor, soldOn) {
    await h.plugin.addAsset({ kind: 'physical', name: name, status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', tagIds: [], cover: { kind: 'none' },
        notes: '', details: { warrantyEndsOn: null, costGoal: null } }, { purchaseAmountMinor: 50000 });
    const created = h.plugin.assets.find(item => item.name === name);
    await h.plugin.recordPhysicalSaleAsset(created.id, { priceMinor: priceMinor, soldOn: soldOn, note: '' });
    const retired = h.plugin.assets.find(item => item.id === created.id);
    assert.equal(retired.status, 'retired', 'seed asset must be retired before the edit test');
    return retired;
}

const saleEventsOf = (h, id) => (h.state['financialEvents.json'].events || [])
    .filter(event => event.assetId === id && event.eventType === 'sale');

function buildReport(h) {
    const snapshot = {
        assets: h.state['assets.json'],
        tags: h.state['tags.json'],
        financialEvents: h.state['financialEvents.json'],
        lifecycleEvents: h.state['lifecycleEvents.json'],
        subscriptionPeriods: h.state['subscriptionPeriods.json'],
        prepaidTransactions: h.state['prepaidTransactions.json'],
        maintenance: h.state['maintenance.json'],
        wishlistEvents: h.state['wishlistEvents.json'],
        operationLogs: h.state['operationLogs.json'],
        exchangeRates: h.state['exchangeRates.json'],
    };
    return buildFormalReport(snapshot, { months: 12, dateFrom: '2026-01-01', endDate: '2026-12-31' }, { now: NOW });
}

(async () => {
    // T1 — 编辑已退役资产：转让价从最后一笔未作废 sale 事件预填回表单
    {
        const h = createHarness([]);
        const retired = await createRetiredWithSale(h, '退役改价预填', 30000, '2026-07-20');
        const mask = h.plugin.openFormalAssetSheet('physical', { asset: retired, id: retired.id });
        wireForms(mask);
        const sp = mask.querySelector('[name="salePrice"]');
        assert.ok(sp, 'T1 salePrice input must render when editing a retired physical');
        assert.equal(sp.value, '300', 'T1 sale price must be pre-filled from the last active sale event');
    }

    // T2 — 改价提交：旧事件作废 + 新事件替换 + 报表口径随之更正
    {
        const h = createHarness([]);
        const retired = await createRetiredWithSale(h, '退役改价提交', 30000, '2026-07-20');
        const oldSale = saleEventsOf(h, retired.id)[0];
        const mask = h.plugin.openFormalAssetSheet('physical', { asset: retired, id: retired.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        mask.querySelector('[name="salePrice"]').value = '500';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'T2 submit must not raise an error toast: ' + h.plugin.toasts.join(' | '));
        const sales = saleEventsOf(h, retired.id);
        const voided = sales.filter(event => event.voidedAt);
        const active = sales.filter(event => !event.voidedAt);
        assert.equal(voided.length, 1, 'T2 exactly one voided sale event');
        assert.equal(voided[0].id, oldSale.id, 'T2 the original sale event is the one voided');
        assert.equal(active.length, 1, 'T2 exactly one active sale event');
        assert.equal(active[0].amountMinor, 50000, 'T2 replacement sale amountMinor=50000 (500.00)');
        assert.equal(active[0].replacesEventId, oldSale.id, 'T2 replacement.replacesEventId points to the voided sale');
        assert.equal(active[0].effectiveDate, '2026-07-20', 'T2 replacement keeps the original sale date');
        assert.equal(active[0].direction, 'inflow', 'T2 replacement direction stays inflow');
        const after = h.plugin.assets.find(item => item.id === retired.id);
        assert.equal(after.status, 'retired', 'T2 asset stays retired after the correction');
        const chain = validateFinancialReplacementChain(h.state['financialEvents.json'].events || []);
        assert.equal(chain.valid, true, 'T2 financial replacement chain must stay valid: ' + chain.errors.join('; '));
        const report = buildReport(h);
        assert.equal(report.amounts.retiredSaleByCurrency.CNY.saleAmountMinor, 50000, 'T2 report retiredSaleByCurrency follows the corrected price');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(log => log.type === 'physical-sale' && log.assetId === retired.id
            && log.field === 'salePrice' && log.oldValue === 30000 && log.newValue === 50000),
            'T2 physical-sale/salePrice correction opLog must persist through the whitelist');
        // 重开表单回显更正后的值
        const mask2 = h.plugin.openFormalAssetSheet('physical', { asset: h.plugin.assets.find(item => item.id === retired.id), id: retired.id });
        wireForms(mask2);
        assert.equal(mask2.querySelector('[name="salePrice"]').value, '500', 'T2 re-open shows the corrected sale price');
    }

    // T3（对照）— 不改价直接保存：无 void、无新事件（无审计噪声）
    {
        const h = createHarness([]);
        const retired = await createRetiredWithSale(h, '退役不改价', 30000, '2026-07-20');
        const before = (h.state['financialEvents.json'].events || []).filter(event => event.assetId === retired.id).length;
        const mask = h.plugin.openFormalAssetSheet('physical', { asset: retired, id: retired.id });
        wireForms(mask);
        const form = mask.querySelector('form');
        // 转让价预填 300，不做任何修改直接保存
        assert.equal(mask.querySelector('[name="salePrice"]').value, '300', 'T3 pre-filled before save');
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'T3 submit must not raise an error toast: ' + h.plugin.toasts.join(' | '));
        const sales = saleEventsOf(h, retired.id);
        assert.equal(sales.length, 1, 'T3 still exactly one sale event');
        assert.equal(sales[0].amountMinor, 30000, 'T3 sale amount unchanged');
        assert.equal(sales[0].voidedAt, null, 'T3 no void when the price is unchanged');
        const all = (h.state['financialEvents.json'].events || []).filter(event => event.assetId === retired.id);
        assert.equal(all.length, before, 'T3 no new financial event at all');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(!logs.some(log => log.type === 'physical-sale' && log.field === 'salePrice'),
            'T3 no sale-price correction opLog when nothing changed');
        const after = h.plugin.assets.find(item => item.id === retired.id);
        assert.equal(after.status, 'retired', 'T3 asset stays retired');
    }

    console.log('formal-sale-price-edit.test.js: ALL PASSED');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
