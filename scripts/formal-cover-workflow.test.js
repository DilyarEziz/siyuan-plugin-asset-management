'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const media = require('../api/media');
const { newFormalV2Asset } = require('../api/assets');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'api', 'storage.js'), 'utf8');

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-07-20T08:00:00.000Z';
const formalBase = {
    id, kind: 'physical', name: 'Formal cover', status: 'active', currency: 'CNY',
    acquiredOn: '2026-07-20', statusChangedOn: '2026-07-20', categoryId: 'digital',
    tagIds: [], notes: '', createdAt: now, updatedAt: now,
    details: { warrantyEndsOn: null, costGoal: null },
};

for (const cover of [
    { kind: 'none' },
    { kind: 'upload', assetPath: 'assets/siyuan-plugin-asset-management/' + id + '/11111111-1111-4111-8111-111111111111.png' },
    { kind: 'workspaceAsset', assetPath: 'assets/existing/photo.png' },
    { kind: 'preset', presetId: 'icons8-box' },
    { kind: 'emoji', emoji: '📦' },
]) {
    assert.equal(newFormalV2Asset(Object.assign({}, formalBase, { cover }), { now, today: '2026-07-20' }).cover.kind, cover.kind);
}

assert.deepEqual(media.normalizeCover({ kind: 'legacyUrl', url: 'https://example.test/image.png' }), { kind: 'none' });
assert.deepEqual(media.normalizeCover({ imageUrl: 'assets/example.png' }), { kind: 'none' });
assert.equal(Object.prototype.hasOwnProperty.call(media.COVER_KINDS, 'LEGACY_URL'), false);
assert.doesNotMatch(fs.readFileSync(path.join(root, 'api', 'media.js'), 'utf8'), /normalizeLegacyUrl|legacyUrl|imageUrl|iconType/);
assert.doesNotMatch(storage, /normalizeCover\(.*imageUrl|imageUrl.*normalizeCover|legacyUrl|legacyPath/,
    'formal storage must not normalize a legacy cover into the formal cover model');
assert.match(storage, /readFormalResetPreflight[\s\S]*?legacyImageUrl/,
    'reset preflight may read legacy imageUrl as a read-only reset impact count');
assert.match(template, /data-formal-cover-preset/, 'formal sheet exposes preset selection');
assert.match(template, /data-formal-cover-upload/, 'formal sheet exposes upload selection');
assert.match(template, /data-close\]'\)\.onclick = \(\) => \{ void discardPendingCover\(\); mask\.remove\(\); \}/, 'cancel cleans a pending owned upload');
assert.match(template, /setDraftCover = async nextCover[\s\S]*?discardPendingCover\(\)/, 'replacement cleans a superseded pending owned upload');
assert.match(template, /media\.copyUploadCoverToOwner/, 'wishlist purchase copies private upload to its new owner');
assert.match(template, /renderAssetCoverContent\(asset, '📦', 'am-product-card__cover-image'/, 'formal detail renders formal cover union');

console.log('[formal-cover-workflow] passed');
