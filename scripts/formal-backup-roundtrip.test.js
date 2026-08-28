'use strict';

const assert = require('node:assert/strict');
const { createStorage, validateFormalImportSnapshot } = require('../api/storage');
const { newFormalV2Asset } = require('../api/assets');

const NOW = '2026-07-19T00:00:00.000Z';
const TAG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function memoryPlugin(initial) {
    const data = structuredClone(initial || {});
    return {
        data,
        async loadData(name) { return Object.prototype.hasOwnProperty.call(data, name) ? structuredClone(data[name]) : ''; },
        async saveData(name, value) { data[name] = structuredClone(value); return true; },
        async removeData(name) { delete data[name]; return true; },
    };
}

async function seededStorage(plugin) {
    const storage = createStorage(plugin);
    await storage.initializeFormalStorageReset({ confirmReset: true });
    const asset = newFormalV2Asset({
        kind: 'physical', name: 'Camera',
        acquiredOn: '2026-07-01', tagIds: [TAG], details: { warrantyEndsOn: null },
    }, { now: NOW, today: '2026-07-19' });
    await storage.runFormalAssetPersistenceTransaction(snapshot => ({ change: {
        tags: [{ id: TAG, label: '工作', emoji: '', color: '', isSystem: false, createdAt: NOW }],
        assets: snapshot.assets.concat([asset]),
    } }));
    return storage;
}

async function main() {
    const sourcePlugin = memoryPlugin();
    const source = await seededStorage(sourcePlugin);
    await source.writeSettings({
        aiEnabled: true,
        aiAllowQuery: true,
        aiAllowCreate: true,
        aiAllowModify: false,
        aiAllowLifecycle: true,
        aiAllowRecords: true,
        aiAllowDelete: false,
        exchangeRateAutoRefresh: true,
    });
    const backup = await source.readFormalV2BackupSnapshot({ pluginVersion: '0.17.0', exportedAt: NOW });
    assert.equal(backup.format, 'siyuan-asset-management-backup');
    assert.equal(backup.schemaGeneration, 'formal-v2');
    assert.equal(backup.schemaVersion, 1);
    assert.deepEqual(Object.keys(backup.data).sort(), [
        'assets', 'exchangeRates', 'financialEvents', 'lifecycleEvents', 'maintenance',
        'operationLogs', 'prepaidTransactions', 'subscriptionPeriods', 'tags', 'usage', 'wishlistEvents',
    ].sort(), 'all formal domain files are represented');
    assert.equal(validateFormalImportSnapshot(backup).valid, true);
    assert.equal(backup.settings.aiEnabled, true);
    assert.equal(backup.settings.aiAllowCreate, true);
    assert.equal(backup.settings.aiAllowLifecycle, true);
    assert.equal(backup.settings.aiAllowRecords, true);
    assert.equal(backup.settings.aiAllowDelete, false);
    assert.equal(backup.settings.exchangeRateAutoRefresh, true, 'exchangeRateAutoRefresh=true survives the backup whitelist');
    assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, 'aiPrivacyScope'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, 'aiMaxAssets'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, 'apiKey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, 'provider'), false);

    const destinationPlugin = memoryPlugin();
    const destination = createStorage(destinationPlugin);
    await destination.initializeFormalStorageReset({ confirmReset: true });
    assert.equal(Object.prototype.hasOwnProperty.call(backup.settings, 'schemaVersion'), false);
    const replacement = await destination.replaceFormalV2DomainFromBackup(backup).catch(error => { error.message = 'destination import: ' + error.message; throw error; });
    assert.deepEqual(replacement.previousSnapshot.assets, [], 'transaction returns the FIFO-consistent previous asset snapshot');
    assert.deepEqual(replacement.committedSnapshot.assets, backup.data.assets.assets,
        'transaction returns the read-back committed asset snapshot');
    const roundtrip = await destination.readFormalV2BackupSnapshot({ pluginVersion: '0.17.0', exportedAt: NOW });
    assert.deepEqual(roundtrip.data, backup.data, 'all domain wrappers round-trip exactly');
    assert.equal(roundtrip.settings.resourceIndex.managedBlockId, undefined, 'runtime resource-index state is never exported');
    assert.equal(roundtrip.settings.exchangeRateAutoRefresh, true, 'exchangeRateAutoRefresh=true round-trips through backup import');
    await destination.writeSettings({ exchangeRateAutoRefresh: false });
    const refreshed = await destination.readFormalV2BackupSnapshot({ pluginVersion: '0.17.0', exportedAt: NOW });
    assert.equal(refreshed.settings.exchangeRateAutoRefresh, false, 'exchangeRateAutoRefresh=false also round-trips through the backup whitelist');

    assert.equal(validateFormalImportSnapshot(Object.assign({}, backup, { schemaVersion: 2 })).valid, false);
    assert.equal(validateFormalImportSnapshot(Object.assign({}, backup, { surprise: true })).valid, false);
    const incomplete = structuredClone(backup); delete incomplete.data.usage;
    assert.equal(validateFormalImportSnapshot(incomplete).valid, false, 'partial backups are rejected');

    const failingPlugin = memoryPlugin(destinationPlugin.data);
    const originalSave = failingPlugin.saveData;
    let writes = 0;
    failingPlugin.saveData = async function(name, value) {
        writes++;
        if (writes === 3) throw new Error('injected import failure');
        return originalSave.call(this, name, value);
    };
    const failing = createStorage(failingPlugin);
    const before = structuredClone(failingPlugin.data);
    await assert.rejects(() => failing.replaceFormalV2DomainFromBackup(backup), /formal v2 import failed/);
    assert.deepEqual(failingPlugin.data, before, 'partial write is compensated back to the original bytes');
    console.log('[formal-backup-roundtrip] passed');
}

main().catch(error => { console.error(error); process.exit(1); });


