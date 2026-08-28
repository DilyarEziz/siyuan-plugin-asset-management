'use strict';
const assert = require('node:assert/strict');
const { asset, createHarness, flushDialog, setValue, wireForms } = require('./formal-workflow-harness');
const ID = 'a2000000-0000-4000-8000-000000000001';

/**
 * Stage R3 基线更新说明：
 *   旧实现用思源原生 Dialog（showDialog），断言围绕 dialog.element / dialogStats
 *   「销毁旧 dialog + 重开新 dialog」的生命周期。R3 把 openFormalWorkflowDialog 重写为
 *   插件内液态玻璃 sheet（返回 mask DOM，非 Dialog 实例），保存成功改为【就地刷新记录
 *   列表 + 清空草稿、不关闭 sheet】，删除失败改为 toast 报错（不再 reject）。
 *   因此本测试同步改为 mask 结构断言；域方法行为断言（记录形状、financialEvent 关联与
 *   void、失败不落库、读失败不改内存、非实物拒绝）保持原样。
 */
(async () => {
    const h = createHarness([asset(ID, 'physical', 'Laptop')]);
    let mask = h.plugin.openFormalWorkflowDialog(ID, 'maintenance'); await flushDialog();
    assert.ok(mask.querySelector('.am-edit-sheet.am-maintenance-sheet'), 'maintenance workflow renders as an in-plugin liquid glass sheet');
    assert.equal(h.dialogStats.created, 0, 'maintenance workflow no longer creates a native SiYuan dialog');
    wireForms(mask);
    let form = mask.querySelector('[data-workflow-form]');
    setValue(form, 'type', 'repair'); setValue(form, 'date', '2026-07-10'); setValue(form, 'amount', '12.50'); setValue(form, 'note', 'screen');
    await form.onsubmit({ preventDefault() {}, currentTarget: form }); await flushDialog();
    assert.equal(mask.isConnected, true, 'successful submit keeps the sheet open for continuous entry');
    const paid = h.plugin._maintenanceRecords.find(record => record.note === 'screen');
    assert.ok(paid, 'maintenance record committed');
    assert.ok(mask.querySelector(`[data-record-id="${paid.id}"]`), 'record list refreshes in place after save');
    assert.equal(form.querySelector('[name="note"]').value, '', 'note draft is cleared after a successful save');
    assert.equal(form.querySelector('[name="amount"]').value, '0', 'amount draft resets after a successful save');
    // Second entry through the same sheet (no reopen needed).
    setValue(form, 'type', 'maintain'); setValue(form, 'date', '2026-07-11'); setValue(form, 'amount', '0'); setValue(form, 'note', 'free');
    await form.onsubmit({ preventDefault() {}, currentTarget: form }); await flushDialog();
    const free = h.plugin._maintenanceRecords.find(record => record.note === 'free');
    assert.deepEqual(Object.keys(paid).sort(), ['assetId','createdAt','date','details','financialEventId','id','note','type'].sort());
    assert.equal(free.financialEventId, null); assert.equal(h.state['financialEvents.json'].events.length, 1);
    // Failed delete: toast, keep the record and the sheet, no lifecycle churn.
    h.io.failFile = 'operationLogs.json'; const beforeDeleteFailure = structuredClone(h.plugin._maintenanceRecords);
    const deleteButton = h.document.querySelector(`[data-record-id="${paid.id}"] [data-delete-record]`);
    const toastsBeforeDeleteFailure = h.plugin.toasts.length;
    await deleteButton.onclick(); await flushDialog();
    assert.ok(h.plugin.toasts.length > toastsBeforeDeleteFailure, 'failed delete surfaces a toast');
    assert.ok(h.plugin.toasts[h.plugin.toasts.length - 1].indexOf('⚠️') === 0, 'failed delete toast carries the error prefix');
    assert.deepEqual(h.plugin._maintenanceRecords, beforeDeleteFailure);
    assert.equal(mask.isConnected, true);
    assert.ok(mask.querySelector(`[data-record-id="${paid.id}"]`), 'failed delete keeps the record row');
    h.io.failFile = null; await deleteButton.onclick(); await flushDialog();
    assert.ok(h.state['financialEvents.json'].events[0].voidedAt, 'deletion voids but keeps financial history');
    assert.ok(!mask.querySelector(`[data-record-id="${paid.id}"]`), 'successful delete removes the record row in place');
    // Failed save: keep the draft and the sheet, never touch storage.
    h.io.failFile = 'operationLogs.json'; const memory = structuredClone(h.plugin._maintenanceRecords);
    form = mask.querySelector('[data-workflow-form]');
    setValue(form, 'type', 'repair'); setValue(form, 'date', '2026-07-12'); setValue(form, 'amount', '0.01'); setValue(form, 'note', 'retain me');
    await form.onsubmit({ preventDefault() {}, currentTarget: form });
    assert.deepEqual(h.plugin._maintenanceRecords, memory); assert.equal(h.state['maintenance.json'].records.length, 1);
    assert.equal(mask.isConnected, true); assert.equal(form.querySelector('[name="note"]').value, 'retain me');
    h.io.failFile = null; h.io.failReadFile = 'maintenance.json';
    await assert.rejects(() => h.plugin.addMaintenanceRecord(ID, { type: 'maintain', date: '2026-07-13', amountMinor: 0 }), error => error.code === 'FORMAL_STORAGE_READ_FAILED');
    assert.deepEqual(h.plugin._maintenanceRecords, memory, 'read failure cannot change memory');
    const wrong = createHarness([asset('a2000000-0000-4000-8000-000000000002', 'virtualPerpetual')]);
    await assert.rejects(() => wrong.plugin.addMaintenanceRecord(wrong.plugin.assets[0].id, { type: 'repair', date: '2026-07-12' }), /类型|support/i);
    console.log('[formal-maintenance-workflow] passed');
})().catch(error => { console.error(error); process.exit(1); });
