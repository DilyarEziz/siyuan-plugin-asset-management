'use strict';

/**
 * v2.5.0 笔记双链批次 · 阶段2 —— 索引文档引擎 headless 测试（mock fetch）。
 *
 * 覆盖（任务规格 7 场景）：
 *   1. legacy 文档首次同步 → 全资产 append + custom-asset-id 打标 + indexBlockId 回填
 *      （wishlist 资产不回写实体，只靠属性定位）
 *   2. 资产改名 → updateBlock 触发；未变 → 不 update（custom-am-hash 幂等）
 *   3. 删除资产 → deleteBlock + 孤儿清理
 *   4. 索引文档被删 → 普通 sync 返回 missing；显式 recreate 后重建全部块（新 id）
 *   5. indexEnabled=false / indexAutoSync=false → no-op（手动 syncNow 不受 autoSync 限制）
 *   6. fetch 失败（网络错 / code!==0）→ 引擎吞错，scheduleSync 不抛
 *   7. 防递归：回填 indexBlockId 触发的 scheduleSync 在 syncing 态被守卫，不产生二次同步
 *   8. 笔记本关闭（getBlockInfo code -1）→ 不误判误删：indexDocId 保留、零写入、ok:false；
 *      重开笔记本 → 下一轮 sync 完全恢复（不重建文档、不新增块）
 *   9. 显式 recreate 的 createDocWithMd 失败 → indexDocId 不被预清，恢复后重建成功
 */

const assert = require('node:assert/strict');
const { createNoteLinkEngine, NOTE_LINK_ASSET_ATTR, NOTE_LINK_HASH_ATTR, NOTE_LINK_HEADER_ATTR, renderAssetBlockMarkdown } = require('../api/note-link');
const { newFormalV2Asset, normalizeFinancialRecord } = require('../api/assets');
const { createStableId } = require('../api/algorithms');

const NOW = '2026-08-17T03:00:00.000Z';
const TODAY = '2026-08-17';
const NB_ID = '20250330182153-k3b63hf';
const DOC_ID_PREFIX = '20260817090000';
const ID_PATTERN = /^[0-9]{14}-[a-z0-9]{7}$/;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// 引擎 deps.t 的测试词典：与 i18n 键一一对应（验证引擎用的是约定键名）。
const I18N_ZH = {
    statusWishlist: '种草', statusActive: '在役', statusRetired: '退役',
    formalKindphysical: '实物', formalKindvirtualSubscription: '虚拟订阅',
    formalKindvirtualPerpetual: '虚拟买断', formalKindprepaidAmount: '预付金额',
    formalKindprepaidCount: '预付次数', wishlistExpectedPrice: '期望价',
    noteIndexDaily: '日均', noteIndexAcquired: '购入', noteIndexExpires: '到期',
    noteIndexRetired: '退役',
    noteIndexRemaining: '剩余', noteIndexTimes: '次',
    noteIndexHeaderHint: '本文档由「资产管理」插件自动维护。', noteIndexLastSync: '最后同步',
};
const testT = (key, fallback) => (I18N_ZH[key] != null ? I18N_ZH[key] : (fallback != null ? fallback : key));

// ===== 内核 mock（内存文档/块/属性模型） =====================================

function createKernelMock() {
    const state = {
        notebooks: [{ id: NB_ID, name: 'Studio', closed: false }, { id: '20200101000000-closed01', name: '归档', closed: true }],
        docs: new Map(),      // docId -> { id, notebook, path }
        blocks: new Map(),    // blockId -> { id, rootId, markdown }
        attrs: [],            // { block_id, name, value, root_id }
        counter: 0,
        calls: [],            // { path, body }
        failNext: null,       // { path, kind: 'network' | 'http' | 'api' }
    };

    function nextId(prefix) {
        state.counter += 1;
        return prefix + '-' + String(state.counter).padStart(7, '0');
    }

    function execSql(stmt) {
        let m;
        if ((m = stmt.match(/^SELECT DISTINCT a\.root_id AS id FROM attributes a JOIN blocks b ON b\.id = a\.root_id WHERE a\.name = '([^']+)' AND a\.value = '([^']+)' AND b\.box = '([^']+)'$/))) {
            return Array.from(state.docs.values())
                .filter(doc => doc.notebook === m[3])
                .filter(doc => state.attrs.some(a => a.block_id === doc.id && a.name === m[1] && a.value === m[2]))
                .map(doc => ({ id: doc.id }));
        }
        if ((m = stmt.match(/^SELECT id FROM blocks WHERE box = '([^']+)' AND hpath = '([^']+)' AND type = 'd'$/))) {
            return Array.from(state.docs.values())
                .filter(doc => doc.notebook === m[1] && doc.path === m[2])
                .map(doc => ({ id: doc.id }));
        }
        if ((m = stmt.match(/^SELECT id, type, root_id, box FROM blocks WHERE id = '([^']+)' LIMIT 1$/))) {
            const doc = state.docs.get(m[1]);
            if (doc) return [{ id: doc.id, type: 'd', root_id: doc.id, box: doc.notebook }];
            const block = state.blocks.get(m[1]);
            const root = block && state.docs.get(block.rootId);
            return block && root ? [{ id: block.id, type: block.type, root_id: block.rootId, box: root.notebook }] : [];
        }
        if ((m = stmt.match(/^SELECT id FROM blocks WHERE root_id = '([^']+)' AND id IN \((.*)\)$/))) {
            const ids = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return ids.filter(id => state.blocks.has(id) && state.blocks.get(id).rootId === m[1]).map(id => ({ id }));
        }
        if ((m = stmt.match(/^SELECT block_id, name, value FROM attributes WHERE root_id = '([^']+)' AND name IN \((.*)\)$/))) {
            const rootId = m[1];
            const names = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return state.attrs
                .filter(a => a.root_id === rootId && names.indexOf(a.name) >= 0)
                .map(a => ({ block_id: a.block_id, name: a.name, value: a.value }));
        }
        if ((m = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs
                .filter(a => a.name === m[1] && a.root_id === m[2])
                .map(a => ({ block_id: a.block_id }));
        }
        // ensureHeaderBlock 内容特征扫描：文档内 quote 块且含标签文本。
        if ((m = stmt.match(/^SELECT block_id FROM blocks WHERE root_id = '([^']+)' AND type = 'b' AND content LIKE '%([^%]+)%'$/))) {
            return Array.from(state.blocks.values())
                .filter(b => b.rootId === m[1] && b.type === 'b' && b.content.indexOf(m[2]) >= 0)
                .map(b => ({ block_id: b.id }));
        }
        throw new Error('mock SQL not supported: ' + stmt);
    }

    // 内核事实投影：quote 块（markdown 以 "> " 开头）在 blocks 表 type='b'；
    // content 列存块的纯文本（去引用前缀后的原文，足够 LIKE 匹配）。
    function blockTypeOf(markdown) {
        return typeof markdown === 'string' && markdown.indexOf('> ') === 0 ? 'b' : 'p';
    }
    function contentOf(markdown) {
        return String(markdown || '').split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
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

    function appendBlock(parentID, markdown) {
        let rootId = null;
        if (state.docs.has(parentID)) rootId = parentID;
        else if (state.blocks.has(parentID)) rootId = state.blocks.get(parentID).rootId;
        if (!rootId) return { code: -1, msg: 'parent not found', data: null };
        const id = nextId(DOC_ID_PREFIX);
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
                if (!nb) return { code: -1, msg: 'notebook not found', data: null };
                if (nb.closed) return { code: -1, msg: 'closed notebook', data: null };
                const id = nextId(DOC_ID_PREFIX);
                state.docs.set(id, { id, notebook: body.notebook, path: body.path });
                return { code: 0, msg: '', data: id };
            }
            case '/api/block/getBlockInfo': {
                // 内核事实：笔记本关闭时其文档/块的 getBlockInfo 返回 code -1
                // （ErrBoxUnindexed，与真删除 ErrTreeNotFound 同码）。
                const rootClosed = rootId => {
                    const doc = state.docs.get(rootId);
                    if (!doc) return false;
                    const owner = state.notebooks.find(n => n.id === doc.notebook);
                    return !!(owner && owner.closed);
                };
                if (state.docs.has(body.id)) {
                    if (rootClosed(body.id)) return { code: -1, msg: 'box not indexed', data: null };
                    const doc = state.docs.get(body.id);
                    return { code: 0, msg: '', data: { box: doc.notebook, rootID: body.id, rootTitle: doc.title } };
                }
                const block = state.blocks.get(body.id);
                if (block) {
                    if (rootClosed(block.rootId)) return { code: -1, msg: 'box not indexed', data: null };
                    return { code: 0, msg: '', data: { rootID: block.rootId } };
                }
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
                // 内核事实（block_op.go L907 + transaction.go doUpdate L1630-1631）：
                // updateBlock 以新数据整块替换，旧块 IAL 全部丢弃（仅 id 复位）。
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

    function deleteDoc(docId) {
        state.docs.delete(docId);
        Array.from(state.blocks.values()).filter(b => b.rootId === docId).forEach(b => state.blocks.delete(b.id));
        state.attrs = state.attrs.filter(a => a.root_id !== docId);
    }

    function seedDoc() {
        const id = nextId(DOC_ID_PREFIX);
        state.docs.set(id, { id, notebook: NB_ID, path: '/legacy-index', title: 'legacy-index' });
        return id;
    }

    function seedTaggedBlock(docId, assetId, markdown) {
        const payload = appendBlock(docId, markdown || 'stale asset projection');
        const id = payload.data[0].doOperations[0].id;
        setAttrs(id, { [NOTE_LINK_ASSET_ATTR]: assetId });
        return id;
    }

    const callsTo = path => state.calls.filter(c => c.path === path);

    return {
        state, fetcher, seedDoc, seedTaggedBlock, deleteDoc, callsTo,
        docBlockIds: docId => Array.from(state.blocks.values()).filter(b => b.rootId === docId).map(b => b.id),
    };
}

// ===== 引擎装配 ===============================================================

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
    const hasExplicitDocId = !!(opts.settings && Object.prototype.hasOwnProperty.call(opts.settings, 'indexDocId'));
    const seededDocId = hasExplicitDocId ? '' : kernel.seedDoc();
    let assets = (opts.assets || []).slice();
    let settings = Object.assign({
        indexEnabled: true, indexNotebookId: NB_ID, indexDocPath: '/legacy-index',
        indexDocId: seededDocId, indexAutoSync: true, indexIncludeCover: false,
    }, opts.settings || {});
    const logs = [];
    const patchCalls = [];
    let scheduleHook = null;

    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        saveSettings: patch => { settings = Object.assign({}, settings, patch); return Promise.resolve(true); },
        getAssets: () => assets,
        getDomain: () => opts.domain || { financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] },
        patchAssetIndexBlockId: (assetId, blockId) => {
            patchCalls.push({ assetId, blockId });
            assets = assets.map(a => (a.id === assetId ? Object.assign({}, a, { indexBlockId: blockId }) : a));
            // 模拟宿主 _onDataCommitted：回写后立即尝试再次调度（防递归验证点）。
            if (scheduleHook) scheduleHook();
            return Promise.resolve(true);
        },
        fetcher: kernel.fetcher,
        t: testT,
        log: function () { logs.push([].slice.call(arguments).join(' ')); },
        debounceMs: opts.debounceMs != null ? opts.debounceMs : 20,
    });
    scheduleHook = () => engine.scheduleSync();

    return {
        engine, kernel, logs, patchCalls,
        getAssets: () => assets,
        setAssets: next => { assets = next; },
        getSettings: () => settings,
        setSettings: patch => { settings = Object.assign({}, settings, patch); },
    };
}

function purchaseEventFor(asset, amountMinor) {
    return normalizeFinancialRecord({
        id: createStableId(), assetId: asset.id, occurredAt: NOW, effectiveDate: asset.acquiredOn,
        createdAt: NOW, source: 'user', correlationId: null, note: '', metadata: {},
        replacesEventId: null, voidedAt: null, direction: 'outflow', eventType: 'purchase',
        currency: asset.currency, amountMinor: amountMinor,
    });
}

// ===== 场景 1：legacy 文档首次同步 =============================================

(async function scenario1() {
    const camera = makeOwnedAsset({ name: '相机' });
    const phone = makeOwnedAsset({ name: '手机', kind: 'physical' });
    const wish = makeWishlistAsset();
    const harness = createHarness({
        assets: [camera, phone, wish],
        domain: { financialEvents: [purchaseEventFor(camera, 36500), purchaseEventFor(phone, 599900)], subscriptionPeriods: [], prepaidTransactions: [], tags: [] },
    });

    const result = await harness.engine.syncNow({ manual: true });
    assert.equal(result.ok, true, 'first sync succeeds');
    assert.ok(result.docId && ID_PATTERN.test(result.docId), 'doc id returned');
    assert.equal(harness.getSettings().indexDocId, result.docId, 'preconfigured indexDocId remains unchanged');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 0, 'normal sync never creates a document');
    assert.equal(harness.kernel.callsTo('/api/block/appendBlock').length, 3, 'all three assets appended');

    // 属性打标：3 个 custom-asset-id + 3 个 custom-am-hash。
    const assetAttrs = harness.kernel.state.attrs.filter(a => a.name === NOTE_LINK_ASSET_ATTR);
    assert.equal(assetAttrs.length, 3, 'custom-asset-id set for every asset');
    assert.ok(assetAttrs.some(a => a.value === camera.id));
    assert.ok(assetAttrs.some(a => a.value === wish.id));
    assert.equal(harness.kernel.state.attrs.filter(a => a.name === NOTE_LINK_HASH_ATTR).length, 3, 'hash attr set');

    // indexBlockId 回填：owned 两个，wishlist 不回写（极简 schema 不携带该键）。
    assert.equal(harness.patchCalls.length, 2, 'wishlist asset is not patched');
    const after = harness.getAssets();
    assert.ok(after.find(a => a.id === camera.id).indexBlockId, 'camera indexBlockId backfilled');
    assert.ok(after.find(a => a.id === phone.id).indexBlockId, 'phone indexBlockId backfilled');
    assert.ok(!after.find(a => a.id === wish.id).indexBlockId, 'wishlist carries no indexBlockId (minimal schema)');

    // 文档头提示块：prepend + custom-am-header 打标。
    assert.equal(harness.kernel.callsTo('/api/block/prependBlock').length, 1, 'header prepended');
    assert.equal(harness.kernel.state.attrs.filter(a => a.name === NOTE_LINK_HEADER_ATTR).length, 1, 'header attr set');
    assert.equal(harness.kernel.docBlockIds(result.docId).length, 4, 'doc holds header + 3 asset blocks');

    // 渲染口径抽查：名称加粗 + 日均 + 购入日期。
    const cameraBlock = harness.kernel.state.blocks.get(after.find(a => a.id === camera.id).indexBlockId);
    assert.match(cameraBlock.markdown, /^\*\*相机\*\* ｜ 在役 · 实物 ｜ 日均 ¥/, 'owned block renders daily cost');
    assert.match(cameraBlock.markdown, /2026-01-01 购入/, 'owned block renders acquired date');
    const wishBlock = harness.kernel.state.blocks.get(assetAttrs.find(a => a.value === wish.id).block_id);
    assert.match(wishBlock.markdown, /^\*\*想要的会员\*\* ｜ 种草 · 虚拟订阅 ｜ 期望价 ¥258/, 'wishlist block renders expected price');

    // 块内容渲染纯函数：markdown 破坏字符被转义。
    const tricky = renderAssetBlockMarkdown(makeOwnedAsset({ name: 'a|b[c]d*e\nf' }), { today: TODAY, domain: {}, t: (k, fb) => fb });
    assert.ok(tricky.indexOf('a\\|b\\[c\\]d\\*e f') >= 0, 'name special chars escaped: ' + tricky);

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 1 passed (legacy first sync)');
})().catch(fail);

// ===== 场景 2：改名触发 update；未变不 update（幂等） =========================

(async function scenario2() {
    const camera = makeOwnedAsset({ name: '相机' });
    const harness = createHarness({ assets: [camera], domain: { financialEvents: [purchaseEventFor(camera, 36500)], subscriptionPeriods: [], prepaidTransactions: [], tags: [] } });

    await harness.engine.syncNow({ manual: true });
    const baselineAppends = harness.kernel.callsTo('/api/block/appendBlock').length;
    assert.equal(baselineAppends, 1);
    const blockId = harness.getAssets()[0].indexBlockId;
    // 只统计资产块的 update（排除文档头提示块每轮的时间刷新）。
    const assetUpdates = () => harness.kernel.callsTo('/api/block/updateBlock').filter(c => c.body.id === blockId).length;

    // 未变 → 幂等：资产块不 update、不 append。
    const idle = await harness.engine.syncNow({ manual: true });
    assert.equal(idle.ok, true);
    assert.equal(idle.stats.unchanged, 1, 'unchanged asset detected via hash');
    assert.equal(harness.kernel.callsTo('/api/block/appendBlock').length, baselineAppends, 'no re-append when unchanged');
    assert.equal(assetUpdates(), 0, 'no updateBlock on unchanged asset block');

    // 改名 → 恰好一次资产块 update + 哈希刷新。
    harness.setAssets(harness.getAssets().map(a => Object.assign({}, a, { name: '微单相机' })));
    const renamed = await harness.engine.syncNow({ manual: true });
    assert.equal(renamed.stats.updated, 1, 'renamed asset updated');
    assert.equal(assetUpdates(), 1, 'exactly one updateBlock for rename');
    assert.equal(harness.kernel.callsTo('/api/block/appendBlock').length, baselineAppends, 'rename does not append');
    assert.match(harness.kernel.state.blocks.get(blockId).markdown, /^\*\*微单相机\*\*/, 'block content updated');

    // 改名后再次同步 → 新哈希已落库，恢复幂等。
    const idleAgain = await harness.engine.syncNow({ manual: true });
    assert.equal(idleAgain.stats.unchanged, 1, 'hash refreshed after update, idempotent again');
    assert.equal(assetUpdates(), 1, 'still only one asset update');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 2 passed (idempotent update)');
})().catch(fail);

// ===== 场景 3：删除资产 → deleteBlock + 孤儿清理 ==============================

(async function scenario3() {
    const camera = makeOwnedAsset({ name: '相机' });
    const phone = makeOwnedAsset({ name: '手机' });
    const harness = createHarness({ assets: [camera, phone] });

    const first = await harness.engine.syncNow({ manual: true });
    assert.equal(first.stats.appended, 2);

    harness.setAssets(harness.getAssets().filter(a => a.id !== phone.id));
    const second = await harness.engine.syncNow({ manual: true });
    assert.equal(second.ok, true);
    assert.equal(second.stats.deleted, 1, 'orphan block deleted');
    assert.equal(harness.kernel.callsTo('/api/block/deleteBlock').length, 1, 'deleteBlock called once');
    assert.equal(harness.kernel.state.attrs.filter(a => a.name === NOTE_LINK_ASSET_ATTR && a.value === phone.id).length, 0, 'orphan attrs removed');
    assert.equal(harness.kernel.docBlockIds(first.docId).length, 2, 'header + remaining asset block');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 3 passed (delete + orphan cleanup)');
})().catch(fail);

// ===== 场景 4：索引文档被误删 → missing；显式 recreate 后重建 =================

(async function scenario4() {
    const camera = makeOwnedAsset({ name: '相机' });
    const wish = makeWishlistAsset();
    const harness = createHarness({ assets: [camera, wish] });

    const first = await harness.engine.syncNow({ manual: true });
    const oldDocId = first.docId;
    const oldCameraBlock = harness.getAssets().find(a => a.id === camera.id).indexBlockId;
    assert.ok(oldCameraBlock);

    harness.kernel.deleteDoc(oldDocId); // 用户误删整篇索引文档
    const second = await harness.engine.syncNow({ manual: true });
    assert.equal(second.ok, false, 'normal sync reports the missing document');
    assert.equal(second.state, 'missing');
    assert.equal(harness.getSettings().indexDocId, oldDocId, 'missing sync preserves the old doc id');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 0, 'missing sync never recreates');

    const recreated = await harness.engine.recreateIndexDocument(NB_ID);
    assert.equal(recreated.ok, true, 'explicit recreate succeeds');
    assert.ok(recreated.docId && recreated.docId !== oldDocId, 'new doc created with new id');
    assert.equal(harness.getSettings().indexDocId, recreated.docId, 'settings point at explicitly rebuilt doc');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 1, 'doc recreated exactly once');

    const newCameraBlock = harness.getAssets().find(a => a.id === camera.id).indexBlockId;
    assert.ok(newCameraBlock && newCameraBlock !== oldCameraBlock, 'asset block rebuilt with new id');
    assert.equal(recreated.stats.appended, 2, 'all assets re-appended');
    assert.equal(harness.kernel.docBlockIds(recreated.docId).length, 3, 'header + 2 asset blocks in rebuilt doc');
    assert.equal(harness.kernel.state.attrs.filter(a => a.root_id === oldDocId).length, 0, 'no attrs left on deleted doc');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 4 passed (missing + explicit recreate)');
})().catch(fail);

// ===== 场景 5：开关关闭 → no-op ===============================================

(async function scenario5() {
    const camera = makeOwnedAsset({ name: '相机' });

    const disabled = createHarness({ assets: [camera], settings: { indexEnabled: false }, debounceMs: 10 });
    disabled.engine.scheduleSync();
    await sleep(60);
    assert.equal(disabled.kernel.state.calls.length, 0, 'indexEnabled=false: scheduleSync is a no-op');
    const disabledResult = await disabled.engine.syncNow({ manual: true });
    assert.deepEqual({ ok: disabledResult.ok, skipped: disabledResult.skipped }, { ok: true, skipped: 'disabled' });
    assert.equal(disabled.kernel.state.calls.length, 0, 'indexEnabled=false: manual sync also skips');
    disabled.engine.dispose();

    const autoOff = createHarness({ assets: [camera], settings: { indexAutoSync: false }, debounceMs: 10 });
    autoOff.engine.scheduleSync();
    await sleep(60);
    assert.equal(autoOff.kernel.state.calls.length, 0, 'indexAutoSync=false: scheduleSync is a no-op');
    const autoOffAuto = await autoOff.engine.syncNow();
    assert.equal(autoOffAuto.skipped, 'autoSyncDisabled', 'automatic syncNow respects autoSync flag');
    const autoOffManual = await autoOff.engine.syncNow({ manual: true });
    assert.equal(autoOffManual.ok, true, 'manual syncNow bypasses autoSync flag');
    assert.equal(autoOff.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
    autoOff.engine.dispose();

    const unconfigured = createHarness({ assets: [camera], settings: { indexNotebookId: '', indexDocId: '' }, debounceMs: 10 });
    const unconfiguredResult = await unconfigured.engine.syncNow({ manual: true });
    assert.equal(unconfiguredResult.skipped, 'unconfigured', 'missing notebook silently skipped');
    assert.equal(unconfigured.kernel.state.calls.length, 0, 'unconfigured: zero kernel calls');
    unconfigured.engine.dispose();

    console.log('[note-link-engine] scenario 5 passed (switch no-ops)');
})().catch(fail);

// ===== 场景 6：fetch 失败 → 引擎吞错 ==========================================

(async function scenario6() {
    const camera = makeOwnedAsset({ name: '相机' });

    const network = createHarness({ assets: [camera], debounceMs: 10 });
    network.kernel.state.failNext = { path: '/api/block/getBlockInfo', kind: 'network' };
    let threw = false;
    try {
        const result = await network.engine.syncNow({ manual: true });
        assert.equal(result.ok, false, 'network failure reported as ok:false');
        assert.ok(result.error, 'error message captured');
    } catch (e) { threw = true; }
    assert.equal(threw, false, 'syncNow never throws on network failure');
    assert.ok(network.engine.getState().lastError, 'lastError recorded');
    network.engine.scheduleSync(); // 错误后仍可调度，不抛
    await sleep(50);
    network.engine.dispose();

    const apiFail = createHarness({ assets: [camera], debounceMs: 10 });
    apiFail.kernel.state.failNext = { path: '/api/block/appendBlock', kind: 'api' };
    const apiResult = await apiFail.engine.syncNow({ manual: true });
    assert.equal(apiResult.ok, false, 'code!==0 failure reported as ok:false');
    assert.equal(apiFail.kernel.callsTo('/api/filetree/createDocWithMd').length, 0, 'sync never creates before append failure');
    apiFail.engine.dispose();

    // scheduleSync 全链路：防抖回调内的失败也不得冒泡（进程存活到本断言即通过）。
    const scheduled = createHarness({ assets: [camera], debounceMs: 10 });
    scheduled.kernel.state.failNext = { path: '/api/block/getBlockInfo', kind: 'http' };
    let scheduledThrew = false;
    try { scheduled.engine.scheduleSync(); } catch (e) { scheduledThrew = true; }
    assert.equal(scheduledThrew, false, 'scheduleSync itself never throws');
    await sleep(60);
    assert.ok(scheduled.kernel.state.calls.length > 0, 'debounced sync actually ran');
    assert.ok(scheduled.engine.getState().lastError, 'debounced failure recorded in lastError, not thrown');
    scheduled.engine.dispose();

    console.log('[note-link-engine] scenario 6 passed (error swallowing)');
})().catch(fail);

// ===== 场景 7：防递归 —— 回写触发的 scheduleSync 不得二次同步 =================

(async function scenario7() {
    const camera = makeOwnedAsset({ name: '相机' });
    const phone = makeOwnedAsset({ name: '手机' });
    const harness = createHarness({ assets: [camera, phone], debounceMs: 15 });
    // harness 的 patchAssetIndexBlockId 在每次回写后调用 engine.scheduleSync()
    // （模拟 _onDataCommitted 钩子）。syncing 守卫必须让全部调用 no-op。

    const result = await harness.engine.syncNow({ manual: true });
    assert.equal(result.ok, true);
    assert.equal(harness.patchCalls.length, 2, 'both owned assets patched');
    const callsAtSyncEnd = harness.kernel.state.calls.length;
    assert.equal(harness.kernel.callsTo('/api/block/appendBlock').length, 2, 'no duplicate appends from recursion');

    await sleep(80); // 若防递归失效，防抖定时器会在此窗口内发起第二轮同步
    assert.equal(harness.kernel.state.calls.length, callsAtSyncEnd, 'no second sync scheduled by backfill writes');
    assert.equal(harness.engine.getState().syncing, false, 'syncing flag released');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 7 passed (recursion guard)');
})().catch(fail);

// ===== 场景 8：笔记本关闭 → 不误判误删；重开 → 完全恢复 =======================

(async function scenario8() {
    const camera = makeOwnedAsset({ name: '相机' });
    const harness = createHarness({ assets: [camera], domain: { financialEvents: [purchaseEventFor(camera, 36500)], subscriptionPeriods: [], prepaidTransactions: [], tags: [] } });

    const first = await harness.engine.syncNow({ manual: true });
    assert.equal(first.ok, true);
    const docId = first.docId;
    const blockCount = harness.kernel.docBlockIds(docId).length; // 头提示块 + 1 资产块
    const attrsBefore = harness.kernel.state.attrs.length;
    const patchesBefore = harness.patchCalls.length;
    const callsBefore = harness.kernel.state.calls.length;

    // 关闭索引所在笔记本：内核对该文档 getBlockInfo 返回 code -1（与真删除同码）。
    harness.kernel.state.notebooks.find(nb => nb.id === NB_ID).closed = true;

    const second = await harness.engine.syncNow({ manual: true });
    assert.equal(second.ok, false, 'closed notebook aborts sync with ok:false');
    assert.ok(second.error && /notebook/i.test(second.error), 'readable error mentions notebook: ' + second.error);
    assert.equal(harness.getSettings().indexDocId, docId, 'indexDocId preserved (no pre-clear)');
    // 本轮只允许探测（getBlockInfo + SQL blocks 行 + lsNotebooks + block tree），零写入。
    const roundCalls = harness.kernel.state.calls.slice(callsBefore);
    assert.deepEqual(roundCalls.map(c => c.path), [
        '/api/block/getBlockInfo', '/api/query/sql', '/api/notebook/lsNotebooks', '/api/block/checkBlockExist',
    ],
        'closed-notebook round is probe-only, zero writes');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 0, 'no false rebuild attempt');
    assert.equal(harness.kernel.docBlockIds(docId).length, blockCount, 'doc blocks intact');
    assert.equal(harness.kernel.state.attrs.length, attrsBefore, 'attrs untouched');
    assert.equal(harness.patchCalls.length, patchesBefore, 'no asset backfill');

    // 重开笔记本 → 下一轮 sync 完全恢复：复用旧文档，不重建、不新增块。
    harness.kernel.state.notebooks.find(nb => nb.id === NB_ID).closed = false;
    const third = await harness.engine.syncNow({ manual: true });
    assert.equal(third.ok, true, 'recovery sync succeeds after reopen');
    assert.equal(third.docId, docId, 'same doc reused, no rebuild');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 0, 'doc not recreated after reopen');
    assert.equal(harness.kernel.docBlockIds(docId).length, blockCount, 'no new blocks appended after reopen');
    assert.equal(third.stats.unchanged, 1, 'asset block recognized via hash, idempotent');
    assert.equal(harness.getSettings().indexDocId, docId, 'indexDocId unchanged through close/reopen');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 8 passed (closed notebook: no false rebuild, full recovery)');
})().catch(fail);

// ===== 场景 9：显式 recreate 创建失败 → indexDocId 不被预清 ==================

(async function scenario9() {
    const camera = makeOwnedAsset({ name: '相机' });
    const harness = createHarness({ assets: [camera] });

    const first = await harness.engine.syncNow({ manual: true });
    assert.equal(first.ok, true);
    const oldDocId = first.docId;

    // 真删除 + 普通同步：只返回 missing，不发创建请求。
    harness.kernel.deleteDoc(oldDocId);
    const missing = await harness.engine.syncNow({ manual: true });
    assert.equal(missing.state, 'missing');
    assert.equal(harness.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);

    // 显式 recreate 创建失败（code -1）：indexDocId 必须保持旧值，不得预清。
    harness.kernel.state.failNext = { path: '/api/filetree/createDocWithMd', kind: 'api', msg: 'create failed' };
    const second = await harness.engine.recreateIndexDocument(NB_ID);
    assert.equal(second.ok, false, 'create failure reported as ok:false');
    assert.ok(second.error, 'error message captured');
    assert.equal(harness.getSettings().indexDocId, oldDocId, 'indexDocId NOT pre-cleared when create fails');
    assert.equal(harness.kernel.state.docs.size, 0, 'no doc written');
    assert.equal(harness.kernel.state.blocks.size, 0, 'no blocks written');

    // 故障解除 → 下一次显式重建成功，indexDocId 仅在创建成功后被新 ID 覆盖。
    const third = await harness.engine.recreateIndexDocument(NB_ID);
    assert.equal(third.ok, true, 'retry after transient create failure succeeds');
    assert.ok(third.docId && third.docId !== oldDocId, 'rebuilt doc gets new id');
    assert.equal(harness.getSettings().indexDocId, third.docId, 'indexDocId overwritten only after create success');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 9 passed (create failure keeps indexDocId)');
})().catch(fail);

// ===== 场景 10：当前文档属性块优先，旧文档块绝不被更新 ========================

(async function scenario10() {
    const camera = makeOwnedAsset({ name: '相机' });
    const harness = createHarness({ assets: [camera] });
    const first = await harness.engine.syncNow({ manual: true });
    assert.equal(first.ok, true);
    const oldDocId = first.docId;
    const oldBlockId = harness.getAssets()[0].indexBlockId;

    const currentDocId = harness.kernel.seedDoc();
    const currentBlockId = harness.kernel.seedTaggedBlock(currentDocId, camera.id, '旧的当前文档投影');
    harness.setSettings({ indexDocId: currentDocId });
    const updatesBefore = harness.kernel.callsTo('/api/block/updateBlock').length;
    const patchesBefore = harness.patchCalls.length;

    const second = await harness.engine.syncNow({ manual: true });
    assert.equal(second.ok, true);
    assert.equal(second.docId, currentDocId);
    assert.equal(second.stats.appended, 0, 'current document tagged block is reused');
    assert.equal(harness.getAssets()[0].indexBlockId, currentBlockId, 'entity is rebound to the current document block');
    assert.deepEqual(harness.patchCalls.slice(patchesBefore), [{ assetId: camera.id, blockId: currentBlockId }]);
    const roundUpdates = harness.kernel.callsTo('/api/block/updateBlock').slice(updatesBefore);
    assert.ok(roundUpdates.some(call => call.body.id === currentBlockId), 'current document block is updated');
    assert.ok(!roundUpdates.some(call => call.body.id === oldBlockId), 'old document block is never updated');
    assert.equal(harness.kernel.state.blocks.get(oldBlockId).rootId, oldDocId, 'old block remains untouched in document A');

    harness.engine.dispose();
    console.log('[note-link-engine] scenario 10 passed (current-root block ownership)');
})().catch(fail);

// ===== 场景 11：退役行补「退役日期」列（v2.6.2） =============================

(async function scenario11() {
    const domain = { financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] };
    const render = asset => renderAssetBlockMarkdown(asset, { today: TODAY, domain, t: testT });
    // 「日期 退役」段特征：退役日期列永远是 `YYYY-MM-DD 退役` 形态，
    // 与状态列的「退役 · 实物」不冲突（状态列无前置日期）。
    const RETIRED_DATE_SEGMENT = /\d{4}-\d{2}-\d{2} 退役/;

    // A. 退役实物资产：渲染退役日期段，且位于「购入」段之后。
    const retired = makeOwnedAsset({
        name: '旧相机', status: 'retired', acquiredOn: '2025-01-01', statusChangedOn: '2026-06-30',
    });
    const retiredMd = render(retired);
    assert.match(retiredMd, /^\*\*旧相机\*\* ｜ 退役 · 实物/, 'retired row keeps status·kind segment');
    assert.ok(retiredMd.indexOf('2025-01-01 购入') >= 0, 'retired row keeps acquired segment: ' + retiredMd);
    assert.ok(retiredMd.indexOf('2026-06-30 退役') >= 0, 'retired row renders retired-date segment: ' + retiredMd);
    assert.ok(retiredMd.indexOf('2025-01-01 购入') < retiredMd.indexOf('2026-06-30 退役'),
        'retired-date segment comes after acquired segment');
    assert.ok(retiredMd.indexOf('日均') < 0, 'retired row renders no daily-cost segment');

    // B. 在役资产行保持原格式：不出现退役日期段。
    const active = makeOwnedAsset({ name: '相机' });
    const activeMd = render(active);
    assert.ok(!RETIRED_DATE_SEGMENT.test(activeMd), 'active row never renders retired-date segment: ' + activeMd);
    assert.ok(activeMd.indexOf('退役') < 0, 'active row contains no retired text at all: ' + activeMd);

    // C. 退役但 statusChangedOn 缺失/非法（脏数据）→ 不渲染退役日期列、同步不抛错。
    // 规范实体的 statusChangedOn 必为合法 YYYY-MM-DD（normalize 强制），缺失/
    // 非法只可能来自篡改；严格投影会拒绝此类实体，引擎按既有 try/catch 降级为
    // 「名称+状态」兜底块（renderFallbackBlockMarkdown），块仍然落盘且无日期列。
    const dirtyMissing = Object.assign(
        {}, makeOwnedAsset({ name: '缺日期', status: 'retired', acquiredOn: '2025-01-01' }),
        { statusChangedOn: null });
    const dirtyInvalid = Object.assign(
        {}, makeOwnedAsset({ name: '坏日期', status: 'retired', acquiredOn: '2025-01-01' }),
        { statusChangedOn: '2026-6-3' });
    const dirtyHarness = createHarness({ assets: [dirtyMissing, dirtyInvalid], domain });
    const dirtyResult = await dirtyHarness.engine.syncNow({ manual: true });
    assert.equal(dirtyResult.ok, true, 'sync tolerates dirty retired assets without throwing');
    const blockIdByAsset = new Map(dirtyHarness.kernel.state.attrs
        .filter(a => a.name === NOTE_LINK_ASSET_ATTR).map(a => [a.value, a.block_id]));
    [dirtyMissing, dirtyInvalid].forEach(dirty => {
        const block = dirtyHarness.kernel.state.blocks.get(blockIdByAsset.get(dirty.id));
        assert.ok(block, 'dirty retired asset still gets a block');
        assert.ok(!RETIRED_DATE_SEGMENT.test(block.markdown),
            'no retired-date segment for dirty statusChangedOn: ' + block.markdown);
        assert.ok(block.markdown.indexOf('**' + dirty.name + '**') >= 0,
            'fallback block keeps the asset name: ' + block.markdown);
    });
    dirtyHarness.engine.dispose();

    console.log('[note-link-engine] scenario 11 passed (retired row gains retired-date column)');
})().catch(fail);

function fail(error) {
    console.error('[note-link-engine] FAILED:', error && error.stack || error);
    process.exit(1);
}
