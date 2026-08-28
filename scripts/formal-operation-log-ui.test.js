'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'src.template.js'), 'utf8');

assert.match(source, /_newFormalOperationLog\(type, asset, oldValue, newValue, field\)/,
    'formal mutations share one operation-log factory');
assert.match(source, /change\.operationLogs = \[operation\]\.concat\(snapshot\.operationLogs \|\| \[\]\)/,
    'formal asset audit mutations commit their operation log in the same transaction');
assert.match(source, /removed \? this\._newFormalOperationLog\('delete', removed, removed, null, null\)/,
    'formal delete records a canonical pre-delete snapshot');
assert.match(source, /openFormalOperationLogDialog\(\)/,
    'settings use the formal snapshot-backed read-only log dialog');
assert.match(source, /mutateFormalAssetDomain\(snapshot => \{[\s\S]*operationLogs: nextLogs/,
    'log cleanup uses a formal domain transaction');
console.log('[formal-operation-log-ui] passed');
