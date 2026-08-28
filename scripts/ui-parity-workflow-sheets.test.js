'use strict';

const assert = require('node:assert/strict');
const { asset, createHarness, flushDialog, setValue, wireForms } = require('./formal-workflow-harness');

const IDS = {
    physical: 'b1000000-0000-4000-8000-000000000001',
    usage: 'b1000000-0000-4000-8000-000000000002',
    prepaid: 'b1000000-0000-4000-8000-000000000003',
    subscription: 'b1000000-0000-4000-8000-000000000004',
    prepaidCount: 'b1000000-0000-4000-8000-000000000005',
};

(async () => {
    const h = createHarness([
        asset(IDS.physical, 'physical', 'Laptop'), asset(IDS.usage, 'virtualPerpetual', 'Editor'),
        asset(IDS.prepaid, 'prepaidAmount', 'Wallet'), asset(IDS.subscription, 'virtualSubscription', 'Cloud'),
        asset(IDS.prepaidCount, 'prepaidCount', 'Gym'),
    ]);
    // 需求4（阶段 R3）：维保 / 预付流水工作流重构为液态玻璃 sheet（返回 mask DOM，非 Dialog），
    // 与续费 sheet 同结构；基线类 .am-maintenance-sheet / .am-prepaid-transaction-sheet 保留。
    const checks = [
        ['openMaintenanceSheet', IDS.physical, '.am-maintenance-sheet'],
        ['openPrepaidTransactionSheet', IDS.prepaid, '.am-prepaid-transaction-sheet'],
    ];
    for (const [method, id, selector] of checks) {
        const mask = h.plugin[method](id); await flushDialog();
        assert.ok(mask.querySelector(selector), method + ' renders dedicated baseline class');
        assert.ok(mask.querySelector('.am-edit-sheet.am-form-shell'), method + ' uses liquid glass am-edit-sheet structure');
        mask.remove();
    }
    assert.equal(h.dialogStats.created, 0, 'workflow sheets no longer create native SiYuan dialogs');
    const maintenance = h.plugin.openMaintenanceSheet(IDS.physical); await flushDialog();
    wireForms(maintenance);
    let form = maintenance.querySelector('[data-workflow-form]');
    setValue(form, 'type', 'repair'); setValue(form, 'date', '2026-07-18'); setValue(form, 'amount', '12.50'); setValue(form, 'note', 'screen');
    await form.onsubmit({ preventDefault() {}, currentTarget: form }); await flushDialog();
    assert.equal(h.state['maintenance.json'].records.length, 1, 'maintenance sheet writes formal record');
    assert.equal(h.state['financialEvents.json'].events.length, 1, 'maintenance sheet writes linked formal transaction');
    assert.ok(maintenance.querySelector('[data-record-id]'), 'maintenance sheet refreshes its record list in place');
    maintenance.remove();
    const prepaid = h.plugin.openPrepaidTransactionSheet(IDS.prepaid); await flushDialog();
    wireForms(prepaid);
    form = prepaid.querySelector('[data-workflow-form]');
    // linkedom 的 select 未设 selected 时 value 为空串（真实浏览器默认首个 option），
    // 显式设 type 才能走到注入的存储失败分支而不是类型校验分支。
    setValue(form, 'type', 'inflow');
    setValue(form, 'date', '2026-07-18'); setValue(form, 'amount', '8.00'); setValue(form, 'note', 'draft retained');
    h.io.failFile = 'prepaidTransactions.json';
    await form.onsubmit({ preventDefault() {}, currentTarget: form });
    assert.equal(prepaid.isConnected, true, 'failed formal transaction keeps sheet open');
    assert.equal(form.querySelector('[name="amount"]').value, '8.00', 'failed formal transaction keeps amount draft');
    assert.equal(form.querySelector('[name="note"]').value, 'draft retained', 'failed formal transaction keeps note draft');
    h.io.failFile = null;
    prepaid.remove();
    // 阶段 R3 验收：次数 kind 字段按 kind 呈现（次数 + 可选支付金额，无金额输入、无退款选项），
    // 调整方向行仅在选择 adjust 时展开，保存走 count dimension 并就地刷新列表。
    const changeEvent = () => new h.document.defaultView.Event('change');
    const prepaidCountSheet = h.plugin.openPrepaidTransactionSheet(IDS.prepaidCount); await flushDialog();
    wireForms(prepaidCountSheet);
    const countForm = prepaidCountSheet.querySelector('[data-workflow-form]');
    assert.ok(countForm.querySelector('[name="count"]'), 'count kind exposes a count input');
    assert.ok(countForm.querySelector('[name="paymentAmount"]'), 'count kind exposes optional payment amount');
    assert.ok(!countForm.querySelector('[name="amount"]'), 'count kind never renders the amount input');
    assert.ok(!countForm.querySelector('select[name="type"] option[value="refund"]'), 'count kind never offers refund');
    const directionRow = countForm.querySelector('[data-workflow-direction-row]');
    assert.ok(directionRow && directionRow.classList.contains('is-hidden'), 'direction row stays hidden until adjust is selected');
    const typeControl = countForm.querySelector('select[name="type"]');
    setValue(countForm, 'type', 'adjust'); typeControl.dispatchEvent(changeEvent());
    assert.equal(directionRow.classList.contains('is-hidden'), false, 'choosing adjust reveals the direction row');
    setValue(countForm, 'type', 'inflow'); typeControl.dispatchEvent(changeEvent());
    assert.equal(directionRow.classList.contains('is-hidden'), true, 'leaving adjust hides the direction row again');
    const beforeCountTx = h.state['prepaidTransactions.json'].records.length;
    setValue(countForm, 'count', '2'); setValue(countForm, 'date', '2026-07-19'); setValue(countForm, 'note', 'session');
    await countForm.onsubmit({ preventDefault() {}, currentTarget: countForm }); await flushDialog();
    assert.equal(h.state['prepaidTransactions.json'].records.length, beforeCountTx + 1, 'count kind writes a formal prepaid transaction');
    const countRecord = h.state['prepaidTransactions.json'].records[h.state['prepaidTransactions.json'].records.length - 1];
    assert.equal(countRecord.dimension, 'count', 'count kind transaction keeps count dimension');
    assert.equal(countRecord.count, 2, 'count kind transaction stores the entered count');
    assert.ok(prepaidCountSheet.querySelector(`[data-record-id="${countRecord.id}"]`), 'count kind record list refreshes in place');
    prepaidCountSheet.remove();
    // 需求4（阶段 2b）：openRenewSheet 重构为液态玻璃 sheet（返回 mask DOM，非 Dialog）。
    const renew = h.plugin.openRenewSheet(IDS.subscription);
    wireForms(renew);
    form = renew.querySelector('[data-renew-form]');
    assert.ok(renew.querySelector('.am-edit-sheet'), 'renew uses liquid glass am-edit-sheet structure');
    assert.ok(renew.querySelector('.am-renew-sheet-form'), 'renew uses dedicated liquid glass sheet');
    setValue(form, 'amount', '30'); setValue(form, 'startDate', '2026-07-19'); setValue(form, 'endDate', '2026-08-18');
    await form.onsubmit({ preventDefault() {}, currentTarget: form });
    assert.equal(renew.isConnected, false, 'renew sheet closes (removed from DOM) after save');
    assert.equal(h.state['subscriptionPeriods.json'].records.length, 1, 'renew writes formal period');
    assert.equal(h.state['financialEvents.json'].events.filter(event => event.assetId === IDS.subscription).length, 1, 'renew writes formal payment');
    assert.ok(h.state['operationLogs.json'].logs.some(log => log.type === 'subscription-renew'), 'renew commits formal log in same domain transaction');
    console.log('[ui-parity-workflow-sheets] passed');
})().catch(error => { console.error(error); process.exit(1); });
