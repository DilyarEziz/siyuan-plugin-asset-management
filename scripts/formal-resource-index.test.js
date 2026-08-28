'use strict';

const assert = require('node:assert/strict');
const index = require('../api/resource-index');

const tag = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const asset = {
    id: '123e4567-e89b-42d3-a456-426614174000', kind: 'physical', name: 'Camera', status: 'active',
    acquiredOn: '2026-07-01', tagIds: [tag], cover: { kind: 'workspaceAsset', assetPath: 'assets/camera.png' },
};
const summaries = index.buildFormalResourceSummaries([asset], [{ id: tag, label: '摄影' }]);
assert.deepEqual(summaries[0].tagLabels, ['摄影']);
assert.equal(summaries[0].kind, 'physical');
const reference = index.collectCoverReferences([asset], [{ id: tag, label: '摄影' }])[0];
const markdown = index.renderIndexMarkdown([reference]);
assert.match(markdown, /physical · active · 2026-07-01 · 摄影/);
assert.doesNotMatch(JSON.stringify(summaries), /assetType|category|purchaseDate|price|tags/);
console.log('[formal-resource-index] passed');
