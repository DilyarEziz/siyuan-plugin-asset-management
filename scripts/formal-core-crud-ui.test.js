'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createFormalV2AssetWrapper, FORMAL_ASSET_KIND } = require('../api/assets');

const clone = value => structuredClone(value);
const now = '2026-07-19T08:00:00.000Z';
const ids = [
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
];
const tagId = '20000000-0000-4000-8000-000000000001';

function freezeDate(iso) {
    const RealDate = Date;
    const fixedMs = RealDate.parse(iso);
    class FixedDate extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixedMs])); }
        static now() { return fixedMs; }
    }
    global.Date = FixedDate;
    return () => { global.Date = RealDate; };
}

function loadPlugin() {
    const original = Module._load;
    const nav = Object.getOwnPropertyDescriptor(global, 'navigator');
    const doc = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } addIcons() {} addTopBar() {} addCommand() {} addDock() {} }, Dialog: class {}, Menu: class {} };
        return original.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = original;
        if (nav) Object.defineProperty(global, 'navigator', nav); else delete global.navigator;
        if (doc) Object.defineProperty(global, 'document', doc); else delete global.document;
    }
}

function details(kind) {
    if (kind === 'physical') return { warrantyEndsOn: null, costGoal: null };
    if (kind === 'virtualSubscription') return { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: true };
    if (kind === 'virtualPerpetual') return { licenseAccountLabel: null };
    return { provider: kind === 'prepaidAmount' ? 'Store' : 'Gym', expiresOn: null };
}

function asset(kind, index) {
    return { id: ids[index], kind, name: 'Asset ' + index, status: 'active', currency: index % 2 ? 'USD' : 'CNY',
        acquiredOn: '2026-07-19', statusChangedOn: '2026-07-19', tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: now, updatedAt: now, details: details(kind) };
}

async function main() {
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    const restoreDate = freezeDate(now);
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    try {
        const state = { 'assets.json': createFormalV2AssetWrapper([], { updatedAt: now }), 'tags.json': { schemaVersion: 1, tags: [{ id: tagId, label: 'Core' }], updatedAt: now } };
        const Plugin = loadPlugin();
        const plugin = new Plugin({ async loadData(name) { return clone(state[name] == null ? null : state[name]); }, async saveData(name, value) { state[name] = clone(value); return true; } });
        plugin.loadPresetIconManifest = () => Promise.resolve();
        plugin.showToast = () => {};
        plugin.scheduleResourceIndexReconcile = () => {};
        await plugin.onload();

        const kinds = Object.values(FORMAL_ASSET_KIND);
        for (let index = 0; index < kinds.length; index++) await plugin.addAsset(asset(kinds[index], index), { purchaseAmountMinor: 1000 + index });
        assert.deepEqual(plugin.assets.map(item => item.kind).sort(), kinds.slice().sort());
        assert.equal(plugin._lifecycleEvents.filter(event => event.kind === 'created').length, 5,
            'each owned asset creation must write a canonical lifecycle event');
        assert.equal(plugin.applyFilter(plugin.assets.filter(item => item.status !== 'wishlist')).length, 5);
        plugin.filter.kind = FORMAL_ASSET_KIND.PREPAID_COUNT;
        assert.deepEqual(plugin.getHomeFilteredAssets().map(item => item.kind), [FORMAL_ASSET_KIND.PREPAID_COUNT]);

        await plugin.updateAsset(ids[0], { name: 'Updated', tagIds: [tagId], details: { warrantyEndsOn: '2027-01-01' } });
        assert.equal(plugin.assets.find(item => item.id === ids[0]).details.warrantyEndsOn, '2027-01-01');
        await assert.rejects(() => plugin.updateAsset(ids[0], { kind: FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL }), /kind|unknown|类型不可修改/i);
        await plugin.setStatus(ids[0], 'retired');
        assert.equal(plugin.assets.find(item => item.id === ids[0]).statusChangedOn, '2026-07-19');
        assert.equal(plugin._lifecycleEvents.some(event => event.kind === 'retired'
            && event.details.fromStatus === 'active' && event.details.toStatus === 'retired'), true,
        'status transitions must write a canonical lifecycle event');
        await plugin.deleteAsset(ids[4]);
        assert.equal(plugin.assets.some(item => item.id === ids[4]), false);
        assert.equal(state['tags.json'].tags.length, 1, 'asset deletion must not mutate the tag catalog');

        const legacyKeys = new Set(['assetType', 'type', 'virtualSubtype', 'prepaidKind', 'category', 'price', 'purchaseDate', 'expectedPrice', 'acquisitionAmountMinor']);
        state['assets.json'].assets.forEach(item => Object.keys(item).forEach(key => assert.equal(legacyKeys.has(key), false, 'persisted legacy key: ' + key)));
        assert.match(plugin.renderFormalAssetListCard(plugin.assets[0]), /am-formal-card/);
        assert.match(plugin.renderFormalAssetMatrixCard(plugin.assets[0]), /am-formal-card/);
        console.log('[formal-core-crud-ui] passed');
    } finally {
        restoreDate();
        if (documentDescriptor) Object.defineProperty(global, 'document', documentDescriptor); else delete global.document;
    }
}

main().catch(error => { console.error('[formal-core-crud-ui] failed:', error); process.exit(1); });
