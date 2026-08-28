'use strict';

/**
 * formal-v2 strict model layer test.
 *
 * 覆盖：
 *   - FORMAL_V2_SCHEMA_GENERATION === 'formal-v2'
 *   - newFormalV2Asset / validateFormalV2Asset / createFormalV2AssetWrapper / validateFormalV2AssetWrapper
 *   - 5 类白名单（physical / virtualSubscription / virtualPerpetual / prepaidAmount / prepaidCount）
 *   - v1 已删字段（usageTrackingEnabled / skipNextRenewal / renewalScore / versionLabel /
 *     virtualPerpetual.costGoal / wishlist categoryId/tagIds/notes）必须被 strict layer 拒绝
 *   - v2 wishlist 极简字段：name / cover / currency / wishlist 子对象
 *   - 顶层 reminderPolicy 在 v2 owned 资产中已被删除
 */

const assert = require('node:assert/strict');
const model = require('../api/assets');
const { createStableId } = require('../api/algorithms');

const ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = '2026-07-19T00:00:00.000Z';
const TODAY = '2026-07-19';
const options = { now: NOW, today: TODAY, currency: 'CNY' };
const TAG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TAG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function clone(value) { return structuredClone(value); }
function expectInvalid(fn, pattern) { assert.throws(fn, pattern); }

assert.equal(model.FORMAL_V2_SCHEMA_GENERATION, 'formal-v2');
assert.equal(model.FORMAL_V2_ASSET_SCHEMA_VERSION, 1);
assert.equal(typeof model.newFormalV2Asset, 'function');
assert.equal(typeof model.validateFormalV2Asset, 'function');
assert.equal(typeof model.createFormalV2AssetWrapper, 'function');
assert.equal(typeof model.validateFormalV2AssetWrapper, 'function');
assert.deepEqual(model.FORMAL_ASSET_KINDS, [
    'physical', 'virtualSubscription', 'virtualPerpetual', 'prepaidAmount', 'prepaidCount',
]);
// v2 detail keys (per kind) must not carry v1 dangling fields.
assert.deepEqual(model.FORMAL_V2_DETAIL_KEYS.physical, ['warrantyEndsOn', 'costGoal']);
assert.deepEqual(model.FORMAL_V2_DETAIL_KEYS.virtualSubscription, ['planName', 'accountLabel', 'billingPlan', 'autoRenew']);
assert.deepEqual(model.FORMAL_V2_DETAIL_KEYS.virtualPerpetual, ['licenseAccountLabel']);
assert.deepEqual(model.FORMAL_V2_DETAIL_KEYS.prepaidAmount, ['provider', 'expiresOn']);
assert.deepEqual(model.FORMAL_V2_DETAIL_KEYS.prepaidCount, ['provider', 'expiresOn']);
// v2 wishlist keys (minimal carrier — no categoryId / tagIds / notes / acquiredOn / status).
assert.deepEqual(model.FORMAL_V2_WISHLIST_KEYS, [
    'id', 'kind', 'name', 'status', 'currency', 'cover',
    'createdAt', 'updatedAt', 'wishlist',
]);

const seeds = {
    physical: { details: { warrantyEndsOn: null } },
    virtualSubscription: { details: { billingPlan: { cycle: 'yearly' }, autoRenew: true } },
    virtualPerpetual: { details: { licenseAccountLabel: 'account@example.test' } },
    prepaidAmount: { details: { provider: 'Transit', expiresOn: null } },
    prepaidCount: { details: { provider: 'Coffee' } },
};

// Normalize 5 kinds using v2 path; result must validate under v2 strict layer.
const owned = Object.keys(seeds).map((kind, index) => model.newFormalV2Asset(Object.assign({
    id: ID.slice(0, -1) + index,
    kind,
    name: '  Asset ' + index + '  ',
    tagIds: [TAG_B.toUpperCase(), TAG_A, TAG_B],
}, seeds[kind]), options));

owned.forEach((asset, index) => {
    assert.equal(model.validateFormalV2Asset(asset).valid, true, asset.kind + ' must validate under v2 strict layer');
    assert.deepEqual(model.normalizeFormalV2Asset(asset), asset, asset.kind + ' normalize must be idempotent');
    assert.equal(asset.name, 'Asset ' + index);
    assert.deepEqual(asset.tagIds, [TAG_B, TAG_A], 'tag UUIDs must be canonical, stable unique');
    // v2 invariants: no reminderPolicy on owned assets.
    assert.equal(Object.prototype.hasOwnProperty.call(asset, 'reminderPolicy'), false,
        'v2 owned asset must not carry top-level reminderPolicy');
});

// categoryId validation: physical accepts only physical categories; virtual refuses non-virtual categoryIds.
const categorizedPhysical = model.newFormalV2Asset({ id: '123e4567-e89b-42d3-a456-426614174098', kind: 'physical', name: 'Categorized', categoryId: 'digital' }, options);
assert.equal(categorizedPhysical.categoryId, 'digital');
expectInvalid(() => model.newFormalV2Asset({ id: '123e4567-e89b-42d3-a456-426614174097', kind: 'physical', name: 'Bad category', categoryId: 'member' }, options), /not allowed/);

// v2 wishlist minimal field set — must reject categoryId / tagIds / notes / reminderPolicy / details.
const wishSeed = {
    id: '123e4567-e89b-42d3-a456-426614174099',
    kind: 'physical',
    name: 'Camera',
    status: 'wishlist',
    wishlist: { expectedAmountMinor: 99900, reason: 'Maybe', targetGroup: 'physical' },
};
const wishBefore = clone(wishSeed);
const wishlist = model.newFormalV2Asset(wishSeed, options);
assert.deepEqual(wishSeed, wishBefore, 'newFormalV2Asset must not mutate input');
assert.equal(model.validateFormalV2Asset(wishlist).valid, true);
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'categoryId'), false, 'wishlist must not carry categoryId');
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'tagIds'), false, 'wishlist must not carry tagIds');
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'notes'), false, 'wishlist must not carry notes');
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'details'), false, 'wishlist must not carry details');
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'reminderPolicy'), false, 'wishlist must not carry reminderPolicy');
assert.equal(Object.prototype.hasOwnProperty.call(wishlist, 'acquiredOn'), false, 'wishlist must not carry acquiredOn');

// Injecting legacy fields into wishlist must be rejected.
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { tagIds: [TAG_A] }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { categoryId: 'digital' }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { notes: 'legacy' }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { details: { warrantyEndsOn: null } }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { reminderPolicy: { enabled: true, leadDays: [7] } }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { price: 1 }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { assetType: 'physical' }), options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { cover: { kind: 'none', imageUrl: 'old' } }), options), /cover contains unknown field/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { currency: 'NOPE' }), options), /currency must be ISO 4217/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { updatedAt: 'not-an-instant' }), options), /updatedAt must be a UTC ISO timestamp/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { currency: undefined }), options), /currency must be ISO 4217/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, wishSeed, { updatedAt: undefined }), options), /updatedAt must be a UTC ISO timestamp/);
expectInvalid(() => model.newFormalV2Asset({ kind: 'physical', name: 'Bad option' }, Object.assign({}, options, { currency: 'NOPE' })), /currency must be ISO 4217/);
expectInvalid(() => model.newFormalV2Asset({ kind: 'physical', name: 'Bad', acquisitionAmountMinor: 1 }, options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset({ kind: 'virtualSubscription', name: 'Bad', details: { billingPlan: { cycle: 'weekly' } } }, options), /cycle is invalid/);
expectInvalid(() => model.newFormalV2Asset({ kind: 'virtualSubscription', name: 'Bad money duplication', details: { billingPlan: { cycle: 'monthly', amountMinor: 1 } } }, options), /unknown field/);
expectInvalid(() => model.newFormalV2Asset({ kind: 'physical', name: 'Bad date', acquiredOn: '2026-99-99' }, options), /acquiredOn must be YYYY-MM-DD/);
expectInvalid(() => model.normalizeFormalV2Asset(Object.assign({}, owned[0], { currency: null }), options), /currency must be ISO 4217/);
expectInvalid(() => model.normalizeFormalV2Asset(Object.assign({}, owned[0], { updatedAt: null }), options), /updatedAt must be a UTC ISO timestamp/);
expectInvalid(() => model.newFormalV2Asset(Object.assign({}, owned[0], { reminderPolicy: { enabled: true, leadDays: [7] } }), options), /unknown field/);

// Patch path uses v2 strict layer.
const physical = owned[0];
const beforePatch = clone(physical);
const patched = model.mergeFormalV2AssetPatch(physical, {
    name: 'Renamed',
    details: { warrantyEndsOn: '2027-07-19' },
}, { now: '2026-07-20T00:00:00.000Z', today: TODAY });
assert.deepEqual(physical, beforePatch, 'v2 patch must not mutate source');
assert.equal(patched.kind, physical.kind);
assert.equal(patched.details.warrantyEndsOn, '2027-07-19');
assert.equal(patched.updatedAt, '2026-07-20T00:00:00.000Z');
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { kind: 'prepaidAmount' }, options), /kind cannot be changed/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { status: 'wishlist' }, options), /cannot cross/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { details: { provider: 'x' } }, options), /unknown field/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { price: 3 }, options), /unknown field/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { acquiredOn: 'bad-date' }, options), /acquiredOn must be YYYY-MM-DD/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { updatedAt: 'bad-instant' }, options), /updatedAt must be a UTC ISO timestamp/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { currency: 'BAD' }, options), /currency must be ISO 4217/);
expectInvalid(() => model.mergeFormalV2AssetPatch(physical, { reminderPolicy: { enabled: true, leadDays: [7] } }, options), /unknown field/);

// Each rejected detail field below is a v1 residue; the v2 strict DETAIL_KEYS whitelist
// must remove every one of them.
[
    ['physical', { dailyCostOverrideMinor: 75 }],
    ['virtualSubscription', { skipNextRenewal: true }],
    ['virtualSubscription', { renewalScore: 5 }],
    ['virtualSubscription', { usageTrackingEnabled: true }],
    ['virtualPerpetual', { versionLabel: '2026' }],
    ['virtualPerpetual', { costGoal: { targetDailyAmountMinor: 1, targetEndsOn: null } }],
    ['prepaidAmount', { accountLabel: 'old account' }],
    ['prepaidAmount', { unitLabel: '元' }],
    ['prepaidCount', { unitLabel: '杯' }],
    ['physical', { usageTrackingEnabled: true }],
    // unitLabel on virtualSubscription / virtualPerpetual must also be rejected.
    ['virtualPerpetual', { unitLabel: 'license' }],
].forEach(([kind, details]) => expectInvalid(() => model.newFormalV2Asset({
    id: createStableId(), kind, name: 'removed field', details,
}, options), /unknown field/));
expectInvalid(() => model.newFormalV2Asset({ kind: 'virtualSubscription', name: 'retired subscription', status: 'retired' }, options), /only allowed for physical/);

// Wrapper factory and validator must enforce v2 markers.
const wrapper = model.createFormalV2AssetWrapper(owned.concat(wishlist), { updatedAt: NOW });
assert.equal(wrapper.schemaGeneration, 'formal-v2');
assert.equal(wrapper.schemaVersion, 1);
assert.equal(model.validateFormalV2AssetWrapper(wrapper).valid, true);
const reordered = Object.fromEntries(Object.entries(owned[0]).reverse());
assert.equal(model.validateFormalV2Asset(reordered).valid, true, 'validation must not depend on object key order');
assert.deepEqual(wrapper.assets, owned.concat(wishlist));
// Validator must reject a wrapper whose generation is anything other than 'formal-v2'.
assert.equal(model.validateFormalV2AssetWrapper(Object.assign({}, wrapper, { schemaGeneration: 'legacy' })).valid, false);
assert.equal(model.validateFormalV2AssetWrapper(Object.assign({}, wrapper, { oldAssets: [] })).valid, false);
assert.match(model.validateFormalV2AssetWrapper(Object.assign({}, wrapper, { schemaGeneration: 'legacy' })).errors.join('\n'), /formal-v2/);
// Duplicate IDs are global.
const duplicateOwnedWrapper = model.createFormalV2AssetWrapper([owned[0], owned[0]], { updatedAt: NOW });
assert.equal(model.validateFormalV2AssetWrapper(duplicateOwnedWrapper).valid, false);
assert.match(model.validateFormalV2AssetWrapper(duplicateOwnedWrapper).errors.join('\n'), /globally unique/);
const duplicateOwnedWish = Object.assign({}, wishlist, { id: owned[0].id });
const ownedWishWrapper = Object.assign({}, wrapper, { assets: [owned[0], duplicateOwnedWish] });
assert.equal(model.validateFormalV2AssetWrapper(ownedWishWrapper).valid, false);
assert.match(model.validateFormalV2AssetWrapper(ownedWishWrapper).errors.join('\n'), /globally unique/);
const wishTwin = Object.assign({}, wishlist);
const twoWishesWrapper = Object.assign({}, wrapper, { assets: [wishlist, wishTwin] });
assert.equal(model.validateFormalV2AssetWrapper(twoWishesWrapper).valid, false);
assert.match(model.validateFormalV2AssetWrapper(twoWishesWrapper).errors.join('\n'), /globally unique/);
expectInvalid(() => model.createFormalV2AssetWrapper([
    Object.assign({}, owned[0], { acquiredOn: 'broken' }),
], { updatedAt: NOW }), /acquiredOn must be YYYY-MM-DD/);
expectInvalid(() => model.createFormalV2AssetWrapper([
    Object.assign({}, owned[0], { currency: 'broken' }),
], { updatedAt: NOW }), /currency must be ISO 4217/);
expectInvalid(() => model.createFormalV2AssetWrapper([
    Object.assign({}, owned[0], { updatedAt: 'broken' }),
], { updatedAt: NOW }), /updatedAt must be a UTC ISO timestamp/);
expectInvalid(() => model.createFormalV2AssetWrapper(owned, { updatedAt: 'broken' }), /updatedAt must be a UTC ISO timestamp/);

console.log('[formal-model] passed');
