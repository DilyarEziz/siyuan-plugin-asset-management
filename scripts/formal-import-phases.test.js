'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

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
    const snapshot = { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v1', schemaVersion: 1 };
    const committedSnapshot = {
        assets: [{ id: 'formal-asset' }], tags: [{ id: 'formal-tag' }], financialEvents: [], lifecycleEvents: [],
        subscriptionPeriods: [], prepaidTransactions: [], usage: [], settings: { defaultSort: 'newest' },
    };
    const calls = [];
    const toasts = [];
    plugin.storage = {
        replaceFormalDomainFromBackup: async value => { calls.push(value); return { committedSnapshot }; },
        readAssets: async () => { throw new Error('legacy readAssets chain must be unreachable'); },
    };
    plugin.showToast = value => toasts.push(value);
    plugin._runGuardedUiEffects = value => { plugin.effects = value; };
    const input = { value: 'formal-backup.json', files: [{ text: async () => JSON.stringify(snapshot) }] };

    await plugin.importFromFile(input);

    assert.deepEqual(calls, [snapshot], 'settings import uses the formal storage replacement boundary exactly once');
    assert.deepEqual(plugin.assets, committedSnapshot.assets);
    assert.deepEqual(plugin.settings, committedSnapshot.settings);
    assert.deepEqual(plugin.effects, { renderDock: true, refreshModal: true });
    assert.equal(input.value, '');
    assert.match(toasts.join('\n'), /导入成功/);

    const source = fs.readFileSync(path.resolve(__dirname, '..', 'src.template.js'), 'utf8');
    assert.equal((source.match(/async importFromFile\s*\(/g) || []).length, 1,
        'only one reachable importFromFile implementation exists');
    for (const legacyHelper of ['_normalizeImportPayload', '_writeFullImportPayload', '_readCurrentBackupSnapshot', '_backupBeforeImport']) {
        assert.doesNotMatch(source, new RegExp('(?:async\\s+)?' + legacyHelper + '\\s*\\('), legacyHelper + ' is not reachable from the formal UI');
    }
    const importSource = source.slice(source.indexOf('async importFromFile('), source.indexOf('_closeSettingsFormalResetConfirm'));
    assert.match(importSource, /replaceFormalDomainFromBackup/);
    assert.doesNotMatch(importSource, /(?:readAssets|normalizeAsset|runAssetPersistenceTransaction)/);
    console.log('[formal-import-phases] passed');
}

main().catch(error => { console.error(error); process.exit(1); });
