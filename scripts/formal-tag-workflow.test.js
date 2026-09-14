'use strict';
const assert = require('node:assert/strict');
const { asset, createHarness, flushDialog, setValue } = require('./formal-workflow-harness');
const ID = 'a1000000-0000-4000-8000-000000000001';

(async () => {
    const h = createHarness([asset(ID, 'physical', 'Camera')]);
    h.plugin.openSettingsDialog(); await flushDialog();
    const tagsTab = h.document.querySelector('[data-settings-tab="tags"]'); tagsTab.onclick();
    const form = h.document.querySelector('.am-settings-tags');
    const settingsDialog = h.connectedDialogs()[0];
    const lifecycleBeforeCreate = { created: h.dialogStats.created, destroyed: h.dialogStats.destroyed };
    setValue(form, 'settingsTagLabel', 'Travel'); await form.querySelector('[data-action="settings-create-tag"]').onclick();
    assert.equal(settingsDialog.element.isConnected, true); assert.deepEqual({ created: h.dialogStats.created, destroyed: h.dialogStats.destroyed }, lifecycleBeforeCreate);
    const travel = h.plugin._tags.find(tag => tag.label === 'Travel');
    assert.ok(travel, h.plugin.toasts.join(' | '));
    const [work] = await Promise.all([h.plugin.createTag({ label: 'Work' }), h.plugin.createTag({ label: 'Home' })]);
    assert.match(travel.id, /^[0-9a-f-]{36}$/); assert.equal(h.state['tags.json'].tags.length, 3);
    await h.plugin.updateAsset(ID, { tagIds: [travel.id] });
    // v2.6.6 追加：被引用标签渲染的删除按钮不再禁用。
    tagsTab.onclick();
    assert.match(h.plugin.renderSettingsTags(), /1 项资产引用/, 'reference count renders before delete');
    const deleteTravel = h.document.querySelector(`[data-settings-tag-delete="${travel.id}"]`);
    assert.ok(deleteTravel, 'referenced tag renders its delete button');
    assert.equal(deleteTravel.hasAttribute('disabled'), false, 'v2.6.6: referenced tag delete button is enabled');
    // v2.6.6 追加：deleteTag 级联——同事务移除资产 tagIds 中的该标签，目录与其余标签保留，逐资产记审计日志。
    assert.equal(await h.plugin.deleteTag(travel.id), true);
    assert.deepEqual(h.plugin._tags.map(tag => tag.label).sort(), ['Home', 'Work'], 'directory keeps other tags');
    assert.deepEqual(h.plugin.assets.find(item => item.id === ID).tagIds, [], 'cascade removed tag from asset in memory');
    assert.deepEqual(h.state['assets.json'].assets.find(item => item.id === ID).tagIds, [], 'cascade removed tag from asset on disk');
    const auditLogs = h.state['operationLogs.json'].logs;
    assert.ok(auditLogs.some(log => log.type === 'tag-delete' && log.assetId === travel.id), 'tag-delete audit entry');
    assert.ok(auditLogs.some(log => log.type === 'update' && log.field === 'tagIds' && log.assetId === ID), 'per-asset update audit entry');
    tagsTab.onclick();
    const deleteWork = h.document.querySelector(`[data-settings-tag-delete="${work.id}"]`);
    await deleteWork.onclick();
    // v2.6.6：标签删除与品牌 / 渠道同款二次确认——点删除先弹确认，点确认才真删。
    const tagConfirmOk = h.document.querySelector('.b3-dialog > .am-plugin-confirm-mask [data-scoped-confirm-ok]');
    assert.ok(tagConfirmOk, 'tag delete now opens scoped confirm instead of deleting directly');
    await tagConfirmOk.onclick();
    assert.equal(h.plugin._tags.length, 1);
    const html = h.plugin.renderSettingsTags(); assert.match(html, /settings-create-tag/);
    assert.ok(h.document.querySelector('[data-action="settings-create-tag"]'), 'real settings dialog renders tag CRUD DOM');
    h.io.failFile = 'tags.json'; const stable = structuredClone(h.plugin._tags);
    const failureForm = h.document.querySelector('.am-settings-tags'); setValue(failureForm, 'settingsTagLabel', 'Failed');
    const lifecycleBeforeFailure = { created: h.dialogStats.created, destroyed: h.dialogStats.destroyed };
    await failureForm.querySelector('[data-action="settings-create-tag"]').onclick(); await flushDialog();
    assert.deepEqual(h.plugin._tags, stable);
    assert.equal(settingsDialog.element.isConnected, true); assert.equal(failureForm.querySelector('[name="settingsTagLabel"]').value, 'Failed');
    assert.deepEqual({ created: h.dialogStats.created, destroyed: h.dialogStats.destroyed }, lifecycleBeforeFailure);
    console.log('[formal-tag-workflow] passed');
})().catch(error => { console.error(error); process.exit(1); });
