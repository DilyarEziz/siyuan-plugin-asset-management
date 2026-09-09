'use strict';

/**
 * v2.6.5 目录阶段1b：dimensions.json（brands/channels 展示目录）storage 边界测试。
 *
 * 覆盖：
 *   1. 旧快照缺 dimensions.json → 读取不报错，返回空目录
 *   2. dimensions 读写 normalize（label trim、未知字段拒绝、查重、上限语义）
 *   3. schemaVersion !== 1 → RESET_REQUIRED；非法结构 → STORAGE_CORRUPT
 *   4. brandId / channelId 写入资产后 roundtrip 保持
 *   5. 审计 brand-create/brand-update/brand-delete + channel 变体记录合法
 *      （含非法 field / 非 null newValue / 悬空 create 的拒绝路径）
 *   6. export → import roundtrip 保留 dimensions 与资产外键
 *   7. reset 覆盖 dimensions.json 且 preflight/counts 统计目录条目
 */

const assert = require('node:assert/strict');
const assetsApi = require('../api/assets');
const storageApi = require('../api/storage');

// linkedom Event 基线补丁（与 calendar-warranty-link.test.js 同源）：Node 24 上
// Event 多个只读属性会被 linkedom dispatchEvent 赋值而抛错。表单提交路径内部
// 会 dispatch input/change 事件，测试环境需要该补丁才能完整跑通 onsubmit。
const BACKING = ['eventPhase', 'currentTarget', 'target', 'srcElement', 'bubbles',
    'defaultPrevented', 'composed', 'timeStamp'];
for (const key of BACKING) {
    const desc = Object.getOwnPropertyDescriptor(Event.prototype, key);
    if (!desc || desc.configurable === false) continue;
    const storeKey = '__am_' + key;
    Object.defineProperty(Event.prototype, key, {
        get() { return this[storeKey]; },
        set(value) { this[storeKey] = value; },
        configurable: true,
    });
}
const { createHarness, asset: harnessAsset } = require('./formal-workflow-harness');

const NOW = '2026-09-09T00:00:00.000Z';
const NOW_PLUS = '2026-09-09T01:00:00.000Z';
const NOW_PLUS2 = '2026-09-09T02:00:00.000Z';
const TODAY = '2026-09-09';
const BRAND_ID = '30000000-0000-4000-8000-000000000001';
const BRAND2_ID = '30000000-0000-4000-8000-000000000002';
const CHANNEL_ID = '31000000-0000-4000-8000-000000000001';
const CHANNEL2_ID = '31000000-0000-4000-8000-000000000002';
const ASSET_ID = '10000000-0000-4000-8000-000000000001';
const LOG_IDS = {
    brandCreate: '32000000-0000-4000-8000-000000000001',
    brandUpdate: '32000000-0000-4000-8000-000000000002',
    brandDelete: '32000000-0000-4000-8000-000000000003',
    channelCreate: '32000000-0000-4000-8000-000000000004',
    channelUpdate: '32000000-0000-4000-8000-000000000005',
    channelDelete: '32000000-0000-4000-8000-000000000006',
};

function clone(value) { return value == null ? value : structuredClone(value); }

function createPlugin(files) {
    const state = files || {};
    const calls = { loads: [], saves: [], removes: [] };
    return {
        state,
        calls,
        async loadData(name) {
            calls.loads.push(name);
            return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : '';
        },
        async saveData(name, payload) {
            calls.saves.push(name);
            state[name] = clone(payload);
            return true;
        },
        async removeData(name) {
            calls.removes.push(name);
            delete state[name];
            return true;
        },
    };
}

function makeAsset(extra) {
    return assetsApi.newFormalV2Asset(Object.assign({
        id: ASSET_ID, kind: 'physical', name: 'Camera', tagIds: [], details: {},
    }, extra || {}), { now: NOW, today: TODAY, currency: 'CNY' });
}

const brandEntry = { id: BRAND_ID, label: 'Acme', color: '#ff0000', createdAt: NOW };
const brand2Entry = { id: BRAND2_ID, label: 'Globex' };
const channelEntry = { id: CHANNEL_ID, label: 'Official Store', emoji: '🏬' };
const channel2Entry = { id: CHANNEL2_ID, label: 'Marketplace' };
const dimensionsPayload = {
    schemaVersion: 1,
    brands: [brandEntry, brand2Entry],
    channels: [channelEntry, channel2Entry],
    updatedAt: NOW,
};

function directoryLog(id, type, entryId, label, field, oldValue, newValue, ts) {
    return { id, type, assetId: entryId, assetName: label, field, oldValue, newValue, ts };
}

(async () => {
    // ---- 1. 旧快照缺 dimensions.json：读取不报错，返回空目录 ----
    const legacyStorage = storageApi.createStorage(createPlugin({}));
    const legacySnapshot = await legacyStorage.readFormalV2AssetDomainSnapshot();
    assert.deepEqual(legacySnapshot.dimensions, { schemaVersion: 1, brands: [], channels: [] },
        'missing dimensions.json reads as empty catalogs');

    // ---- 2. 写路径 normalize + 读回 ----
    const plugin = createPlugin({});
    const storage = storageApi.createStorage(plugin);
    const writeResult = await storage.mutateFormalV2AssetDomain(() => ({
        dimensions: {
            brands: [{ id: BRAND_ID, label: '  Acme  ', color: ' #FF0000 ', createdAt: ' ' + NOW + ' ' }, brand2Entry],
            channels: [channelEntry, channel2Entry],
        },
    }));
    assert.deepEqual(writeResult.dimensions.brands, [
        { id: BRAND_ID, label: 'Acme', color: '#FF0000', createdAt: NOW },
        { id: BRAND2_ID, label: 'Globex' },
    ], 'directory entries normalize ids and trim labels');
    // un-trimmed ids are rejected exactly like tags.json
    await assert.rejects(() => storage.mutateFormalV2AssetDomain(() => ({
        dimensions: { brands: [{ id: ' ' + BRAND2_ID + ' ', label: 'Padded' }], channels: [] },
    })), /\[storage\] tags\[0\]\.id must be a lowercase UUID/);
    const persisted = plugin.state['dimensions.json'];
    assert.equal(persisted.schemaVersion, 1, 'dimensions.json persists as a strict v1 wrapper');
    assert.equal(persisted.brands.length, 2);
    assert.equal(persisted.channels.length, 2);

    // write payload missing a directory array is rejected without writes
    const beforeBadWrite = clone(plugin.state);
    await assert.rejects(() => storage.mutateFormalV2AssetDomain(() => ({
        dimensions: { brands: [] },
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.IMPORT_INVALID);
    assert.deepEqual(plugin.state, beforeBadWrite, 'rejected dimension write leaves storage untouched');

    // duplicate ids across brands and channels share one namespace
    await assert.rejects(() => storage.mutateFormalV2AssetDomain(() => ({
        dimensions: { brands: [{ id: BRAND_ID, label: 'Acme' }], channels: [{ id: BRAND_ID, label: 'Clash' }] },
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);

    // ---- 3. 非法 wrapper：RESET_REQUIRED / STORAGE_CORRUPT ----
    const resetRequired = storageApi.createStorage(createPlugin({
        'dimensions.json': { schemaVersion: 2, brands: [], channels: [] },
    }));
    await assert.rejects(() => resetRequired.readFormalV2AssetDomainSnapshot(),
        error => error && error.code === storageApi.FORMAL_ERROR_CODE.RESET_REQUIRED
            && /dimensions\.json is not a strict v1 sidecar wrapper/.test(error.message));

    const corruptUnknownField = storageApi.createStorage(createPlugin({
        'dimensions.json': { schemaVersion: 1, brands: [], channels: [], surprise: true },
    }));
    await assert.rejects(() => corruptUnknownField.readFormalV2AssetDomainSnapshot(),
        error => error && error.code === storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT);

    const corruptMissingArray = storageApi.createStorage(createPlugin({
        'dimensions.json': { schemaVersion: 1, brands: [] },
    }));
    await assert.rejects(() => corruptMissingArray.readFormalV2AssetDomainSnapshot(),
        error => error && error.code === storageApi.FORMAL_ERROR_CODE.STORAGE_CORRUPT);

    // ---- 4. brandId / channelId 写入资产后 roundtrip 保持 ----
    const refStorage = storageApi.createStorage(createPlugin({}));
    await refStorage.mutateFormalV2AssetDomain(() => ({
        assets: [makeAsset({ brandId: BRAND_ID, channelId: CHANNEL_ID })],
        dimensions: { brands: [brandEntry], channels: [channelEntry] },
    }));
    const refSnapshot = await refStorage.readFormalV2AssetDomainSnapshot();
    assert.equal(refSnapshot.assets[0].brandId, BRAND_ID, 'asset.brandId survives the formal roundtrip');
    assert.equal(refSnapshot.assets[0].channelId, CHANNEL_ID, 'asset.channelId survives the formal roundtrip');
    assert.equal(refSnapshot.dimensions.brands[0].id, BRAND_ID);

    // ---- 5. 审计 brand-*/channel-* 操作日志 ----
    // 5a. 悬空 create（目录中不存在且无后续 delete）必须拒绝
    const danglingLogs = [directoryLog(LOG_IDS.brandCreate, 'brand-create', BRAND_ID, 'Acme', 'color', null, brandEntry, NOW)];
    const danglingStorage = storageApi.createStorage(createPlugin({}));
    await assert.rejects(() => danglingStorage.mutateFormalV2AssetDomain(() => ({
        operationLogs: danglingLogs,
    })), error => error && error.code === storageApi.FORMAL_ERROR_CODE.REFERENCE_INVALID);

    // 5b. create + update + delete 全链（brand 与 channel 各一条线）在同一事务中合法
    const chainLogs = [
        directoryLog(LOG_IDS.brandCreate, 'brand-create', BRAND_ID, 'Acme', null, null, { id: BRAND_ID, label: 'Acme', color: '#ff0000' }, NOW),
        directoryLog(LOG_IDS.brandUpdate, 'brand-update', BRAND_ID, 'Acme', 'color', '#ff0000', null, NOW_PLUS),
        directoryLog(LOG_IDS.brandDelete, 'brand-delete', BRAND_ID, 'Acme', null, { id: BRAND_ID, label: 'Acme', color: null }, null, NOW_PLUS2),
        directoryLog(LOG_IDS.channelCreate, 'channel-create', CHANNEL_ID, 'Official Store', null, null, { id: CHANNEL_ID, label: 'Official Store', emoji: '🏬' }, NOW),
        directoryLog(LOG_IDS.channelUpdate, 'channel-update', CHANNEL_ID, 'Official Store', 'color', null, '#3575f3', NOW_PLUS),
        directoryLog(LOG_IDS.channelDelete, 'channel-delete', CHANNEL_ID, 'Official Store', null, { id: CHANNEL_ID, label: 'Official Store' }, null, NOW_PLUS2),
    ];
    const chainStorage = storageApi.createStorage(createPlugin({}));
    const chainResult = await chainStorage.mutateFormalV2AssetDomain(() => ({
        assets: [makeAsset()],
        dimensions: { brands: [brandEntry, brand2Entry], channels: [channelEntry, channel2Entry] },
        operationLogs: chainLogs,
    }));
    assert.equal(chainResult.operationLogs.length, 6, 'directory audit chain persists');

    // 5c. 非法形态：update field 不是 color / delete newValue 非 null / 未知类型
    const importBase = () => {
        const data = storageApi.createFormalV2ResetSnapshot({ updatedAt: NOW });
        data.assets = assetsApi.createFormalV2AssetWrapper([makeAsset()], { updatedAt: NOW });
        data.dimensions = clone(dimensionsPayload);
        return {
            format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v2', schemaVersion: 1,
            exportedAt: NOW, pluginVersion: '2.6.5', data, settings: {},
        };
    };
    const badField = importBase();
    badField.data.operationLogs.logs = [directoryLog(LOG_IDS.brandUpdate, 'brand-update', BRAND_ID, 'Acme', 'label', 'Acme', 'Renamed', NOW)];
    assert.equal(storageApi.validateFormalV2ImportSnapshot(badField).valid, false,
        'brand-update with a non-color field is rejected');

    const badDelete = importBase();
    badDelete.data.operationLogs.logs = [directoryLog(LOG_IDS.brandDelete, 'brand-delete', BRAND_ID, 'Acme', null, { id: BRAND_ID, label: 'Acme' }, { id: BRAND_ID, label: 'Acme' }, NOW)];
    assert.equal(storageApi.validateFormalV2ImportSnapshot(badDelete).valid, false,
        'brand-delete with a non-null newValue is rejected');

    const unknownType = importBase();
    unknownType.data.operationLogs.logs = [directoryLog(LOG_IDS.brandCreate, 'brand-rename', BRAND_ID, 'Acme', null, null, null, NOW)];
    assert.equal(storageApi.validateFormalV2ImportSnapshot(unknownType).valid, false,
        'unknown directory operation type is rejected');

    const goodImport = importBase();
    goodImport.data.operationLogs.logs = chainLogs;
    const chainImport = storageApi.validateFormalV2ImportSnapshot(goodImport);
    assert.equal(chainImport.valid, true, 'full directory audit chain validates: '
        + (chainImport.valid ? '' : chainImport.errors.join('; ')));

    // ---- 6. export → import roundtrip 保留 dimensions 与资产外键 ----
    const source = storageApi.createStorage(createPlugin({}));
    await source.mutateFormalV2AssetDomain(() => ({
        assets: [makeAsset({ brandId: BRAND_ID, channelId: CHANNEL_ID })],
        dimensions: { brands: [brandEntry], channels: [channelEntry] },
    }));
    const backup = await source.readFormalV2BackupSnapshot({ pluginVersion: '2.6.5', exportedAt: NOW });
    assert.deepEqual(Object.keys(backup.data).sort(), storageApi.FORMAL_BACKUP_DATA_KEYS.slice().sort(),
        'backup data enumerates every formal domain including dimensions');
    assert.equal(backup.data.dimensions.brands[0].label, 'Acme');
    assert.equal(storageApi.validateFormalV2ImportSnapshot(backup).valid, true);

    const destination = storageApi.createStorage(createPlugin({}));
    await destination.initializeFormalStorageReset({ confirmReset: true });
    await destination.replaceFormalV2DomainFromBackup(backup);
    const restored = await destination.readFormalV2AssetDomainSnapshot();
    assert.deepEqual(restored.dimensions, { schemaVersion: 1, brands: [brandEntry], channels: [channelEntry], updatedAt: restored.dimensions.updatedAt },
        'dimensions survive the import roundtrip');
    assert.equal(restored.assets[0].brandId, BRAND_ID);
    assert.equal(restored.assets[0].channelId, CHANNEL_ID);

    // ---- 7. reset 覆盖 dimensions.json 且 counts 统计目录条目 ----
    const resetPlugin = createPlugin({
        'dimensions.json': clone(dimensionsPayload),
        'assets.json': { schemaVersion: 10, assets: [] },
    });
    const resetStorage = storageApi.createStorage(resetPlugin);
    const preflight = await resetStorage.readFormalResetPreflight();
    assert.equal(preflight.counts.dimensions, 4, 'reset preflight counts brand+channel entries');
    const resetResult = await resetStorage.initializeFormalStorageReset({ confirmReset: true });
    assert.equal(resetResult.counts.dimensions, 4, 'reset reports the previous directory entry count');
    assert.deepEqual(resetPlugin.state['dimensions.json'].brands, [], 'reset clears brands');
    assert.deepEqual(resetPlugin.state['dimensions.json'].channels, [], 'reset clears channels');
    assert.equal(resetPlugin.state['dimensions.json'].schemaVersion, 1);
    const afterReset = await resetStorage.readFormalV2AssetDomainSnapshot();
    assert.deepEqual(afterReset.dimensions.brands, []);

    // ---- 8. v2.6.5 修复回归：pending 品牌/途径 resolve 顺序 + 悬空 id 回显防御 ----
    // 8a. 编辑表单 pending 新建品牌/途径：提交时必须落真实目录条目，
    //     asset.brandId/channelId = 目录 id（不得保留表单上的临时 UUID）。
    // 8b. 资产带悬空 brandId（目录中无此 id）：打开编辑表单必须显示未设置，
    //     直接重新保存即自愈清除悬空引用。
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    function openSheet(document, plugin, existing) {
        plugin.openFormalAssetSheet('physical', { asset: existing || null, id: existing ? existing.id : '03000000-0000-4000-8000-000000000001' });
        const mask = document.querySelector('.am-edit-sheet-mask');
        if (!mask) throw new Error('physical edit sheet did not open');
        mask.querySelectorAll('form').forEach(f => {
            const elements = new Proxy({}, { get(_t, name) { return f.querySelector('[name="' + String(name) + '"]') || undefined; } });
            Object.defineProperty(f, 'elements', { value: elements, configurable: true });
            f.checkValidity = () => true;
            f.reportValidity = () => {};
        });
        return mask;
    }

    function submitSheetForm(mask) {
        const form = mask.querySelector('form');
        return form.onsubmit({ preventDefault() {}, currentTarget: form });
    }

    function fillPendingDimension(mask, key, label) {
        const root = mask.querySelector('[data-dimension-popover="' + key + '"]');
        if (!root) throw new Error('missing dimension popover ' + key);
        const input = root.querySelector('[data-dimension-new]');
        input.value = label;
        root.querySelector('[data-dimension-new-add]').onclick({ preventDefault() {}, stopPropagation() {} });
    }

    // 8a. pending 新建品牌 + 途径 → 提交 → 目录与资产外键落真实 id
    {
        const { plugin, state, document } = createHarness([]);
        state['dimensions.json'] = { schemaVersion: 1, brands: [], channels: [], updatedAt: NOW };
        plugin._brands = [];
        plugin._channels = [];
        const mask = openSheet(document, plugin, null);
        fillPendingDimension(mask, 'brand', '小米');
        fillPendingDimension(mask, 'channel', '京东');
        const form = mask.querySelector('form');
        const tempBrandId = form.getAttribute('data-selected-brand-id');
        const tempChannelId = form.getAttribute('data-selected-channel-id');
        assert.ok(UUID_RE.test(tempBrandId) && UUID_RE.test(tempChannelId),
            'pending dimension picks carry temporary uuids on the form');
        const nameInput = mask.querySelector('input[name="name"]');
        nameInput.value = '小米相机';
        await submitSheetForm(mask);
        const dims = state['dimensions.json'];
        const savedBrand = (dims.brands || []).find(entry => entry.label === '小米');
        const savedChannel = (dims.channels || []).find(entry => entry.label === '京东');
        assert.ok(savedBrand, 'submitting creates the pending brand directory entry');
        assert.ok(savedChannel, 'submitting creates the pending channel directory entry');
        const assets = await plugin.storage.readFormalV2Assets();
        const saved = assets.find(item => item.name === '小米相机');
        assert.ok(saved, 'asset persists after submit');
        assert.notEqual(saved.brandId, tempBrandId, 'asset.brandId must not keep the temporary form uuid');
        assert.notEqual(saved.channelId, tempChannelId, 'asset.channelId must not keep the temporary form uuid');
        assert.equal(saved.brandId, savedBrand.id, 'asset.brandId resolves to the real brand directory entry');
        assert.equal(saved.channelId, savedChannel.id, 'asset.channelId resolves to the real channel directory entry');
    }

    // 8b. 悬空 brandId：回显为未设置，直接重存自愈为 null
    {
        const dangling = harnessAsset('05000000-0000-4000-8000-000000000001', 'physical', 'Dangling Cam');
        dangling.brandId = '99999999-9999-4999-8999-999999999999';
        const { plugin, document } = createHarness([dangling]);
        const mask = openSheet(document, plugin, dangling);
        const form = mask.querySelector('form');
        assert.equal(form.getAttribute('data-selected-brand-id'), '',
            'a dangling brandId echoes back as unset instead of a dead selection');
        await submitSheetForm(mask);
        const assets = await plugin.storage.readFormalV2Assets();
        const saved = assets.find(item => item.id === dangling.id);
        assert.ok(saved, 'edited asset persists');
        assert.equal(saved.brandId, null, 'resaving an echoed dangling brandId heals it to null');
    }

    console.log('[formal-dimensions] passed');
})().catch(error => { console.error(error); process.exit(1); });
