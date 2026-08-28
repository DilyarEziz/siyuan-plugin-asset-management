/* eslint-disable no-undef */
/**
 * Workspace cover reference index. The module only uses public SiYuan HTTP APIs
 * and only mutates a block ID persisted by the plugin.
 */

'use strict';

const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp']);
const INDEX_STATUS = Object.freeze({ IDLE: 'idle', PENDING: 'pending', SYNCED: 'synced', ERROR: 'error' });
const RESOURCE_INDEX_MARKER_PREFIX = 'siyuan-plugin-asset-management-resource-index:';
const DEFAULT_RESOURCE_INDEX_TARGET = Object.freeze({
    notebookId: null,
    documentId: null,
    documentTitle: '',
});

function normalizeId(value) {
    const id = String(value || '').trim();
    return /^[0-9]{14}-[a-z0-9]{7}$/.test(id) ? id : null;
}

function normalizeNotebookId(value) {
    return normalizeId(value);
}

function normalizeAssetPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    return path && path.indexOf('assets/') === 0 && !/[?#\\]/.test(path) && !/(^|\/)\.\.?(\/|$)/.test(path) ? path : null;
}

function normalizeResourceIndex(value) {
    const source = value && typeof value === 'object' ? value : {};
    const status = Object.values(INDEX_STATUS).indexOf(source.status) >= 0 ? source.status : INDEX_STATUS.IDLE;
    const notebookId = normalizeNotebookId(source.notebookId);
    const documentId = normalizeId(source.documentId);
    return {
        notebookId: notebookId,
        documentId: documentId,
        documentTitle: String(source.documentTitle || '').trim(),
        targetVerified: source.targetVerified === true && !!(notebookId && documentId),
        managedBlockId: normalizeId(source.managedBlockId),
        pendingCleanupBlockId: normalizeId(source.pendingCleanupBlockId),
        status: status,
        updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
        lastError: typeof source.lastError === 'string' ? source.lastError.slice(0, 240) : null,
    };
}

function tagLabelMap(tags) {
    return new Map((Array.isArray(tags) ? tags : []).map(tag => [tag && tag.id, String(tag && tag.label || '').trim()]));
}

function buildFormalResourceSummaries(assets, tags) {
    const labels = tagLabelMap(tags);
    return (Array.isArray(assets) ? assets : []).map(asset => ({
        id: String(asset && asset.id || ''),
        kind: String(asset && asset.kind || ''),
        name: String(asset && asset.name || '').trim(),
        status: String(asset && asset.status || ''),
        acquiredOn: asset && asset.status !== 'wishlist' ? String(asset.acquiredOn || '') : '',
        cover: asset && asset.cover,
        tagLabels: (Array.isArray(asset && asset.tagIds) ? asset.tagIds : []).map(id => labels.get(id) || ('[missing:' + String(id).slice(0, 8) + ']')),
    }));
}

function collectCoverReferences(assets, tags) {
    const seen = new Set();
    return buildFormalResourceSummaries(assets, tags).reduce((result, asset) => {
        const cover = asset && asset.cover;
        if (!cover || (cover.kind !== 'upload' && cover.kind !== 'workspaceAsset')) return result;
        const path = normalizeAssetPath(cover.assetPath);
        if (!path || seen.has(path)) return result;
        seen.add(path);
        result.push({ path: path, name: asset.name || path.split('/').pop(), kind: asset.kind,
            status: asset.status, acquiredOn: asset.acquiredOn, tagLabels: asset.tagLabels.slice() });
        return result;
    }, []);
}

function escapeMarkdownText(value) {
    return String(value || '').replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]+/g, ' ').trim();
}

function encodeMarkdownHref(value) {
    return String(value || '').split('/').map(segment => encodeURIComponent(segment)
        .replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/');
}

function resourceIndexMarker(documentId) {
    const id = normalizeId(documentId);
    return id ? '<!-- ' + RESOURCE_INDEX_MARKER_PREFIX + id + ' -->' : '';
}

function hasResourceIndexMarker(markdown, documentId) {
    const marker = resourceIndexMarker(documentId);
    return !!marker && String(markdown || '').indexOf(marker) >= 0;
}

function renderIndexMarkdown(references) {
    const lines = [];
    (Array.isArray(references) ? references : []).forEach(reference => {
        const path = normalizeAssetPath(reference && reference.path);
        if (!path) return;
        const summary = [reference.kind, reference.status, reference.acquiredOn,
            (Array.isArray(reference.tagLabels) ? reference.tagLabels : []).join(', ')].filter(Boolean).join(' · ');
        lines.push('![' + escapeMarkdownText(reference.name) + '](' + encodeMarkdownHref(path) + ')' + (summary ? ' ' + escapeMarkdownText(summary) : ''));
    });
    return lines.join(' ');
}

function renderManagedIndexMarkdown(references, documentId) {
    const marker = resourceIndexMarker(documentId);
    const content = renderIndexMarkdown(references);
    return marker && content ? marker + ' ' + content : content;
}

function getFetch(options) {
    if (options && typeof options.fetch === 'function') return options.fetch;
    if (typeof fetch === 'function') return fetch;
    throw new Error('Fetch is unavailable');
}

async function callApi(path, body, options) {
    let response;
    try {
        response = await getFetch(options)(path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
        });
    } catch (cause) {
        const error = new Error((cause && cause.message) || 'SiYuan API network request failed');
        error.kind = 'network';
        throw error;
    }
    if (!response || !response.ok) {
        const error = new Error('SiYuan API HTTP ' + ((response && response.status) || 0));
        error.kind = 'http';
        error.httpStatus = (response && response.status) || 0;
        throw error;
    }
    let payload;
    try { payload = await response.json(); }
    catch (cause) {
        const error = new Error('SiYuan API returned invalid JSON');
        error.kind = 'response';
        throw error;
    }
    if (!payload || payload.code !== 0) {
        const error = new Error((payload && payload.msg) || 'SiYuan API request failed');
        error.kind = 'api';
        error.apiCode = payload && payload.code;
        error.apiMessage = String((payload && payload.msg) || '');
        throw error;
    }
    return payload.data;
}

async function searchWorkspaceAssets(query, options) {
    const k = String(query || '').trim().slice(0, 160);
    const data = await callApi('/api/search/searchAsset', { k: k, exts: IMAGE_EXTENSIONS }, options);
    return (Array.isArray(data) ? data : []).map(item => ({
        path: normalizeAssetPath(item && item.path),
        name: String((item && (item.hName || item.name)) || '').trim(),
        updated: Number(item && item.updated) || 0,
    })).filter(item => item.path && IMAGE_EXTENSIONS.indexOf('.' + item.path.split('.').pop().toLowerCase()) >= 0).slice(0, 80);
}

function flattenTree(nodes, output) {
    (Array.isArray(nodes) ? nodes : []).forEach(node => {
        if (!node || !node.id) return;
        output.push(String(node.id));
        flattenTree(node.children, output);
    });
    return output;
}

// Kernel listDocTree currently returns { data: { tree: [{ id, children }] } }.
// Keep the parser defensive for older wrappers while retaining the kernel shape
// as the primary path. DocFile deliberately has no title/path fields.
function docTreeNodes(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.tree)) return data.tree;
    if (data && data.data && Array.isArray(data.data.tree)) return data.data.tree;
    return [];
}

function documentTitle(info) {
    const source = info && typeof info === 'object' ? info : {};
    return String(source.name || source.title || (source.ial && source.ial.title) || '').trim();
}

function findDocumentNode(nodes, documentId) {
    for (const node of (Array.isArray(nodes) ? nodes : [])) {
        if (node && String(node.id || '') === documentId) return node;
        const nested = findDocumentNode(node && node.children, documentId);
        if (nested) return nested;
    }
    return null;
}

async function verifyDocumentInNotebook(notebookId, documentId, options) {
    const notebook = normalizeNotebookId(notebookId);
    const document = normalizeId(documentId);
    if (!notebook || !document) return false;
    const data = await callApi('/api/filetree/listDocTree', { notebook: notebook, path: '/' }, options);
    return !!findDocumentNode(docTreeNodes(data), document);
}

async function listNotebookDocuments(notebookId, options) {
    const notebook = normalizeNotebookId(notebookId);
    if (!notebook) return [];
    const data = await callApi('/api/filetree/listDocTree', { notebook: notebook, path: '/' }, options);
    const ids = flattenTree(docTreeNodes(data), []);
    const details = await Promise.allSettled(ids.map(async id => {
        const info = await callApi('/api/block/getDocInfo', { id: id }, options);
        return { id: normalizeId(id), name: documentTitle(info), path: '' };
    }));
    // A single stale/indexing-failed document must not make the whole notebook
    // selector appear empty. Its node ID remains selectable as a safe fallback.
    return details.map((result, index) => result.status === 'fulfilled'
        ? result.value : { id: normalizeId(ids[index]), name: '', path: '' })
        .filter(document => document.id);
}

async function listNotebooks(options) {
    const data = await callApi('/api/notebook/lsNotebooks', {}, options);
    return (Array.isArray(data && data.notebooks) ? data.notebooks : []).map(notebook => ({
        id: normalizeNotebookId(notebook && notebook.id), name: String((notebook && notebook.name) || '').trim(),
    })).filter(notebook => notebook.id);
}

function resolveDefaultTarget() {
    return Object.assign({}, DEFAULT_RESOURCE_INDEX_TARGET);
}

function blockIdFromAppendResult(data) {
    const first = Array.isArray(data) ? data[0] : null;
    const op = first && Array.isArray(first.doOperations) ? first.doOperations[0] : null;
    return normalizeId(op && op.id);
}

function isMissingBlockError(error) {
    if (!error) return false;
    if (error.kind === 'http' && error.httpStatus === 404) return true;
    return error.kind === 'api' && /(?:block[^\n]*(?:not found|missing)|未找到[^\n]*块|块[^\n]*不存在|找不到[^\n]*块)/i
        .test(String(error.apiMessage || error.message || ''));
}

async function verifyManagedBlock(managedBlockId, documentId, options) {
    const blockId = normalizeId(managedBlockId);
    const targetDocumentId = normalizeId(documentId);
    if (!blockId || !targetDocumentId) return 'notManaged';
    try {
        const info = await callApi('/api/block/getBlockInfo', { id: blockId }, options);
        if (info == null) return 'missing';
        if (normalizeId(info && info.rootID) !== targetDocumentId) return 'notManaged';
        const data = await callApi('/api/block/getBlockKramdown', { id: blockId, mode: 'md' }, options);
        if (data == null) return 'missing';
        return hasResourceIndexMarker(data && data.kramdown, targetDocumentId) ? 'managed' : 'notManaged';
    } catch (error) {
        return isMissingBlockError(error) ? 'missing' : 'unknown';
    }
}

async function clearManagedBlock(state, options) {
    const index = normalizeResourceIndex(state);
    if (!index.managedBlockId) return Object.assign(index, { managedBlockId: null });
    const verification = await verifyManagedBlock(index.managedBlockId, index.documentId, options);
    if (verification === 'managed') {
        await callApi('/api/block/deleteBlock', { id: index.managedBlockId }, options);
    } else if (verification !== 'missing') {
        const error = new Error(verification === 'unknown'
            ? 'Managed resource index block could not be verified'
            : 'Managed resource index block failed root/marker verification');
        error.code = verification === 'unknown'
            ? 'RESOURCE_INDEX_BLOCK_VERIFICATION_UNKNOWN'
            : 'RESOURCE_INDEX_BLOCK_NOT_MANAGED';
        throw error;
    }
    return Object.assign(index, { managedBlockId: null });
}

async function clearPendingCleanupBlock(state, options) {
    const index = normalizeResourceIndex(state);
    if (!index.pendingCleanupBlockId) return index;
    const verification = await verifyManagedBlock(index.pendingCleanupBlockId, index.documentId, options);
    if (verification === 'missing') return Object.assign(index, { pendingCleanupBlockId: null, lastError: null });
    if (verification === 'unknown') {
        const error = new Error('Pending resource index block could not be verified');
        error.code = 'RESOURCE_INDEX_BLOCK_VERIFICATION_UNKNOWN';
        throw error;
    }
    if (verification !== 'managed') {
        const error = new Error('Pending resource index block failed root/marker verification');
        error.code = 'RESOURCE_INDEX_BLOCK_NOT_MANAGED';
        throw error;
    }
    try {
        await callApi('/api/block/deleteBlock', { id: index.pendingCleanupBlockId }, options);
    } catch (error) {
        if (!isMissingBlockError(error)) throw error;
    }
    return Object.assign(index, { pendingCleanupBlockId: null, lastError: null });
}

async function reconcileResourceIndex({ state, assets, tags, target, options }) {
    let index = normalizeResourceIndex(state);
    const requested = target ? normalizeResourceIndex(target) : index;
    if (!requested.notebookId || !requested.documentId || requested.targetVerified !== true) return index;
    const references = collectCoverReferences(assets, tags);
    const targetChanged = !!(target && (requested.notebookId !== index.notebookId || requested.documentId !== index.documentId));
    if (!references.length) {
        // No custom cover means there is nothing to protect. Keep any historical managed
        // block intact and avoid touching document or block APIs during this reconcile.
        if (targetChanged) {
            index = Object.assign(index, {
                notebookId: requested.notebookId,
                documentId: requested.documentId,
                documentTitle: requested.documentTitle,
                managedBlockId: null,
            });
        }
        return Object.assign(index, { status: INDEX_STATUS.IDLE, updatedAt: new Date().toISOString(), lastError: null });
    }
    if (targetChanged && (!requested.notebookId || !requested.documentId
        || !await verifyDocumentInNotebook(requested.notebookId, requested.documentId, options))) {
        throw new Error('The selected index document is not in the selected notebook');
    }
    if (targetChanged && index.managedBlockId) index = await clearManagedBlock(index, options);
    if (targetChanged) index = Object.assign(index, {
        notebookId: requested.notebookId,
        documentId: requested.documentId,
        documentTitle: requested.documentTitle,
        targetVerified: true,
    });
    try {
        if (!await verifyDocumentInNotebook(index.notebookId, index.documentId, options)) {
            throw new Error('The selected index document is not in the selected notebook');
        }
        const markdown = renderManagedIndexMarkdown(references, index.documentId);
        if (index.managedBlockId) {
            const verification = await verifyManagedBlock(index.managedBlockId, index.documentId, options);
            if (verification === 'unknown') throw new Error('The managed resource index block could not be verified');
            if (verification !== 'managed') index.managedBlockId = null;
        }
        if (index.managedBlockId) {
            await callApi('/api/block/updateBlock', { dataType: 'markdown', data: markdown, id: index.managedBlockId }, options);
        } else {
            const data = await callApi('/api/block/appendBlock', { dataType: 'markdown', data: markdown, parentID: index.documentId }, options);
            const managedBlockId = blockIdFromAppendResult(data);
            if (!managedBlockId) throw new Error('Failed to create the resource index block');
            index.managedBlockId = managedBlockId;
        }
        return Object.assign(index, { status: INDEX_STATUS.SYNCED, updatedAt: new Date().toISOString(), lastError: null });
    } catch (error) {
        error.resourceIndexState = index;
        throw error;
    }
}

module.exports = {
    IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
    INDEX_STATUS: INDEX_STATUS,
    RESOURCE_INDEX_MARKER_PREFIX: RESOURCE_INDEX_MARKER_PREFIX,
    DEFAULT_RESOURCE_INDEX_TARGET: DEFAULT_RESOURCE_INDEX_TARGET,
    normalizeResourceIndex: normalizeResourceIndex,
    normalizeNotebookId: normalizeNotebookId,
    collectCoverReferences: collectCoverReferences,
    buildFormalResourceSummaries: buildFormalResourceSummaries,
    encodeMarkdownHref: encodeMarkdownHref,
    resourceIndexMarker: resourceIndexMarker,
    hasResourceIndexMarker: hasResourceIndexMarker,
    renderIndexMarkdown: renderIndexMarkdown,
    renderManagedIndexMarkdown: renderManagedIndexMarkdown,
    searchWorkspaceAssets: searchWorkspaceAssets,
    verifyDocumentInNotebook: verifyDocumentInNotebook,
    listNotebookDocuments: listNotebookDocuments,
    docTreeNodes: docTreeNodes,
    documentTitle: documentTitle,
    listNotebooks: listNotebooks,
    resolveDefaultTarget: resolveDefaultTarget,
    verifyManagedBlock: verifyManagedBlock,
    clearManagedBlock: clearManagedBlock,
    clearPendingCleanupBlock: clearPendingCleanupBlock,
    reconcileResourceIndex: reconcileResourceIndex,
};
