'use strict';

/**
 * v2.5.0 笔记双链 · 阶段3 —— 入口能力 headless 测试（mock fetch）。
 *
 * 覆盖（任务规格）：
 *   A. rebuildNow：内容未变也强制 updateBlock；缺块补建；孤儿删除；返回 stats
 *   B. getBlockRefMarkdown：owned 有 indexBlockId → 正确格式且名称含双引号被转义；
 *      wishlist → custom-asset-id 属性 SQL 定位；索引未启用 → null；owned 无 indexBlockId → null
 *   C. getStatus：syncNow 成功后 lastSyncAt 更新、失败后 lastError 更新；
 *      enabled / configured / docId / assetTotal 快照正确
 *   D. 深链：渲染 markdown 含 siyuan://plugins/... 打开详情链接（阶段3B 落地后启用）
 */

const assert = require('node:assert/strict');
const { createNoteLinkEngine, NOTE_LINK_ASSET_ATTR, NOTE_LINK_HASH_ATTR, renderAssetBlockMarkdown } = require('../api/note-link');
const { newFormalV2Asset } = require('../api/assets');
const { createStableId } = require('../api/algorithms');

const NOW = '2026-08-17T03:00:00.000Z';
const TODAY = '2026-08-17';
const NB_ID = '20250330182153-k3b63hf';
const DOC_ID_PREFIX = '20260817090000';
const ID_PATTERN = /^[0-9]{14}-[a-z0-9]{7}$/;

const I18N_ZH = {
    statusWishlist: '种草', statusActive: '在役', statusRetired: '退役',
    formalKindphysical: '实物', formalKindvirtualSubscription: '虚拟订阅',
    noteIndexDaily: '日均', noteIndexAcquired: '购入', noteIndexExpires: '到期',
    noteIndexRemaining: '剩余', noteIndexTimes: '次', wishlistExpectedPrice: '期望价',
};
const testT = (key, fallback) => (I18N_ZH[key] != null ? I18N_ZH[key] : (fallback != null ? fallback : key));

// ===== 内核 mock（内存文档/块/属性模型，支持 entry 专用 SQL） ==================

function createKernelMock() {
    const state = {
        notebooks: [{ id: NB_ID, name: 'Studio', closed: false }],
        docs: new Map(),
        blocks: new Map(),
        attrs: [],
        counter: 0,
        calls: [],
        failNext: null,
    };

    function nextId() {
        state.counter += 1;
        return DOC_ID_PREFIX + '-' + String(state.counter).padStart(7, '0');
    }

    function execSql(stmt) {
        let m;
        if ((m = stmt.match(/^SELECT id FROM blocks WHERE root_id = '([^']+)' AND id IN \((.*)\)$/))) {
            const ids = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return ids.filter(id => state.blocks.has(id) && state.blocks.get(id).rootId === m[1]).map(id => ({ id }));
        }
        if ((m = stmt.match(/^SELECT block_id, name, value FROM attributes WHERE root_id = '([^']+)' AND name IN \((.*)\)$/))) {
            const names = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return state.attrs.filter(a => a.root_id === m[1] && names.indexOf(a.name) >= 0)
                .map(a => ({ block_id: a.block_id, name: a.name, value: a.value }));
        }
        if ((m = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs.filter(a => a.name === m[1] && a.root_id === m[2])
                .map(a => ({ block_id: a.block_id }));
        }
        // ensureHeaderBlock 内容特征扫描：文档内 quote 块且含标签文本。
        if ((m = stmt.match(/^SELECT block_id FROM blocks WHERE root_id = '([^']+)' AND type = 'b' AND content LIKE '%([^%]+)%'$/))) {
            return Array.from(state.blocks.values())
                .filter(b => b.rootId === m[1] && b.type === 'b' && b.content.indexOf(m[2]) >= 0)
                .map(b => ({ block_id: b.id }));
        }
        // getBlockRefMarkdown 专用：按属性值（资产 id）定位块。
        if ((m = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND value = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs.filter(a => a.name === m[1] && a.value === m[2] && a.root_id === m[3])
                .map(a => ({ block_id: a.block_id }));
        }
        throw new Error('mock SQL not supported: ' + stmt);
    }

    function setAttrs(blockId, attrs) {
        const block = state.blocks.get(blockId);
        const rootId = state.docs.has(blockId) ? blockId : (block && block.rootId);
        if (!rootId) return { code: -1, msg: 'block not found', data: null };
        Object.keys(attrs || {}).forEach(name => {
            const value = attrs[name];
            state.attrs = state.attrs.filter(a => !(a.block_id === blockId && a.name === name));
            if (value != null && value !== '') {
                state.attrs.push({ block_id: blockId, name: name, value: String(value), root_id: rootId });
            }
        });
        return { code: 0, msg: '', data: null };
    }

    // 内核事实投影：quote 块（markdown 以 "> " 开头）在 blocks 表 type='b'。
    function blockTypeOf(markdown) {
        return typeof markdown === 'string' && markdown.indexOf('> ') === 0 ? 'b' : 'p';
    }
    function contentOf(markdown) {
        return String(markdown || '').split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
    }

    function appendBlock(parentID, markdown) {
        let rootId = null;
        if (state.docs.has(parentID)) rootId = parentID;
        else if (state.blocks.has(parentID)) rootId = state.blocks.get(parentID).rootId;
        if (!rootId) return { code: -1, msg: 'parent not found', data: null };
        const id = nextId();
        state.blocks.set(id, { id, rootId, markdown, type: blockTypeOf(markdown), content: contentOf(markdown) });
        return { code: 0, msg: '', data: [{ timestamp: Date.now(), doOperations: [{ action: 'insert', id, parentID: parentID }], undoOperations: [] }] };
    }

    function handle(path, body) {
        state.calls.push({ path, body });
        if (state.failNext && state.failNext.path === path) {
            const fail = state.failNext;
            state.failNext = null;
            if (fail.kind === 'api') return { code: -1, msg: fail.msg || 'injected api failure', data: null };
            return { __fail: fail.kind };
        }
        switch (path) {
            case '/api/notebook/lsNotebooks':
                return { code: 0, msg: '', data: { notebooks: state.notebooks } };
            case '/api/filetree/createDocWithMd': {
                const nb = state.notebooks.find(n => n.id === body.notebook);
                if (!nb || nb.closed) return { code: -1, msg: 'notebook not available', data: null };
                const id = nextId();
                state.docs.set(id, { id, notebook: body.notebook, path: body.path });
                return { code: 0, msg: '', data: id };
            }
            case '/api/block/getBlockInfo': {
                if (state.docs.has(body.id)) {
                    const doc = state.docs.get(body.id);
                    return { code: 0, msg: '', data: { box: doc.notebook, rootID: body.id, rootTitle: doc.title } };
                }
                const block = state.blocks.get(body.id);
                if (block) return { code: 0, msg: '', data: { rootID: block.rootId } };
                return { code: -1, msg: 'block not found', data: null };
            }
            case '/api/block/checkBlockExist':
                return { code: 0, msg: '', data: state.docs.has(body.id) || state.blocks.has(body.id) };
            case '/api/filetree/getHPathByID': {
                const doc = state.docs.get(body.id);
                return doc ? { code: 0, msg: '', data: doc.path }
                    : { code: -1, msg: 'document not found', data: null };
            }
            case '/api/attr/getBlockAttrs': {
                if (!state.docs.has(body.id) && !state.blocks.has(body.id)) {
                    return { code: -1, msg: 'block not found', data: null };
                }
                const attrs = {};
                state.attrs.filter(a => a.block_id === body.id).forEach(a => { attrs[a.name] = a.value; });
                return { code: 0, msg: '', data: attrs };
            }
            case '/api/block/appendBlock':
                return appendBlock(body.parentID, body.data);
            case '/api/block/prependBlock':
                return appendBlock(body.parentID, body.data);
            case '/api/block/updateBlock': {
                const block = state.blocks.get(body.id);
                if (!block) return { code: -1, msg: 'block not found', data: null };
                block.markdown = body.data;
                block.type = blockTypeOf(body.data);
                block.content = contentOf(body.data);
                // 内核事实：updateBlock 整块替换，旧块 IAL 全部丢弃（仅 id 复位）。
                state.attrs = state.attrs.filter(a => a.block_id !== body.id);
                return { code: 0, msg: '', data: null };
            }
            case '/api/block/deleteBlock': {
                if (!state.blocks.has(body.id)) return { code: -1, msg: 'block not found', data: null };
                state.blocks.delete(body.id);
                state.attrs = state.attrs.filter(a => a.block_id !== body.id);
                return { code: 0, msg: '', data: null };
            }
            case '/api/attr/setBlockAttrs':
                return setAttrs(body.id, body.attrs);
            case '/api/query/sql':
                return { code: 0, msg: '', data: execSql(String(body.stmt || '')) };
            default:
                return { code: -1, msg: 'unknown endpoint ' + path, data: null };
        }
    }

    async function fetcher(path, options) {
        const body = JSON.parse((options && options.body) || '{}');
        const result = handle(path, body);
        if (result && result.__fail === 'network') throw new Error('network down');
        if (result && result.__fail === 'http') return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => result };
    }

    const callsTo = path => state.calls.filter(c => c.path === path);
    /** 模拟用户手动删掉单个资产块（不动文档本体）。 */
    function deleteBlockHard(blockId) {
        state.blocks.delete(blockId);
        state.attrs = state.attrs.filter(a => a.block_id !== blockId);
    }

    function seedDoc() {
        const id = nextId();
        state.docs.set(id, { id, notebook: NB_ID, path: '/legacy-index', title: 'legacy-index' });
        return id;
    }

    return { state, fetcher, callsTo, deleteBlockHard, seedDoc };
}

// ===== 装配 ====================================================================

function makeOwnedAsset(extra) {
    return newFormalV2Asset(Object.assign({
        id: createStableId(), kind: 'physical', name: '相机', currency: 'CNY', acquiredOn: '2026-01-01',
    }, extra), { now: NOW, today: TODAY, currency: 'CNY' });
}

function makeWishlistAsset(extra) {
    return newFormalV2Asset(Object.assign({
        id: createStableId(), kind: 'virtualSubscription', name: '想要的会员', status: 'wishlist',
        currency: 'CNY', wishlist: { reason: '', targetGroup: 'virtual', expectedAmountMinor: 25800 },
    }, extra), { now: NOW, today: TODAY, currency: 'CNY' });
}

function createHarness(options) {
    const opts = options || {};
    const kernel = createKernelMock();
    const seededDocId = kernel.seedDoc();
    let assets = (opts.assets || []).slice();
    let settings = Object.assign({
        indexEnabled: true, indexNotebookId: NB_ID, indexDocPath: '/legacy-index',
        indexDocId: seededDocId, indexAutoSync: true, indexIncludeCover: false,
    }, opts.settings || {});
    const patchCalls = [];

    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        saveSettings: patch => { settings = Object.assign({}, settings, patch); return Promise.resolve(true); },
        getAssets: () => assets,
        getDomain: () => opts.domain || { financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] },
        patchAssetIndexBlockId: (assetId, blockId) => {
            patchCalls.push({ assetId, blockId });
            assets = assets.map(a => (a.id === assetId ? Object.assign({}, a, { indexBlockId: blockId }) : a));
            return Promise.resolve(true);
        },
        fetcher: kernel.fetcher,
        t: testT,
        log: function () {},
        debounceMs: 20,
    });

    return {
        engine, kernel, patchCalls,
        getAssets: () => assets,
        getSettings: () => settings,
        setSettings: patch => { settings = Object.assign({}, settings, patch); },
    };
}

async function firstSync(harness) {
    const result = await harness.engine.syncNow({ manual: true });
    assert.equal(result.ok, true, 'first sync succeeds');
    assert.ok(result.docId && ID_PATTERN.test(result.docId));
    return result;
}

// ===== 场景 A：rebuildNow ======================================================

(async function scenarioRebuild() {
    const camera = makeOwnedAsset({ name: '相机' });
    const wish = makeWishlistAsset();
    const harness = createHarness({ assets: [camera, wish] });
    await firstSync(harness);

    // 幂等基线：内容未变 → 第二轮普通 sync 零 update。
    const steady = await harness.engine.syncNow({ manual: true });
    assert.equal(steady.ok, true);
    assert.equal(steady.stats.updated, 0, 'steady sync performs no update');

    // 重建：内容未变也强制 updateBlock（全部块重写 + 哈希重写）。
    const cameraLive = harness.getAssets().find(a => a.id === camera.id);
    const wishTaggedId = harness.kernel.state.attrs.find(a => a.name === NOTE_LINK_ASSET_ATTR && a.value === wish.id).block_id;
    const assetUpdateCalls = () => harness.kernel.callsTo('/api/block/updateBlock')
        .filter(call => call.body.id === cameraLive.indexBlockId || call.body.id === wishTaggedId).length;
    const before = assetUpdateCalls();
    const rebuild = await harness.engine.rebuildNow();
    assert.equal(rebuild.ok, true, 'rebuild succeeds');
    assert.equal(rebuild.stats.updated, 2, 'rebuild force-updates both live blocks');
    assert.equal(rebuild.stats.unchanged, 0, 'rebuild leaves nothing unchanged');
    assert.equal(rebuild.stats.appended, 0, 'rebuild appends nothing when no block is missing');
    assert.equal(assetUpdateCalls() - before, 2, 'asset updateBlock actually issued twice (header refresh excluded)');
    const hashRewrites = harness.kernel.callsTo('/api/attr/setBlockAttrs')
        .filter(call => call.body.attrs && NOTE_LINK_HASH_ATTR in call.body.attrs).length;
    assert.ok(hashRewrites >= 2, 'hash attrs rewritten during rebuild');

    // 缺块补建：手动删掉 wishlist 块（无 indexBlockId 可回写，只能靠属性/缺块 append 路径）。
    const wishBlockId = harness.kernel.state.attrs.find(a => a.name === NOTE_LINK_ASSET_ATTR && a.value === wish.id).block_id;
    harness.kernel.deleteBlockHard(wishBlockId);
    const rebuild2 = await harness.engine.rebuildNow();
    assert.equal(rebuild2.ok, true);
    assert.equal(rebuild2.stats.appended, 1, 'missing wishlist block is re-appended');
    assert.ok(harness.kernel.state.attrs.some(a => a.name === NOTE_LINK_ASSET_ATTR && a.value === wish.id),
        're-appended block is tagged again');

    // 孤儿删除：伪造一个指向不存在资产的打标块。
    const orphanId = '20260817099999-orphan1';
    harness.kernel.state.blocks.set(orphanId, { id: orphanId, rootId: harness.getSettings().indexDocId, markdown: '孤儿' });
    harness.kernel.state.attrs.push({ block_id: orphanId, name: NOTE_LINK_ASSET_ATTR, value: 'not-an-asset', root_id: harness.getSettings().indexDocId });
    const rebuild3 = await harness.engine.rebuildNow();
    assert.equal(rebuild3.ok, true);
    assert.equal(rebuild3.stats.deleted, 1, 'orphan tagged block is deleted');
    assert.ok(!harness.kernel.state.blocks.has(orphanId), 'orphan block really removed');

    // 返回结构：rebuildNow 复用 syncNow 管道（skipped 语义一致）。
    harness.setSettings({ indexEnabled: false });
    const skipped = await harness.engine.rebuildNow();
    assert.equal(skipped.ok, true);
    assert.equal(skipped.skipped, 'disabled', 'rebuild respects indexEnabled gate');
    console.log('[note-link-entry] scenarioRebuild OK');
})();

// ===== 场景 B：getBlockRefMarkdown =============================================

(async function scenarioBlockRef() {
    const monitor = makeOwnedAsset({ name: '27" 显示器' });   // 名称含双引号
    const camera = makeOwnedAsset({ name: '相机' });
    const wish = makeWishlistAsset({ name: '想要的服务' });
    const harness = createHarness({ assets: [monitor, camera, wish] });
    await firstSync(harness);

    // owned 有 indexBlockId → ((id "名称"))，双引号转义。
    // patchAssetIndexBlockId 回写替换数组元素，断言前从 harness 取最新实体。
    const monitorLive = harness.getAssets().find(a => a.id === monitor.id);
    assert.ok(monitorLive.indexBlockId, 'indexBlockId patched back after sync');
    const monitorRef = await harness.engine.getBlockRefMarkdown(monitorLive);
    assert.ok(monitorRef, 'owned asset returns a ref');
    assert.equal(monitorRef, '((' + monitorLive.indexBlockId + ' "27\\" 显示器"))',
        'owned ref format with escaped quote');

    // wishlist → custom-asset-id 属性 SQL 定位（无实体回写）。
    const wishRef = await harness.engine.getBlockRefMarkdown(wish);
    assert.ok(wishRef, 'wishlist asset returns a ref via attribute lookup');
    const wishBlockId = harness.kernel.state.attrs.find(a => a.name === NOTE_LINK_ASSET_ATTR && a.value === wish.id).block_id;
    assert.equal(wishRef, '((' + wishBlockId + ' "想要的服务"))', 'wishlist ref points at the tagged block');

    // 索引未启用 → null。
    harness.setSettings({ indexEnabled: false });
    assert.equal(await harness.engine.getBlockRefMarkdown(camera), null, 'disabled index returns null');
    harness.setSettings({ indexEnabled: true });

    // owned 无 indexBlockId → null（不回退属性查询，按规格）。
    const orphanOwned = makeOwnedAsset({ name: '没有索引块的资产' });
    assert.equal(await harness.engine.getBlockRefMarkdown(orphanOwned), null, 'owned without indexBlockId returns null');

    // indexDocId 未配置（文档不存在）→ null。
    harness.setSettings({ indexDocId: '' });
    assert.equal(await harness.engine.getBlockRefMarkdown(wish), null, 'missing index doc returns null');
    console.log('[note-link-entry] scenarioBlockRef OK');
})();

// ===== 场景 C：getStatus =======================================================

(async function scenarioStatus() {
    const camera = makeOwnedAsset({ name: '相机' });
    const wish = makeWishlistAsset();
    const harness = createHarness({ assets: [camera, wish] });

    // 同步前：预置 legacy doc 已配置，但尚无 lastSyncAt。
    let status = harness.engine.getStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.configured, true);
    assert.equal(status.docId, harness.getSettings().indexDocId);
    assert.equal(status.assetTotal, 2);
    assert.equal(status.lastSyncAt, null);
    assert.equal(status.lastError, null);

    // 成功后：lastSyncAt 更新。
    const result = await firstSync(harness);
    status = harness.engine.getStatus();
    assert.equal(status.docId, result.docId, 'docId exposed after sync');
    assert.ok(status.lastSyncAt, 'lastSyncAt recorded after successful sync');
    assert.equal(status.lastError, null, 'lastError stays clean after success');

    // 失败后：lastError 更新。注入 sql 查询失败（无自愈路径，直接抛到 syncNow）。
    harness.kernel.state.failNext = { path: '/api/query/sql', kind: 'api', msg: 'injected sql failure' };
    const failed = await harness.engine.syncNow({ manual: true });
    assert.equal(failed.ok, false, 'sync fails as expected');
    status = harness.engine.getStatus();
    assert.ok(status.lastError, 'lastError recorded after failed sync');
    assert.equal(status.lastError, String(failed.error));

    // indexDocId 是唯一配置事实源：仅清 notebook cache 仍保持 configured。
    harness.setSettings({ indexNotebookId: '' });
    status = harness.engine.getStatus();
    assert.equal(status.configured, true);
    console.log('[note-link-entry] scenarioStatus OK');
})();

// ===== 场景 D：深链渲染（阶段3B 落地后把 DEEP_LINK_ENABLED 改为 true） =========

(async function scenarioDeepLink() {
    const DEEP_LINK_ENABLED = true; // v2.5 阶段3B 已落地：renderAssetBlockMarkdown 末尾追加 siyuan:// 链接
    if (!DEEP_LINK_ENABLED) { console.log('[note-link-entry] scenarioDeepLink SKIPPED'); return; }
    const camera = makeOwnedAsset({ name: '相机' });
    const wish = makeWishlistAsset();
    const domain = { financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] };
    const owned = renderAssetBlockMarkdown(camera, { today: TODAY, domain, t: testT });
    assert.ok(owned.includes('siyuan://plugins/siyuan-plugin-asset-management/asset?id=' + camera.id),
        'owned block markdown contains the open-detail deep link');
    const wanted = renderAssetBlockMarkdown(wish, { today: TODAY, domain, t: testT });
    assert.ok(wanted.includes('siyuan://plugins/siyuan-plugin-asset-management/asset?id=' + wish.id),
        'wishlist block markdown contains the open-detail deep link');
    console.log('[note-link-entry] scenarioDeepLink OK');
})();

Promise.resolve().then(() => { console.log('[note-link-entry] ALL PASS'); });
