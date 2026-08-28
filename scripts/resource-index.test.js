'use strict';

const assert = require('assert/strict');
const media = require('../api/media');
const index = require('../api/resource-index');

function response(data) {
    return { ok: true, json: async () => ({ code: 0, data: data }) };
}

async function testWorkspaceCoverSafety() {
    const cover = media.normalizeCover({ kind: 'workspaceAsset', assetPath: '/assets/existing/photo.png' });
    assert.deepEqual(cover, { kind: 'workspaceAsset', assetPath: 'assets/existing/photo.png' });
    assert.equal(media.resolveCoverUrl(cover), '/assets/existing/photo.png');
    const calls = [];
    const removed = await media.cleanupDeletedCover(cover, 'asset_1', { fetch: async (...args) => { calls.push(args); return response(null); } });
    assert.equal(removed, false);
    assert.equal(calls.length, 0);
}

async function testDocumentTreeKernelResponseShape() {
    const notebookId = '20260712000000-nbtest1';
    const parentId = '20260713000000-aaaaaaa';
    const documentId = '20260713000000-bbbbbbb';
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        if (url === '/api/filetree/listDocTree') {
            // Kernel api/filetree.go returns only id + recursively nested children.
            return response({ tree: [{ id: parentId, children: [{ id: documentId }] }] });
        }
        if (url === '/api/block/getDocInfo') {
            const id = JSON.parse(options.body).id;
            return response({ id, rootID: id, name: id === parentId ? 'Parent' : 'Nested report', ial: { title: 'ignored title fallback' } });
        }
        throw new Error('unexpected API ' + url);
    };
    const documents = await index.listNotebookDocuments(notebookId, { fetch });
    assert.deepEqual(documents, [
        { id: parentId, name: 'Parent', path: '' },
        { id: documentId, name: 'Nested report', path: '' },
    ], 'nested DocFile nodes are flattened and titled through getDocInfo');
    assert.equal(await index.verifyDocumentInNotebook(notebookId, documentId, { fetch }), true,
        'manual IDs are validated against the recursively returned notebook tree');
    assert.equal(await index.verifyDocumentInNotebook(notebookId, '20260713000000-ccccccc', { fetch }), false,
        'a well-formed but absent document is distinguished from a matching tree node');
    assert.equal(calls.filter(call => call.url === '/api/filetree/listDocTree').every(call => call.body.notebook === notebookId), true,
        'kernel-style notebook Node IDs are passed through unchanged');
    const callsBeforeMixedCase = calls.length;
    assert.equal(await index.verifyDocumentInNotebook('20260712000000-nbTEst1', documentId, { fetch }), false,
        'mixed-case notebook IDs are rejected before querying the kernel');
    assert.equal(calls.length, callsBeforeMixedCase, 'invalid mixed-case notebook IDs make no API request');
}

async function testSearchAndReconcile() {
    const calls = [];
    const notebookId = '20260713000000-aaaaaaa';
    const documentId = '20260713000000-bbbbbbb';
    const managedBlockId = '20260713000000-ccccccc';
    const fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url === '/api/search/searchAsset') return response([{ hName: 'camera.png', path: 'assets/camera.png' }]);
        if (url === '/api/filetree/listDocTree') return response({ tree: [{ id: documentId }] });
        if (url === '/api/block/getBlockInfo') return response({ rootID: documentId });
        if (url === '/api/block/getBlockKramdown') return response({ kramdown: index.resourceIndexMarker(documentId) + ' ![Camera](assets/camera.png)' });
        if (url === '/api/block/appendBlock') return response([{ doOperations: [{ id: managedBlockId }] }]);
        if (url === '/api/block/updateBlock' || url === '/api/block/deleteBlock') return response(null);
        throw new Error('unexpected API ' + url);
    };
    const results = await index.searchWorkspaceAssets('camera', { fetch });
    assert.deepEqual(results, [{ path: 'assets/camera.png', name: 'camera.png', updated: 0 }]);
    assert.deepEqual(calls[0].body, { k: 'camera', exts: ['.png', '.jpg', '.jpeg', '.webp'] });

    const state = await index.reconcileResourceIndex({
        state: { notebookId, documentId, targetVerified: true },
        target: { notebookId: notebookId, documentId: documentId, targetVerified: true },
        assets: [{ name: 'Camera', cover: { kind: 'workspaceAsset', assetPath: 'assets/camera.png' } }],
        options: { fetch },
    });
    assert.equal(state.managedBlockId, managedBlockId);
    assert.equal(state.status, 'synced');
    const append = calls.find(call => call.url === '/api/block/appendBlock');
    assert.match(append.body.data, /<!-- siyuan-plugin-asset-management-resource-index:20260713000000-bbbbbbb -->/);
    assert.match(append.body.data, /!\[Camera\]\(assets\/camera\.png\)/);

    const callsBeforeEmptyReconcile = calls.length;
    const idle = await index.reconcileResourceIndex({ state: state, assets: [], options: { fetch } });
    assert.equal(idle.managedBlockId, managedBlockId);
    assert.equal(idle.status, 'idle');
    assert.equal(calls.length, callsBeforeEmptyReconcile);
}

async function testFixedDefaultTargetAndValidation() {
    const defaultTarget = index.DEFAULT_RESOURCE_INDEX_TARGET;
    assert.deepEqual(index.resolveDefaultTarget(), { notebookId: null, documentId: null, documentTitle: '' });
    assert.deepEqual(index.normalizeResourceIndex({}), {
        notebookId: defaultTarget.notebookId,
        documentId: defaultTarget.documentId,
        documentTitle: defaultTarget.documentTitle,
        targetVerified: false,
        managedBlockId: null,
        pendingCleanupBlockId: null,
        status: 'idle',
        updatedAt: null,
        lastError: null,
    });

    const calls = [];
    const managedBlockId = '20260713000000-ccccccc';
    const fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url === '/api/filetree/listDocTree') {
            assert.deepEqual(body, { notebook: '20260713000000-aaaaaaa', path: '/' });
            return response({ tree: [{ id: '20260713000000-bbbbbbb' }] });
        }
        if (url === '/api/block/appendBlock') return response([{ doOperations: [{ id: managedBlockId }] }]);
        throw new Error('unexpected API ' + url);
    };
    const state = await index.reconcileResourceIndex({
        state: { notebookId: '20260713000000-aaaaaaa', documentId: '20260713000000-bbbbbbb', documentTitle: 'Formal target', targetVerified: true },
        target: { notebookId: '20260713000000-aaaaaaa', documentId: '20260713000000-bbbbbbb', documentTitle: 'Formal target', targetVerified: true },
        assets: [{ name: 'Camera', cover: { kind: 'upload', assetPath: 'assets/camera.png' } }],
        options: { fetch },
    });
    assert.equal(state.notebookId, '20260713000000-aaaaaaa');
    assert.equal(state.documentId, '20260713000000-bbbbbbb');
    assert.equal(state.managedBlockId, managedBlockId);
    assert.equal(calls.filter(call => call.url === '/api/notebook/lsNotebooks').length, 0);
    assert.equal(calls.filter(call => call.url === '/api/filetree/createDocWithMd').length, 0);

    const invalidCalls = [];
    await assert.rejects(() => index.reconcileResourceIndex({
        state: { notebookId: '20260713000000-aaaaaaa', documentId: '20260713000000-bbbbbbb', documentTitle: 'Formal target', targetVerified: true },
        target: { notebookId: '20260713000000-aaaaaaa', documentId: '20260713000000-bbbbbbb', documentTitle: 'Formal target', targetVerified: true },
        assets: [{ name: 'Camera', cover: { kind: 'workspaceAsset', assetPath: 'assets/camera.png' } }],
        options: {
            fetch: async (url, options) => {
                invalidCalls.push({ url, body: JSON.parse(options.body) });
                if (url === '/api/filetree/listDocTree') return response({ tree: [] });
                throw new Error('unexpected API ' + url);
            },
        },
    }), error => {
        assert.equal(error.message, 'The selected index document is not in the selected notebook');
        assert.equal(error.resourceIndexState.notebookId, '20260713000000-aaaaaaa');
        assert.equal(error.resourceIndexState.documentId, '20260713000000-bbbbbbb');
        return true;
    });
    assert.deepEqual(invalidCalls.map(call => call.url), ['/api/filetree/listDocTree']);
}

async function testNoCoverNeverMutatesIndexBlocks() {
    const calls = [];
    const state = await index.reconcileResourceIndex({
        state: {
            notebookId: '20260713000000-aaaaaaa',
            documentId: '20260713000000-bbbbbbb',
            targetVerified: true,
            managedBlockId: '20260713000000-ccccccc',
            status: 'synced',
        },
        assets: [{ name: 'No cover', cover: { kind: 'preset', presetId: 'camera' } }],
        options: {
            fetch: async (url, options) => {
                calls.push({ url, body: JSON.parse(options.body) });
                throw new Error('the empty-cover path must not call APIs');
            },
        },
    });
    assert.equal(state.status, 'idle');
    assert.equal(state.managedBlockId, '20260713000000-ccccccc');
    assert.deepEqual(calls, []);
}

async function testMarkdownEscapingAndUntrustedBlockSafety() {
    assert.equal(index.renderIndexMarkdown([{
        name: 'cover ](https://example.invalid) [title',
        path: 'assets/folder [draft]/cover (1).png',
    }]), '![' + 'cover \\](https://example.invalid) \\[title' + '](assets/folder%20%5Bdraft%5D/cover%20%281%29.png)');

    const notebookId = '20260713000000-aaaaaaa';
    const documentId = '20260713000000-bbbbbbb';
    const untrustedBlockId = '20260713000000-ccccccc';
    const freshBlockId = '20260713000000-ddddddd';
    const calls = [];
    const fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url === '/api/filetree/listDocTree') return response({ tree: [{ id: documentId }] });
        if (url === '/api/block/getBlockInfo') return response({ rootID: documentId });
        if (url === '/api/block/getBlockKramdown') return response({ kramdown: 'User-authored content' });
        if (url === '/api/block/appendBlock') return response([{ doOperations: [{ id: freshBlockId }] }]);
        if (url === '/api/block/updateBlock' || url === '/api/block/deleteBlock') {
            throw new Error('an untrusted block must not be mutated');
        }
        throw new Error('unexpected API ' + url);
    };
    const state = await index.reconcileResourceIndex({
        state: { notebookId, documentId, targetVerified: true, managedBlockId: untrustedBlockId },
        assets: [{ name: 'Unsafe ](name)', cover: { kind: 'workspaceAsset', assetPath: 'assets/a b](x).png' } }],
        options: { fetch },
    });
    assert.equal(state.managedBlockId, freshBlockId);
    assert.equal(calls.filter(call => call.url === '/api/block/updateBlock').length, 0);
    assert.equal(calls.filter(call => call.url === '/api/block/deleteBlock').length, 0);
    const append = calls.find(call => call.url === '/api/block/appendBlock');
    assert.match(append.body.data, /assets\/a%20b%5D%28x%29\.png/);
    assert.match(append.body.data, /Unsafe \\]\(name\)/);

    const wrongRootCalls = [];
    const wrongRootFetch = async (url, options) => {
        const body = JSON.parse(options.body);
        wrongRootCalls.push({ url, body });
        if (url === '/api/filetree/listDocTree') return response({ tree: [{ id: documentId }] });
        if (url === '/api/block/getBlockInfo') return response({ rootID: '20260713000000-eeeeeee' });
        if (url === '/api/block/appendBlock') return response([{ doOperations: [{ id: freshBlockId }] }]);
        if (url === '/api/block/getBlockKramdown' || url === '/api/block/updateBlock' || url === '/api/block/deleteBlock') {
            throw new Error('a block outside the target document must not be read or mutated');
        }
        throw new Error('unexpected API ' + url);
    };
    await index.reconcileResourceIndex({
        state: { notebookId, documentId, targetVerified: true, managedBlockId: untrustedBlockId },
        assets: [{ name: 'Camera', cover: { kind: 'workspaceAsset', assetPath: 'assets/camera.png' } }],
        options: { fetch: wrongRootFetch },
    });
    assert.equal(wrongRootCalls.filter(call => call.url === '/api/block/getBlockKramdown').length, 0);
    assert.equal(wrongRootCalls.filter(call => call.url === '/api/block/updateBlock' || call.url === '/api/block/deleteBlock').length, 0);
}

async function main() {
    await testWorkspaceCoverSafety();
    await testDocumentTreeKernelResponseShape();
    await testSearchAndReconcile();
    await testFixedDefaultTargetAndValidation();
    await testNoCoverNeverMutatesIndexBlocks();
    await testMarkdownEscapingAndUntrustedBlockSafety();
    console.log('resource-index tests passed');
}

main().catch(error => { console.error(error); process.exit(1); });
