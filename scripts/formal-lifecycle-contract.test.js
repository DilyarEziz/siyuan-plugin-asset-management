'use strict';

const assert = require('node:assert/strict');
const model = require('../api/assets');

const event = {
    id: '11111111-1111-4111-8111-111111111111', schemaVersion: 1,
    assetId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-07-20T00:00:00.000Z', effectiveDate: '2026-07-20',
    createdAt: '2026-07-20T00:00:00.000Z', source: 'user', correlationId: null,
    note: '', replacesEventId: null, voidedAt: null, kind: 'created', details: { initialStatus: 'active' },
};

assert.equal(model.validateFormalLifecycleRecord(event).valid, true);
assert.equal(model.validateFormalLifecycleRecord(Object.assign({}, event, { eventType: 'created' })).valid, false,
    'legacy lifecycle envelope fields must fail closed');
assert.equal(model.validateFormalLifecycleRecord(Object.assign({}, event, { kind: 'not-a-kind' })).valid, false);
const replacement = Object.assign({}, event, {
    id: '33333333-3333-4333-8333-333333333333', replacesEventId: event.id,
});
assert.equal(model.validateFormalLifecycleReplacementChain([event, replacement]).valid, false,
    'a replacement requires the original to be voided');
const voided = Object.assign({}, event, { voidedAt: '2026-07-20T01:00:00.000Z' });
assert.equal(model.validateFormalLifecycleReplacementChain([voided, replacement]).valid, true);
assert.equal(model.validateFormalLifecycleReplacementChain([replacement]).valid, false,
    'a replacement must not reference a missing lifecycle event');
assert.equal(model.validateFormalLifecycleReplacementChain([voided, Object.assign({}, replacement, {
    assetId: '44444444-4444-4444-8444-444444444444',
})]).valid, false, 'cross-asset lifecycle replacement is invalid');
const cyclic = Object.assign({}, voided, { replacesEventId: replacement.id });
assert.equal(model.validateFormalLifecycleReplacementChain([cyclic, replacement]).valid, false,
    'lifecycle replacement cycles are invalid');
console.log('[formal-lifecycle-contract] passed');
