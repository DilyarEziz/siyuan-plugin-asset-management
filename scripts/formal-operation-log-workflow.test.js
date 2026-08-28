'use strict';
const assert = require('node:assert/strict');
const { asset, createHarness, flushDialog } = require('./formal-workflow-harness');
const ID = 'a5000000-0000-4000-8000-000000000001';

(async () => {
    const h = createHarness([asset(ID, 'physical', 'Phone')]);
    await h.plugin.setStatus(ID, 'retired');
    const log = h.plugin._opLogs[0]; assert.equal(log.type, 'set-status');
    h.plugin.openSettingsDialog(); await flushDialog(); const settingsDialog = h.connectedDialogs()[0]; h.document.querySelector('[data-settings-tab="logs"]').onclick();
    assert.ok(h.document.querySelector('[data-open-formal-oplog]'), 'settings logs tab exposes the formal read-only dialog');
    await h.plugin.openFormalOperationLogDialog(); await flushDialog();
    const logDialog = h.connectedDialogs().find(dialog => dialog !== settingsDialog);
    const nameFilter = h.document.querySelector('[data-formal-oplog-name]');
    nameFilter.value = 'pho'; nameFilter.oninput(); assert.match(h.document.querySelector('[data-formal-oplog-list]').textContent, /Phone/);
    assert.ok(h.document.querySelector('[data-oplog-undo]') === null, 'formal audit log is read-only and has no legacy undo');
    assert.equal(h.plugin.assets[0].status, 'retired');
    assert.equal(settingsDialog.element.isConnected, true); assert.equal(logDialog.element.isConnected, true);
    h.io.failFile = 'operationLogs.json'; const memory = structuredClone(h.plugin._opLogs);
    const lifecycleBeforeFailure = { created: h.dialogStats.created, destroyed: h.dialogStats.destroyed };
    await assert.rejects(() => h.plugin.clearOperationLogsByIds([log.id])); assert.deepEqual(h.plugin._opLogs, memory);
    assert.equal(settingsDialog.element.isConnected, true); assert.equal(logDialog.element.isConnected, true); assert.deepEqual({ created: h.dialogStats.created, destroyed: h.dialogStats.destroyed }, lifecycleBeforeFailure);
    h.io.failFile = null; await h.plugin.clearOperationLogsByIds([log.id]); assert.equal(h.plugin._opLogs.length, 0, 'clear applies only to the persisted formal snapshot');
    console.log('[formal-operation-log-workflow] passed');
})().catch(error => { console.error(error); process.exit(1); });
