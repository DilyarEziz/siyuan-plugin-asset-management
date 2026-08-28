'use strict';

const assert = require('node:assert/strict');
const { normalizeFinancialRecord } = require('../api/assets');
const { asset, createHarness } = require('./formal-workflow-harness');

const IDS = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
];

function purchase(assetId, amountMinor, id) {
    return normalizeFinancialRecord({
        id, assetId, occurredAt: '2026-07-01T08:00:00.000Z', effectiveDate: '2026-07-01',
        createdAt: '2026-07-01T08:00:00.000Z', source: 'user', correlationId: null,
        note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor,
    }, { now: '2026-07-01T08:00:00.000Z' });
}

function main() {
    const assets = [
        asset(IDS[0], 'physical', '相机'),
        asset(IDS[1], 'virtualSubscription', '订阅'),
        asset(IDS[2], 'virtualPerpetual', '软件'),
        asset(IDS[3], 'prepaidAmount', '储值卡'),
        asset(IDS[4], 'prepaidCount', '健身卡'),
    ];
    assets[0].tagIds = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
    assets[1].tagIds = ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
    const { plugin, document } = createHarness(assets);
    plugin._tags = [
        { id: assets[0].tagIds[0], label: '摄影' },
        { id: assets[0].tagIds[1], label: '工作' },
        { id: assets[1].tagIds[0], label: '订阅' },
    ];
    plugin._financialEvents = assets.map((item, index) => purchase(item.id, (index + 1) * 12345,
        `00000000-0000-4000-8000-00000000000${index + 1}`));

    const list = document.createElement('div');
    list.innerHTML = plugin.renderFormalAssetCollection(assets);
    document.body.appendChild(list);
    assert.equal(list.querySelectorAll('.am-asset-item').length, 5, 'list keeps one rich card for every formal kind');
    assert.ok(list.querySelector('.am-formal-card'), 'formal adapter renders cards');
    assert.match(list.textContent, /正式投影不可用/, 'formal VM renders a stable error card when its full projection is unavailable');

    plugin.settings.viewMode = 'matrix';
    const matrix = document.createElement('div');
    matrix.innerHTML = plugin.renderFormalAssetCollection(assets);
    document.body.appendChild(matrix);
    assert.equal(matrix.querySelectorAll('.am-asset-matrix').length, 5, 'matrix keeps one rich card for every formal kind');

    plugin._financialEvents = [{ assetId: IDS[1] }];
    assert.match(plugin.renderFormalAssetListCard(assets[1]), /am-formal-sidecar-error/, 'sidecar projection failure is stable and visible');
    console.log('[ui-parity-cards] passed');
}

try { main(); } catch (error) { console.error('[ui-parity-cards] failed:', error); process.exit(1); }
