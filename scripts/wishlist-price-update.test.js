'use strict';

/**
 * v2.4.1 种草期望价更新（数据层）测试。
 *
 * 覆盖：
 *   (a) 域方法成功：expectedAmountMinor 被更新、wishlistEvents 追加一条合法
 *       expectedPriceChanged 事件（previousAmountMinor = 旧值）、operationLogs 数量不变；
 *   (b) 值未变 → noop（不追加事件）；含 null → null noop 与清空价格路径；
 *   (c) 非 wishlist 资产 / 不存在 id → noop，不写事件；
 *   (d) 非法 amountMinor（负数、非整数等）→ throw；
 *   (e) storage 校验层：合法 expectedPriceChanged 记录通过域快照校验；
 *       非法变体（负数金额、currency 与 sourceSnapshot 不一致、targetAssetId 非 null、
 *       缺 sourceSnapshot）被 throw 拒绝。
 *
 * harness 模式复用 five-kind-form-wishlist.test.js（plugin 级，走 index.js）
 * 与 formal-storage-boundary.test.js（storage 级导入校验）。
 */

const assert = require('node:assert/strict');
const Module = require('node:module');
const assetsApi = require('../api/assets');
const storageApi = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset } = assetsApi;

const NOW = '2026-08-14T00:00:00.000Z';
const TODAY = '2026-08-14';
const clone = value => value == null ? value : structuredClone(value);

const WISH_ID = '61000000-0000-4000-8000-000000000001';
const OWNED_ID = '61000000-0000-4000-8000-000000000002';
const EVENT_ID = '62000000-0000-4000-8000-000000000001';

function wish() {
    return newFormalV2Asset({ id: WISH_ID, name: 'Price wish', kind: 'virtualSubscription', status: 'wishlist', currency: 'USD', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW, wishlist: { expectedAmountMinor: 900, reason: 'price watch', targetGroup: 'virtual' } });
}
function owned() {
    return newFormalV2Asset({ id: OWNED_ID, kind: 'physical', name: 'Owned thing', status: 'active', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, tagIds: [], cover: { kind: 'none' }, notes: '', createdAt: NOW, updatedAt: NOW, details: { warrantyEndsOn: null, costGoal: null } });
}

function loadPlugin() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = function(request, parent, isMain) { if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} }; return original.call(this, request, parent, isMain); };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); } finally { Module._load = original; }
}

async function createPluginHarness(assetList) {
    const state = {
        'assets.json': createFormalV2AssetWrapper(assetList, { updatedAt: NOW }),
        'tags.json': { schemaVersion: 1, tags: [], updatedAt: NOW },
    };
    const Plugin = loadPlugin();
    const plugin = new Plugin({
        async loadData(name) { return clone(state[name] == null ? null : state[name]); },
        async saveData(name, value) { state[name] = clone(value); return true; },
    });
    plugin.storage = storageApi.createStorage(plugin);
    plugin.assets = await plugin.storage.readFormalV2Assets();
    plugin._assetsLoadedOk = true;
    plugin.showToast = () => {};
    plugin.scheduleResourceIndexReconcile = () => {};
    plugin._runGuardedUiEffects = () => {};
    return { plugin, state };
}

function logCount(state) {
    return state['operationLogs.json'] && Array.isArray(state['operationLogs.json'].logs) ? state['operationLogs.json'].logs.length : 0;
}
function eventList(state) {
    return state['wishlistEvents.json'] && Array.isArray(state['wishlistEvents.json'].events) ? state['wishlistEvents.json'].events : [];
}

// ---- (e) storage 校验层 harness（复用 formal-storage-boundary 的导入快照模式） ----

function snapshotForImport(assetList, sidecars) {
    const data = storageApi.createFormalV2ResetSnapshot({ updatedAt: NOW });
    data.assets = createFormalV2AssetWrapper(assetList, { updatedAt: NOW });
    // storage 侧引用完整性要求每个在役资产带 tagIds 数组；v2 wishlist 本身不携带
    // tagIds（严格 wrapper 校验会拒绝），且 assertAssetTagReferences 跳过 wishlist。
    data.assets.assets = data.assets.assets.map(asset => asset.status === 'wishlist'
        ? asset
        : Object.assign({}, asset, { tagIds: [] }));
    data.tags = { schemaVersion: 1, tags: [], updatedAt: NOW };
    Object.assign(data, sidecars || {});
    return { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v2', schemaVersion: 1, exportedAt: NOW, pluginVersion: '2.4.1', data, settings: {} };
}

function priceEvent(source, overrides) {
    return Object.assign({
        id: EVENT_ID, eventType: 'expectedPriceChanged', sourceWishlistId: source.id,
        targetAssetId: null, targetKind: source.kind, sourceTargetGroup: source.wishlist.targetGroup,
        occurredAt: NOW, financialEventId: null, abandonReason: null, currency: source.currency,
        previousAmountMinor: source.wishlist.expectedAmountMinor, expectedAmountMinor: 1200,
        sourceSnapshot: source,
    }, overrides || {});
}

function validateWithEvent(source, record) {
    return storageApi.validateFormalV2ImportSnapshot(snapshotForImport([source], {
        wishlistEvents: { schemaVersion: 1, events: [record], updatedAt: NOW },
    }));
}

async function main() {
    // ---- (a) 域方法成功路径 ----
    const source = wish();
    const { plugin, state } = await createPluginHarness([source, owned()]);
    const logsBefore = logCount(state);

    const updated = await plugin.updateWishlistExpectedPrice(WISH_ID, 1200);
    assert.equal(updated.id, WISH_ID);
    assert.equal(updated.wishlist.expectedAmountMinor, 1200);
    assert.equal(updated.wishlist.reason, 'price watch');
    assert.equal(updated.wishlist.targetGroup, 'virtual');
    const stored = plugin.assets.find(asset => asset.id === WISH_ID);
    assert.equal(stored.wishlist.expectedAmountMinor, 1200, 'in-memory asset reflects the new expected price');

    const events = eventList(state);
    assert.equal(events.length, 1, 'exactly one expectedPriceChanged event is appended');
    const event = events[0];
    assert.equal(event.eventType, 'expectedPriceChanged');
    assert.equal(event.sourceWishlistId, WISH_ID);
    assert.equal(event.targetAssetId, null);
    assert.equal(event.targetKind, source.kind);
    assert.equal(event.sourceTargetGroup, 'virtual');
    assert.equal(event.financialEventId, null);
    assert.equal(event.abandonReason, null);
    assert.equal(event.currency, 'USD');
    assert.equal(event.previousAmountMinor, 900, 'previousAmountMinor carries the old value');
    assert.equal(event.expectedAmountMinor, 1200);
    assert.deepEqual(event.sourceSnapshot, source, 'event retains the canonical pre-update wishlist snapshot');
    assert.equal(new Date(event.occurredAt).toISOString(), event.occurredAt, 'occurredAt is a UTC ISO instant');
    assert.equal(logCount(state), logsBefore, 'wishlist price update must not write operation logs');

    // ---- (b) 值未变 → noop ----
    const same = await plugin.updateWishlistExpectedPrice(WISH_ID, 1200);
    assert.equal(same.wishlist.expectedAmountMinor, 1200);
    assert.equal(eventList(state).length, 1, 'unchanged value is a noop and appends no event');

    // 清空价格（1200 → null）产生事件；null → null 仍是 noop。
    const cleared = await plugin.updateWishlistExpectedPrice(WISH_ID, null);
    assert.equal(cleared.wishlist.expectedAmountMinor, null);
    assert.equal(eventList(state).length, 2);
    const clearEvent = eventList(state)[1];
    assert.equal(clearEvent.eventType, 'expectedPriceChanged');
    assert.equal(clearEvent.previousAmountMinor, 1200);
    assert.equal(clearEvent.expectedAmountMinor, null);
    const sameNull = await plugin.updateWishlistExpectedPrice(WISH_ID, null);
    assert.equal(sameNull.wishlist.expectedAmountMinor, null);
    assert.equal(eventList(state).length, 2, 'null → null is a noop');
    assert.equal(logCount(state), logsBefore, 'noop and clear paths must not write operation logs');

    // ---- (c) 非 wishlist 资产 / 不存在 id → noop，不写事件 ----
    const nonWish = await plugin.updateWishlistExpectedPrice(OWNED_ID, 500);
    assert.equal(nonWish, null);
    const missing = await plugin.updateWishlistExpectedPrice('99000000-0000-4000-8000-000000000099', 500);
    assert.equal(missing, null);
    assert.equal(eventList(state).length, 2, 'non-wishlist and unknown ids write no event');
    assert.equal(plugin.assets.find(asset => asset.id === OWNED_ID).status, 'active');

    // ---- (d) 非法 amountMinor → throw ----
    for (const bad of [-1, 12.5, '900', NaN, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(() => plugin.updateWishlistExpectedPrice(WISH_ID, bad), /expectedAmountMinor/);
    }
    assert.equal(eventList(state).length, 2, 'invalid amounts write no event');
    assert.equal(plugin.assets.find(asset => asset.id === WISH_ID).wishlist.expectedAmountMinor, null, 'invalid amounts leave the asset untouched');

    // ---- (e) storage 校验层 ----
    const validSource = wish();
    const validResult = validateWithEvent(validSource, priceEvent(validSource));
    assert.equal(validResult.valid, true, 'canonical expectedPriceChanged record passes domain validation');

    const invalidVariants = [
        ['negative expectedAmountMinor', priceEvent(validSource, { expectedAmountMinor: -1 })],
        ['negative previousAmountMinor', priceEvent(validSource, { previousAmountMinor: -5 })],
        ['currency mismatch with sourceSnapshot', priceEvent(validSource, { currency: 'CNY' })],
        ['non-null targetAssetId', priceEvent(validSource, { targetAssetId: OWNED_ID })],
        ['non-null financialEventId', priceEvent(validSource, { financialEventId: EVENT_ID })],
    ];
    for (const [label, record] of invalidVariants) {
        const result = validateWithEvent(validSource, record);
        assert.equal(result.valid, false, 'invalid variant must be rejected: ' + label);
        assert.equal(result.code, storageApi.FORMAL_ERROR_CODE.IMPORT_INVALID, label);
    }
    const missingSnapshot = priceEvent(validSource);
    delete missingSnapshot.sourceSnapshot;
    const missingResult = validateWithEvent(validSource, missingSnapshot);
    assert.equal(missingResult.valid, false, 'missing sourceSnapshot must be rejected');
    assert.equal(missingResult.code, storageApi.FORMAL_ERROR_CODE.IMPORT_INVALID, 'missing sourceSnapshot');

    console.log('[wishlist-price-update] passed');
}

main().catch(error => { console.error('[wishlist-price-update] failed:', error); process.exitCode = 1; });
