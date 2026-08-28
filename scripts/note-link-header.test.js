'use strict';

/**
 * v2.5.0 笔记双链 · header 块重复 bug 回归测试（mock fetch）。
 *
 * 根因（siyuan-master 源码核实）：
 *   /api/block/updateBlock 以新 markdown 整块替换 —— block_op.go updateBlock 仅将
 *   新树首子块 id 复位为旧 id；model.doUpdate 中 oldNode.InsertAfter(updatedNode) +
 *   oldNode.Unlink() 丢弃旧块全部 IAL —— custom-* 属性被剥离（内核自身也需要在
 *   update 后异步重打 custom-av-view-names，见 transaction.go L1667-1675 旁证）。
 *
 * 旧实现：ensureHeaderBlock update 分支不重打 custom-am-header → 下一轮属性定位
 * 失败 → 重复 prepend（用户实测每次同步多出一段）。资产块 update 分支只重打
 * custom-am-hash 漏打 custom-asset-id → wishlist 块定位/孤儿清理退化。
 *
 * 本文件 mock 内核严格模拟剥离语义，覆盖：
 *   1. 连续两次 sync → 恰好 1 个 header 块且内容被更新（不新增）
 *   2. 预置 3 个重复 header 块（有属性/无属性混合 + 全无属性）→ 下次 sync 清理为 1 个
 *   3. 资产（wishlist）内容变更走 updateBlock 后 custom-asset-id / custom-am-hash
 *      仍完整，且下一轮 sync 恢复哈希幂等（不再 update）
 */

const assert = require('node:assert/strict');
const { createNoteLinkEngine, NOTE_LINK_ASSET_ATTR, NOTE_LINK_HASH_ATTR, NOTE_LINK_HEADER_ATTR, renderHeaderMarkdown } = require('../api/note-link');
const { newFormalV2Asset } = require('../api/assets');
const { createStableId } = require('../api/algorithms');

const NOW = '2026-08-17T03:00:00.000Z';
const TODAY = '2026-08-17';
const NB_ID = '20250330182153-k3b63hf';
const DOC_ID_PREFIX = '20260817090000';

const I18N_ZH = {
    statusWishlist: '种草', statusActive: '在役', statusRetired: '退役',
    formalKindphysical: '实物', formalKindvirtualSubscription: '虚拟订阅',
    formalKindvirtualPerpetual: '虚拟买断', formalKindprepaidAmount: '预付金额',
    formalKindprepaidCount: '预付次数', wishlistExpectedPrice: '期望价',
    noteIndexDaily: '日均', noteIndexAcquired: '购入', noteIndexExpires: '到期',
    noteIndexRemaining: '剩余', noteIndexTimes: '次',
    noteIndexHeaderHint: '本文档由「资产管理」插件自动维护。', noteIndexLastSync: '最后同步',
};
const testT = (key, fallback) => (I18N_ZH[key] != null ? I18N_ZH[key] : (fallback != null ? fallback : key));

// ===== 内核 mock（严格模拟 updateBlock 剥离 IAL 的真实语义） ====================

function createKernelMock() {
    const state = {
        notebooks: [{ id: NB_ID, name: 'Studio', closed: false }],
        docs: new Map(),
        blocks: new Map(),    // blockId -> { id, rootId, markdown, type, content }
        attrs: [],            // { block_id, name, value, root_id }
        counter: 0,
        calls: [],
    };

    function nextId() {
        state.counter += 1;
        return DOC_ID_PREFIX + '-' + String(state.counter).padStart(7, '0');
    }

    function blockTypeOf(markdown) {
        return typeof markdown === 'string' && markdown.indexOf('> ') === 0 ? 'b' : 'p';
    }
    function contentOf(markdown) {
        return String(markdown || '').split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
    }

    function execSql(stmt) {
        let m;
        if ((m = stmt.match(/^SELECT id FROM blocks WHERE root_id = '([^']+)' AND id IN \((.*)\)$/))) {
            const ids = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return ids.filter(id => state.blocks.has(id) && state.blocks.get(id).rootId === m[1]).map(id => ({ id }));
        }
        if ((m = stmt.match(/^SELECT block_id, name, value FROM attributes WHERE root_id = '([^']+)' AND name IN \((.*)\)$/))) {
            const names = Array.from(m[2].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return state.attrs
                .filter(a => a.root_id === m[1] && names.indexOf(a.name) >= 0)
                .map(a => ({ block_id: a.block_id, name: a.name, value: a.value }));
        }
        if ((m = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs
                .filter(a => a.name === m[1] && a.root_id === m[2])
                .map(a => ({ block_id: a.block_id }));
        }
        if ((m = stmt.match(/^SELECT block_id FROM blocks WHERE root_id = '([^']+)' AND type = 'b' AND content LIKE '%([^%]+)%'$/))) {
            return Array.from(state.blocks.values())
                .filter(b => b.rootId === m[1] && b.type === 'b' && b.content.indexOf(m[2]) >= 0)
                .map(b => ({ block_id: b.id }));
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
                // 内核事实（block_op.go L907 + transaction.go doUpdate L1630-1631）：
                // updateBlock 整块替换，旧块 IAL 全部丢弃（仅 id 复位）。
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
        return { ok: true, status: 200, json: async () => result };
    }

    /** 模拟历史 bug 遗留污染：在文档内手动塞一段无属性 header 形态的 quote 块。 */
    function seedStrayHeader(docId, markdown) {
        const id = nextId();
        state.blocks.set(id, { id, rootId: docId, markdown, type: 'b', content: contentOf(markdown) });
        return id;
    }

    function seedDoc() {
        const id = nextId();
        state.docs.set(id, { id, notebook: NB_ID, path: '/legacy-index', title: 'legacy-index' });
        return id;
    }

    const callsTo = path => state.calls.filter(c => c.path === path);
    const quoteBlocksIn = docId => Array.from(state.blocks.values()).filter(b => b.rootId === docId && b.type === 'b');
    const headerAttrRowsIn = docId => state.attrs.filter(a => a.name === NOTE_LINK_HEADER_ATTR && a.root_id === docId);

    return { state, fetcher, seedDoc, seedStrayHeader, callsTo, quoteBlocksIn, headerAttrRowsIn };
}

// ===== 引擎装配 =================================================================

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

    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        saveSettings: patch => { settings = Object.assign({}, settings, patch); return Promise.resolve(true); },
        getAssets: () => assets,
        getDomain: () => ({ financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] }),
        patchAssetIndexBlockId: () => Promise.resolve(true),
        fetcher: kernel.fetcher,
        t: testT,
        log: () => {},
        debounceMs: 20,
    });

    return {
        engine, kernel,
        setAssets: next => { assets = next; },
        getSettings: () => settings,
    };
}

// ===== 场景 1：连续两次 sync → 恰好 1 个 header 块且内容被更新 ====================

(async function scenario1() {
    const harness = createHarness({ assets: [makeWishlistAsset()] });
    const r1 = await harness.engine.syncNow({ manual: true });
    assert.equal(r1.ok, true, 'first sync ok');
    const docId = harness.getSettings().indexDocId;
    assert.ok(docId, 'indexDocId persisted');

    const first = harness.kernel.quoteBlocksIn(docId);
    assert.equal(first.length, 1, 'exactly one header quote block after sync 1');
    const headerId = first[0].id;
    assert.equal(harness.kernel.headerAttrRowsIn(docId).length, 1, 'header attr present after prepend');

    // 模拟用户/时间推进后内容漂移：篡改 header 内容，第二轮 sync 必须原地刷新。
    harness.kernel.state.blocks.get(headerId).markdown = '> 篡改过的头';
    harness.kernel.state.blocks.get(headerId).content = '篡改过的头';

    const r2 = await harness.engine.syncNow({ manual: true });
    assert.equal(r2.ok, true, 'second sync ok');

    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 1, 'still exactly one header block (no duplicate)');
    assert.equal(harness.kernel.callsTo('/api/block/prependBlock').length, 1, 'no second prepend');
    const headerUpdateCalls = harness.kernel.callsTo('/api/block/updateBlock').filter(c => c.body.id === headerId);
    assert.ok(headerUpdateCalls.length >= 1, 'header updated in place');
    const refreshed = harness.kernel.state.blocks.get(headerId);
    assert.ok(refreshed.markdown.indexOf('最后同步') >= 0, 'header content refreshed');
    assert.equal(harness.kernel.headerAttrRowsIn(docId).filter(a => a.block_id === headerId).length, 1,
        'custom-am-header re-applied after updateBlock stripped it');

    // 第三轮：属性仍在 → 依然不新增（长期幂等）。
    await harness.engine.syncNow({ manual: true });
    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 1, 'third sync keeps single header');
    assert.equal(harness.kernel.callsTo('/api/block/prependBlock').length, 1, 'still one prepend total');
    console.log('[note-link-header] scenario 1 passed (repeat sync keeps single header)');
})().catch(e => { console.error('[note-link-header] scenario 1 FAILED:', e); process.exit(1); });

// ===== 场景 2a：3 个重复 header（1 有属性 + 2 无属性）→ 清理为 1 ==================

(async function scenario2a() {
    const harness = createHarness({ assets: [makeWishlistAsset()] });
    await harness.engine.syncNow({ manual: true });
    const docId = harness.getSettings().indexDocId;
    const md = renderHeaderMarkdown(testT, '2026-08-16 10:00:00');

    // 历史 bug 遗留：两段失属性重复 header。
    const stray1 = harness.kernel.seedStrayHeader(docId, md);
    const stray2 = harness.kernel.seedStrayHeader(docId, md);
    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 3, 'polluted: 3 header blocks');

    const r = await harness.engine.syncNow({ manual: true });
    assert.equal(r.ok, true, 'cleanup sync ok');

    const remaining = harness.kernel.quoteBlocksIn(docId);
    assert.equal(remaining.length, 1, 'dedup to exactly one header block');
    assert.ok(remaining[0].markdown.indexOf('最后同步') >= 0, 'remaining block is the header');
    assert.equal(harness.kernel.headerAttrRowsIn(docId).length, 1, 'exactly one header attr row');
    assert.equal(harness.kernel.headerAttrRowsIn(docId)[0].block_id, remaining[0].id, 'attr on surviving block');
    assert.ok(!harness.kernel.state.blocks.has(stray1) && !harness.kernel.state.blocks.has(stray2),
        'stray headers deleted');

    // 再来一轮：不反弹。
    await harness.engine.syncNow({ manual: true });
    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 1, 'dedup is idempotent');
    console.log('[note-link-header] scenario 2a passed (mixed-attr triplicate dedup)');
})().catch(e => { console.error('[note-link-header] scenario 2a FAILED:', e); process.exit(1); });

// ===== 场景 2b：3 个重复 header 全部失属性 → 保留最新并补打属性 ==================

(async function scenario2b() {
    const harness = createHarness({ assets: [makeWishlistAsset()] });
    await harness.engine.syncNow({ manual: true });
    const docId = harness.getSettings().indexDocId;
    const md = renderHeaderMarkdown(testT, '2026-08-16 10:00:00');

    // 极端污染：连打标块也失去属性（例如用户手动在编辑器里改过头块）。
    const attrBlockId = harness.kernel.headerAttrRowsIn(docId)[0].block_id;
    harness.kernel.state.attrs = harness.kernel.state.attrs.filter(a => a.name !== NOTE_LINK_HEADER_ATTR);
    harness.kernel.seedStrayHeader(docId, md);
    harness.kernel.seedStrayHeader(docId, md);
    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 3, 'polluted: 3 attr-less header blocks');

    const r = await harness.engine.syncNow({ manual: true });
    assert.equal(r.ok, true, 'recovery sync ok');

    const remaining = harness.kernel.quoteBlocksIn(docId);
    assert.equal(remaining.length, 1, 'dedup to exactly one header block');
    assert.equal(harness.kernel.headerAttrRowsIn(docId).length, 1, 'attr re-applied to survivor');
    assert.equal(harness.kernel.headerAttrRowsIn(docId)[0].block_id, remaining[0].id, 'attr on surviving block');
    assert.equal(harness.kernel.callsTo('/api/block/prependBlock').length, 1, 'no extra prepend during recovery');
    assert.ok(remaining[0].markdown.indexOf('最后同步') >= 0, 'survivor content refreshed');
    void attrBlockId;
    console.log('[note-link-header] scenario 2b passed (attr-less triplicate recovery)');
})().catch(e => { console.error('[note-link-header] scenario 2b FAILED:', e); process.exit(1); });

// ===== 场景 3：wishlist 资产 update 后双属性保留 + 哈希幂等恢复 ===================

(async function scenario3() {
    const wish = makeWishlistAsset();
    const harness = createHarness({ assets: [wish] });
    await harness.engine.syncNow({ manual: true });
    const docId = harness.getSettings().indexDocId;

    const assetBlocks = () => Array.from(harness.kernel.state.blocks.values())
        .filter(b => b.rootId === docId && b.type === 'p');
    assert.equal(assetBlocks().length, 1, 'wishlist block appended');
    const blockId = assetBlocks()[0].id;
    const attrsOf = name => harness.kernel.state.attrs
        .filter(a => a.block_id === blockId && a.name === name).map(a => a.value);
    assert.deepEqual(attrsOf(NOTE_LINK_ASSET_ATTR), [wish.id], 'custom-asset-id after append');

    // 内容变更（期望价调整）→ 下一轮走 updateBlock（mock 剥离全部 IAL）。
    const changed = makeWishlistAsset({ id: wish.id, name: wish.name });
    changed.wishlist.expectedAmountMinor = 36800;
    harness.setAssets([changed]);
    const r2 = await harness.engine.syncNow({ manual: true });
    assert.equal(r2.ok, true);
    assert.equal(r2.stats.updated, 1, 'asset block updated, not re-appended');
    assert.equal(r2.stats.appended, 0, 'no duplicate append for wishlist');

    // 关键断言：updateBlock 剥离后引擎重打，双属性必须完整。
    assert.deepEqual(attrsOf(NOTE_LINK_ASSET_ATTR), [changed.id],
        'custom-asset-id survives updateBlock (re-applied)');
    assert.equal(attrsOf(NOTE_LINK_HASH_ATTR).length, 1, 'custom-am-hash survives updateBlock');

    // 幂等恢复：再 sync 一轮（内容未变）→ 资产块零 update。
    const updatesBefore = harness.kernel.callsTo('/api/block/updateBlock')
        .filter(c => c.body.id === blockId).length;
    const r3 = await harness.engine.syncNow({ manual: true });
    assert.equal(r3.ok, true);
    const updatesAfter = harness.kernel.callsTo('/api/block/updateBlock')
        .filter(c => c.body.id === blockId).length;
    assert.equal(updatesAfter - updatesBefore, 0, 'hash idempotency restored (no re-update)');
    assert.equal(harness.kernel.quoteBlocksIn(docId).length, 1, 'still one header alongside');
    console.log('[note-link-header] scenario 3 passed (asset attrs survive updateBlock + idempotency)');
})().catch(e => { console.error('[note-link-header] scenario 3 FAILED:', e); process.exit(1); });
