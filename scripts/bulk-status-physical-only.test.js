'use strict';

// Historical bulk status was physical-only and depended on legacy newAsset().
// Formal-v1 keeps batch actions hidden until a canonical batch contract exists.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const template = fs.readFileSync(path.resolve(__dirname, '..', 'src.template.js'), 'utf8');
const start = template.indexOf('    renderBulkActionBar() {');
const end = template.indexOf('    handleAction(', start);

assert.notEqual(start, -1, 'bulk action renderer remains explicitly defined');
assert.notEqual(end, -1, 'bulk action renderer boundary exists');
const source = template.slice(start, end);
assert.match(source, /bulk-change-status/, 'formal UI keeps the action discoverable for its disabled contract');
assert.match(source, /disabled/, 'formal batch actions are hidden/disabled instead of applying legacy physical-only semantics');
assert.doesNotMatch(source, /assetType|newAsset/, 'formal batch UI does not read legacy asset fields');

console.log('[bulk-status-formal-disabled] passed');
