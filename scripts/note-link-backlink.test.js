'use strict';

/**
 * v2.5.0 笔记双链 · 阶段4 —— 资产 → 笔记反链 headless 测试（mock fetch）。
 *
 * 覆盖：
 *   1. getAssetIndexBlockId：owned 直取（零 SQL）/ wishlist 属性 SQL 定位 / 索引未启用 null
 *   2. getRelatedNotes 三源合并：ref（块引反链）/ tag（custom-asset-id 打标）/
 *      manual（relatedNotes 登记），ref 优先去重、索引文档自身过滤
 *   3. manual 查活与 dead 标记；docTitle fallback 链（root content → 登记标题 → id 前 8 位）
 *   4. 索引未启用 → 仅剩 manual 源（不发 refs / attributes 查询）
 *   5. linkBlockToAsset / unlinkBlockFromAsset：setBlockAttrs 载荷（null = 删除属性）
 *   6. getBlockAssetTag：读回属性；api 失败容错（返回 null 不抛）
 *   7. getBlockRefMarkdown 重构回归：owned / wishlist 仍产出 ((id "名称"))
 */

const assert = require('node:assert/strict');
const { createNoteLinkEngine, NOTE_LINK_ASSET_ATTR } = require('../api/note-link');
const { newFormalV2Asset } = require('../api/assets');
const { createStableId } = require('../api/algorithms');

const NOW = '2026-08-17T03:00:00.000Z';
const TODAY = '2026-08-17';

// 固定 id（符合 /^[0-9]{14}-[a-z0-9]{7}$/）
const INDEX_DOC = '20260817090000-indexdc';
const INDEX_BLOCK = '20260817090001-ownedix';
const REF_ROOT = '20260817090002-refroot';
const REF_BLOCK = '20260817090003-refbloc';
const TAG_ROOT = '20260817090004-tagroot';
const TAG_BLOCK = '20260817090005-tagbloc';
const MAN_ROOT = '20260817090006-manroot';
const MAN_BLOCK = '20260817090007-manbloc';
const DEAD_BLOCK = '20260817090008-deadblo';
const WISH_BLOCK = '20260817090009-wishblk';
const LINK_BLOCK = '20260817090010-linkblo';

// ===== 内核 mock（内存 blocks / attributes / refs 表） ========================

function createKernelMock() {
    const state = {
        blocks: new Map(),   // id -> { id, rootId, content }
        attrs: [],           // { block_id, name, value, root_id }
        refs: [],            // { def_block_id, block_id, root_id, content }
        calls: [],           // { path, body }
        failPaths: {},       // path -> 剩余失败次数（code -1）
    };

    function execSql(stmt) {
        let m;
        if ((m = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND value = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs
                .filter(a => a.name === m[1] && a.value === m[2] && a.root_id === m[3])
                .map(a => ({ block_id: a.block_id }));
        }
        if ((m = stmt.match(/^SELECT block_id, root_id, content FROM refs WHERE def_block_id = '([^']+)'$/))) {
            return state.refs
                .filter(r => r.def_block_id === m[1])
                .map(r => ({ block_id: r.block_id, root_id: r.root_id, content: r.content }));
        }
        if ((m = stmt.match(/^SELECT a\.block_id, a\.root_id, tagged\.content AS content, root\.content AS root_content FROM attributes a LEFT JOIN blocks tagged ON a\.block_id = tagged\.id LEFT JOIN blocks root ON a\.root_id = root\.id WHERE a\.name = '([^']+)' AND a\.value = '([^']+)'$/))) {
            return state.attrs
                .filter(a => a.name === m[1] && a.value === m[2])
                .map(a => {
                    const tagged = state.blocks.get(a.block_id);
                    const root = state.blocks.get(a.root_id);
                    return { block_id: a.block_id, root_id: a.root_id, content: tagged ? tagged.content : null, root_content: root ? root.content : null };
                });
        }
        if ((m = stmt.match(/^SELECT id, root_id, content FROM blocks WHERE id IN \((.*)\)$/))) {
            const ids = Array.from(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return ids.filter(id => state.blocks.has(id))
                .map(id => ({ id: id, root_id: state.blocks.get(id).rootId, content: state.blocks.get(id).content }));
        }
        if ((m = stmt.match(/^SELECT id, content FROM blocks WHERE id IN \((.*)\)$/))) {
            const ids = Array.from(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]);
            return ids.filter(id => state.blocks.has(id))
                .map(id => ({ id: id, content: state.blocks.get(id).content }));
        }
        throw new Error('mock SQL not supported: ' + stmt);
    }

    async function fetcher(path, options) {
        const body = JSON.parse((options && options.body) || '{}');
        state.calls.push({ path: path, body: body });
        if (state.failPaths[path] > 0) {
            state.failPaths[path] -= 1;
            return { ok: true, status: 200, json: async () => ({ code: -1, msg: 'injected api failure', data: null }) };
        }
        switch (path) {
            case '/api/query/sql':
                return { ok: true, status: 200, json: async () => ({ code: 0, msg: '', data: execSql(String(body.stmt || '')) }) };
            case '/api/attr/setBlockAttrs': {
                const block = state.blocks.get(body.id);
                if (!block) return { ok: true, status: 200, json: async () => ({ code: -1, msg: 'block not found', data: null }) };
                Object.keys(body.attrs || {}).forEach(name => {
                    const value = body.attrs[name];
                    state.attrs = state.attrs.filter(a => !(a.block_id === body.id && a.name === name));
                    if (value != null && value !== '') {
                        state.attrs.push({ block_id: body.id, name: name, value: String(value), root_id: block.rootId });
                    }
                });
                return { ok: true, status: 200, json: async () => ({ code: 0, msg: '', data: null }) };
            }
            case '/api/attr/getBlockAttrs': {
                if (!state.blocks.has(body.id)) {
                    return { ok: true, status: 200, json: async () => ({ code: -1, msg: 'block not found', data: null }) };
                }
                const attrs = {};
                state.attrs.filter(a => a.block_id === body.id).forEach(a => { attrs[a.name] = a.value; });
                return { ok: true, status: 200, json: async () => ({ code: 0, msg: '', data: attrs }) };
            }
            default:
                return { ok: true, status: 200, json: async () => ({ code: -1, msg: 'unknown endpoint ' + path, data: null }) };
        }
    }

    return { state: state, fetcher: fetcher };
}

// ===== 装配 ====================================================================

function createHarness(options) {
    const opts = options || {};
    const kernel = createKernelMock();
    let settings = Object.assign({ indexEnabled: true, indexDocId: INDEX_DOC }, opts.settings || {});
    const assets = (opts.assets || []).slice();
    const logs = [];
    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        getAssets: () => assets,
        fetcher: kernel.fetcher,
        t: (key, fallback) => (fallback != null ? fallback : key),
        log: function () { logs.push([].slice.call(arguments).join(' ')); },
        debounceMs: 5,
    });
    return {
        engine: engine, kernel: kernel, logs: logs,
        getSettings: () => settings,
        setSettings: patch => { settings = Object.assign({}, settings, patch); },
    };
}

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

/** 三源种子数据：索引块 + ref 笔记 + tag 笔记 + manual（存活/失效/与 ref 重复）。 */
function seedThreeSources(kernel, asset) {
    const s = kernel.state;
    s.blocks.set(INDEX_DOC, { id: INDEX_DOC, rootId: INDEX_DOC, content: '资产索引' });
    s.blocks.set(INDEX_BLOCK, { id: INDEX_BLOCK, rootId: INDEX_DOC, content: '相机 · 实物' });
    s.blocks.set(REF_ROOT, { id: REF_ROOT, rootId: REF_ROOT, content: '摄影笔记' });
    s.blocks.set(REF_BLOCK, { id: REF_BLOCK, rootId: REF_ROOT, content: '机身见 ((相机索引块))' });
    s.blocks.set(TAG_ROOT, { id: TAG_ROOT, rootId: TAG_ROOT, content: '器材清单' });
    s.blocks.set(TAG_BLOCK, { id: TAG_BLOCK, rootId: TAG_ROOT, content: '**镜头保养计划**' });
    s.blocks.set(MAN_ROOT, { id: MAN_ROOT, rootId: MAN_ROOT, content: '购后记录' });
    s.blocks.set(MAN_BLOCK, { id: MAN_BLOCK, rootId: MAN_ROOT, content: '第一次外拍记录' });
    // 索引块自身与 tag 笔记块都带 custom-asset-id（前者必须被索引文档过滤）
    s.attrs.push({ block_id: INDEX_BLOCK, name: NOTE_LINK_ASSET_ATTR, value: asset.id, root_id: INDEX_DOC });
    s.attrs.push({ block_id: TAG_BLOCK, name: NOTE_LINK_ASSET_ATTR, value: asset.id, root_id: TAG_ROOT });
    s.refs.push({ def_block_id: INDEX_BLOCK, block_id: REF_BLOCK, root_id: REF_ROOT, content: '机身见 ((相机索引块))' });
}

// ===== 场景 1：getAssetIndexBlockId ============================================

(async function scenario1() {
    // 1a. 索引未启用 → null（零请求）
    const disabled = createHarness({ settings: { indexEnabled: false } });
    assert.equal(await disabled.engine.getAssetIndexBlockId(makeOwnedAsset()), null, 'disabled → null');
    assert.equal(disabled.kernel.state.calls.length, 0, 'no api call when disabled');

    // 1b. owned 直取 indexBlockId（零 SQL）
    const owned = makeOwnedAsset();
    owned.indexBlockId = INDEX_BLOCK;
    const h1 = createHarness({ assets: [owned] });
    assert.equal(await h1.engine.getAssetIndexBlockId(owned), INDEX_BLOCK, 'owned returns indexBlockId');
    assert.equal(h1.kernel.state.calls.length, 0, 'owned lookup issues no api call');

    // 1c. wishlist → custom-asset-id 属性 SQL 定位（限索引文档内）
    const wish = makeWishlistAsset();
    wish.indexBlockId = 'must-be-ignored';  // wishlist 实体字段即使脏数据也不用
    const h2 = createHarness({ assets: [wish] });
    h2.kernel.state.blocks.set(INDEX_DOC, { id: INDEX_DOC, rootId: INDEX_DOC, content: '' });
    h2.kernel.state.blocks.set(WISH_BLOCK, { id: WISH_BLOCK, rootId: INDEX_DOC, content: '会员 · 种草' });
    h2.kernel.state.attrs.push({ block_id: WISH_BLOCK, name: NOTE_LINK_ASSET_ATTR, value: wish.id, root_id: INDEX_DOC });
    assert.equal(await h2.engine.getAssetIndexBlockId(wish), WISH_BLOCK, 'wishlist located via attribute SQL');

    // 1d. owned 无 indexBlockId → null
    const bare = makeOwnedAsset();
    const h3 = createHarness({ assets: [bare] });
    assert.equal(await h3.engine.getAssetIndexBlockId(bare), null, 'owned without indexBlockId → null');

    console.log('scenario1 getAssetIndexBlockId: OK');
})();

// ===== 场景 2：getRelatedNotes 三源合并 ========================================

(async function scenario2() {
    const asset = makeOwnedAsset({
        relatedNotes: [
            { id: REF_BLOCK, title: '与 ref 重复的手动登记', addedAt: NOW },  // 应被 ref 优先去重
            { id: MAN_BLOCK, title: '', addedAt: NOW },                       // 存活，title 空 → 用 root 标题
            { id: DEAD_BLOCK, title: '失效文档', addedAt: NOW },               // 查不到 → dead
        ],
    });
    asset.indexBlockId = INDEX_BLOCK;
    const harness = createHarness({ assets: [asset] });
    seedThreeSources(harness.kernel, asset);

    const notes = await harness.engine.getRelatedNotes(asset);

    assert.equal(notes.length, 4, 'ref + tag + manual-live + manual-dead, index doc filtered, dup removed');
    // ref 源
    assert.equal(notes[0].source, 'ref');
    assert.equal(notes[0].blockId, REF_BLOCK);
    assert.equal(notes[0].rootId, REF_ROOT);
    assert.equal(notes[0].docTitle, '摄影笔记', 'ref docTitle from root block content');
    assert.equal(notes[0].preview, '机身见 ((相机索引块))');
    // tag 源
    assert.equal(notes[1].source, 'tag');
    assert.equal(notes[1].blockId, TAG_BLOCK);
    assert.equal(notes[1].docTitle, '器材清单', 'tag docTitle from LEFT JOIN root_content');
    assert.equal(notes[1].preview, '**镜头保养计划**', 'tag preview comes from the tagged block content');
    // manual 存活
    assert.equal(notes[2].source, 'manual');
    assert.equal(notes[2].blockId, MAN_BLOCK);
    assert.equal(notes[2].docTitle, '购后记录', 'manual docTitle falls back to root content');
    assert.equal(notes[2].preview, '第一次外拍记录', 'manual preview comes from the live block content');
    assert.notEqual(notes[2].dead, true);
    // manual 失效
    assert.equal(notes[3].source, 'manual');
    assert.equal(notes[3].blockId, DEAD_BLOCK);
    assert.equal(notes[3].dead, true, 'missing manual entry flagged dead');
    assert.equal(notes[3].docTitle, '失效文档', 'dead docTitle falls back to registered title');
    // 索引文档自身（索引块的 tag 行）绝不出现
    assert.ok(!notes.some(n => n.rootId === INDEX_DOC || n.blockId === INDEX_BLOCK), 'index doc rows filtered');

    console.log('scenario2 getRelatedNotes three sources: OK');
})();

// ===== 场景 3：索引未启用只剩 manual ===========================================

(async function scenario3() {
    const asset = makeOwnedAsset({
        relatedNotes: [
            { id: MAN_BLOCK, title: '手动登记的文档', addedAt: NOW },
            { id: DEAD_BLOCK, title: '', addedAt: NOW },  // title 空 → id 前 8 位 fallback
        ],
    });
    const harness = createHarness({ assets: [asset], settings: { indexEnabled: false } });
    seedThreeSources(harness.kernel, asset);  // 即便内核里存在 ref/tag 数据也不查询

    const notes = await harness.engine.getRelatedNotes(asset);
    assert.equal(notes.length, 2, 'only manual source when index disabled');
    assert.ok(notes.every(n => n.source === 'manual'), 'all entries are manual');
    assert.equal(notes[0].blockId, MAN_BLOCK);
    assert.equal(notes[0].docTitle, '手动登记的文档');
    assert.equal(notes[1].blockId, DEAD_BLOCK);
    assert.equal(notes[1].dead, true);
    assert.equal(notes[1].docTitle, DEAD_BLOCK.slice(0, 8), 'dead without title → id prefix');

    const sqlStmts = harness.kernel.state.calls.filter(c => c.path === '/api/query/sql').map(c => c.body.stmt);
    assert.ok(sqlStmts.length > 0, 'manual liveness lookup still queries');
    assert.ok(sqlStmts.every(stmt => stmt.indexOf('refs') < 0 && stmt.indexOf('attributes') < 0),
        'no refs/attributes SQL when index disabled');

    console.log('scenario3 manual-only when disabled: OK');
})();

// ===== 场景 4：link / unlink / getBlockAssetTag ================================

(async function scenario4() {
    const asset = makeOwnedAsset();
    const harness = createHarness({ assets: [asset] });
    harness.kernel.state.blocks.set(TAG_ROOT, { id: TAG_ROOT, rootId: TAG_ROOT, content: '器材清单' });
    harness.kernel.state.blocks.set(LINK_BLOCK, { id: LINK_BLOCK, rootId: TAG_ROOT, content: '相关段落' });

    // 未标记 → null
    assert.equal(await harness.engine.getBlockAssetTag(LINK_BLOCK), null, 'untagged block → null');

    // link：载荷 = {id, attrs:{custom-asset-id: assetId}}
    assert.equal(await harness.engine.linkBlockToAsset(LINK_BLOCK, asset.id), true);
    const linkCall = harness.kernel.state.calls.filter(c => c.path === '/api/attr/setBlockAttrs').pop();
    assert.equal(linkCall.body.id, LINK_BLOCK);
    assert.deepEqual(linkCall.body.attrs, { 'custom-asset-id': asset.id });
    assert.equal(await harness.engine.getBlockAssetTag(LINK_BLOCK), asset.id, 'tag readable after link');

    // unlink：attrs 值为 null（内核删除属性语义）
    assert.equal(await harness.engine.unlinkBlockFromAsset(LINK_BLOCK), true);
    const unlinkCall = harness.kernel.state.calls.filter(c => c.path === '/api/attr/setBlockAttrs').pop();
    assert.deepEqual(unlinkCall.body.attrs, { 'custom-asset-id': null }, 'null value deletes attr');
    assert.equal(await harness.engine.getBlockAssetTag(LINK_BLOCK), null, 'tag cleared after unlink');

    // 无效 id：link 抛错（不发包）
    await assert.rejects(() => harness.engine.linkBlockToAsset('not-a-valid-id', asset.id), /invalid block id/);
    await assert.rejects(() => harness.engine.linkBlockToAsset(LINK_BLOCK, 'BAD ID!'), /invalid asset id/);
    await assert.rejects(() => harness.engine.unlinkBlockFromAsset(''), /invalid block id/);

    // getBlockAssetTag 容错：api 失败 → null 不抛
    harness.kernel.state.failPaths['/api/attr/getBlockAttrs'] = 1;
    assert.equal(await harness.engine.getBlockAssetTag(LINK_BLOCK), null, 'api failure tolerated → null');

    // link 对不存在块：内核 code -1 → callApi 抛 api 错（调用方 toast）
    await assert.rejects(() => harness.engine.linkBlockToAsset(DEAD_BLOCK, asset.id));

    console.log('scenario4 link/unlink/getBlockAssetTag: OK');
})();

// ===== 场景 5：getBlockRefMarkdown 重构回归 ====================================

(async function scenario5() {
    const owned = makeOwnedAsset({ name: '相机' });
    owned.indexBlockId = INDEX_BLOCK;
    const h1 = createHarness({ assets: [owned] });
    h1.kernel.state.blocks.set(INDEX_DOC, { id: INDEX_DOC, rootId: INDEX_DOC, content: '' });
    h1.kernel.state.blocks.set(INDEX_BLOCK, { id: INDEX_BLOCK, rootId: INDEX_DOC, content: '相机' });
    assert.equal(await h1.engine.getBlockRefMarkdown(owned), '((20260817090001-ownedix "相机"))');

    const wish = makeWishlistAsset({ name: '会员 "Pro"' });
    const h2 = createHarness({ assets: [wish] });
    h2.kernel.state.blocks.set(INDEX_DOC, { id: INDEX_DOC, rootId: INDEX_DOC, content: '' });
    h2.kernel.state.blocks.set(WISH_BLOCK, { id: WISH_BLOCK, rootId: INDEX_DOC, content: '' });
    h2.kernel.state.attrs.push({ block_id: WISH_BLOCK, name: NOTE_LINK_ASSET_ATTR, value: wish.id, root_id: INDEX_DOC });
    assert.equal(await h2.engine.getBlockRefMarkdown(wish), '((20260817090009-wishblk "会员 \\"Pro\\""))',
        'wishlist ref via attribute lookup, quotes escaped');

    console.log('scenario5 getBlockRefMarkdown regression: OK');
})();
