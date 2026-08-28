'use strict';

/**
 * v2.4.2 种草心动值（P1 数据契约 + 投影）测试。
 *
 * 覆盖：
 *   (a) normalize：heartbeatTarget 合法值（null/1/5/999）通过；非法值
 *       （0/-1/1.5/1000/'abc'/true）抛错；旧数据缺省键 → null；
 *       patch 路径（mergeFormalV2AssetPatch）可设置 / 清空 heartbeatTarget。
 *   (b) storage 校验层：合法 heartbeat 事件（完整 13 键 + canonical
 *       sourceSnapshot）通过域快照校验；非法变体（targetAssetId /
 *       financialEventId / abandonReason / expectedAmountMinor /
 *       previousAmountMinor 非 null、currency 与快照不一致、缺 sourceSnapshot）
 *       被 throw 拒绝。
 *   (c) 投影：deriveWishlistHeartbeat 计数（只数 heartbeat 且 sourceWishlistId
 *       匹配的事件）；describeWishlistHeartbeat 全部阶段边界
 *       （有目标 ratio 分档 + 无目标里程碑分档）。
 *   (d) v2.4.2 读取容忍：≤2.4.1 存量 3 键 wishlist（无 heartbeatTarget 键）
 *       无迁移无重置正常加载——资产本体通过 validateFormalV2Asset /
 *       validateFormalV2AssetWrapper；3 键 sourceSnapshot 内嵌于
 *       purchased / abandoned / expectedPriceChanged 事件（完整 13 键）通过
 *       storage 导入校验；normalize/新建输出仍为 4 键 canonical（写入不放松）；
 *       wishlist 子对象未知键（heartbeatX）仍被拒绝；heartbeatTarget 存在但
 *       值非法（0）仍被拒绝（容忍只针对缺键）。
 *   (e) 域方法（plugin 级，走 index.js；harness 复用 wishlist-price-update）：
 *       recordWishlistHeartbeat 追加 canonical 13 键 heartbeat 事件且计数=事件数、
 *       非法 id / owned 资产 noop；justReached 语义（target=5 第 4/5/6 次）；
 *       undoWishlistHeartbeat 删最新一条、count=0 与非 wishlist noop；
 *       updateWishlistAsset 设置/清空/保留 heartbeatTarget；
 *       铁律核查：heartbeatTarget=5 走 updateWishlistExpectedPrice 与
 *       deleteWishlistPriceEvent 后仍为 5（merge 语义保留 current 键）；
 *       购买后资产删除而 heartbeat 事件留存 sidecar；硬删除清理 heartbeat 事件。
 *
 * harness 模式复用 wishlist-price-update.test.js（storage 级导入校验）。
 */

const assert = require('node:assert/strict');
const Module = require('node:module');
const assetsApi = require('../api/assets');
const storageApi = require('../api/storage');
const reportApi = require('../api/report');
const { createFormalV2AssetWrapper, newFormalV2Asset, normalizeFormalV2Asset, validateFormalV2Asset, validateFormalV2AssetWrapper, mergeFormalV2AssetPatch } = assetsApi;
const { deriveWishlistHeartbeat, describeWishlistHeartbeat } = reportApi;

const NOW = '2026-08-16T00:00:00.000Z';
const TODAY = '2026-08-16';
const WISH_ID = '63000000-0000-4000-8000-000000000001';
const OTHER_WISH_ID = '63000000-0000-4000-8000-000000000002';
const TARGET_ID = '63000000-0000-4000-8000-000000000003';
const EVENT_ID = '64000000-0000-4000-8000-000000000001';
const FINANCIAL_ID = '64000000-0000-4000-8000-000000000002';

function wishSeed(wishlistOverrides) {
    return {
        id: WISH_ID, kind: 'virtualSubscription', name: 'Heartbeat wish', status: 'wishlist',
        currency: 'CNY', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW,
        wishlist: Object.assign({ expectedAmountMinor: 900, reason: 'want it', targetGroup: 'virtual' }, wishlistOverrides || {}),
    };
}

// ---- (a) normalize 层 ----

function checkNormalize() {
    // 合法值直通（含显式 null 与缺省键）。
    for (const value of [null, 1, 5, 999]) {
        const asset = newFormalV2Asset(wishSeed({ heartbeatTarget: value }));
        assert.equal(asset.wishlist.heartbeatTarget, value, 'legal heartbeatTarget passes: ' + String(value));
        assert.equal(validateFormalV2Asset(asset).valid, true, 'normalized asset stays canonical for ' + String(value));
    }
    const legacy = newFormalV2Asset(wishSeed());
    assert.equal(legacy.wishlist.heartbeatTarget, null, 'legacy seed without the key normalizes to null');
    assert.equal(validateFormalV2Asset(legacy).valid, true, 'legacy-normalized asset stays canonical');
    // 其余 wishlist 字段不受影响。
    assert.equal(legacy.wishlist.expectedAmountMinor, 900);
    assert.equal(legacy.wishlist.reason, 'want it');
    assert.equal(legacy.wishlist.targetGroup, 'virtual');

    // 非法值一律抛错。
    for (const bad of [0, -1, 1.5, 1000, 'abc', true]) {
        assert.throws(() => newFormalV2Asset(wishSeed({ heartbeatTarget: bad })),
            /wishlist\.heartbeatTarget must be null or an integer between 1 and 999/,
            'invalid heartbeatTarget must throw: ' + String(bad));
    }

    // patch 路径：heartbeatTarget 随 wishlist patch 过 normalize。
    const base = newFormalV2Asset(wishSeed());
    const patched = mergeFormalV2AssetPatch(base, { wishlist: { heartbeatTarget: 7 } }, { now: NOW });
    assert.equal(patched.wishlist.heartbeatTarget, 7, 'patch sets heartbeatTarget');
    assert.equal(patched.wishlist.expectedAmountMinor, 900, 'patch keeps sibling wishlist fields');
    assert.equal(patched.wishlist.targetGroup, 'virtual');
    const cleared = mergeFormalV2AssetPatch(patched, { wishlist: { heartbeatTarget: null } }, { now: NOW });
    assert.equal(cleared.wishlist.heartbeatTarget, null, 'patch can clear heartbeatTarget back to null');
    assert.throws(() => mergeFormalV2AssetPatch(base, { wishlist: { heartbeatTarget: 1000 } }, { now: NOW }),
        /wishlist\.heartbeatTarget must be null or an integer between 1 and 999/,
        'patch with invalid heartbeatTarget must throw');
}

// ---- (b) storage 校验层 harness（复用 wishlist-price-update 的导入快照模式） ----

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
    return { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v2', schemaVersion: 1, exportedAt: NOW, pluginVersion: '2.4.2', data, settings: {} };
}

function heartbeatEvent(source, overrides) {
    return Object.assign({
        id: EVENT_ID, eventType: 'heartbeat', sourceWishlistId: source.id,
        targetAssetId: null, targetKind: source.kind, sourceTargetGroup: source.wishlist.targetGroup,
        occurredAt: NOW, financialEventId: null, abandonReason: null, currency: source.currency,
        expectedAmountMinor: null, previousAmountMinor: null,
        sourceSnapshot: source,
    }, overrides || {});
}

function validateWithEvent(source, record) {
    return storageApi.validateFormalV2ImportSnapshot(snapshotForImport([source], {
        wishlistEvents: { schemaVersion: 1, events: [record], updatedAt: NOW },
    }));
}

function checkStorageValidation() {
    const source = newFormalV2Asset(wishSeed());

    // 合法 heartbeat 事件（完整 13 键 + canonical sourceSnapshot）通过。
    const valid = validateWithEvent(source, heartbeatEvent(source));
    assert.equal(valid.valid, true, 'canonical heartbeat record passes domain validation');

    // 携带任何业务负载字段都必须被拒绝。
    const invalidVariants = [
        ['non-null targetAssetId', heartbeatEvent(source, { targetAssetId: OTHER_WISH_ID })],
        ['non-null financialEventId', heartbeatEvent(source, { financialEventId: EVENT_ID })],
        ['non-null abandonReason', heartbeatEvent(source, { abandonReason: 'gave up' })],
        ['non-null expectedAmountMinor', heartbeatEvent(source, { expectedAmountMinor: 100 })],
        ['non-null previousAmountMinor', heartbeatEvent(source, { previousAmountMinor: 50 })],
        ['currency mismatch with sourceSnapshot', heartbeatEvent(source, { currency: 'USD' })],
    ];
    for (const [label, record] of invalidVariants) {
        const result = validateWithEvent(source, record);
        assert.equal(result.valid, false, 'invalid variant must be rejected: ' + label);
        assert.equal(result.code, storageApi.FORMAL_ERROR_CODE.IMPORT_INVALID, label);
    }

    // 缺 sourceSnapshot 必须被拒绝（canonical 快照强制）。
    const missingSnapshot = heartbeatEvent(source);
    delete missingSnapshot.sourceSnapshot;
    const missingResult = validateWithEvent(source, missingSnapshot);
    assert.equal(missingResult.valid, false, 'missing sourceSnapshot must be rejected');
    assert.equal(missingResult.code, storageApi.FORMAL_ERROR_CODE.IMPORT_INVALID, 'missing sourceSnapshot');
}

// ---- (c) 投影层 ----

function checkDerive() {
    // 非数组输入安全降级。
    for (const bad of [null, undefined, 'events', {}, 42]) {
        assert.deepEqual(deriveWishlistHeartbeat(bad, WISH_ID), { count: 0 }, 'non-array events derive to zero');
    }
    assert.deepEqual(deriveWishlistHeartbeat([], WISH_ID), { count: 0 });

    const events = [
        { eventType: 'heartbeat', sourceWishlistId: WISH_ID },
        { eventType: 'heartbeat', sourceWishlistId: WISH_ID },
        { eventType: 'heartbeat', sourceWishlistId: OTHER_WISH_ID },
        { eventType: 'expectedPriceChanged', sourceWishlistId: WISH_ID },
        { eventType: 'purchased', sourceWishlistId: WISH_ID },
        { eventType: 'abandoned', sourceWishlistId: WISH_ID },
        null,
    ];
    assert.deepEqual(deriveWishlistHeartbeat(events, WISH_ID), { count: 2 }, 'only heartbeat events of the asset count');
    assert.deepEqual(deriveWishlistHeartbeat(events, OTHER_WISH_ID), { count: 1 }, 'other wishlist counts independently');
    assert.deepEqual(deriveWishlistHeartbeat(events, '93000000-0000-4000-8000-000000000099'), { count: 0 });
}

function checkDescribe() {
    // 有目标：ratio 分档（target=100 覆盖全部边界；24.99% 用 target=10000）。
    const withTarget = [
        [0, 100, { ratio: 0, stageKey: 'seed', emoji: '🌰', reached: false }],
        [1, 100, { ratio: 0.01, stageKey: 'sprout', emoji: '🌱', reached: false }],
        [2499, 10000, { ratio: 0.2499, stageKey: 'sprout', emoji: '🌱', reached: false }],
        [25, 100, { ratio: 0.25, stageKey: 'growing', emoji: '🌿', reached: false }],
        [49, 100, { ratio: 0.49, stageKey: 'growing', emoji: '🌿', reached: false }],
        [50, 100, { ratio: 0.5, stageKey: 'thriving', emoji: '☘️', reached: false }],
        [74, 100, { ratio: 0.74, stageKey: 'thriving', emoji: '☘️', reached: false }],
        [75, 100, { ratio: 0.75, stageKey: 'budding', emoji: '🌷', reached: false }],
        [99, 100, { ratio: 0.99, stageKey: 'budding', emoji: '🌷', reached: false }],
        [100, 100, { ratio: 1, stageKey: 'bloom', emoji: '🌸', reached: true }],
        [7, 5, { ratio: 1.4, stageKey: 'bloom', emoji: '🌸', reached: true }],
    ];
    for (const [count, target, expected] of withTarget) {
        assert.deepEqual(describeWishlistHeartbeat(count, target), expected,
            'targeted stage for count=' + count + ' target=' + target);
    }

    // 无目标（null / 非法 target）：里程碑分档，ratio=null，reached=false。
    const noTarget = [
        [0, 'seed', '🌰'],
        [1, 'sprout', '🌱'],
        [4, 'sprout', '🌱'],
        [5, 'growing', '🌿'],
        [9, 'growing', '🌿'],
        [10, 'thriving', '☘️'],
        [19, 'thriving', '☘️'],
        [20, 'bloom', '🌸'],
        [999, 'bloom', '🌸'],
    ];
    for (const target of [null, undefined, 0, -3, 1.5, 'abc', true]) {
        for (const [count, stageKey, emoji] of noTarget) {
            assert.deepEqual(describeWishlistHeartbeat(count, target),
                { ratio: null, stageKey: stageKey, emoji: emoji, reached: false },
                'untargeted milestone for count=' + count + ' target=' + String(target));
        }
    }
}

// ---- (d) v2.4.2 读取容忍：≤2.4.1 存量 3 键 wishlist 无迁移无重置正常加载 ----

function legacyWishAsset() {
    const canonical = newFormalV2Asset(wishSeed());
    const wishlist = Object.assign({}, canonical.wishlist);
    delete wishlist.heartbeatTarget;
    return Object.assign({}, canonical, { wishlist: wishlist });
}

function ownedTarget() {
    return newFormalV2Asset({ id: TARGET_ID, kind: 'virtualSubscription', name: 'Bought sub', status: 'active', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, tagIds: [], cover: { kind: 'none' }, notes: '', createdAt: NOW, updatedAt: NOW, details: {} });
}

function purchaseFinancialEvent() {
    return { id: FINANCIAL_ID, schemaVersion: 1, assetId: TARGET_ID, occurredAt: NOW, effectiveDate: TODAY, createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 900 };
}

function legacyEvent(source, overrides) {
    return Object.assign({
        id: EVENT_ID, eventType: 'abandoned', sourceWishlistId: source.id,
        targetAssetId: null, targetKind: source.kind, sourceTargetGroup: source.wishlist.targetGroup,
        occurredAt: NOW, financialEventId: null, abandonReason: null, currency: source.currency,
        expectedAmountMinor: null, previousAmountMinor: null,
        sourceSnapshot: source,
    }, overrides || {});
}

function snapshotForLegacyImport(assetList, sidecars) {
    const data = storageApi.createFormalV2ResetSnapshot({ updatedAt: NOW });
    // 手写 wrapper（不走 createFormalV2AssetWrapper，它会把资产 normalize 成
    // 4 键 canonical），让 3 键旧资产原样进入 storage 的 validateFormalV2Asset。
    data.assets = { schemaGeneration: 'formal-v2', schemaVersion: 1, assets: assetList, updatedAt: NOW };
    data.tags = { schemaVersion: 1, tags: [], updatedAt: NOW };
    Object.assign(data, sidecars || {});
    return { format: 'siyuan-asset-management-backup', schemaGeneration: 'formal-v2', schemaVersion: 1, exportedAt: NOW, pluginVersion: '2.4.1', data, settings: {} };
}

function checkLegacyReadTolerance() {
    const legacy = legacyWishAsset();
    assert.equal(Object.prototype.hasOwnProperty.call(legacy.wishlist, 'heartbeatTarget'), false, 'legacy fixture really lacks heartbeatTarget');
    assert.deepEqual(Object.keys(legacy.wishlist), ['expectedAmountMinor', 'reason', 'targetGroup'], 'legacy wishlist keeps exactly the 3 pre-2.4.2 keys');

    // (d1) 旧式 3 键 wishlist 资产直接通过 validateFormalV2Asset（assets.json 读取路径）。
    assert.equal(validateFormalV2Asset(legacy).valid, true, 'legacy 3-key wishlist asset passes validateFormalV2Asset');
    const wrapperValidation = validateFormalV2AssetWrapper({ schemaGeneration: 'formal-v2', schemaVersion: 1, assets: [legacy], updatedAt: NOW });
    assert.equal(wrapperValidation.valid, true, 'legacy assets.json wrapper passes read validation');

    // (d2) 旧式 3 键 sourceSnapshot 内嵌于既有 3 类事件（完整 13 键）通过 storage 导入校验。
    const abandonedResult = storageApi.validateFormalV2ImportSnapshot(snapshotForLegacyImport([legacy], {
        wishlistEvents: { schemaVersion: 1, events: [legacyEvent(legacy, { eventType: 'abandoned', abandonReason: 'too pricey' })], updatedAt: NOW },
    }));
    assert.equal(abandonedResult.valid, true, 'legacy 3-key sourceSnapshot inside abandoned event passes');

    const priceResult = storageApi.validateFormalV2ImportSnapshot(snapshotForLegacyImport([legacy], {
        wishlistEvents: { schemaVersion: 1, events: [legacyEvent(legacy, { eventType: 'expectedPriceChanged', expectedAmountMinor: 1200, previousAmountMinor: 900 })], updatedAt: NOW },
    }));
    assert.equal(priceResult.valid, true, 'legacy 3-key sourceSnapshot inside expectedPriceChanged event passes');

    const purchasedResult = storageApi.validateFormalV2ImportSnapshot(snapshotForLegacyImport([legacy, ownedTarget()], {
        financialEvents: { schemaVersion: 1, events: [purchaseFinancialEvent()], updatedAt: NOW },
        wishlistEvents: { schemaVersion: 1, events: [legacyEvent(legacy, { eventType: 'purchased', targetAssetId: TARGET_ID, financialEventId: FINANCIAL_ID })], updatedAt: NOW },
    }));
    assert.equal(purchasedResult.valid, true, 'legacy 3-key sourceSnapshot inside purchased event passes');

    // (d3) 新建 / normalize 输出仍为 4 键 canonical（写入路径不放松）。
    const fresh = newFormalV2Asset(wishSeed());
    assert.equal(Object.prototype.hasOwnProperty.call(fresh.wishlist, 'heartbeatTarget'), true, 'normalized wishlist carries heartbeatTarget key');
    assert.deepEqual(Object.keys(fresh.wishlist), ['expectedAmountMinor', 'reason', 'targetGroup', 'heartbeatTarget'], 'normalize output keeps the 4-key canonical wishlist');
    assert.equal(validateFormalV2Asset(fresh).valid, true, 'canonical 4-key wishlist asset stays valid');
    const renormalized = normalizeFormalV2Asset(legacy);
    assert.equal(Object.prototype.hasOwnProperty.call(renormalized.wishlist, 'heartbeatTarget'), true, 'renormalizing legacy data restores the 4-key canonical form');
    assert.equal(renormalized.wishlist.heartbeatTarget, null);

    // (d4) wishlist 子对象含未知键仍被拒绝（容忍不放宽白名单）。
    const unknownKey = legacyWishAsset();
    unknownKey.wishlist.heartbeatX = 5;
    const unknownResult = validateFormalV2Asset(unknownKey);
    assert.equal(unknownResult.valid, false, 'unknown wishlist key (heartbeatX) is still rejected');
    assert.ok(unknownResult.errors.length > 0, 'unknown key rejection reports an error');

    // (d5) heartbeatTarget 存在但值非法（0）仍被拒绝——容忍只针对「缺键」。
    const invalidTarget = newFormalV2Asset(wishSeed());
    invalidTarget.wishlist = Object.assign({}, invalidTarget.wishlist, { heartbeatTarget: 0 });
    const invalidResult = validateFormalV2Asset(invalidTarget);
    assert.equal(invalidResult.valid, false, 'present-but-invalid heartbeatTarget (0) is still rejected');
    assert.ok(invalidResult.errors.length > 0, 'invalid-value rejection reports an error');
}

// ---- (e) 域方法（plugin 级 harness，走 index.js；模式复用 wishlist-price-update.test.js） ----

const HB_WISH_ID = '65000000-0000-4000-8000-000000000001';
const HB_OWNED_ID = '65000000-0000-4000-8000-000000000002';
const HB_TARGET_ID = '65000000-0000-4000-8000-000000000003';
const HB_MISSING_ID = '95000000-0000-4000-8000-000000000099';
const HEARTBEAT_EVENT_KEYS = ['id', 'eventType', 'sourceWishlistId', 'targetAssetId', 'targetKind',
    'sourceTargetGroup', 'occurredAt', 'financialEventId', 'abandonReason', 'currency',
    'expectedAmountMinor', 'previousAmountMinor', 'sourceSnapshot'].sort();

const cloneValue = value => value == null ? value : structuredClone(value);

function domainWish(wishlistOverrides) {
    return newFormalV2Asset({
        id: HB_WISH_ID, kind: 'physical', name: 'Heartbeat domain wish', status: 'wishlist',
        currency: 'CNY', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW,
        wishlist: Object.assign({ expectedAmountMinor: 8800, reason: 'domain test', targetGroup: 'physical' }, wishlistOverrides || {}),
    });
}

function domainOwned() {
    return newFormalV2Asset({ id: HB_OWNED_ID, kind: 'physical', name: 'Domain owned', status: 'active', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, tagIds: [], cover: { kind: 'none' }, notes: '', createdAt: NOW, updatedAt: NOW, details: { warrantyEndsOn: null, costGoal: null } });
}

function loadPluginForDomain() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = function(request, parent, isMain) { if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} }; return original.call(this, request, parent, isMain); };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); } finally { Module._load = original; }
}

async function createDomainHarness(assetList) {
    const state = {
        'assets.json': createFormalV2AssetWrapper(assetList, { updatedAt: NOW }),
        'tags.json': { schemaVersion: 1, tags: [], updatedAt: NOW },
    };
    const Plugin = loadPluginForDomain();
    const plugin = new Plugin({
        async loadData(name) { return cloneValue(state[name] == null ? null : state[name]); },
        async saveData(name, value) { state[name] = cloneValue(value); return true; },
    });
    plugin.storage = storageApi.createStorage(plugin);
    plugin.assets = await plugin.storage.readFormalV2Assets();
    plugin._assetsLoadedOk = true;
    plugin.showToast = () => {};
    plugin.scheduleResourceIndexReconcile = () => {};
    plugin._runGuardedUiEffects = () => {};
    return { plugin, state };
}

function domainEventList(state) {
    return state['wishlistEvents.json'] && Array.isArray(state['wishlistEvents.json'].events) ? state['wishlistEvents.json'].events : [];
}
function domainLogCount(state) {
    return state['operationLogs.json'] && Array.isArray(state['operationLogs.json'].logs) ? state['operationLogs.json'].logs.length : 0;
}

async function checkDomainMethods() {
    // ---- (e1) recordWishlistHeartbeat：canonical 事件 + 计数 + 不写操作日志 ----
    {
        const source = domainWish({ heartbeatTarget: 5 });
        const { plugin, state } = await createDomainHarness([source, domainOwned()]);
        const logsBefore = domainLogCount(state);

        const result = await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        assert.ok(result, 'heartbeat click returns a context');
        assert.equal(result.asset.id, HB_WISH_ID);
        assert.equal(result.count, 1, 'count derived after the click');
        assert.equal(result.reached, false);
        assert.equal(result.justReached, false);

        const events = domainEventList(state);
        assert.equal(events.length, 1, 'exactly one heartbeat event appended');
        const event = events[0];
        assert.deepEqual(Object.keys(event).sort(), HEARTBEAT_EVENT_KEYS, 'heartbeat event carries exactly the canonical 13 keys');
        assert.equal(event.eventType, 'heartbeat');
        assert.equal(event.sourceWishlistId, HB_WISH_ID);
        assert.equal(event.targetAssetId, null);
        assert.equal(event.targetKind, source.kind);
        assert.equal(event.sourceTargetGroup, 'physical');
        assert.equal(event.financialEventId, null);
        assert.equal(event.abandonReason, null);
        assert.equal(event.expectedAmountMinor, null);
        assert.equal(event.previousAmountMinor, null);
        assert.equal(event.currency, 'CNY');
        assert.equal(new Date(event.occurredAt).toISOString(), event.occurredAt, 'occurredAt is a UTC ISO instant');
        assert.deepEqual(event.sourceSnapshot, source, 'sourceSnapshot is the canonical pre-click asset');
        assert.deepEqual(result.event, event, 'context exposes the committed event');
        assert.equal(domainLogCount(state), logsBefore, 'heartbeat writes no operation logs');
        assert.equal(deriveWishlistHeartbeat(domainEventList(state), HB_WISH_ID).count, 1, 'derived count equals event count');

        const second = await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        assert.equal(second.count, 2, 'second click derives count 2');
        assert.equal(domainEventList(state).length, 2);

        // ---- (e2) noop：不存在 id / owned 资产，不抛错不写事件 ----
        assert.equal(await plugin.recordWishlistHeartbeat(HB_MISSING_ID), null, 'missing id is a noop');
        assert.equal(await plugin.recordWishlistHeartbeat(HB_OWNED_ID), null, 'owned asset is a noop');
        assert.equal(domainEventList(state).length, 2, 'noop paths append no event');
        assert.equal(domainLogCount(state), logsBefore, 'noop paths write no operation logs');
    }

    // ---- (e3) justReached 语义：target=5，第 4 次 false、第 5 次 true、第 6 次 reached 但非 justReached ----
    {
        const { plugin } = await createDomainHarness([domainWish({ heartbeatTarget: 5 })]);
        const results = [];
        for (let i = 0; i < 6; i++) results.push(await plugin.recordWishlistHeartbeat(HB_WISH_ID));
        results.forEach((result, index) => assert.equal(result.count, index + 1, 'click ' + (index + 1) + ' count'));
        assert.equal(results[3].justReached, false, '4th click is not justReached');
        assert.equal(results[3].reached, false, '4th click has not reached');
        assert.equal(results[4].justReached, true, '5th click is justReached');
        assert.equal(results[4].reached, true, '5th click reaches the target');
        assert.equal(results[5].justReached, false, '6th click is not justReached again');
        assert.equal(results[5].reached, true, '6th click stays reached');
    }

    // ---- (e4) undoWishlistHeartbeat：删 occurredAt 最新一条；count=0 / 非 wishlist noop ----
    {
        const { plugin, state } = await createDomainHarness([domainWish({ heartbeatTarget: 5 }), domainOwned()]);
        const clickedIds = [];
        for (let i = 0; i < 3; i++) {
            const result = await plugin.recordWishlistHeartbeat(HB_WISH_ID);
            clickedIds.push(result.event.id);
        }
        assert.equal(domainEventList(state).length, 3);

        const undone = await plugin.undoWishlistHeartbeat(HB_WISH_ID);
        assert.equal(undone.count, 2, 'count derived after undo');
        assert.deepEqual(domainEventList(state).map(item => item.id), clickedIds.slice(0, 2), 'undo removes the latest heartbeat event');

        // 撤销至 0 后再撤销 → noop（count=0，不抛错）。
        const secondUndo = await plugin.undoWishlistHeartbeat(HB_WISH_ID);
        assert.equal(secondUndo.count, 1);
        const thirdUndo = await plugin.undoWishlistHeartbeat(HB_WISH_ID);
        assert.equal(thirdUndo.count, 0);
        assert.equal(domainEventList(state).length, 0);
        const emptyUndo = await plugin.undoWishlistHeartbeat(HB_WISH_ID);
        assert.equal(emptyUndo.count, 0, 'undo with no heartbeat events is a noop returning count 0');
        assert.equal(emptyUndo.asset.id, HB_WISH_ID);
        assert.equal(domainEventList(state).length, 0, 'noop undo appends nothing');

        assert.equal(await plugin.undoWishlistHeartbeat(HB_OWNED_ID), null, 'undo on owned asset is a noop');
        assert.equal(await plugin.undoWishlistHeartbeat(HB_MISSING_ID), null, 'undo on missing id is a noop');
    }

    // ---- (e5) updateWishlistAsset：设置 / 清空 / 未传保留 heartbeatTarget ----
    {
        const { plugin } = await createDomainHarness([domainWish()]);
        const setTarget = await plugin.updateWishlistAsset(HB_WISH_ID, { wishlist: { heartbeatTarget: 7 } });
        assert.equal(setTarget.wishlist.heartbeatTarget, 7, 'patch sets heartbeatTarget');
        assert.equal(setTarget.wishlist.expectedAmountMinor, 8800, 'sibling wishlist fields preserved');
        assert.equal(setTarget.wishlist.reason, 'domain test');
        assert.equal(setTarget.wishlist.targetGroup, 'physical');

        const untouched = await plugin.updateWishlistAsset(HB_WISH_ID, { wishlist: { reason: 'changed' } });
        assert.equal(untouched.wishlist.heartbeatTarget, 7, 'omitted heartbeatTarget keeps the previous value');
        assert.equal(untouched.wishlist.reason, 'changed');

        const cleared = await plugin.updateWishlistAsset(HB_WISH_ID, { wishlist: { heartbeatTarget: null } });
        assert.equal(cleared.wishlist.heartbeatTarget, null, 'explicit null clears heartbeatTarget');
        assert.equal(cleared.wishlist.reason, 'changed', 'clearing heartbeatTarget keeps siblings');
    }

    // ---- (e6) 铁律核查 (d)：3 键 wishlist patch 不得丢失 heartbeatTarget ----
    {
        const { plugin, state } = await createDomainHarness([domainWish({ heartbeatTarget: 5 })]);
        const updated = await plugin.updateWishlistExpectedPrice(HB_WISH_ID, 9900);
        assert.equal(updated.wishlist.expectedAmountMinor, 9900);
        assert.equal(updated.wishlist.heartbeatTarget, 5, 'updateWishlistExpectedPrice preserves heartbeatTarget');

        const priceEvent = domainEventList(state).find(event => event.eventType === 'expectedPriceChanged');
        assert.ok(priceEvent, 'price change event exists');
        const afterDelete = await plugin.deleteWishlistPriceEvent(HB_WISH_ID, priceEvent.id);
        assert.equal(afterDelete.wishlist.expectedAmountMinor, 8800, 'deleting the only price event rolls back the price');
        assert.equal(afterDelete.wishlist.heartbeatTarget, 5, 'deleteWishlistPriceEvent preserves heartbeatTarget');
    }

    // ---- (e7) 购买后：资产删除，heartbeat 事件留存 sidecar（历史卡派生用） ----
    {
        const { plugin, state } = await createDomainHarness([domainWish({ heartbeatTarget: 3 })]);
        await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        const wishBefore = plugin.assets.find(asset => asset.id === HB_WISH_ID);

        const targetSeed = { id: HB_TARGET_ID, kind: 'physical', name: 'Bought item', status: 'active', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, tagIds: [], cover: { kind: 'none' }, notes: '', details: { warrantyEndsOn: null, costGoal: null } };
        const owned = await plugin.completeWishlistPurchase(wishBefore, targetSeed, 8800, {});
        assert.equal(owned.id, HB_TARGET_ID, 'purchase creates the owned asset');
        assert.equal(plugin.assets.find(asset => asset.id === HB_WISH_ID), undefined, 'wish asset removed after purchase');
        assert.ok(plugin.assets.find(asset => asset.id === HB_TARGET_ID && asset.status === 'active'), 'owned asset present');

        const events = domainEventList(state);
        assert.equal(events.filter(event => event.eventType === 'heartbeat' && event.sourceWishlistId === HB_WISH_ID).length, 2, 'heartbeat events survive the purchase');
        assert.equal(events.filter(event => event.eventType === 'purchased' && event.sourceWishlistId === HB_WISH_ID).length, 1, 'purchased event appended');
        assert.equal(deriveWishlistHeartbeat(events, HB_WISH_ID).count, 2, 'history derivation still sees the heartbeat count');
    }

    // ---- (e8) 硬删除：deleteAsset 清理该资产的 heartbeat 事件 ----
    {
        const { plugin, state } = await createDomainHarness([domainWish({ heartbeatTarget: 3 })]);
        await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        await plugin.recordWishlistHeartbeat(HB_WISH_ID);
        assert.equal(domainEventList(state).length, 2);
        const logsBefore = domainLogCount(state);

        await plugin.deleteAsset(HB_WISH_ID);
        assert.equal(plugin.assets.find(asset => asset.id === HB_WISH_ID), undefined, 'asset hard-deleted');
        assert.equal(domainEventList(state).length, 0, 'heartbeat events cleaned up on hard delete');
        assert.equal(domainLogCount(state), logsBefore, 'wishlist hard delete writes no operation log (wishlist stays outside the log sidecar)');
    }
}

function main() {
    checkNormalize();
    checkStorageValidation();
    checkDerive();
    checkDescribe();
    checkLegacyReadTolerance();
    return checkDomainMethods()
        .then(checkDetailSectionHeartbeatLog);
}

// v2.4.2 hotfix 4：详情卡心动值 section 下的「心动记录」紧凑展示。
// 直接调用 plugin._renderWishlistHeartbeatSectionHtml 验证 HTML 产物。
// 1) count=0 → 整块 am-wish-heartbeat-records 不渲染；
// 2) count<=5 → 按 occurredAt 倒序，每行 MM-DD HH:MM，无「…等 N 次」尾巴；
// 3) count=7 → 仅渲染最近 5 条 + 「…等 7 次」尾巴；
// 4) 跨资产隔离——其他资产的 heartbeat 事件不应出现在本资产的记录中。
function hbEvent(id, occurredAt, sourceId) {
    return {
        id, eventType: 'heartbeat', sourceWishlistId: sourceId, targetAssetId: null,
        targetKind: 'physical', sourceTargetGroup: 'physical', occurredAt,
        financialEventId: null, abandonReason: null, currency: 'CNY',
        expectedAmountMinor: null, previousAmountMinor: null, sourceSnapshot: null,
    };
}
async function checkDetailSectionHeartbeatLog() {
    const source = domainWish({ heartbeatTarget: 5 });
    const { plugin } = await createDomainHarness([source, domainOwned()]);
    // 不挂 _i18nMap → 所有 _t 走 fallback（中文），便于断言固定字符串。
    plugin._i18nMap = {};
    plugin.wishlistEvents = [];

    // (f1) 0 次 → 不渲染记录块
    const htmlEmpty = plugin._renderWishlistHeartbeatSectionHtml(source);
    assert.equal(htmlEmpty.includes('am-wish-heartbeat-records'), false, 'no records block when count=0');

    // (f2) 3 次 → 渲染 3 行 MM-DD HH:MM，按 occurredAt 倒序，无更多尾巴
    plugin.wishlistEvents = [
        hbEvent('hb-1', '2026-08-16T03:30:00.000Z', HB_WISH_ID),
        hbEvent('hb-2', '2026-08-16T05:45:00.000Z', HB_WISH_ID),
        hbEvent('hb-3', '2026-08-15T14:00:00.000Z', HB_WISH_ID),
    ];
    const htmlThree = plugin._renderWishlistHeartbeatSectionHtml(source);
    assert.equal(htmlThree.includes('am-wish-heartbeat-records'), true, 'records block rendered when count>0');
    const itemMatches = [...htmlThree.matchAll(/<li class="am-wish-heartbeat-records__item"><span class="am-wish-heartbeat-records__time">([^<]+)<\/span><\/li>/g)].map(m => m[1]);
    assert.equal(itemMatches.length, 3, 'three timestamp items rendered');
    // 倒序：最新在最上；_formatWishlistHeartbeatTimestamp 直接抽 ISO 的 HH:MM（UTC 时戳原样）。
    assert.equal(itemMatches[0], '08-16 05:45', 'newest item first');
    assert.equal(itemMatches[1], '08-16 03:30', 'second newest second');
    assert.equal(itemMatches[2], '08-15 14:00', 'oldest last');
    assert.equal(htmlThree.includes('…等'), false, 'no overflow note when count<=5');

    // (f3) 7 次 → 截断为 5 条 + 「…等 7 次」尾巴
    plugin.wishlistEvents = [];
    for (let i = 0; i < 7; i++) {
        // 跨日构造，确保不同 MM-DD
        const day = String(10 + i).padStart(2, '0');
        const ts = `2026-08-${day}T01:00:00.000Z`;
        plugin.wishlistEvents.push(hbEvent('hb-' + i, ts, HB_WISH_ID));
    }
    const htmlSeven = plugin._renderWishlistHeartbeatSectionHtml(source);
    const sevenMatches = [...htmlSeven.matchAll(/<li class="am-wish-heartbeat-records__item"><span class="am-wish-heartbeat-records__time">([^<]+)<\/span><\/li>/g)].map(m => m[1]);
    assert.equal(sevenMatches.length, 5, 'capped at 5 items even when count=7');
    assert.equal(htmlSeven.includes('…等 7 次'), true, 'overflow note "…等 7 次" appended when count>5');

    // (f4) 跨资产隔离——另一资产的 heartbeat 事件不应出现
    plugin.wishlistEvents = [
        hbEvent('hb-foreign', '2026-08-16T01:00:00.000Z', 'foreign-asset-id'),
        hbEvent('hb-mine', '2026-08-16T02:00:00.000Z', HB_WISH_ID),
    ];
    const htmlIso = plugin._renderWishlistHeartbeatSectionHtml(source);
    const isoMatches = [...htmlIso.matchAll(/<li class="am-wish-heartbeat-records__item"><span class="am-wish-heartbeat-records__time">([^<]+)<\/span><\/li>/g)].map(m => m[1]);
    assert.equal(isoMatches.length, 1, 'only this asset heartbeats counted');
    assert.equal(isoMatches[0], '08-16 02:00', 'foreign heartbeat excluded, own heartbeat shown');
}

main().then(() => console.log('[wishlist-heartbeat] passed'))
    .catch(error => { console.error('[wishlist-heartbeat] failed:', error); process.exitCode = 1; });
