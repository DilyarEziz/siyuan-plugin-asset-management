'use strict';

/**
 * v2.5.0 笔记双链批次 · 阶段1 —— 数据契约地基 headless 测试。
 *
 * 覆盖：
 *   - FORMAL_V2_OWNED_KEYS 白名单新增 indexBlockId / relatedNotes（wishlist 极简 schema 不变）
 *   - newFormalV2Asset 默认值：indexBlockId = null，relatedNotes = []
 *   - validateFormalV2Asset / normalize：新字段合法与非法用例
 *     （indexBlockId 传 number / 空串非法；relatedNotes 元素缺 id、未知键、坏时间戳非法）
 *   - mergeFormalV2AssetPatch：owned patch 白名单接受新字段；wishlist patch 拒绝
 *   - ≤2.4.2 存量 owned 资产缺键读取容忍为 null / []（无迁移无重置），未知键仍 fail-closed
 *   - DEFAULT_SETTINGS 含 6 个索引文档配置键；normalizeSettings 缺键回落默认值
 */

const assert = require('node:assert/strict');
const model = require('../api/assets');
const { DEFAULT_SETTINGS, normalizeSettings } = require('../api/storage');
const { createStableId } = require('../api/algorithms');

const NOW = '2026-08-17T00:00:00.000Z';
const TODAY = '2026-08-17';
const options = { now: NOW, today: TODAY, currency: 'CNY' };
const BLOCK_ID = '20260817000000-abcdefg';
const NOTE_DOC_ID = '20260816000000-note0001';

function ownedSeed(extra) {
    return Object.assign({
        id: createStableId(), kind: 'physical', name: 'Note link asset', currency: 'CNY',
    }, extra || {});
}
function wishlistSeed() {
    return {
        id: createStableId(), kind: 'physical', name: 'Wish item', status: 'wishlist',
        currency: 'CNY', wishlist: { reason: '', targetGroup: 'physical' },
    };
}
function expectInvalid(fn, pattern) { assert.throws(fn, pattern); }

// --- 白名单：owned 新增两键；wishlist 极简 schema 不变 -----------------------
assert.ok(model.FORMAL_V2_OWNED_KEYS.indexOf('indexBlockId') >= 0, 'owned whitelist carries indexBlockId');
assert.ok(model.FORMAL_V2_OWNED_KEYS.indexOf('relatedNotes') >= 0, 'owned whitelist carries relatedNotes');
assert.equal(model.FORMAL_V2_WISHLIST_KEYS.indexOf('indexBlockId'), -1, 'wishlist schema must not carry indexBlockId');
assert.equal(model.FORMAL_V2_WISHLIST_KEYS.indexOf('relatedNotes'), -1, 'wishlist schema must not carry relatedNotes');

// --- newFormalV2Asset 默认值 -------------------------------------------------
const fresh = model.newFormalV2Asset(ownedSeed(), options);
assert.equal(fresh.indexBlockId, null, 'indexBlockId defaults to null');
assert.deepEqual(fresh.relatedNotes, [], 'relatedNotes defaults to []');
assert.equal(model.validateFormalV2Asset(fresh).valid, true, 'fresh owned asset stays canonical');
assert.deepEqual(model.normalizeFormalV2Asset(fresh), fresh, 'normalize stays idempotent with note-link fields');

// --- 合法用例 ----------------------------------------------------------------
const linked = model.newFormalV2Asset(ownedSeed({
    indexBlockId: BLOCK_ID,
    relatedNotes: [{ id: NOTE_DOC_ID, title: '评测笔记', addedAt: NOW }],
}), options);
assert.equal(linked.indexBlockId, BLOCK_ID);
assert.deepEqual(linked.relatedNotes, [{ id: NOTE_DOC_ID, title: '评测笔记', addedAt: NOW }]);
assert.equal(model.validateFormalV2Asset(linked).valid, true, 'canonical note-linked asset validates');

// 元素 title 可为空串；addedAt 缺省回退 now（此处 = options.now）。
const noteDefaults = model.newFormalV2Asset(ownedSeed({ relatedNotes: [{ id: 'doc-1' }] }), options);
assert.deepEqual(noteDefaults.relatedNotes, [{ id: 'doc-1', title: '', addedAt: NOW }],
    'relatedNotes element defaults title/addedAt');
assert.equal(model.validateFormalV2Asset(noteDefaults).valid, true);

// 重复 id 去重（保留首条，tagIds 同款风格）。
const deduped = model.newFormalV2Asset(ownedSeed({
    relatedNotes: [
        { id: 'doc-1', title: 'First', addedAt: NOW },
        { id: 'doc-1', title: 'Duplicate', addedAt: NOW },
    ],
}), options);
assert.equal(deduped.relatedNotes.length, 1, 'duplicate relatedNotes ids dedupe');
assert.equal(deduped.relatedNotes[0].title, 'First');

// --- 非法用例 ----------------------------------------------------------------
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ indexBlockId: 123 }), options), /indexBlockId must be a string or null/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ indexBlockId: '' }), options), /indexBlockId must not be empty/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ indexBlockId: '   ' }), options), /indexBlockId must not be empty/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ indexBlockId: 'x'.repeat(65) }), options), /indexBlockId is too long/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: 'x' }), options), /relatedNotes must be an array/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: [{}] }), options), /relatedNotes\[0\]\.id must be a non-empty string/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: [{ id: '' }] }), options), /relatedNotes\[0\]\.id must be a non-empty string/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: [{ id: 42 }] }), options), /relatedNotes\[0\]\.id must be a non-empty string/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: [{ id: 'doc-1', unknownKey: 1 }] }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: [{ id: 'doc-1', addedAt: 'not-an-instant' }] }), options), /UTC ISO timestamp/);
expectInvalid(() => model.newFormalV2Asset(ownedSeed({ relatedNotes: ['doc-1'] }), options), /must be an object/);
// wishlist 分支不接受笔记双链字段。
expectInvalid(() => model.newFormalV2Asset(Object.assign(wishlistSeed(), { indexBlockId: BLOCK_ID }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign(wishlistSeed(), { relatedNotes: [] }), options), /unknown field/);

// --- patch 白名单 --------------------------------------------------------------
const patched = model.mergeFormalV2AssetPatch(fresh, {
    indexBlockId: BLOCK_ID,
    relatedNotes: [{ id: 'doc-2', title: '使用笔记', addedAt: NOW }],
}, options);
assert.equal(patched.indexBlockId, BLOCK_ID, 'patch accepts indexBlockId');
assert.equal(patched.relatedNotes.length, 1, 'patch accepts relatedNotes');
assert.equal(patched.relatedNotes[0].id, 'doc-2');
assert.equal(model.validateFormalV2Asset(patched).valid, true);
// patch 可以把 indexBlockId 清回 null。
const cleared = model.mergeFormalV2AssetPatch(patched, { indexBlockId: null }, options);
assert.equal(cleared.indexBlockId, null, 'patch can clear indexBlockId back to null');
assert.equal(cleared.relatedNotes.length, 1, 'clearing indexBlockId keeps relatedNotes');
// wishlist patch 拒绝笔记双链字段；owned patch 未知键仍拒绝。
const wish = model.newFormalV2Asset(wishlistSeed(), options);
expectInvalid(() => model.mergeFormalV2AssetPatch(wish, { indexBlockId: BLOCK_ID }, options), /unknown field/);
expectInvalid(() => model.mergeFormalV2AssetPatch(wish, { relatedNotes: [] }, options), /unknown field/);
expectInvalid(() => model.mergeFormalV2AssetPatch(fresh, { indexBlockIds: BLOCK_ID }, options), /unknown field/);

// --- ≤2.4.2 存量数据缺键读取容忍（无迁移无重置） ------------------------------
const legacy = Object.assign({}, fresh);
delete legacy.indexBlockId;
delete legacy.relatedNotes;
assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'indexBlockId'), false);
assert.equal(model.validateFormalV2Asset(legacy).valid, true,
    'legacy owned asset without note-link keys is read-tolerant');
const legacyPartial = Object.assign({}, fresh);
delete legacyPartial.relatedNotes;
assert.equal(model.validateFormalV2Asset(legacyPartial).valid, true,
    'partially missing note-link keys are read-tolerant');
// normalize 读取路径补默认值。
assert.equal(model.normalizeFormalV2Asset(legacy).indexBlockId, null);
assert.deepEqual(model.normalizeFormalV2Asset(legacy).relatedNotes, []);
// 未知键仍 fail-closed（容忍只覆盖约定缺键）。
const injected = Object.assign({}, legacy, { noteLinkUrl: 'https://example.test' });
assert.equal(model.validateFormalV2Asset(injected).valid, false, 'unknown keys stay fail-closed');
// wishlist 存量资产不受影响（本就不携带这两个键）。
assert.equal(model.validateFormalV2Asset(wish).valid, true, 'wishlist assets remain valid unchanged');

// --- DEFAULT_SETTINGS 6 键 + normalizeSettings 缺键容忍 -----------------------
assert.equal(DEFAULT_SETTINGS.indexEnabled, false);
assert.equal(DEFAULT_SETTINGS.indexNotebookId, '');
assert.equal(DEFAULT_SETTINGS.indexDocPath, '/资产管理插件索引文档——不建议手动操作');
assert.equal(DEFAULT_SETTINGS.indexDocId, '');
assert.equal(DEFAULT_SETTINGS.indexAutoSync, true);
assert.equal(DEFAULT_SETTINGS.indexIncludeCover, false);

const normalizedNull = normalizeSettings(null);
assert.equal(normalizedNull.indexEnabled, false, 'null settings fall back to defaults');
assert.equal(normalizedNull.indexDocPath, '/资产管理插件索引文档——不建议手动操作');

const normalizedEmpty = normalizeSettings({});
assert.equal(normalizedEmpty.indexEnabled, false);
assert.equal(normalizedEmpty.indexNotebookId, '');
assert.equal(normalizedEmpty.indexDocPath, '/资产管理插件索引文档——不建议手动操作');
assert.equal(normalizedEmpty.indexDocId, '');
assert.equal(normalizedEmpty.indexAutoSync, true);
assert.equal(normalizedEmpty.indexIncludeCover, false);

// 非法值回落默认；既有键保留（Object.assign 合并，不整体覆写）。
const normalizedDirty = normalizeSettings({
    indexEnabled: 'yes', indexNotebookId: 'garbage', indexDocPath: '   ',
    indexDocId: 'not-an-id', indexAutoSync: null, indexIncludeCover: 1,
    preferredCurrency: 'USD',
});
assert.equal(normalizedDirty.indexEnabled, false, 'non-boolean indexEnabled falls back to false');
assert.equal(normalizedDirty.indexNotebookId, '', 'invalid notebook id falls back to empty');
assert.equal(normalizedDirty.indexDocPath, '/资产管理插件索引文档——不建议手动操作',
    'blank indexDocPath falls back to default');
assert.equal(normalizedDirty.indexDocId, '', 'invalid document id falls back to empty');
assert.equal(normalizedDirty.indexAutoSync, true, 'indexAutoSync defaults true unless explicitly false');
assert.equal(normalizedDirty.indexIncludeCover, false, 'non-boolean indexIncludeCover falls back to false');
assert.equal(normalizedDirty.preferredCurrency, 'USD', 'existing settings keys are preserved');

// 合法值原样通过（Studio 笔记本 id 为合法内核 ID 形态）。
const normalizedClean = normalizeSettings({
    indexEnabled: true,
    indexNotebookId: '20250330182153-k3b63hf',
    indexDocPath: '/资产索引',
    indexDocId: '20260817000100-abcdefg',
    indexAutoSync: false,
    indexIncludeCover: true,
});
assert.equal(normalizedClean.indexEnabled, true);
assert.equal(normalizedClean.indexNotebookId, '20250330182153-k3b63hf');
assert.equal(normalizedClean.indexDocPath, '/资产索引');
assert.equal(normalizedClean.indexDocId, '20260817000100-abcdefg');
assert.equal(normalizedClean.indexAutoSync, false);
assert.equal(normalizedClean.indexIncludeCover, true);

console.log('[note-link-contract] passed');
