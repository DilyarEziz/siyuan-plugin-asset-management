'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { parseHTML } = require('linkedom');
const { createNoteLinkEngine } = require('../api/note-link');

const DOC_ID = '20260817090000-index01';
const OTHER_DOC_ID = '20260817090000-other01';
const OWNED_BLOCK_ID = '20260817090001-owned01';
const WISHLIST_BLOCK_ID = '20260817090002-wish001';
const REPLACEMENT_BLOCK_ID = '20260817090003-newown1';
const FOREIGN_BLOCK_ID = '20260817090004-foreign';
const ATOMIC_BLOCK_ID = '20260817090006-atomic1';
const OLDER_BLOCK_ID = '20260817090007-older01';
const LATEST_BLOCK_ID = '20260817090008-latest1';
const OWNED_ASSET_ID = 'f5f1457b-9dd2-43cb-b052-9c56e210dc2b';
const WISHLIST_ASSET_ID = '7ca8e15d-4a06-43bc-b6cf-cae3e191d575';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function sqlResponse(data) {
    return { ok: true, json: async () => ({ code: 0, msg: '', data }) };
}

function loadPluginClass() {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve('../index.js')];
        return require('../index.js');
    } finally {
        Module._load = originalLoad;
    }
}

async function testEngineCache() {
    const settings = { indexEnabled: true, indexDocId: DOC_ID, indexAutoSync: false };
    let assets = [
        { id: OWNED_ASSET_ID, status: 'active', indexBlockId: OWNED_BLOCK_ID },
        { id: WISHLIST_ASSET_ID, status: 'wishlist' },
    ];
    let rows = [
        { block_id: OWNED_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
        { block_id: WISHLIST_BLOCK_ID, value: WISHLIST_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
        { block_id: FOREIGN_BLOCK_ID, value: OWNED_ASSET_ID, root_id: OTHER_DOC_ID, block_root_id: OTHER_DOC_ID },
        { block_id: '20260817090005-unknown', value: 'missing-asset', root_id: DOC_ID, block_root_id: DOC_ID },
    ];
    let sqlCalls = 0;
    const queuedResponses = [];
    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        getAssets: () => assets,
        fetcher: async (apiPath, options) => {
            assert.equal(apiPath, '/api/query/sql');
            sqlCalls += 1;
            const stmt = JSON.parse(options.body).stmt;
            assert.match(stmt, /JOIN blocks b ON b\.id = a\.block_id/);
            assert.match(stmt, new RegExp("a\\.root_id = '" + DOC_ID + "'"));
            assert.match(stmt, new RegExp("b\\.root_id = '" + DOC_ID + "'"));
            if (queuedResponses.length > 0) return queuedResponses.shift();
            return sqlResponse(rows);
        },
    });

    assert.equal(engine.getAssetIdByIndexBlockId(OWNED_BLOCK_ID), OWNED_ASSET_ID, 'owned 实体在异步刷新前立即 seed');
    assert.equal(engine.getAssetIdByIndexBlockId(WISHLIST_BLOCK_ID), null, 'wishlist 等待属性 SQL 补齐');
    await engine.refreshAssetBlockMap();
    assert.equal(sqlCalls, 1, '一次 SQL 刷新完整映射');
    assert.equal(engine.getAssetIdByIndexBlockId(OWNED_BLOCK_ID), OWNED_ASSET_ID);
    assert.equal(engine.getAssetIdByIndexBlockId(WISHLIST_BLOCK_ID), WISHLIST_ASSET_ID);
    assert.equal(engine.getAssetIdByIndexBlockId(FOREIGN_BLOCK_ID), null, '过滤非当前索引文档块');

    assets = [assets[0]];
    await engine.refreshAssetBlockMap();
    assert.equal(engine.getAssetIdByIndexBlockId(WISHLIST_BLOCK_ID), null, '刷新剔除已删除资产映射');

    rows = [{ block_id: REPLACEMENT_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID }];
    await engine.refreshAssetBlockMap();
    assert.equal(engine.getAssetIdByIndexBlockId(OWNED_BLOCK_ID), null, '刷新清理旧块映射');
    assert.equal(engine.getAssetIdByIndexBlockId(REPLACEMENT_BLOCK_ID), OWNED_ASSET_ID, '刷新采用当前文档属性真值');

    const failedSql = deferred();
    queuedResponses.push(failedSql.promise);
    const failedRefresh = engine.refreshAssetBlockMap();
    assert.equal(engine.getAssetIdByIndexBlockId(REPLACEMENT_BLOCK_ID), OWNED_ASSET_ID,
        '刷新 pending 时继续读取上次完整快照');
    failedSql.reject(new Error('offline'));
    await assert.rejects(failedRefresh, /offline/);
    assert.equal(engine.getAssetIdByIndexBlockId(REPLACEMENT_BLOCK_ID), OWNED_ASSET_ID,
        '刷新失败不修改旧快照');

    const atomicSql = deferred();
    queuedResponses.push(atomicSql.promise);
    const atomicRefresh = engine.refreshAssetBlockMap();
    assert.equal(engine.getAssetIdByIndexBlockId(REPLACEMENT_BLOCK_ID), OWNED_ASSET_ID,
        '成功刷新提交前仍暴露旧快照');
    assert.equal(engine.getAssetIdByIndexBlockId(ATOMIC_BLOCK_ID), null,
        '成功刷新提交前不暴露局部构建结果');
    atomicSql.resolve(sqlResponse([
        { block_id: ATOMIC_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
    ]));
    await atomicRefresh;
    assert.equal(engine.getAssetIdByIndexBlockId(REPLACEMENT_BLOCK_ID), null, '成功后原子移除旧快照');
    assert.equal(engine.getAssetIdByIndexBlockId(ATOMIC_BLOCK_ID), OWNED_ASSET_ID, '成功后原子切换新快照');

    const olderSql = deferred();
    const latestSql = deferred();
    queuedResponses.push(olderSql.promise, latestSql.promise);
    const olderRefresh = engine.refreshAssetBlockMap();
    const latestRefresh = engine.refreshAssetBlockMap();
    latestSql.resolve(sqlResponse([
        { block_id: LATEST_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
    ]));
    assert.equal((await latestRefresh).ok, true, '最新 refresh 可提交');
    olderSql.resolve(sqlResponse([
        { block_id: OLDER_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
    ]));
    assert.equal((await olderRefresh).skipped, 'stale', '乱序完成的旧 refresh 被 revision 拒绝');
    assert.equal(engine.getAssetIdByIndexBlockId(LATEST_BLOCK_ID), OWNED_ASSET_ID,
        '旧 refresh 不覆盖最新结果');
    assert.equal(engine.getAssetIdByIndexBlockId(OLDER_BLOCK_ID), null);

    const filteredSql = deferred();
    queuedResponses.push(filteredSql.promise);
    const filteredRefresh = engine.refreshAssetBlockMap();
    assets = [];
    filteredSql.resolve(sqlResponse([
        { block_id: LATEST_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
    ]));
    const filteredResult = await filteredRefresh;
    assert.equal(filteredResult.ok, true);
    assert.equal(filteredResult.count, 0, 'commit 前按当前 getAssets 过滤已删除资产');
    assert.equal(engine.getAssetIdByIndexBlockId(LATEST_BLOCK_ID), null,
        '无 revision 通知时仍不能提交已删除资产映射');

    assets = [{ id: OWNED_ASSET_ID, status: 'active', indexBlockId: OWNED_BLOCK_ID }];
    rows = [{ block_id: LATEST_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID }];
    await engine.refreshAssetBlockMap();
    assert.equal(engine.getAssetIdByIndexBlockId(LATEST_BLOCK_ID), OWNED_ASSET_ID,
        '恢复删除竞态测试的已提交基线');

    const deletingSql = deferred();
    queuedResponses.push(deletingSql.promise);
    const deletingRefresh = engine.refreshAssetBlockMap();
    assets = [];
    engine.scheduleSync();
    assert.equal(engine.getAssetIdByIndexBlockId(LATEST_BLOCK_ID), null, '删除后同步裁剪旧映射');
    deletingSql.resolve(sqlResponse([
        { block_id: LATEST_BLOCK_ID, value: OWNED_ASSET_ID, root_id: DOC_ID, block_root_id: DOC_ID },
    ]));
    assert.equal((await deletingRefresh).skipped, 'stale', '删除使 pending refresh 失效');
    assert.equal(engine.getAssetIdByIndexBlockId(LATEST_BLOCK_ID), null, 'pending 结果不能复活已删除资产映射');
    engine.dispose();
}

function makeClickEvent(target, overrides) {
    const calls = { prevent: 0, stop: 0, immediate: 0 };
    const event = Object.assign({
        target,
        button: 0,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => { calls.prevent += 1; },
        stopPropagation: () => { calls.stop += 1; },
        stopImmediatePropagation: () => { calls.immediate += 1; },
    }, overrides || {});
    return { event, calls };
}

function assertZeroInterception(plugin, target, overrides, message) {
    const probe = makeClickEvent(target, overrides);
    plugin._handleAssetBlockRefCaptureClick(probe.event);
    assert.deepEqual(probe.calls, { prevent: 0, stop: 0, immediate: 0 }, message);
}

function testPluginEntries() {
    const descriptors = {
        document: Object.getOwnPropertyDescriptor(global, 'document'),
        window: Object.getOwnPropertyDescriptor(global, 'window'),
        navigator: Object.getOwnPropertyDescriptor(global, 'navigator'),
        Element: Object.getOwnPropertyDescriptor(global, 'Element'),
    };
    const dom = parseHTML('<!doctype html><html><body>'
        + '<span data-type="block-ref" data-id="' + OWNED_BLOCK_ID + '"><em id="asset-ref-target">资产引用</em></span>'
        + '<span data-type="virtual-block-ref" data-id="' + OWNED_BLOCK_ID + '"><em id="virtual-ref-target">虚拟引用</em></span>'
        + '<span data-type="file-ref" data-id="' + OWNED_BLOCK_ID + '"><em id="file-ref-target">文件引用</em></span>'
        + '<span id="unrelated">普通文本</span>'
        + '</body></html>');
    Object.defineProperty(global, 'document', { value: dom.document, configurable: true });
    Object.defineProperty(global, 'window', { value: dom.window, configurable: true });
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'Element', { value: dom.window.Element, configurable: true });

    try {
        let selectedText = '';
        dom.window.getSelection = () => ({ toString: () => selectedText });
        const PluginClass = loadPluginClass();
        const plugin = new PluginClass();
        plugin.assets = [{ id: OWNED_ASSET_ID, name: '相机' }];
        plugin.noteLink = { getAssetIdByIndexBlockId: id => id === OWNED_BLOCK_ID ? OWNED_ASSET_ID : null };
        plugin._t = (_key, fallback) => fallback;
        plugin.showToast = () => {};
        let opened = 0;
        plugin._openAssetDetailById = id => { assert.equal(id, OWNED_ASSET_ID); opened += 1; };

        const assetTarget = dom.document.getElementById('asset-ref-target');
        const ordinary = makeClickEvent(assetTarget);
        plugin._handleAssetBlockRefCaptureClick(ordinary.event);
        assert.deepEqual(ordinary.calls, { prevent: 1, stop: 1, immediate: 0 }, '普通资产引用 prevent + stop，且不 stopImmediate');
        assert.equal(opened, 1, '普通资产引用打开产品卡');

        assertZeroInterception(plugin, dom.document.getElementById('unrelated'), {}, '无关元素零拦截');
        plugin.noteLink.getAssetIdByIndexBlockId = () => null;
        assertZeroInterception(plugin, assetTarget, {}, '缓存 miss 零拦截');
        plugin.noteLink.getAssetIdByIndexBlockId = () => OWNED_ASSET_ID;
        plugin.assets = [];
        assertZeroInterception(plugin, assetTarget, {}, '资产已删除零拦截');
        plugin.assets = [{ id: OWNED_ASSET_ID, name: '相机' }];
        ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'].forEach(key => {
            assertZeroInterception(plugin, assetTarget, { [key]: true }, key + ' 修饰键零拦截');
        });
        selectedText = '资产';
        assertZeroInterception(plugin, assetTarget, {}, '有文字选择时零拦截');
        selectedText = '';
        assertZeroInterception(plugin, assetTarget, { button: 2 }, '右键零拦截');
        assertZeroInterception(plugin, dom.document.getElementById('virtual-ref-target'), {}, 'virtual-block-ref 不误匹配');
        assertZeroInterception(plugin, dom.document.getElementById('file-ref-target'), {}, 'file-ref 不误匹配');

        const menuItems = [];
        plugin._jumpToBlock = id => { assert.equal(id, OWNED_BLOCK_ID); };
        plugin._handleBlockRefMenu({ detail: {
            element: assetTarget.parentElement,
            menu: { addItem: item => { menuItems.push(item); } },
        } });
        assert.equal(menuItems.length, 2, '块引用菜单命中时同步注入两项');
        assert.deepEqual(menuItems.map(item => item.label), ['打开产品卡', '在索引文档中定位']);
        menuItems[0].click();
        menuItems[1].click();
        assert.equal(opened, 2, '菜单打开入口复用详情 helper');
        plugin.noteLink.getAssetIdByIndexBlockId = () => null;
        const missItems = [];
        plugin._handleBlockRefMenu({ detail: {
            element: assetTarget.parentElement,
            menu: { addItem: item => { missItems.push(item); } },
        } });
        assert.equal(missItems.length, 0, '块引用菜单缓存 miss 不注入');

        let deepLinked = null;
        plugin._openAssetDetailById = id => { deepLinked = id; };
        plugin._handleOpenSiyuanUrlPlugin({
            url: 'siyuan://plugins/siyuan-plugin-asset-management/asset?id=' + OWNED_ASSET_ID,
        });
        assert.equal(deepLinked, OWNED_ASSET_ID, 'deep link 复用 _openAssetDetailById');

        const onloadSource = String(PluginClass.prototype.onload);
        const unloadSource = String(PluginClass.prototype.onunload);
        assert.match(onloadSource, /addEventListener\('click', this\._assetBlockRefCaptureClickHandler, true\)/);
        assert.match(unloadSource, /removeEventListener\('click', this\._assetBlockRefCaptureClickHandler, true\)/);
        assert.match(onloadSource, /eventBus\.on\('open-menu-blockref', this\._blockRefMenuHandler\)/);
        assert.match(unloadSource, /eventBus\.off\('open-menu-blockref', this\._blockRefMenuHandler\)/);
        assert.doesNotMatch(String(PluginClass.prototype._handleAssetBlockRefCaptureClick), /stopImmediatePropagation/);
        assert.doesNotMatch(String(PluginClass.prototype._handleBlockRefMenu), /\bawait\b|Promise/);
    } finally {
        Object.keys(descriptors).forEach(key => {
            if (descriptors[key]) Object.defineProperty(global, key, descriptors[key]);
            else delete global[key];
        });
    }
}

(async () => {
    const zh = require('../i18n/zh_CN.json');
    const en = require('../i18n/en_US.json');
    assert.equal(zh.blockRefMenuOpenAssetCard, '打开产品卡');
    assert.equal(zh.blockRefMenuLocateIndex, '在索引文档中定位');
    assert.equal(en.blockRefMenuOpenAssetCard, 'Open product card');
    assert.equal(en.blockRefMenuLocateIndex, 'Locate in index document');
    await testEngineCache();
    testPluginEntries();

    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    assert.match(template, /this\.noteLink\.refreshAssetBlockMap\(\)\.catch\(\(\) => \{\}\)/, 'onload 异步刷新且不阻塞');
    console.log('[note-link-direct-open] passed');
})().catch(error => { console.error(error); process.exit(1); });
