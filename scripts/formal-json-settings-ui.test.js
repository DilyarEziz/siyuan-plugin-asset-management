'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const pluginVersion = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'plugin.json'), 'utf8')
).version;

function loadPluginClass() {
    const originalLoad = Module._load;
    if (!global.navigator) global.navigator = { userAgent: '' };
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = originalLoad; }
}

async function main() {
    const PluginClass = loadPluginClass();
    const plugin = new PluginClass();
    plugin._t = (_key, fallback) => fallback;
    plugin.settings = {};
    const html = plugin.renderSettingsData();
    // v0.18 阶段 7：JSON 导入导出 UI 与「初始化正式数据」危险区已从数据 Tab 移除，
    // 仅保留 Markdown 导出。底层函数仍保留作死代码，下方继续直接测试。
    assert.doesNotMatch(html, /formal-json-download/, 'JSON 导出 UI 已隐藏');
    assert.doesNotMatch(html, /formal-json-import/, 'JSON 导入 UI 已隐藏');
    assert.doesNotMatch(html, /data-formal-json-file/, 'JSON 文件选择器已隐藏');
    assert.doesNotMatch(html, /formal-reset-all/, '初始化正式数据 UI 已移除');
    assert.match(html, /data-action="markdown-export"/, 'Markdown 导出保留');
    assert.match(html, /data-markdown-export-result/, 'Markdown 结果框保留');

    const download = {}, copy = {}, importButton = {};
    const fileInput = { value: 'same.json', clicks: 0, click() { this.clicks++; } };
    const elements = {
        '[data-action="formal-json-download"]': download, '[data-action="formal-json-copy"]': copy,
        '[data-action="formal-json-import"]': importButton, '[data-formal-json-file]': fileInput,
    };
    const root = { querySelector: selector => elements[selector] || null };
    const exports = [], imports = [];
    plugin.doExportJsonBackup = async mode => { exports.push(mode); };
    plugin.importFromFile = async input => { imports.push(input); input.value = ''; };
    plugin.bindFormalJsonSettings(root);
    await download.onclick(); await copy.onclick();
    assert.deepEqual(exports, ['download', 'copy']);
    importButton.onclick();
    assert.equal(fileInput.value, '', 'value clears before picker so the same file can be reselected after cancel');
    assert.equal(fileInput.clicks, 1);
    fileInput.value = 'same.json'; await fileInput.onchange();
    assert.deepEqual(imports, [fileInput]);
    assert.equal(fileInput.value, '', 'change finally clears the selected file');

    const backup = { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v1', schemaVersion: 1,
        exportedAt: '2026-07-19T00:00:00.000Z', pluginVersion: '0.17.0', data: {}, settings: {} };
    const calls = [];
    plugin.storage = { readFormalBackupSnapshot: async options => { calls.push(options); return backup; } };
    plugin.doExportJsonBackup = PluginClass.prototype.doExportJsonBackup.bind(plugin);
    plugin.showToast = () => {};
    let downloaded = null;
    plugin._downloadTextFile = (_name, text) => { downloaded = JSON.parse(text); };
    const previousClipboard = global.navigator.clipboard;
    let copied = null;
    global.navigator.clipboard = { writeText: async text => { copied = JSON.parse(text); } };
    try {
        await plugin.doExportJsonBackup('download');
        await plugin.doExportJsonBackup('copy');
    } finally { global.navigator.clipboard = previousClipboard; }
    assert.deepEqual(downloaded, backup);
    assert.deepEqual(copied, backup);
    assert.deepEqual(calls, [{ pluginVersion }, { pluginVersion }],
        'both actions use the single formal snapshot storage API');

    const raw = { format: 'siyuan-asset-management-raw-reset-backup', createdAt: '2026-07-20T00:00:00.000Z', payload: { assets: [{ legacy: true }] } };
    const rawCalls = [];
    plugin.storage = { readRawFormalResetBackup: async options => { rawCalls.push(options); return raw; } };
    let rawDownloaded = null;
    plugin._downloadTextFile = async (_name, text, type) => { rawDownloaded = { value: JSON.parse(text), type }; };
    const exportedRaw = await plugin.downloadRawFormalResetBackup();
    assert.deepEqual(exportedRaw, raw);
    assert.deepEqual(rawDownloaded.value, raw);
    assert.equal(rawDownloaded.type, 'application/json;charset=utf-8');
    assert.deepEqual(rawCalls, [{ pluginVersion }]);
    console.log('[formal-json-settings-ui] passed');
}

main().catch(error => { console.error(error); process.exit(1); });
