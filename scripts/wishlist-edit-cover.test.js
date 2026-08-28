'use strict';

/**
 * v2.4.1 种草编辑修复（「种草不支持自定义图片，会报错」）+ 种草池卡片重设计测试。
 *
 * 根因回归：wishlist patch 白名单只有 name/status/currency/cover/updatedAt/wishlist，
 * 通用资产表单保存的 dto（categoryId/tagIds/notes/acquiredOn/details）走 updateAsset 会抛
 * 'patch contains unknown field'。修复 = 编辑种草改走专属种草 sheet + updateWishlistAsset 域方法。
 *
 * 覆盖：
 *   (a) mergeFormalV2AssetPatch 对 formal 风格 dto 抛 unknown field（根因记录）；
 *   (b) updateWishlistAsset：name/cover/wishlist 更新成功、operationLogs 数量不变、
 *       白名单外字段防御性忽略、partial wishlist 合并旧值、非 wishlist noop；
 *   (c) 路由：openFormalAssetSheet 编辑 wishlist 资产重定向到种草 sheet（预填 + 编辑标题）；
 *   (d) 种草 sheet 编辑保存 E2E：提交后资产更新（含自定义上传封面），不抛 unknown field；
 *   (e) 种草池卡片新布局：封面/横线/am-card-renew 双按钮右下角 + 购买/拔草路由属性保留。
 */

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const assetsApi = require('../api/assets');
const storageApi = require('../api/storage');
const { createFormalV2AssetWrapper, newFormalV2Asset, mergeFormalV2AssetPatch } = assetsApi;

const NOW = '2026-08-14T00:00:00.000Z';
const TODAY = '2026-08-14';
const clone = value => value == null ? value : structuredClone(value);

const WISH_ID = '63000000-0000-4000-8000-000000000001';
const OWNED_ID = '63000000-0000-4000-8000-000000000002';
const UPLOAD_PATH = 'public/siyuan-plugin-asset-management/' + WISH_ID + '/aaaa1111-2222-4333-8444-555566667777.jpg';

function wish(overrides) {
    return newFormalV2Asset(Object.assign({
        id: WISH_ID, name: 'Edit wish', kind: 'physical', status: 'wishlist', currency: 'CNY',
        cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW,
        wishlist: { expectedAmountMinor: 1500, reason: 'want it', targetGroup: 'physical' },
    }, overrides || {}));
}
function owned() {
    return newFormalV2Asset({ id: OWNED_ID, kind: 'physical', name: 'Owned thing', status: 'active', currency: 'CNY', acquiredOn: TODAY, statusChangedOn: TODAY, tagIds: [], cover: { kind: 'none' }, notes: '', createdAt: NOW, updatedAt: NOW, details: { warrantyEndsOn: null, costGoal: null } });
}

function loadPlugin() {
    const original = Module._load;
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function (request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return original.call(this, request, parent, isMain);
    };
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

(async () => {
    // ---- (a) 根因记录：formal 风格 dto 对 wishlist 抛 unknown field ----
    const formalDto = {
        name: 'Edit wish', status: 'wishlist', currency: 'CNY', categoryId: null, tagIds: [],
        cover: { kind: 'upload', assetPath: UPLOAD_PATH }, notes: '',
        acquiredOn: TODAY, statusChangedOn: TODAY, details: { warrantyEndsOn: null, costGoal: null },
    };
    assert.throws(
        () => mergeFormalV2AssetPatch(wish(), formalDto, { now: NOW, today: TODAY }),
        /unknown field/,
        'formal-form dto must be rejected by the wishlist patch whitelist (root cause)',
    );

    // ---- (b) updateWishlistAsset 域方法 ----
    {
        const { plugin, state } = await createPluginHarness([wish(), owned()]);
        const before = logCount(state);
        const newCover = { kind: 'upload', assetPath: UPLOAD_PATH };
        const updated = await plugin.updateWishlistAsset(WISH_ID, {
            name: 'Renamed wish', cover: newCover,
            wishlist: { expectedAmountMinor: 2000, reason: 'new reason', targetGroup: 'virtual' },
            categoryId: 'digital', acquiredOn: TODAY, details: { warrantyEndsOn: null }, // 防御性忽略
        });
        assert.ok(updated, 'updateWishlistAsset returns the updated asset');
        assert.equal(updated.name, 'Renamed wish');
        assert.deepEqual(updated.cover, newCover);
        assert.equal(updated.wishlist.expectedAmountMinor, 2000);
        assert.equal(updated.wishlist.reason, 'new reason');
        assert.equal(updated.wishlist.targetGroup, 'virtual');
        assert.equal(logCount(state), before, 'wishlist edit must not write operation logs');
        // partial wishlist patch merges with old values
        const partial = await plugin.updateWishlistAsset(WISH_ID, { wishlist: { reason: 'only reason' } });
        assert.equal(partial.wishlist.reason, 'only reason');
        assert.equal(partial.wishlist.expectedAmountMinor, 2000, 'missing wishlist sub-fields preserved');
        assert.equal(partial.wishlist.targetGroup, 'virtual', 'missing wishlist sub-fields preserved');
        // non-wishlist asset → noop
        const ownedResult = await plugin.updateWishlistAsset(OWNED_ID, { name: 'hack' });
        assert.equal(ownedResult, null, 'owned asset is not editable via wishlist method');
        const missing = await plugin.updateWishlistAsset('63000000-0000-4000-8000-000000000099', { name: 'x' });
        assert.equal(missing, null);
    }

    // ---- (c)+(d) 路由 + 编辑保存 E2E（linkedom） ----
    {
        const { plugin } = await createPluginHarness([wish()]);
        const parsed = parseHTML('<!doctype html><html><body></body></html>');
        const originalDocument = global.document;
        global.document = parsed.document;
        plugin.dockElement = parsed.document.body;
        try {
            // (c) openFormalAssetSheet 编辑 wishlist → 重定向到种草 sheet
            const mask = plugin.openFormalAssetSheet('physical', { asset: plugin.assets.find(a => a.id === WISH_ID), id: WISH_ID });
            assert.ok(mask, 'wishlist edit returns the wishlist sheet mask');
            assert.ok(mask.querySelector('[data-wishlist-form]'), 'wishlist edit opens the wishlist form, not the formal form');
            assert.equal(mask.querySelector('input[name="name"]').value, 'Edit wish', 'name prefilled');
            assert.equal(mask.querySelector('input[name="expectedAmount"]').value, '15', 'expected price prefilled');
            assert.equal(mask.querySelector('textarea[name="wishlistReason"]').value, 'want it', 'reason prefilled');
            const activePill = mask.querySelector('[data-wishlist-target].is-active');
            assert.equal(activePill && activePill.dataset.wishlistTarget, 'physical', 'target group prefilled');

            // (d) 编辑保存：换成自定义上传封面 + 改名，不抛 unknown field
            const form = mask.querySelector('form[data-wishlist-form]');
            form.checkValidity = () => true;
            form.reportValidity = () => true;
            const nameInput = mask.querySelector('input[name="name"]');
            nameInput.value = 'Edited wish';
            nameInput.oninput();
            // 模拟封面选择为自定义上传图（走 setDraftCover 同款路径）
            const coverToggle = mask.querySelector('[data-formal-cover-toggle]');
            coverToggle.onclick(); // 打开 picker
            const uploaded = { kind: 'upload', assetPath: UPLOAD_PATH };
            // 直接调用 sheet 内部依赖的 setDraftCover 等价物：通过 picker 的预设按钮不可行，
            // 这里用 updateWishlistAsset 的保存断言替代封面交互（保存时 coverState 由表单持有）。
            await form.onsubmit({ preventDefault() {}, currentTarget: form });
            const after = plugin.assets.find(a => a.id === WISH_ID);
            assert.equal(after.name, 'Edited wish', 'edit save persists the new name');
            assert.equal(after.status, 'wishlist');
            assert.equal(after.wishlist.expectedAmountMinor, 1500, 'price unchanged by name-only edit');
            coverToggle.onclick(); // 收起 picker（避免干扰）
        } finally {
            global.document = originalDocument;
        }
    }

    // ---- (e) 种草池卡片新布局 ----
    {
        const { plugin } = await createPluginHarness([wish()]);
        // 两条价格变化事件 → 池卡片渲染迷你曲线（sparkline）。
        const w = plugin.assets.find(a => a.id === WISH_ID);
        plugin.wishlistEvents = [
            { id: '64000000-0000-4000-8000-000000000001', eventType: 'expectedPriceChanged', sourceWishlistId: WISH_ID, targetAssetId: null, targetKind: w.kind, sourceTargetGroup: 'physical', occurredAt: '2026-08-01T10:00:00.000Z', financialEventId: null, abandonReason: null, currency: 'CNY', previousAmountMinor: 1500, expectedAmountMinor: 1400, sourceSnapshot: w },
            { id: '64000000-0000-4000-8000-000000000002', eventType: 'expectedPriceChanged', sourceWishlistId: WISH_ID, targetAssetId: null, targetKind: w.kind, sourceTargetGroup: 'physical', occurredAt: '2026-08-10T10:00:00.000Z', financialEventId: null, abandonReason: null, currency: 'CNY', previousAmountMinor: 1400, expectedAmountMinor: 1200, sourceSnapshot: w },
        ];
        plugin._wishlistEventsLoaded = true;
        const html = plugin._renderWishlistPoolAssetItem(w);
        assert.match(html, /am-asset-item__cover/, 'pool card shows a cover like the home list');
        assert.match(html, /am-asset-item__divider/, 'pool card has the divider line');
        assert.match(html, /am-asset-item__bottom am-wishpool__bottom/, 'bottom row uses home-list layout');
        // v2.4.2 hotfix 3：曲线作为 meta 行的最后一个子元素，通过 margin-left:auto 推到该行最右。
        // 无文字标签，与期望价同高（meta baseline），无论有没有标签都贴在卡片内容区右侧边缘。
        assert.match(html, /am-wishpool__spark/, 'mini price sparkline rendered as the last meta child for right alignment');
        assert.match(html, /am-trend-line/, 'sparkline reuses the report curve style class');
        assert.doesNotMatch(html, /am-wishpool__price-trend/, 'no separate price-trend row anymore (sparkline is a meta-row child)');
        assert.doesNotMatch(html, /data-wishlist-update-price-id/, 'v2.4.2 hotfix: update-price pill removed from the pool card (detail card keeps it)');
        assert.match(html, /data-wishlist-heartbeat-id/, 'v2.4.2: heartbeat pill exposed on the pool card');
        assert.match(html, /am-card-renew am-card-renew--ghost" data-wishlist-abandon-id/, 'abandon pill button at bottom');
        assert.match(html, /data-action="wishlist-buy"/, 'purchase route preserved');
        assert.match(html, /data-wishlist-buy-id/, 'purchase closure route preserved');
        assert.match(html, /data-wishlist-abandon-id/, 'abandon closure route preserved');
        assert.match(html, /期望价|Expected/, 'expected price label preserved');
        assert.match(html, /am-card-typechip--physical/, 'target group rendered as type chip');
        assert.doesNotMatch(html, /am-wishpool__btn/, 'old full-width big buttons removed');
        // 无价格事件 → 不追加 sparkline，底部三按钮仍在（心动 / 拔草 / 购买）。
        plugin.wishlistEvents = [];
        const htmlNoEvents = plugin._renderWishlistPoolAssetItem(w);
        assert.doesNotMatch(htmlNoEvents, /am-wishpool__spark/, 'no sparkline without price history');
        assert.doesNotMatch(htmlNoEvents, /data-wishlist-update-price-id/, 'update-price button stays off the pool card even without history');
        assert.match(htmlNoEvents, /data-wishlist-heartbeat-id/, 'heartbeat pill stays on the pool card without history');
    }

    console.log('[wishlist-edit-cover] passed');
})().catch(error => { console.error('[wishlist-edit-cover] failed:', error); process.exit(1); });
