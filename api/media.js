/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 — media.js
 *
 * 资产封面媒体：工作空间图片上传、预设图标与 emoji 的统一模型。
 * 封面上传统一落盘 data/public/（思源 v2.9.3+ 静态服务目录，不参与未引用资源扫描），
 * 旧 assets/ 落盘路径经运行时翻译层（resolvePhysicalAssetPath）兼容。
 * 本批次：新增 decodeCoverImage / cropAndEncodeCoverImage / processCoverImage 提供 1:1 裁切 + 自动压缩；
 *         新流程产 Blob 直接给 uploadImage（落盘到 public/，自动压缩在 UI 端完成）。
 */

'use strict';

const MEDIA_ROOT = 'public/siyuan-plugin-asset-management';
// Uploads created before the public/ migration recorded the legacy assets/ prefix in
// persisted cover data. That data is never rewritten; the runtime translation layer
// below resolves the legacy prefix once the directory has been moved.
const LEGACY_MEDIA_ROOT = 'assets/siyuan-plugin-asset-management';
let legacyMediaMigrated = false;
const WORKSPACE_DATA_ROOT = 'data/';
const PRESET_ICON_ROOT = 'assets/preset-icons';
const DEFAULT_PRESET_ICON_ID = 'icons8-box';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const COVER_MAX_DIMENSION = 1280;
const COVER_QUALITY = 0.92;
const COVER_COMPRESSED_THRESHOLD = 1024 * 1024;
const COVER_QUALITY_LADDER = [0.92, 0.82, 0.75];
const COVER_DEFAULT_OUTPUT_SIZE = 1280;
const ALLOWED_IMAGE_TYPES = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
});
const ALLOWED_IMAGE_EXTENSIONS = Object.freeze({
    jpg: 'jpg',
    jpeg: 'jpg',
    png: 'png',
    webp: 'webp',
});
const COVER_KINDS = Object.freeze({
    UPLOAD: 'upload',
    WORKSPACE_ASSET: 'workspaceAsset',
    PRESET: 'preset',
    EMOJI: 'emoji',
    NONE: 'none',
});

function mediaError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function getFileExtension(name) {
    const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

function normalizeWorkspaceAssetPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    if (!path || (path.indexOf('assets/') !== 0 && path.indexOf('public/') !== 0)
        || /(^|\/)\.\.?(\/|$)/.test(path) || /[?#\\]/.test(path)) {
        return null;
    }
    return path;
}

function isLegacyMediaMigrated() {
    return legacyMediaMigrated;
}

// Runtime translation layer: persisted cover records keep their historical assets/
// prefix (formal-v2 data is never rewritten). Once the legacy root has been moved,
// resolve the plugin's own legacy paths to the new public/ root. Any other assets/
// path (user workspaceAsset covers) is always returned unchanged.
function resolvePhysicalAssetPath(assetPath) {
    const path = String(assetPath || '').trim();
    if (!legacyMediaMigrated) return path;
    const legacyPrefix = LEGACY_MEDIA_ROOT + '/';
    if (path.indexOf(legacyPrefix) !== 0) return path;
    return MEDIA_ROOT + '/' + path.slice(legacyPrefix.length);
}

// Covers persist paths relative to SiYuan's data directory so they resolve through
// /assets/* or /public/*. The file APIs instead address paths from the workspace root.
function toWorkspaceFilePath(assetPath) {
    const normalized = normalizeWorkspaceAssetPath(assetPath);
    return normalized ? WORKSPACE_DATA_ROOT + resolvePhysicalAssetPath(normalized) : null;
}

function normalizePresetId(value) {
    const presetId = String(value || '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(presetId) ? presetId : null;
}

function isLegacyIconParkPreset(value) {
    return /^ip-outline-[a-z0-9-]+$/i.test(String(value || '').trim());
}

function normalizePresetCoverId(value) {
    const presetId = normalizePresetId(value);
    if (!presetId) return null;
    // IconPark artwork is no longer bundled. Keep historical assets readable by
    // explicitly switching their former preset selection to the neutral Box icon.
    return isLegacyIconParkPreset(presetId) ? DEFAULT_PRESET_ICON_ID : presetId;
}

function normalizeEmoji(value) {
    const emoji = String(value || '').trim();
    // Historical SVG symbol ids are ASCII. Only retain visibly non-ASCII emoji-like values.
    return emoji && emoji.length <= 32 && /[^\x00-\x7F]/.test(emoji) ? emoji : null;
}

function isMediaAssetId(value) {
    return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || '').trim());
}

function isMediaUuid(value) {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(String(value || '').trim().toLowerCase());
}

/** Only files created by this plugin for this exact asset may be mutated. */
function isOwnedMediaPath(value, assetId) {
    const path = String(value || '').trim();
    const id = String(assetId || '').trim();
    if (!isMediaAssetId(id)) return false;
    const match = path.match(/^(assets|public)\/siyuan-plugin-asset-management\/([A-Za-z0-9_-]{1,128})\/([a-f0-9-]{36})\.(jpg|jpeg|png|webp)$/i);
    return !!match && match[2] === id && isMediaUuid(match[3]);
}

function normalizeCover(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const kind = source.kind;
    if (kind === COVER_KINDS.UPLOAD) {
        const assetPath = normalizeWorkspaceAssetPath(source.assetPath);
        return assetPath ? { kind: COVER_KINDS.UPLOAD, assetPath: assetPath } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.WORKSPACE_ASSET) {
        const assetPath = normalizeWorkspaceAssetPath(source.assetPath);
        return assetPath ? { kind: COVER_KINDS.WORKSPACE_ASSET, assetPath: assetPath } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.PRESET) {
        const presetId = normalizePresetCoverId(source.presetId);
        return presetId ? { kind: COVER_KINDS.PRESET, presetId: presetId } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.EMOJI) {
        const emoji = normalizeEmoji(source.emoji);
        return emoji ? { kind: COVER_KINDS.EMOJI, emoji: emoji } : { kind: COVER_KINDS.NONE };
    }
    if (kind === COVER_KINDS.NONE) return { kind: COVER_KINDS.NONE };
    return { kind: COVER_KINDS.NONE };
}

function isUploadCover(cover) {
    return !!cover && cover.kind === COVER_KINDS.UPLOAD && !!normalizeWorkspaceAssetPath(cover.assetPath);
}

function isWorkspaceAssetCover(cover) {
    return !!cover && cover.kind === COVER_KINDS.WORKSPACE_ASSET && !!normalizeWorkspaceAssetPath(cover.assetPath);
}

function isOwnedUploadCover(cover, assetId) {
    return !!cover && cover.kind === COVER_KINDS.UPLOAD && isOwnedMediaPath(cover.assetPath, assetId);
}

function resolveCoverUrl(cover, presetManifest) {
    const normalized = normalizeCover(cover);
    if (normalized.kind === COVER_KINDS.UPLOAD || normalized.kind === COVER_KINDS.WORKSPACE_ASSET) {
        return '/' + resolvePhysicalAssetPath(normalized.assetPath);
    }
    if (normalized.kind !== COVER_KINDS.PRESET) return null;
    const manifest = presetManifest && typeof presetManifest === 'object' ? presetManifest : {};
    const items = Array.isArray(manifest.icons) ? manifest.icons : [];
    const item = items.find(icon => icon && icon.id === normalized.presetId);
    const filename = item && String(item.filename || '').trim();
    // Box is the only built-in default and must remain available while the
    // manifest request is pending or has failed.
    if ((!filename || /[\\/]/.test(filename)) && normalized.presetId === DEFAULT_PRESET_ICON_ID) {
        return '/plugins/siyuan-plugin-asset-management/' + PRESET_ICON_ROOT + '/icons8-box-64.png';
    }
    if (!filename || /[\\/]/.test(filename)) return null;
    return '/plugins/siyuan-plugin-asset-management/' + PRESET_ICON_ROOT + '/' + filename;
}

function createMediaPath(assetId, extension, uuid) {
    const id = String(assetId || '').trim();
    const ext = ALLOWED_IMAGE_EXTENSIONS[String(extension || '').toLowerCase()];
    const token = String(uuid || '').trim().toLowerCase();
    if (!isMediaAssetId(id)) throw mediaError('MEDIA_ASSET_ID_INVALID', 'Invalid asset id for media upload');
    if (!ext) throw mediaError('MEDIA_EXTENSION_INVALID', 'Unsupported image extension');
    if (!isMediaUuid(token)) {
        throw mediaError('MEDIA_UUID_INVALID', 'Invalid media upload id');
    }
    return MEDIA_ROOT + '/' + id + '/' + token + '.' + ext;
}

function createUploadId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const random = Math.floor(Math.random() * 16);
        return (c === 'x' ? random : ((random & 0x3) | 0x8)).toString(16);
    });
}

/** A short-lived UI upload session; cancellation does not abort the kernel request. */
function createUploadSession() {
    return { type: 'cover-upload-session', cancelled: false };
}

function cancelUploadSession(session) {
    if (!session || session.type !== 'cover-upload-session') return false;
    session.cancelled = true;
    return true;
}

function isUploadSessionActive(session) {
    return !!session && session.type === 'cover-upload-session' && session.cancelled !== true;
}

function validateImageFile(file) {
    if (!file || typeof file !== 'object') throw mediaError('MEDIA_FILE_REQUIRED', 'Image file is required');
    const size = Number(file.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_UPLOAD_BYTES) {
        throw mediaError('MEDIA_FILE_SIZE_INVALID', 'Image must not exceed 5 MiB');
    }
    const mimeType = String(file.type || '').toLowerCase();
    const extension = getFileExtension(file.name);
    const mimeExtension = ALLOWED_IMAGE_TYPES[mimeType];
    const nameExtension = ALLOWED_IMAGE_EXTENSIONS[extension];
    if ((mimeType && !mimeExtension) || (extension && !nameExtension) || (!mimeExtension && !nameExtension)) {
        throw mediaError('MEDIA_FILE_TYPE_INVALID', 'Only JPEG, PNG, and WebP images are supported');
    }
    if (mimeExtension && nameExtension && mimeExtension !== nameExtension) {
        throw mediaError('MEDIA_FILE_TYPE_INVALID', 'Image MIME type does not match its filename');
    }
    return { extension: mimeExtension || nameExtension, size: size };
}

function createCoverCanvas(width, height) {
    const w = width;
    const h = height;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

function drawCroppedToCanvas(ctx, source, crop, outW, outH) {
    const sourceWidth = Number(source && source.width);
    const sourceHeight = Number(source && source.height);
    const cropX = Math.max(0, Math.min(Number(crop.x), sourceWidth));
    const cropY = Math.max(0, Math.min(Number(crop.y), sourceHeight));
    const cropW = Math.max(0, Math.min(Number(crop.width), sourceWidth - cropX));
    const cropH = Math.max(0, Math.min(Number(crop.height), sourceHeight - cropY));
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
}

function encodeCanvasToBlob(canvas, type, quality) {
    const encodeQuality = type === 'image/png' ? undefined : quality;
    if (typeof canvas.convertToBlob === 'function') {
        return canvas.convertToBlob({ type: type, quality: encodeQuality });
    }
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob
        ? resolve(blob)
        : reject(mediaError('MEDIA_ENCODE_FAILED', 'canvas.toBlob returned null')),
    type, encodeQuality));
}

async function decodeCoverImage(file, options) {
    const opts = options || {};
    const bitmapFn = opts.createImageBitmap || (typeof createImageBitmap !== 'undefined' ? createImageBitmap : null);
    if (typeof bitmapFn !== 'function') throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    let bitmap;
    try {
        bitmap = await bitmapFn(file, { imageOrientation: 'from-image' });
    } catch (e) {
        throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    }
    if (!bitmap || typeof bitmap.width !== 'number' || typeof bitmap.height !== 'number') {
        try { bitmap && bitmap.close && bitmap.close(); } catch (_) {}
        throw mediaError('MEDIA_DECODE_FAILED', 'Unable to decode image');
    }
    return { bitmap: bitmap, width: bitmap.width, height: bitmap.height };
}

async function cropAndEncodeCoverImage(options) {
    const opts = options || {};
    const bitmap = opts.bitmap;
    const sourceWidth = Number(opts.sourceWidth);
    const sourceHeight = Number(opts.sourceHeight);
    const crop = opts.crop || {};
    if (!bitmap) throw mediaError('MEDIA_DECODE_FAILED', 'Bitmap missing');
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw mediaError('MEDIA_CROP_INVALID', 'Invalid source dimensions');
    }
    const cropX = Number(crop.x);
    const cropY = Number(crop.y);
    const cropW = Number(crop.width);
    const cropH = Number(crop.height);
    if (!Number.isFinite(cropX) || !Number.isFinite(cropY) || !Number.isFinite(cropW) || !Number.isFinite(cropH)) {
        throw mediaError('MEDIA_CROP_INVALID', 'Invalid crop coordinates');
    }
    if (cropW !== cropH) throw mediaError('MEDIA_CROP_INVALID', 'Cover crop must be 1:1');
    if (cropX < 0 || cropY < 0 || cropW <= 0 || cropH <= 0 || cropX + cropW > sourceWidth || cropY + cropH > sourceHeight) {
        throw mediaError('MEDIA_CROP_INVALID', 'Crop exceeds source bounds');
    }
    const outputSize = Number(opts.outputSize) || COVER_DEFAULT_OUTPUT_SIZE;
    const maxDimension = Number(opts.maxDimension) || COVER_MAX_DIMENSION;
    const threshold = Number(opts.threshold) || COVER_COMPRESSED_THRESHOLD;
    const type = opts.type || 'image/jpeg';
    const isPng = type === 'image/png';
    const requestedQuality = Number.isFinite(opts.quality) ? opts.quality : COVER_QUALITY;
    const finalDimension = Math.max(1, Math.min(outputSize, maxDimension));
    const outW = finalDimension;
    const outH = finalDimension;
    let canvas;
    try {
        canvas = createCoverCanvas(outW, outH);
    } catch (e) {
        throw mediaError('MEDIA_ENCODE_FAILED', 'Failed to create canvas');
    }
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) throw mediaError('MEDIA_ENCODE_FAILED', '2D context unavailable');
    const drawOnce = (q) => {
        try {
            ctx.clearRect(0, 0, outW, outH);
            drawCroppedToCanvas(ctx, bitmap, { x: cropX, y: cropY, width: cropW, height: cropH }, outW, outH);
        } catch (e) {
            throw mediaError('MEDIA_ENCODE_FAILED', 'drawImage failed');
        }
        return encodeCanvasToBlob(canvas, type, isPng ? undefined : q);
    };
    let blob;
    let usedQuality = requestedQuality;
    try {
        blob = await drawOnce(requestedQuality);
    } catch (e) {
        if (e && e.code) throw e;
        throw mediaError('MEDIA_ENCODE_FAILED', 'encode failed');
    }
    let processedSize = blob.size;
    if (!isPng && blob.size > threshold) {
        const ladder = COVER_QUALITY_LADDER;
        const startIdx = ladder.indexOf(requestedQuality);
        const retryList = startIdx >= 0 ? ladder.slice(startIdx + 1) : ladder.slice(1);
        for (const q of retryList) {
            let next;
            try { next = await drawOnce(q); } catch (e) { continue; }
            processedSize = next.size;
            usedQuality = q;
            blob = next;
            if (next.size <= threshold) break;
        }
    }
    const sourceSize = Number(opts.sourceSize) || 0;
    const compressed = processedSize < sourceSize;
    return {
        blob: blob,
        width: outW,
        height: outH,
        sourceSize: sourceSize,
        processedSize: processedSize,
        compressed: compressed,
        quality: isPng ? null : usedQuality,
    };
}

async function processCoverImage(file, options) {
    const opts = options || {};
    const decoded = await decodeCoverImage(file, opts);
    let result;
    try {
        result = await cropAndEncodeCoverImage(Object.assign({}, opts, {
            bitmap: decoded.bitmap,
            sourceWidth: decoded.width,
            sourceHeight: decoded.height,
            sourceSize: (file && file.size) || 0,
        }));
    } finally {
        try { decoded.bitmap && decoded.bitmap.close && decoded.bitmap.close(); } catch (_) {}
    }
    return {
        blob: result.blob,
        width: result.width,
        height: result.height,
        sourceSize: (file && file.size) || 0,
        processedSize: result.processedSize,
        compressed: result.compressed,
        type: (opts && opts.type) || 'image/jpeg',
        ratio: '1:1',
    };
}

async function parseKernelResponse(response) {
    if (!response || !response.ok) throw mediaError('MEDIA_API_FAILED', 'SiYuan file API request failed');
    const payload = await response.json();
    if (!payload || payload.code !== 0) {
        throw mediaError('MEDIA_API_FAILED', (payload && payload.msg) || 'SiYuan file API request failed');
    }
    return payload;
}

function getFetch(options) {
    const fetchFn = options && options.fetch;
    if (typeof fetchFn === 'function') return fetchFn;
    if (typeof fetch === 'function') return fetch;
    throw mediaError('MEDIA_FETCH_UNAVAILABLE', 'Fetch is unavailable');
}

/**
 * One-shot move of the legacy assets/ media root to data/public/ via kernel
 * renameFile (supports whole-directory moves and creates the target parent
 * directory). Idempotent: a missing source directory counts as migrated
 * (fresh install or a previous run already moved it). Any other outcome
 * leaves the flag false so the next onload retries. Never throws.
 */
async function migrateLegacyMediaRoot(options) {
    let response;
    try {
        response = await getFetch(options)('/api/file/renameFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: WORKSPACE_DATA_ROOT + LEGACY_MEDIA_ROOT,
                newPath: WORKSPACE_DATA_ROOT + MEDIA_ROOT,
            }),
        });
    } catch (e) {
        legacyMediaMigrated = false;
        return { status: 'failed', code: 'NETWORK', message: (e && e.message) || 'Network error during media migration' };
    }
    let payload = null;
    try {
        payload = response && typeof response.json === 'function' ? await response.json() : null;
    } catch (e) {
        payload = null;
    }
    const code = payload && typeof payload.code === 'number' ? payload.code : ((response && response.status) || -1);
    if (code === 0) {
        legacyMediaMigrated = true;
        return { status: 'migrated' };
    }
    if (code === 404 || (response && response.status === 404)) {
        legacyMediaMigrated = true;
        return { status: 'absent' };
    }
    legacyMediaMigrated = false;
    return {
        status: 'failed',
        code: code,
        message: (payload && payload.msg) || ('Media migration failed with HTTP ' + ((response && response.status) || 0)),
    };
}

async function uploadImage(assetId, file, options) {
    const validated = validateImageFile(file);
    const opts = options || {};
    const assetPath = createMediaPath(assetId, validated.extension, opts.uuid || createUploadId());
    const FormDataCtor = opts.FormData || (typeof FormData !== 'undefined' ? FormData : null);
    if (!FormDataCtor) throw mediaError('MEDIA_FORM_DATA_UNAVAILABLE', 'FormData is unavailable');
    const body = new FormDataCtor();
    body.append('path', toWorkspaceFilePath(assetPath));
    body.append('file', file, file.name || ('cover.' + validated.extension));
    await parseKernelResponse(await getFetch(opts)('/api/file/putFile', { method: 'POST', body: body }));
    return { kind: COVER_KINDS.UPLOAD, assetPath: assetPath };
}

async function removeUploadCover(cover, assetId, options) {
    const normalized = normalizeCover(cover);
    if (!isOwnedUploadCover(normalized, assetId)) return false;
    const response = await getFetch(options)('/api/file/removeFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toWorkspaceFilePath(normalized.assetPath) }),
    });
    await parseKernelResponse(response);
    return true;
}

async function renameUploadCover(cover, assetId, newAssetPath, options) {
    const normalized = normalizeCover(cover);
    const targetPath = String(newAssetPath || '').trim();
    if (!isOwnedUploadCover(normalized, assetId) || !isOwnedMediaPath(targetPath, assetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid owned upload cover path');
    }
    const response = await getFetch(options)('/api/file/renameFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: toWorkspaceFilePath(normalized.assetPath),
            newPath: toWorkspaceFilePath(targetPath),
        }),
    });
    await parseKernelResponse(response);
    return { kind: COVER_KINDS.UPLOAD, assetPath: targetPath };
}

async function copyUploadCoverToOwner(cover, sourceAssetId, targetAssetId, options) {
    const normalized = normalizeCover(cover);
    if (!isOwnedUploadCover(normalized, sourceAssetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid source upload cover path');
    }
    const filename = normalized.assetPath.split('/').pop();
    const targetPath = MEDIA_ROOT + '/' + String(targetAssetId || '').trim() + '/' + filename;
    if (!isOwnedMediaPath(targetPath, targetAssetId)) {
        throw mediaError('MEDIA_PATH_INVALID', 'Invalid target upload cover path');
    }
    const opts = options || {};
    const fetchFn = getFetch(opts);
    const sourceResponse = await fetchFn('/api/file/getFile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toWorkspaceFilePath(normalized.assetPath) }),
    });
    if (!sourceResponse || !sourceResponse.ok || typeof sourceResponse.blob !== 'function') {
        throw mediaError('MEDIA_API_FAILED', 'Failed to read source upload cover');
    }
    const blob = await sourceResponse.blob();
    const FormDataCtor = opts.FormData || (typeof FormData !== 'undefined' ? FormData : null);
    if (!FormDataCtor) throw mediaError('MEDIA_FORM_DATA_UNAVAILABLE', 'FormData is unavailable');
    const body = new FormDataCtor();
    body.append('path', toWorkspaceFilePath(targetPath));
    body.append('file', blob, filename);
    await parseKernelResponse(await fetchFn('/api/file/putFile', { method: 'POST', body: body }));
    return { kind: COVER_KINDS.UPLOAD, assetPath: targetPath };
}

async function cleanupReplacedCover(previousCover, nextCover, assetId, options) {
    const previous = normalizeCover(previousCover);
    const next = normalizeCover(nextCover);
    if (!isUploadCover(previous) || previous.assetPath === (next && next.assetPath)) return false;
    return removeUploadCover(previous, assetId, options);
}

async function cleanupDeletedCover(cover, assetId, options) {
    const normalized = normalizeCover(cover);
    // Deletion must never turn a persisted URL, preset, or arbitrary workspace
    // upload into a file mutation. Only this asset's generated upload path qualifies.
    if (!isOwnedUploadCover(normalized, assetId)) return false;
    return removeUploadCover(normalized, assetId, options);
}

module.exports = {
    MEDIA_ROOT: MEDIA_ROOT,
    LEGACY_MEDIA_ROOT: LEGACY_MEDIA_ROOT,
    WORKSPACE_DATA_ROOT: WORKSPACE_DATA_ROOT,
    PRESET_ICON_ROOT: PRESET_ICON_ROOT,
    DEFAULT_PRESET_ICON_ID: DEFAULT_PRESET_ICON_ID,
    MAX_UPLOAD_BYTES: MAX_UPLOAD_BYTES,
    COVER_MAX_DIMENSION: COVER_MAX_DIMENSION,
    COVER_QUALITY: COVER_QUALITY,
    COVER_COMPRESSED_THRESHOLD: COVER_COMPRESSED_THRESHOLD,
    COVER_QUALITY_LADDER: COVER_QUALITY_LADDER,
    COVER_DEFAULT_OUTPUT_SIZE: COVER_DEFAULT_OUTPUT_SIZE,
    decodeCoverImage: decodeCoverImage,
    cropAndEncodeCoverImage: cropAndEncodeCoverImage,
    processCoverImage: processCoverImage,
    ALLOWED_IMAGE_TYPES: ALLOWED_IMAGE_TYPES,
    COVER_KINDS: COVER_KINDS,
    normalizeWorkspaceAssetPath: normalizeWorkspaceAssetPath,
    toWorkspaceFilePath: toWorkspaceFilePath,
    isLegacyMediaMigrated: isLegacyMediaMigrated,
    resolvePhysicalAssetPath: resolvePhysicalAssetPath,
    migrateLegacyMediaRoot: migrateLegacyMediaRoot,
    isLegacyIconParkPreset: isLegacyIconParkPreset,
    normalizeCover: normalizeCover,
    isUploadCover: isUploadCover,
    isWorkspaceAssetCover: isWorkspaceAssetCover,
    isOwnedMediaPath: isOwnedMediaPath,
    isOwnedUploadCover: isOwnedUploadCover,
    resolveCoverUrl: resolveCoverUrl,
    createMediaPath: createMediaPath,
    createUploadSession: createUploadSession,
    cancelUploadSession: cancelUploadSession,
    isUploadSessionActive: isUploadSessionActive,
    validateImageFile: validateImageFile,
    uploadImage: uploadImage,
    removeUploadCover: removeUploadCover,
    renameUploadCover: renameUploadCover,
    copyUploadCoverToOwner: copyUploadCoverToOwner,
    cleanupReplacedCover: cleanupReplacedCover,
    cleanupDeletedCover: cleanupDeletedCover,
};
