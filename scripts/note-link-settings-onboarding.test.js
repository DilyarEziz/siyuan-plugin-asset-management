'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { parseHTML } = require('linkedom');

const NB_A = '20260817143000-aaaaaaa';
const DOC_A = '20260817143100-bbbbbbb';

function loadPluginClass() {
    const originalLoad = Module._load;
    if (!global.navigator) global.navigator = { userAgent: '' };
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve('../index.js')];
        return require('../index.js');
    } finally {
        Module._load = originalLoad;
    }
}

function createPlugin() {
    const PluginClass = loadPluginClass();
    const plugin = new PluginClass();
    plugin._t = (_key, fallback) => fallback;
    plugin.settings = {
        indexNotebookId: '',
        indexDocId: '',
        indexDocPath: '/stale-settings-path',
        indexEnabled: false,
        indexAutoSync: true,
    };
    plugin._noteIndexNotebooks = [{ id: NB_A, name: '主笔记本', closed: false }];
    plugin._noteIndexSelectedNotebookId = '';
    plugin.showToast = () => {};
    return plugin;
}

function assertStateRendering() {
    const plugin = createPlugin();
    const loading = plugin.renderNoteIndexSettings();
    assert.match(loading, /正在检测索引文档/, '首次渲染显示 loading');
    assert.match(loading, /data-note-index-root/, '设置区提供稳定 hydrate root');

    const unconfigured = plugin._renderNoteIndexSettingsContent({ state: 'unconfigured' });
    assert.match(unconfigured, /选择一个笔记本，插件会创建并自动维护索引文档/, 'unconfigured 显示初始说明');
    assert.match(unconfigured, /创建并启用/, 'unconfigured 只有创建主动作');
    assert.match(unconfigured, /data-note-index-action="create" disabled/, '未选笔记本时创建按钮禁用');
    assert.doesNotMatch(unconfigured, /noteIndexEnabled|noteIndexDocPath/, '不渲染旧总开关或路径输入');
    assert.doesNotMatch(unconfigured, /data-note-index-action="sync"|data-note-index-action="repair"/, 'unconfigured 不显示 ready 操作');

    plugin._noteIndexSelectedNotebookId = NB_A;
    const configuredChoice = plugin._renderNoteIndexSettingsContent({ state: 'unconfigured' });
    assert.doesNotMatch(configuredChoice, /data-note-index-action="create" disabled/, '选中笔记本后创建按钮可用');

    const ready = plugin._renderNoteIndexSettingsContent({
        state: 'ready', docId: DOC_A, notebookId: NB_A, notebookName: '实时笔记本',
        title: '移动后的索引标题', hPath: '/移动后/实时路径',
    });
    assert.match(ready, /索引文档已连接/, 'ready 显示连接状态');
    assert.match(ready, /移动后的索引标题/, 'ready 使用 inspect title');
    assert.match(ready, /实时笔记本 \/ 移动后\/实时路径/, 'ready 使用 inspect notebookName/hPath');
    assert.doesNotMatch(ready, /stale-settings-path/, 'ready 当前地址不读取 settings.indexDocPath');
    assert.match(ready, /打开文档/, 'ready 显示打开文档');
    assert.match(ready, /立即同步/, 'ready 显示立即同步');
    assert.match(ready, /修复索引/, 'ready 将重建操作命名为修复索引');
    assert.match(ready, /不会新建文档，也不会更换已有资产块 ID/, 'ready 解释原地修复语义');
    assert.match(ready, /name="noteIndexAutoSync"/, '自动同步开关仅 ready 可见');

    const closed = plugin._renderNoteIndexSettingsContent({ state: 'closed', notebookId: NB_A });
    assert.match(closed, /索引文档所在笔记本已关闭。打开笔记本后将自动恢复同步。/, 'closed 显示恢复说明');
    assert.match(closed, /data-note-index-action="redetect"/, 'closed 仅提供重新检测');
    assert.doesNotMatch(closed, /修复索引|重新创建文档|noteIndexAutoSync/, 'closed 不显示修复、重建或开关');

    plugin._noteIndexSelectedNotebookId = '';
    const missing = plugin._renderNoteIndexSettingsContent({ state: 'missing', notebookId: NB_A });
    assert.match(missing, /资产管理功能不受影响，但已有块引用可能失效/, 'missing 解释引用风险');
    assert.match(missing, new RegExp(`value="${NB_A}" selected`), 'missing 默认旧 indexNotebookId');
    assert.match(missing, /data-note-index-action="recreate"/, 'missing 显示重新创建');
    assert.doesNotMatch(missing, /修复索引|noteIndexAutoSync/, 'missing 不显示修复或自动同步');

    const error = plugin._renderNoteIndexSettingsContent({ state: 'error', error: '读取失败' });
    assert.match(error, /索引文档连接异常/, 'error 显示可读标题');
    assert.match(error, /读取失败/, 'error 显示内联错误');
    assert.match(error, /data-note-index-action="retry"/, 'error 提供重试');

    plugin._noteIndexOperationState = { ok: false, reason: 'name-conflict' };
    const conflict = plugin._renderNoteIndexSettingsContent({ state: 'unconfigured' });
    assert.match(conflict, /发现同名文档，但无法确认由插件创建。请重命名该文档后重试。/, 'name-conflict 不自动接管');
    plugin._noteIndexOperationState = { ok: false, reason: 'marker-pending', markerPending: true };
    const markerPending = plugin._renderNoteIndexSettingsContent({ state: 'error' });
    assert.match(markerPending, /索引文档标记待完成/, 'markerPending 显示专用状态');
}

class StableRoot {
    constructor() {
        this.innerHTML = '';
        this.onclick = null;
        this.onchange = null;
        this.isConnected = true;
    }
    contains() { return true; }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function readyInspection(title) {
    return { state: 'ready', docId: DOC_A, notebookId: NB_A, notebookName: '主笔记本', title, hPath: '/' + title };
}

function actionEvent(action) {
    const target = { dataset: { noteIndexAction: action } };
    target.closest = selector => selector === '[data-note-index-action]' ? target : null;
    return { target };
}

function notebookChangeEvent(value) {
    return {
        target: {
            value,
            matches: selector => selector === '[data-note-index-notebook]',
        },
    };
}

async function assertDelegatedLifecycle() {
    const plugin = createPlugin();
    const stableRoot = new StableRoot();
    const dialogRoot = { querySelector: selector => selector === '[data-note-index-root]' ? stableRoot : null };
    let state = 'unconfigured';
    let createCalls = 0;
    let syncCalls = 0;
    let saveCalls = 0;
    plugin.noteLink = {
        listNotebooks: async () => [{ id: NB_A, name: '主笔记本', closed: false }],
        inspectIndexDocument: async () => state === 'ready'
            ? { state: 'ready', docId: DOC_A, notebookId: NB_A, notebookName: '主笔记本', title: '实时标题', hPath: '/实时路径' }
            : { state: 'unconfigured', docId: null, notebookId: null },
        createIndexDocument: async notebookId => {
            createCalls += 1;
            assert.equal(notebookId, NB_A, '创建使用当前会话选择的笔记本');
            state = 'ready';
            plugin.settings = Object.assign({}, plugin.settings, { indexNotebookId: NB_A, indexDocId: DOC_A, indexEnabled: true });
            return { ok: true, state: 'ready', docId: DOC_A };
        },
        syncNow: async () => { syncCalls += 1; return { ok: true, state: 'ready', stats: {} }; },
        rebuildNow: async () => ({ ok: true, state: 'ready', stats: {} }),
    };
    plugin.saveSettings = async patch => {
        saveCalls += 1;
        plugin.settings = Object.assign({}, plugin.settings, patch);
        return true;
    };

    await plugin._bindNoteIndexSettings(dialogRoot);
    const delegatedClick = stableRoot.onclick;
    const delegatedChange = stableRoot.onchange;
    assert.match(stableRoot.innerHTML, /创建并启用/, 'inspect 后 hydrate unconfigured');

    await stableRoot.onchange(notebookChangeEvent(NB_A));
    assert.equal(createCalls, 0, 'select change 不创建文档');
    assert.equal(saveCalls, 0, 'select change 不写设置');
    assert.strictEqual(stableRoot.onclick, delegatedClick, 'select 导致 innerHTML 重渲染后 click 委托仍保留');
    assert.strictEqual(stableRoot.onchange, delegatedChange, 'select 导致 innerHTML 重渲染后 change 委托仍保留');

    await stableRoot.onclick(actionEvent('create'));
    assert.equal(createCalls, 1, '只有点击创建主按钮才调用 createIndexDocument');
    assert.match(stableRoot.innerHTML, /索引文档已连接/, '创建后重新 inspect 并 hydrate ready');
    assert.strictEqual(stableRoot.onclick, delegatedClick, '创建后重渲染不丢失 click 委托');

    await stableRoot.onclick(actionEvent('sync'));
    assert.equal(syncCalls, 1, '重渲染后立即同步事件仍生效');
}

async function assertMissingConfirmation() {
    const plugin = createPlugin();
    plugin.settings.indexNotebookId = NB_A;
    plugin.settings.indexDocId = DOC_A;
    const stableRoot = new StableRoot();
    const dialogRoot = { querySelector: selector => selector === '[data-note-index-root]' ? stableRoot : null };
    let state = 'missing';
    let recreateCalls = 0;
    let confirmOptions = null;
    plugin.noteLink = {
        listNotebooks: async () => [{ id: NB_A, name: '主笔记本', closed: false }],
        inspectIndexDocument: async () => state === 'missing'
            ? { state: 'missing', docId: DOC_A, notebookId: NB_A }
            : { state: 'ready', docId: DOC_A, notebookId: NB_A, notebookName: '主笔记本', title: '新索引', hPath: '/新索引' },
        recreateIndexDocument: async notebookId => {
            recreateCalls += 1;
            assert.equal(notebookId, NB_A);
            state = 'ready';
            return { ok: true, state: 'ready', docId: DOC_A };
        },
    };
    plugin._openScopedConfirm = (_host, options) => { confirmOptions = options; };

    await plugin._bindNoteIndexSettings(dialogRoot);
    await stableRoot.onclick(actionEvent('recreate'));
    assert.equal(recreateCalls, 0, '点击重新创建只打开确认层，不直接调用 recreate');
    assert.ok(confirmOptions, 'missing 使用插件范围 scoped confirm');
    assert.equal(confirmOptions.text, '重新创建会生成新的资产块 ID，原有笔记中的块引用不会自动恢复。');

    await confirmOptions.onConfirm();
    assert.equal(recreateCalls, 1, '二次确认后才调用 recreateIndexDocument');
    assert.match(stableRoot.innerHTML, /索引文档已连接/, '重新创建后重新 inspect');
}

async function assertRefreshGenerationGuards() {
    {
        const plugin = createPlugin();
        const stableRoot = new StableRoot();
        const dialogRoot = { querySelector: selector => selector === '[data-note-index-root]' ? stableRoot : null };
        const inspections = [deferred(), deferred()];
        const notebooks = [deferred(), deferred()];
        let inspectCall = 0;
        let notebookCall = 0;
        plugin.noteLink = {
            inspectIndexDocument: () => inspections[inspectCall++].promise,
            listNotebooks: () => notebooks[notebookCall++].promise,
        };

        const olderBind = plugin._bindNoteIndexSettings(dialogRoot);
        const newerRefresh = plugin._refreshNoteIndexSettings(stableRoot);
        inspections[1].resolve(readyInspection('新结果'));
        notebooks[1].resolve([{ id: NB_A, name: '新笔记本', closed: false }]);
        await newerRefresh;
        inspections[0].resolve(readyInspection('旧结果'));
        notebooks[0].resolve([{ id: NB_A, name: '旧笔记本', closed: false }]);
        await olderBind;

        assert.equal(plugin._noteIndexInspection.title, '新结果', '两次 inspect 逆序完成时保留新 generation');
        assert.match(stableRoot.innerHTML, /新结果/, '逆序完成只渲染新 inspect');
        assert.doesNotMatch(stableRoot.innerHTML, /旧结果/, '旧 inspect 不覆盖新结果');
    }

    {
        const plugin = createPlugin();
        const stableRoot = new StableRoot();
        const dialogRoot = { querySelector: selector => selector === '[data-note-index-root]' ? stableRoot : null };
        const inspection = deferred();
        const notebooks = deferred();
        plugin.noteLink = {
            inspectIndexDocument: () => inspection.promise,
            listNotebooks: () => notebooks.promise,
        };
        const pending = plugin._bindNoteIndexSettings(dialogRoot);
        stableRoot.isConnected = false;
        inspection.resolve(readyInspection('断开结果'));
        notebooks.resolve([]);
        await pending;
        assert.equal(stableRoot.innerHTML, '', 'root 断开后异步结果不渲染');
        assert.equal(plugin._noteIndexInspection, undefined, 'root 断开后不提交 inspection');
    }

    {
        const plugin = createPlugin();
        const stableRoot = new StableRoot();
        const dialogRoot = { querySelector: selector => selector === '[data-note-index-root]' ? stableRoot : null };
        const inspection = deferred();
        const notebooks = deferred();
        plugin.noteLink = {
            inspectIndexDocument: () => inspection.promise,
            listNotebooks: () => notebooks.promise,
        };
        const pending = plugin._bindNoteIndexSettings(dialogRoot);
        plugin._invalidateNoteIndexSettings(dialogRoot);
        inspection.resolve(readyInspection('切页结果'));
        notebooks.resolve([]);
        await pending;
        assert.equal(stableRoot.innerHTML, '', '切 Tab 失效 binding 后不渲染');
        assert.equal(plugin._noteIndexInspection, undefined, '切 Tab 后不提交 inspection');
    }

    {
        const plugin = createPlugin();
        const oldRoot = new StableRoot();
        const newRoot = new StableRoot();
        const oldDialog = { querySelector: selector => selector === '[data-note-index-root]' ? oldRoot : null };
        const newDialog = { querySelector: selector => selector === '[data-note-index-root]' ? newRoot : null };
        const inspections = [deferred(), deferred()];
        const notebooks = [deferred(), deferred()];
        let inspectCall = 0;
        let notebookCall = 0;
        plugin.noteLink = {
            inspectIndexDocument: () => inspections[inspectCall++].promise,
            listNotebooks: () => notebooks[notebookCall++].promise,
        };
        const oldBind = plugin._bindNoteIndexSettings(oldDialog);
        const newBind = plugin._bindNoteIndexSettings(newDialog);
        inspections[1].resolve(readyInspection('重开新结果'));
        notebooks[1].resolve([]);
        await newBind;
        inspections[0].resolve(readyInspection('重开旧结果'));
        notebooks[0].resolve([]);
        await oldBind;
        assert.match(newRoot.innerHTML, /重开新结果/, '重开 Dialog 的新 root 保留新结果');
        assert.equal(oldRoot.innerHTML, '', '旧 Dialog Promise 不再渲染旧 root');
        assert.equal(plugin._noteIndexInspection.title, '重开新结果', '旧 Dialog Promise 不覆盖新 inspection');
    }
}

async function assertScopedRecreateConfirmationGuard() {
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    const windowDescriptor = Object.getOwnPropertyDescriptor(global, 'window');
    const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
    Object.defineProperty(global, 'document', { value: document, configurable: true });
    Object.defineProperty(global, 'window', { value: window, configurable: true });
    try {
        const plugin = createPlugin();
        plugin.settings.indexNotebookId = NB_A;
        plugin.settings.indexDocId = DOC_A;
        let state = 'missing';
        let recreateCalls = 0;
        let recreateResult = null;
        plugin.noteLink = {
            listNotebooks: async () => [{ id: NB_A, name: '主笔记本', closed: false }],
            inspectIndexDocument: async () => state === 'missing'
                ? { state: 'missing', docId: DOC_A, notebookId: NB_A }
                : readyInspection('确认后新索引'),
            recreateIndexDocument: async () => {
                recreateCalls += 1;
                if (recreateResult) await recreateResult.promise;
                state = 'ready';
                return { ok: true, state: 'ready', docId: DOC_A };
            },
        };

        const dialogRoot = document.createElement('div');
        dialogRoot.innerHTML = plugin.renderNoteIndexSettings();
        document.body.appendChild(dialogRoot);
        let noteRoot = dialogRoot.querySelector('[data-note-index-root]');
        await plugin._bindNoteIndexSettings(dialogRoot);

        const openRecreate = async () => {
            const button = noteRoot.querySelector('[data-note-index-action="recreate"]');
            assert.ok(button, 'missing 状态提供 recreate 按钮');
            await noteRoot.onclick({ target: button });
        };

        await openRecreate();
        await openRecreate();
        assert.equal(noteRoot.querySelectorAll('.am-plugin-confirm-mask').length, 1, 'recreate 快速双击只有一个确认层');
        noteRoot.querySelector('[data-scoped-confirm-cancel]').onclick();
        assert.equal(recreateCalls, 0, '取消确认不调用 recreate');

        await openRecreate();
        const escapeEvent = new window.Event('keydown');
        Object.defineProperty(escapeEvent, 'key', { value: 'Escape' });
        window.dispatchEvent(escapeEvent);
        assert.equal(noteRoot.querySelectorAll('.am-plugin-confirm-mask').length, 0, 'Esc 清理 scoped confirm');
        assert.equal(recreateCalls, 0, 'Esc 不调用 recreate');

        await openRecreate();
        plugin._invalidateNoteIndexSettings(dialogRoot);
        assert.equal(noteRoot.querySelectorAll('.am-plugin-confirm-mask').length, 0, '设置 Dialog 失效时清理确认层');

        dialogRoot.innerHTML = plugin.renderNoteIndexSettings();
        noteRoot = dialogRoot.querySelector('[data-note-index-root]');
        await plugin._bindNoteIndexSettings(dialogRoot);
        await openRecreate();
        recreateResult = deferred();
        const confirm = noteRoot.querySelector('[data-scoped-confirm-ok]');
        const firstConfirm = confirm.onclick();
        const secondConfirm = confirm.onclick();
        assert.equal(recreateCalls, 1, '确认按钮快速双击最多调用一次 recreate');
        recreateResult.resolve();
        await Promise.all([firstConfirm, secondConfirm]);
        assert.match(noteRoot.innerHTML, /确认后新索引/, '单次 recreate 完成后刷新 ready 状态');
    } finally {
        if (documentDescriptor) Object.defineProperty(global, 'document', documentDescriptor); else delete global.document;
        if (windowDescriptor) Object.defineProperty(global, 'window', windowDescriptor); else delete global.window;
    }
}

(async () => {
    assertStateRendering();
    await assertDelegatedLifecycle();
    await assertMissingConfirmation();
    await assertRefreshGenerationGuards();
    await assertScopedRecreateConfirmationGuard();
    console.log('[note-link-settings-onboarding] passed');
})().catch(error => { console.error(error); process.exit(1); });
