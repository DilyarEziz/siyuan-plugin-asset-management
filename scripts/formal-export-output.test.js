'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createStorage, FORMAL_BACKUP_DATA_KEYS } = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset, normalizeFinancialRecord } = require('../api/assets');

const root = path.resolve(__dirname, '..');
const NOW = '2026-07-20T00:00:00.000Z';

function memoryPlugin(initial) {
    const data = structuredClone(initial);
    return {
        async loadData(name) { return Object.prototype.hasOwnProperty.call(data, name) ? structuredClone(data[name]) : ''; },
        async saveData(name, value) { data[name] = structuredClone(value); return true; },
    };
}

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
    const asset = newFormalV2Asset({
        id: 'd1000000-0000-4000-8000-000000000001', kind: 'physical', name: 'Formal camera',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01', details: {}, tagIds: [],
    }, { now: NOW, today: '2026-07-20' });
    const storage = createStorage(memoryPlugin({
        'assets.json': createFormalV2AssetWrapper([asset], { updatedAt: NOW }),
        'tags.json': { schemaVersion: 1, tags: [], updatedAt: NOW },
        'settings.json': {},
    }));
    const backup = await storage.readFormalV2BackupSnapshot({ pluginVersion: '0.17.0', exportedAt: NOW });
    assert.equal(backup.format, 'siyuan-asset-management-backup');
    assert.equal(backup.schemaGeneration, 'formal-v2');
    assert.equal(backup.schemaVersion, 1);
    assert.deepEqual(Object.keys(backup.data).sort(), FORMAL_BACKUP_DATA_KEYS.slice().sort(),
        'backup carries every formal sidecar wrapper');
    assert.equal(backup.data.assets.schemaGeneration, 'formal-v2');
    assert.equal(backup.data.assets.schemaVersion, 1);
    assert.deepEqual(backup.data.assets.assets, [asset], 'canonical assets remain inside the strict wrapper');
    assert.equal(backup.data.maintenance.schemaVersion, 1);
    assert.deepEqual(backup.data.maintenance.records, []);

    const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
    const settingsStart = template.indexOf('    renderSettingsData() {');
    const settingsEnd = template.indexOf('    _closeSettingsClearAllAssetsConfirm(', settingsStart);
    const settingsData = template.slice(settingsStart, settingsEnd);
    const exportStart = template.indexOf('    async doExportJsonBackup(mode) {');
    const exportEnd = template.indexOf('    async importFromFile(', exportStart);
    const exportMethod = template.slice(exportStart, exportEnd);
    // v0.18 阶段 7：JSON 导入导出 UI 已从数据 Tab 移除，仅保留 Markdown 导出。
    assert.doesNotMatch(settingsData, /data-action="formal-json-download"/, 'JSON download UI removed from data tab');
    assert.doesNotMatch(settingsData, /data-action="formal-json-import"/, 'JSON import UI removed from data tab');
    assert.doesNotMatch(settingsData, /data-action="formal-reset-all"/, 'initialize-formal-data danger zone removed from data tab');
    assert.match(settingsData, /data-action="markdown-export"/,
        'settings exposes the Markdown export button (reference image 2 data tab)');
    assert.match(settingsData, /data-action="markdown-copy"/,
        'settings exposes the Markdown copy button (reference image 2 data tab)');
    assert.match(settingsData, /data-markdown-export-result/,
        'settings exposes the Markdown export result textarea');
    assert.match(exportMethod, /readFormalBackupSnapshot\(\{ pluginVersion: PLUGIN_VERSION \}\)/,
        'UI delegates backup construction to the formal storage API');

    // --- v0.18 阶段 7b：运行时断言（exportMarkdown 真实实现 + 真实点击，严禁 mock exportMarkdown） ---

    // 1. exportMarkdown must exist on prototype
    const PluginClass = loadPluginClass();
    assert.equal(typeof PluginClass.prototype.exportMarkdown, 'function',
        'exportMarkdown must exist on prototype');

    // 2. Build instance covering all 5 kinds + tags + financial events + snapshot
    const TODAY2 = '2026-07-20';
    const IDS2 = {
        physical: 'a1000000-0000-4000-8000-000000000001',
        subscription: 'a1000000-0000-4000-8000-000000000002',
        perpetual: 'a1000000-0000-4000-8000-000000000003',
        amount: 'a1000000-0000-4000-8000-000000000004',
        count: 'a1000000-0000-4000-8000-000000000005',
    };
    const TAG_ID = 'b1000000-0000-4000-8000-000000000001';
    function mkAsset(kind, id, details, overrides) {
        return newFormalV2Asset(Object.assign({
            id, kind, name: kind + ' asset', status: 'active', currency: 'CNY',
            acquiredOn: '2026-01-15', statusChangedOn: '2026-01-15',
            details: details || {}, tagIds: [TAG_ID], notes: kind + ' note',
        }, overrides || {}), { now: NOW, today: TODAY2 });
    }
    function mkFinancial(assetId, currency, amountMinor, eventType, id) {
        return normalizeFinancialRecord({
            id, assetId, occurredAt: NOW, effectiveDate: '2026-01-15', createdAt: NOW, source: 'user',
            direction: 'outflow', eventType, currency, amountMinor,
            metadata: eventType === 'adjustment' ? { affectsCash: false } : {},
        }, { now: NOW });
    }
    const fiveAssets = [
        mkAsset('physical', IDS2.physical, { warrantyEndsOn: '2027-06-01' }),
        mkAsset('virtualSubscription', IDS2.subscription, { billingPlan: { cycle: 'monthly' }, autoRenew: true }),
        mkAsset('virtualPerpetual', IDS2.perpetual, {}),
        mkAsset('prepaidAmount', IDS2.amount, { expiresOn: '2026-12-31' }),
        mkAsset('prepaidCount', IDS2.count, { expiresOn: null }),
    ];
    const fiveFinancialEvents = [
        mkFinancial(IDS2.physical, 'CNY', 10000, 'purchase', 'c1000000-0000-4000-8000-000000000001'),
        mkFinancial(IDS2.subscription, 'CNY', 2000, 'purchase', 'c1000000-0000-4000-8000-000000000002'),
        mkFinancial(IDS2.perpetual, 'CNY', 5000, 'purchase', 'c1000000-0000-4000-8000-000000000003'),
        mkFinancial(IDS2.amount, 'CNY', 3000, 'purchase', 'c1000000-0000-4000-8000-000000000004'),
        mkFinancial(IDS2.count, 'CNY', 800, 'purchase', 'c1000000-0000-4000-8000-000000000005'),
    ];
    const fiveTags = [{ id: TAG_ID, label: '测试标签', emoji: '🏷️', color: '#3575f3', createdAt: NOW, updatedAt: NOW }];

    const plugin = new PluginClass();
    plugin._t = (_key, fallback, params) => {
        const raw = fallback || _key;
        if (!params) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : '{' + k + '}'));
    };
    plugin.assets = fiveAssets;
    plugin._tags = fiveTags;
    plugin._financialEvents = fiveFinancialEvents;
    plugin._subscriptionPeriods = [];
    plugin._prepaidTransactions = [];
    plugin._maintenanceRecords = [];
    plugin._usageRecords = [];
    plugin._lifecycleEvents = [];
    plugin.wishlistEvents = [];
    plugin._opLogs = [];
    plugin._formalDomainLoaded = true;
    plugin._formalDomainStateSnapshot = {
        assets: fiveAssets, tags: fiveTags, financialEvents: fiveFinancialEvents,
        subscriptionPeriods: [], prepaidTransactions: [], maintenance: [],
        usage: [], lifecycleEvents: [], wishlistEvents: [], operationLogs: [],
    };
    plugin.showToast = () => {};

    const md = plugin.exportMarkdown();
    assert.equal(typeof md, 'string', 'exportMarkdown returns a string');
    assert.ok(md.includes('|---'), 'markdown contains separator row');
    fiveAssets.forEach(a => assert.ok(md.includes(a.name), 'markdown contains asset name: ' + a.name));
    // _formalKindLabel fallback labels (mock _t returns fallback)
    ['实物', '虚拟订阅', '买断软件', '金额预付', '次数预付'].forEach(label =>
        assert.ok(md.includes(label), 'markdown contains kind label: ' + label));
    // Line count: title(1) + generated(1) + blank(1) + header(1) + separator(1) + 5 data rows = 10
    assert.equal(md.split('\n').length, 10,
        'markdown has 10 lines (title + generated + blank + header + separator + 5 data rows)');

    // 3. Real click via bindSettingsTabEvents(root, 'data') — exportMarkdown is NOT mocked
    const resultEl = { value: '', focus() {}, select() {} };
    const exportBtn = {};
    const copyBtn = { disabled: true };
    const mockRoot = {
        querySelector(selector) {
            if (selector === '[data-markdown-export-result]') return resultEl;
            if (selector === '[data-action="markdown-export"]') return exportBtn;
            if (selector === '[data-action="markdown-copy"]') return copyBtn;
            return null; // bindFormalJsonSettings / reset button gracefully skip null
        },
    };
    const prevClipboard = global.navigator.clipboard;
    global.navigator.clipboard = { writeText: async () => {} }; // clipboard mock allowed
    try {
        plugin.bindSettingsTabEvents(mockRoot, 'data');
        assert.equal(typeof exportBtn.onclick, 'function', 'export button has onclick handler after bindSettingsTabEvents');
        await exportBtn.onclick();
        assert.equal(resultEl.value, plugin.exportMarkdown(),
            'textarea value equals a fresh exportMarkdown() return (real, not mocked)');
        assert.ok(resultEl.value.includes('|---'), 'clicked result contains separator');
        assert.ok(resultEl.value.includes(fiveAssets[0].name), 'clicked result contains first asset name');
        assert.ok(resultEl.value.length > 0, 'clicked result is non-empty');
    } finally {
        global.navigator.clipboard = prevClipboard;
    }

    console.log('[formal-export-output] passed');
}

main().catch(error => { console.error('[formal-export-output] failed:', error); process.exit(1); });
