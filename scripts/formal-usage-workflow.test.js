'use strict';
const assert = require('node:assert/strict');
const { asset, createHarness } = require('./formal-workflow-harness');
const ID = 'a3000000-0000-4000-8000-000000000001';

(async () => {
    const h = createHarness([asset(ID, 'virtualSubscription', 'Cloud')]);
    assert.equal(typeof h.plugin.addUsageRecord, 'undefined', 'usage writes are removed');
    assert.equal(typeof h.plugin.openUsageSheet, 'undefined', 'usage UI entry is removed');
    console.log('[formal-usage-workflow] passed');
})().catch(error => { console.error(error); process.exit(1); });
