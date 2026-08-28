'use strict';

const assert = require('node:assert/strict');
const {
    createNoteLinkEngine,
    NOTE_LINK_INDEX_DOC_TITLE,
    NOTE_LINK_INDEX_DOC_PATH,
    NOTE_LINK_INDEX_OWNER_ATTR,
    NOTE_LINK_INDEX_VERSION_ATTR,
    NOTE_LINK_INDEX_OWNER,
    NOTE_LINK_INDEX_VERSION,
    NOTE_LINK_HEADER_ATTR,
    quoteSqlString,
    renderHeaderMarkdown,
} = require('../api/note-link');

const NB_A = '20250330182153-k3b63hf';
const NB_B = '20250330182154-k3b63hg';
const NB_CLOSED = '20250330182155-k3b63hh';
const ID_PREFIX = '20260817120000';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function createKernelMock() {
    const state = {
        notebooks: [
            { id: NB_A, name: '主笔记本', closed: false },
            { id: NB_B, name: '移动目标', closed: false },
            { id: NB_CLOSED, name: '已关闭', closed: true },
        ],
        docs: new Map(),
        staleDocRows: new Map(),
        blocks: new Map(),
        attrs: [],
        calls: [],
        counter: 0,
        failNext: null,
        notebookListData: undefined,
        checkBlockExistData: undefined,
    };

    function nextId() {
        state.counter += 1;
        return ID_PREFIX + '-' + String(state.counter).padStart(7, '0');
    }

    function notebook(id) {
        return state.notebooks.find(item => item.id === id) || null;
    }

    function rootIdOf(id) {
        if (state.docs.has(id)) return id;
        const block = state.blocks.get(id);
        return block ? block.rootId : null;
    }

    function attrsOf(id) {
        const result = {};
        state.attrs.filter(row => row.block_id === id).forEach(row => { result[row.name] = row.value; });
        return result;
    }

    function setAttrs(id, attrs) {
        const rootId = rootIdOf(id);
        if (!rootId) return { code: -1, msg: 'block not found', data: null };
        Object.keys(attrs || {}).forEach(name => {
            const value = attrs[name];
            state.attrs = state.attrs.filter(row => !(row.block_id === id && row.name === name));
            if (value != null && value !== '') {
                state.attrs.push({ block_id: id, root_id: rootId, name: name, value: String(value) });
            }
        });
        return { code: 0, msg: '', data: null };
    }

    function seedDoc(notebookId, hPath, title, attrs) {
        const id = nextId();
        state.docs.set(id, { id, notebook: notebookId, hPath, title });
        if (attrs) setAttrs(id, attrs);
        return id;
    }

    function deleteDoc(id, keepSqlRow) {
        const doc = state.docs.get(id);
        if (keepSqlRow && doc) state.staleDocRows.set(id, Object.assign({}, doc));
        state.docs.delete(id);
        Array.from(state.blocks.values()).filter(block => block.rootId === id)
            .forEach(block => state.blocks.delete(block.id));
        state.attrs = state.attrs.filter(row => row.root_id !== id);
    }

    function moveDoc(id, notebookId, hPath, title) {
        const doc = state.docs.get(id);
        if (!doc) throw new Error('missing mock doc');
        doc.notebook = notebookId;
        doc.hPath = hPath;
        doc.title = title;
    }

    function contentOf(markdown) {
        return String(markdown || '').split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
    }

    function appendBlock(parentID, markdown) {
        const rootId = rootIdOf(parentID);
        if (!rootId) return { code: -1, msg: 'parent not found', data: null };
        const id = nextId();
        state.blocks.set(id, {
            id, rootId, markdown,
            type: String(markdown || '').indexOf('> ') === 0 ? 'b' : 'p',
            content: contentOf(markdown),
        });
        return {
            code: 0, msg: '',
            data: [{ doOperations: [{ action: 'insert', id, parentID }], undoOperations: [] }],
        };
    }

    function execSql(stmt) {
        let match;
        if ((match = stmt.match(/^SELECT DISTINCT a\.root_id AS id FROM attributes a JOIN blocks b ON b\.id = a\.root_id WHERE a\.name = '([^']+)' AND a\.value = '([^']+)' AND b\.box = '([^']+)'$/))) {
            return Array.from(state.docs.values())
                .filter(doc => doc.notebook === match[3])
                .filter(doc => state.attrs.some(row => row.block_id === doc.id && row.name === match[1] && row.value === match[2]))
                .map(doc => ({ id: doc.id }));
        }
        if ((match = stmt.match(/^SELECT id FROM blocks WHERE box = '([^']+)' AND hpath = '([^']+)' AND type = 'd'$/))) {
            return Array.from(state.docs.values())
                .filter(doc => doc.notebook === match[1] && doc.hPath === match[2])
                .map(doc => ({ id: doc.id }));
        }
        if ((match = stmt.match(/^SELECT block_id, name, value FROM attributes WHERE root_id = '([^']+)' AND name IN \((.*)\)$/))) {
            const names = Array.from(match[2].matchAll(/'([^']+)'/g)).map(item => item[1]);
            return state.attrs.filter(row => row.root_id === match[1] && names.includes(row.name))
                .map(row => ({ block_id: row.block_id, name: row.name, value: row.value }));
        }
        if ((match = stmt.match(/^SELECT block_id FROM attributes WHERE name = '([^']+)' AND root_id = '([^']+)'$/))) {
            return state.attrs.filter(row => row.name === match[1] && row.root_id === match[2])
                .map(row => ({ block_id: row.block_id }));
        }
        if ((match = stmt.match(/^SELECT block_id FROM blocks WHERE root_id = '([^']+)' AND type = 'b' AND content LIKE '%([^%]+)%'$/))) {
            return Array.from(state.blocks.values())
                .filter(block => block.rootId === match[1] && block.type === 'b' && block.content.includes(match[2]))
                .map(block => ({ block_id: block.id }));
        }
        if ((match = stmt.match(/^SELECT id, type, root_id, box FROM blocks WHERE id = '([^']+)' LIMIT 1$/))) {
            const doc = state.docs.get(match[1]);
            if (doc) return [{ id: doc.id, type: 'd', root_id: doc.id, box: doc.notebook }];
            const staleDoc = state.staleDocRows.get(match[1]);
            if (staleDoc) return [{ id: staleDoc.id, type: 'd', root_id: staleDoc.id, box: staleDoc.notebook }];
            const block = state.blocks.get(match[1]);
            const root = block && state.docs.get(block.rootId);
            return block && root ? [{ id: block.id, type: block.type, root_id: block.rootId, box: root.notebook }] : [];
        }
        if ((match = stmt.match(/^SELECT id FROM blocks WHERE root_id = '([^']+)' AND id IN \((.*)\)$/))) {
            const ids = Array.from(match[2].matchAll(/'([^']+)'/g)).map(item => item[1]);
            return ids.filter(id => state.blocks.has(id) && state.blocks.get(id).rootId === match[1]).map(id => ({ id }));
        }
        throw new Error('unsupported mock SQL: ' + stmt);
    }

    function handle(path, body) {
        state.calls.push({ path, body });
        if (state.failNext && state.failNext.path === path) {
            const failure = state.failNext;
            state.failNext = null;
            return { code: failure.code == null ? -1 : failure.code, msg: failure.message || 'injected failure', data: null };
        }
        switch (path) {
            case '/api/notebook/lsNotebooks':
                return { code: 0, msg: '', data: state.notebookListData === undefined
                    ? { notebooks: state.notebooks } : state.notebookListData };
            case '/api/filetree/createDocWithMd': {
                const target = notebook(body.notebook);
                if (!target || target.closed) return { code: -1, msg: 'notebook unavailable', data: null };
                const id = seedDoc(body.notebook, body.path, body.path.slice(1));
                return { code: 0, msg: '', data: id };
            }
            case '/api/block/getBlockInfo': {
                const rootId = rootIdOf(body.id);
                const doc = rootId ? state.docs.get(rootId) : null;
                if (!doc) return { code: -1, msg: 'block not found', data: null };
                const box = notebook(doc.notebook);
                if (!box || box.closed) return { code: -1, msg: 'box not indexed', data: null };
                return { code: 0, msg: '', data: { box: doc.notebook, rootID: rootId, rootTitle: doc.title } };
            }
            case '/api/block/checkBlockExist':
                return { code: 0, msg: '', data: state.checkBlockExistData === undefined
                    ? (state.docs.has(body.id) || state.blocks.has(body.id))
                    : state.checkBlockExistData };
            case '/api/filetree/getHPathByID': {
                const doc = state.docs.get(body.id);
                return doc ? { code: 0, msg: '', data: doc.hPath }
                    : { code: -1, msg: 'document not found', data: null };
            }
            case '/api/filetree/removeDocByID':
                if (!state.docs.has(body.id)) return { code: -1, msg: 'document not found', data: null };
                deleteDoc(body.id);
                return { code: 0, msg: '', data: null };
            case '/api/attr/getBlockAttrs':
                return rootIdOf(body.id)
                    ? { code: 0, msg: '', data: attrsOf(body.id) }
                    : { code: -1, msg: 'block not found', data: null };
            case '/api/attr/setBlockAttrs':
                return setAttrs(body.id, body.attrs);
            case '/api/block/appendBlock':
            case '/api/block/prependBlock':
                return appendBlock(body.parentID, body.data);
            case '/api/block/updateBlock': {
                const block = state.blocks.get(body.id);
                if (!block) return { code: -1, msg: 'block not found', data: null };
                block.markdown = body.data;
                block.content = contentOf(body.data);
                block.type = String(body.data || '').indexOf('> ') === 0 ? 'b' : 'p';
                state.attrs = state.attrs.filter(row => row.block_id !== body.id);
                return { code: 0, msg: '', data: null };
            }
            case '/api/block/deleteBlock':
                state.blocks.delete(body.id);
                state.attrs = state.attrs.filter(row => row.block_id !== body.id);
                return { code: 0, msg: '', data: null };
            case '/api/query/sql':
                return { code: 0, msg: '', data: execSql(String(body.stmt || '')) };
            default:
                return { code: -1, msg: 'unknown endpoint ' + path, data: null };
        }
    }

    async function fetcher(path, options) {
        const body = JSON.parse((options && options.body) || '{}');
        const payload = handle(path, body);
        return { ok: true, status: 200, json: async () => payload };
    }

    return {
        state, fetcher, seedDoc, deleteDoc, moveDoc, attrsOf,
        seedBlock: (docId, markdown) => {
            const result = appendBlock(docId, markdown || '普通段落');
            return result.data[0].doOperations[0].id;
        },
        callsTo: path => state.calls.filter(call => call.path === path),
    };
}

function createHarness(options) {
    const opts = options || {};
    const kernel = createKernelMock();
    let settings = Object.assign({
        indexEnabled: true,
        indexNotebookId: NB_A,
        indexDocPath: '/旧兼容路径',
        indexDocId: '',
        indexAutoSync: true,
        indexIncludeCover: false,
    }, opts.settings || {});
    const saves = [];
    let saveFailureMode = null;
    const engine = createNoteLinkEngine({
        getSettings: () => settings,
        saveSettings: async patch => {
            if (saveFailureMode === 'before') throw new Error('injected save failure');
            if (saveFailureMode === 'after') {
                saveFailureMode = null;
                settings = Object.assign({}, settings, patch);
                throw new Error('injected save failure after mutation');
            }
            saves.push(Object.assign({}, patch));
            settings = Object.assign({}, settings, patch);
            return true;
        },
        getAssets: () => [],
        getDomain: () => ({ financialEvents: [], subscriptionPeriods: [], prepaidTransactions: [], tags: [] }),
        patchAssetIndexBlockId: async () => true,
        fetcher: kernel.fetcher,
        t: (key, fallback) => fallback || key,
        log: () => {},
        debounceMs: 5,
    });
    return {
        kernel, engine, saves,
        getSettings: () => settings,
        setSettings: patch => { settings = Object.assign({}, settings, patch); },
        setSaveFailureMode: value => { saveFailureMode = value; },
    };
}

function ownerAttrs() {
    return {
        [NOTE_LINK_INDEX_OWNER_ATTR]: NOTE_LINK_INDEX_OWNER,
        [NOTE_LINK_INDEX_VERSION_ATTR]: NOTE_LINK_INDEX_VERSION,
    };
}

async function main() {
    assert.equal(NOTE_LINK_INDEX_DOC_TITLE, '资产管理插件索引文档——不建议手动操作');
    assert.equal(NOTE_LINK_INDEX_DOC_PATH, '/资产管理插件索引文档——不建议手动操作');
    assert.equal(quoteSqlString("a'b"), "'a''b'", 'SQL string values escape single quotes');
    assert.match(renderHeaderMarkdown((key, fallback) => fallback, '2026-08-17 12:00'),
        /文档可以移动或重命名，插件根据文档 ID 继续维护/);

    // 1. 普通 sync/schedule 在无 ID 时只返回 unconfigured，绝不创建。
    {
        const h = createHarness();
        const result = await h.engine.syncNow({ manual: true });
        assert.deepEqual({ ok: result.ok, skipped: result.skipped, state: result.state },
            { ok: true, skipped: 'unconfigured', state: 'unconfigured' });
        h.engine.scheduleSync();
        await sleep(20);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        h.engine.dispose();
    }

    // 2. 显式创建固定根路径，打双 owner attrs，保存 ID 并完成首次同步。
    {
        const h = createHarness();
        const result = await h.engine.createIndexDocument(NB_A);
        assert.equal(result.ok, true);
        assert.equal(result.created, true);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd')[0].body.path, NOTE_LINK_INDEX_DOC_PATH);
        assert.deepEqual(h.kernel.attrsOf(result.docId), ownerAttrs());
        assert.equal(h.getSettings().indexDocId, result.docId);
        assert.equal(h.getSettings().indexDocPath, NOTE_LINK_INDEX_DOC_PATH);
        assert.equal(h.getSettings().indexEnabled, true);
        assert.equal(h.getSettings().indexAutoSync, true);
        assert.equal(h.kernel.state.attrs.filter(row => row.name === NOTE_LINK_HEADER_ATTR).length, 1,
            'first sync created the managed header');
        h.engine.dispose();
    }

    // 3. 已有 owner 文档被接管，不重复创建。
    {
        const h = createHarness();
        const ownedId = h.kernel.seedDoc(NB_A, '/中断后留下的文档', '中断后留下的文档', ownerAttrs());
        const result = await h.engine.createIndexDocument(NB_A);
        assert.equal(result.ok, true);
        assert.equal(result.adopted, true);
        assert.equal(result.docId, ownedId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        h.engine.dispose();
    }

    // 4. 固定路径同名但无 owner 标记时返回 name-conflict，settings 零写入。
    {
        const h = createHarness();
        h.kernel.seedDoc(NB_A, NOTE_LINK_INDEX_DOC_PATH, NOTE_LINK_INDEX_DOC_TITLE);
        const before = Object.assign({}, h.getSettings());
        const result = await h.engine.createIndexDocument(NB_A);
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'name-conflict');
        assert.deepEqual(h.getSettings(), before);
        assert.equal(h.saves.length, 0);
        h.engine.dispose();
    }

    // 5. legacy live ID 不改名、不换 ID，只补 owner attrs。
    {
        const h = createHarness();
        const legacyId = h.kernel.seedDoc(NB_A, '/我改过名字', '我改过名字');
        h.setSettings({ indexDocId: legacyId });
        const result = await h.engine.syncNow({ manual: true });
        assert.equal(result.ok, true);
        assert.equal(result.docId, legacyId);
        assert.equal(h.getSettings().indexDocId, legacyId);
        assert.equal(h.kernel.state.docs.get(legacyId).hPath, '/我改过名字');
        assert.deepEqual(h.kernel.attrsOf(legacyId), ownerAttrs());
        h.engine.dispose();
    }

    // 6. rename/move/跨笔记本移动后 inspect 动态解析，sync 继续复用原 ID。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, NOTE_LINK_INDEX_DOC_PATH, NOTE_LINK_INDEX_DOC_TITLE, ownerAttrs());
        h.setSettings({ indexDocId: docId });
        h.kernel.moveDoc(docId, NB_B, '/归档/我的资产索引', '我的资产索引');
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'ready');
        assert.equal(inspected.docId, docId);
        assert.equal(inspected.notebookId, NB_B);
        assert.equal(inspected.notebookName, '移动目标');
        assert.equal(inspected.hPath, '/归档/我的资产索引');
        assert.equal(inspected.title, '我的资产索引');
        assert.equal(h.getSettings().indexNotebookId, NB_B, 'cross-notebook move updates only notebook cache');
        const synced = await h.engine.syncNow({ manual: true });
        assert.equal(synced.ok, true);
        assert.equal(synced.docId, docId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        h.engine.dispose();
    }

    // 7. 关闭时保留 ID 且零创建；重开后同 ID 自动恢复同步。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, NOTE_LINK_INDEX_DOC_PATH, NOTE_LINK_INDEX_DOC_TITLE, ownerAttrs());
        h.setSettings({ indexDocId: docId });
        h.kernel.state.notebooks.find(item => item.id === NB_A).closed = true;
        h.kernel.state.checkBlockExistData = false;
        const closed = await h.engine.syncNow({ manual: true });
        assert.equal(closed.ok, false);
        assert.equal(closed.state, 'closed');
        assert.equal(h.getSettings().indexDocId, docId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        assert.equal(h.kernel.callsTo('/api/block/checkBlockExist').length, 1,
            'closed SQL row takes priority over block-tree false');
        h.kernel.state.notebooks.find(item => item.id === NB_A).closed = false;
        h.kernel.state.checkBlockExistData = undefined;
        const reopened = await h.engine.syncNow({ manual: true });
        assert.equal(reopened.ok, true);
        assert.equal(reopened.docId, docId);
        h.engine.dispose();
    }

    // 8. 删除后块树为 false，即使主 SQL 行短暂残留也判 missing；recreate 可成功。
    {
        const h = createHarness();
        const oldId = h.kernel.seedDoc(NB_A, NOTE_LINK_INDEX_DOC_PATH, NOTE_LINK_INDEX_DOC_TITLE, ownerAttrs());
        h.setSettings({ indexDocId: oldId });
        h.kernel.deleteDoc(oldId, true);
        const missing = await h.engine.inspectIndexDocument();
        assert.equal(missing.state, 'missing');
        assert.equal(h.kernel.state.staleDocRows.has(oldId), true, 'regression keeps a stale main-SQL document row');
        assert.equal(h.kernel.callsTo('/api/block/checkBlockExist').at(-1).body.id, oldId);
        assert.equal(h.getSettings().indexDocId, oldId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        const recreated = await h.engine.recreateIndexDocument(NB_A);
        assert.equal(recreated.ok, true);
        assert.notEqual(recreated.docId, oldId);
        assert.equal(h.getSettings().indexDocId, recreated.docId);
        assert.equal(h.kernel.state.attrs.filter(row => row.name === NOTE_LINK_HEADER_ATTR && row.root_id === recreated.docId).length, 1);
        h.engine.dispose();
    }

    // 8b. getBlockInfo code=3 时仍用证据矩阵：陈旧 SQL 行 + 块树 false + 笔记本 open => missing/recreate。
    {
        const h = createHarness();
        const oldId = h.kernel.seedDoc(NB_A, NOTE_LINK_INDEX_DOC_PATH, NOTE_LINK_INDEX_DOC_TITLE, ownerAttrs());
        h.setSettings({ indexDocId: oldId, indexNotebookId: NB_A });
        h.kernel.deleteDoc(oldId, true);
        h.kernel.state.failNext = {
            path: '/api/block/getBlockInfo',
            code: 3,
            message: '正在进行数据索引，请等索引完毕后再尝试打开',
        };
        const missing = await h.engine.inspectIndexDocument();
        assert.equal(missing.state, 'missing');
        assert.equal(h.kernel.state.staleDocRows.has(oldId), true);
        assert.equal(h.kernel.callsTo('/api/block/checkBlockExist').at(-1).body.id, oldId);
        h.kernel.state.failNext = {
            path: '/api/block/getBlockInfo',
            code: 3,
            message: '正在进行数据索引，请等索引完毕后再尝试打开',
        };
        const recreated = await h.engine.recreateIndexDocument(NB_A);
        assert.equal(recreated.ok, true);
        assert.notEqual(recreated.docId, oldId);
        assert.equal(h.getSettings().indexDocId, recreated.docId);
        h.engine.dispose();
    }

    // 8c. getBlockInfo code=3 且块树仍存在 => error，recreate 必须拒绝。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, '/索引中索引', '索引中索引', ownerAttrs());
        h.setSettings({ indexDocId: docId, indexNotebookId: NB_A });
        h.kernel.state.failNext = {
            path: '/api/block/getBlockInfo',
            code: 3,
            message: '正在进行数据索引，请等索引完毕后再尝试打开',
        };
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'error');
        assert.match(inspected.error, /正在进行数据索引/);
        h.kernel.state.failNext = {
            path: '/api/block/getBlockInfo',
            code: 3,
            message: '正在进行数据索引，请等索引完毕后再尝试打开',
        };
        const recreated = await h.engine.recreateIndexDocument(NB_B);
        assert.equal(recreated.ok, false);
        assert.equal(recreated.state, 'error');
        assert.equal(recreated.reason, 'invalid-state');
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        h.engine.dispose();
    }

    // 8d. getBlockInfo code=3 时，SQL 实际 box 对应 closed notebook 仍优先判 closed。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_CLOSED, '/已关闭索引', '已关闭索引', ownerAttrs());
        h.setSettings({ indexDocId: docId, indexNotebookId: NB_A });
        h.kernel.state.failNext = {
            path: '/api/block/getBlockInfo',
            code: 3,
            message: '正在进行数据索引，请等索引完毕后再尝试打开',
        };
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'closed');
        assert.equal(inspected.notebookId, NB_CLOSED);
        assert.equal(inspected.notebookName, '已关闭');
        h.engine.dispose();
    }

    // 9. 当前文档 ready 时 create 直接返回 already-ready，不接管其它 owner 文档。
    {
        const h = createHarness();
        const readyId = h.kernel.seedDoc(NB_A, '/当前索引', '当前索引', ownerAttrs());
        h.kernel.seedDoc(NB_B, '/其它 owner 索引', '其它 owner 索引', ownerAttrs());
        h.setSettings({ indexDocId: readyId, indexNotebookId: NB_A });
        const result = await h.engine.createIndexDocument(NB_B);
        assert.equal(result.ok, true);
        assert.equal(result.reason, 'already-ready');
        assert.equal(result.docId, readyId);
        assert.equal(h.getSettings().indexDocId, readyId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        assert.equal(h.kernel.callsTo('/api/query/sql').some(call => /SELECT DISTINCT a\.root_id/.test(call.body.stmt)), false,
            'ready path never scans or adopts another owner document');
        h.engine.dispose();
    }

    // 10. getBlockInfo code=-1 且块树仍存在时是 error，显式 recreate 不创建。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, '/读取失败索引', '读取失败索引', ownerAttrs());
        h.setSettings({ indexDocId: docId, indexNotebookId: NB_A });
        h.kernel.state.failNext = { path: '/api/block/getBlockInfo', message: 'injected read failure' };
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'error');
        assert.notEqual(inspected.state, 'missing');
        assert.equal(h.kernel.callsTo('/api/block/checkBlockExist').at(-1).body.id, docId);
        h.kernel.state.failNext = { path: '/api/block/getBlockInfo', message: 'injected read failure' };
        const recreated = await h.engine.recreateIndexDocument(NB_B);
        assert.equal(recreated.ok, false);
        assert.equal(recreated.state, 'error');
        assert.equal(h.getSettings().indexDocId, docId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0,
            'read failure cannot enter recreate path');
        const sqlCalls = h.kernel.callsTo('/api/query/sql').length;
        h.kernel.state.failNext = { path: '/api/block/getBlockInfo', code: 7, message: 'unknown API failure' };
        const unknown = await h.engine.inspectIndexDocument();
        assert.equal(unknown.state, 'error');
        assert.equal(h.kernel.callsTo('/api/query/sql').length, sqlCalls,
            'unknown API errors are not interpreted as not-found evidence');
        h.engine.dispose();
    }

    // 11b. checkBlockExist 非 boolean 或调用失败都不能放宽成 missing。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, '/块树证据异常', '块树证据异常', ownerAttrs());
        h.setSettings({ indexDocId: docId, indexNotebookId: NB_A });
        h.kernel.deleteDoc(docId);
        h.kernel.state.checkBlockExistData = null;
        const invalid = await h.engine.inspectIndexDocument();
        assert.equal(invalid.state, 'error');
        assert.notEqual(invalid.state, 'missing');
        h.kernel.state.checkBlockExistData = undefined;
        h.kernel.state.failNext = { path: '/api/block/checkBlockExist', message: 'injected existence failure' };
        const failed = await h.engine.inspectIndexDocument();
        assert.equal(failed.state, 'error');
        assert.notEqual(failed.state, 'missing');
        h.engine.dispose();
    }

    // 11. lsNotebooks 响应形状异常时无法确认 missing，必须返回 error。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, '/待确认索引', '待确认索引', ownerAttrs());
        h.setSettings({ indexDocId: docId, indexNotebookId: NB_A });
        h.kernel.deleteDoc(docId);
        h.kernel.state.notebookListData = {};
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'error');
        assert.notEqual(inspected.state, 'missing');
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, 0);
        h.engine.dispose();
    }

    // 12. 普通段落 ID 不是文档根：不打 owner、不 ready、不同步。
    {
        const h = createHarness();
        const docId = h.kernel.seedDoc(NB_A, '/普通文档', '普通文档');
        const paragraphId = h.kernel.seedBlock(docId, '普通段落');
        h.setSettings({ indexDocId: paragraphId, indexNotebookId: NB_A });
        const inspected = await h.engine.inspectIndexDocument();
        assert.equal(inspected.state, 'error');
        assert.match(inspected.error, /document root block/);
        assert.equal(h.kernel.attrsOf(paragraphId)[NOTE_LINK_INDEX_OWNER_ATTR], undefined);
        const synced = await h.engine.syncNow({ manual: true });
        assert.equal(synced.ok, false);
        assert.equal(h.kernel.callsTo('/api/attr/setBlockAttrs')
            .filter(call => call.body.id === paragraphId && call.body.attrs[NOTE_LINK_INDEX_OWNER_ATTR]).length, 0);
        h.engine.dispose();
    }

    // 13. settings 保存失败：删除本次确切新文档，并恢复保存前快照；重试创建新文档。
    {
        const h = createHarness();
        const oldMissingId = '20260817120000-9999999';
        h.setSettings({ indexDocId: oldMissingId, indexNotebookId: NB_A });
        const before = Object.assign({}, h.getSettings());
        h.setSaveFailureMode('after');
        const failed = await h.engine.createIndexDocument(NB_A);
        assert.equal(failed.ok, false);
        assert.equal(failed.reason, 'settings-save-failed');
        assert.equal(failed.cleanupFailed, false);
        assert.equal(failed.restoreFailed, false);
        assert.deepEqual(h.getSettings(), before);
        assert.equal(h.getSettings().indexDocId, oldMissingId, 'failed save restores the previous configured ID');
        assert.equal(h.kernel.state.docs.has(failed.docId), false, 'exact failed-create document is removed');
        assert.deepEqual(h.kernel.callsTo('/api/filetree/removeDocByID').map(call => call.body.id), [failed.docId]);
        const retried = await h.engine.createIndexDocument(NB_A);
        assert.equal(retried.ok, true);
        assert.notEqual(retried.docId, failed.docId);
        assert.equal(h.kernel.state.docs.size, 1, 'retry leaves no same-name orphan');
        h.engine.dispose();
    }

    // 14. owner attr 失败：保留已跟踪新 ID，后续 sync 按同一 ID 补标并成功。
    {
        const h = createHarness();
        h.kernel.state.failNext = { path: '/api/attr/setBlockAttrs', message: 'injected owner marker failure' };
        const failed = await h.engine.createIndexDocument(NB_A);
        assert.equal(failed.ok, false);
        assert.equal(failed.reason, 'marker-pending');
        assert.equal(failed.markerPending, true);
        assert.equal(h.getSettings().indexDocId, failed.docId);
        assert.equal(h.kernel.state.docs.has(failed.docId), true);
        assert.equal(h.kernel.attrsOf(failed.docId)[NOTE_LINK_INDEX_OWNER_ATTR], undefined);
        const createCalls = h.kernel.callsTo('/api/filetree/createDocWithMd').length;
        const retried = await h.engine.syncNow({ manual: true });
        assert.equal(retried.ok, true);
        assert.equal(retried.docId, failed.docId);
        assert.deepEqual(h.kernel.attrsOf(failed.docId), ownerAttrs());
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, createCalls);
        h.engine.dispose();
    }

    // 15. 首次 sync 失败：不回滚已保存的新 ID，重试仍使用同一文档。
    {
        const h = createHarness();
        h.kernel.state.failNext = { path: '/api/block/prependBlock', message: 'injected first sync failure' };
        const failed = await h.engine.createIndexDocument(NB_A);
        assert.equal(failed.ok, false);
        assert.ok(failed.docId);
        assert.equal(h.getSettings().indexDocId, failed.docId);
        assert.deepEqual(h.kernel.attrsOf(failed.docId), ownerAttrs());
        const createCalls = h.kernel.callsTo('/api/filetree/createDocWithMd').length;
        const retried = await h.engine.syncNow({ manual: true });
        assert.equal(retried.ok, true);
        assert.equal(retried.docId, failed.docId);
        assert.equal(h.kernel.callsTo('/api/filetree/createDocWithMd').length, createCalls);
        h.engine.dispose();
    }

    console.log('[note-link-onboarding] ALL PASS');
}

main().catch(error => {
    console.error('[note-link-onboarding] FAILED:', error && error.stack || error);
    process.exit(1);
});
