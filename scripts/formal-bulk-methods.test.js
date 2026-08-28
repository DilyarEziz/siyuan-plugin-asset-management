'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'src.template.js'), 'utf8');

assert.match(source, /case "toggle-bulk-mode": this\.showToast\('ℹ️ ' \+ this\._t\('formalLaterFeature'/,
    'bulk mode remains explicitly unavailable in the formal UI');
assert.match(source, /case "bulk-clear": case "bulk-delete": case "bulk-change-status": case "bulk-add-tag": case "bulk-remove-tag":[\s\S]*?formalLaterFeature/,
    'every bulk command is a safe no-op');
console.log('[formal-bulk-methods] passed');
