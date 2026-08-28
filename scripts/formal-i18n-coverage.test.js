'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'en_US.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'zh_CN.json'), 'utf8'));
const staticKeys = new Set();
const callPattern = /this\._t\(\s*["']([^"']+)["']/g;
let match;
while ((match = callPattern.exec(template))) staticKeys.add(match[1]);

assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'English and Chinese i18n key sets must match');
const missing = Array.from(staticKeys).filter(key => !Object.hasOwn(en, key) || !Object.hasOwn(zh, key));
assert.deepEqual(missing, [], 'every static _t() key in the formal UI must exist in both locales');

[
    'formalKindphysical', 'formalKindvirtualSubscription', 'formalKindvirtualPerpetual',
    'formalKindprepaidAmount', 'formalKindprepaidCount', 'formalCyclemonthly',
    'formalCyclequarterly', 'formalCyclehalfYearly', 'formalCycleyearly', 'formalCategorydigital',
    'formalCategoryprepaidCount', 'wishlistPurchaseAction', 'wishlistAbandonAction',
].forEach(key => assert.ok(Object.hasOwn(en, key), `required formal UI key is missing: ${key}`));

console.log('[formal-i18n-coverage] passed');
