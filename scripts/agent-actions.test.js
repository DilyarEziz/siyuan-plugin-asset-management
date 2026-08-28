'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agentActions = require('../api/agent-actions');
const storageApi = require('../api/storage');
const { asset, createHarness } = require('./formal-workflow-harness');

const ROOT = path.join(__dirname, '..');
const PHYSICAL_ID = '11111111-1111-4111-8111-111111111111';
const SUBSCRIPTION_ID = '22222222-2222-4222-8222-222222222222';
const PREPAID_ID = '33333333-3333-4333-8333-333333333333';
const TAG_WORK_ID = '66666666-6666-4666-8666-666666666666';
const TAG_HOME_ID = '77777777-7777-4777-8777-777777777777';

function completeDomain(assets, tags) {
    return {
        assets: assets || [],
        tags: tags || [],
        financialEvents: [],
        subscriptionPeriods: [],
        prepaidTransactions: [],
        maintenance: [],
        usage: [],
        lifecycleEvents: [],
        wishlistEvents: [],
        operationLogs: [],
    };
}

function allPermissions(patch) {
    return Object.assign({}, agentActions.AGENT_DEFAULT_SETTINGS, {
        aiEnabled: true,
        aiAllowQuery: true,
        aiAllowCreate: true,
        aiAllowModify: true,
        aiAllowLifecycle: true,
        aiAllowRecords: true,
        aiAllowDelete: true,
    }, patch || {});
}

function agentRequestPath(id, stage) {
    return 'agent-writes/' + stage + '/' + encodeURIComponent(id) + '.json';
}

function enqueueAgentRequest(harness, id, method, args) {
    const manifestPath = 'agent-writes/pending-manifest.json';
    const current = harness.state[manifestPath];
    const manifest = typeof current === 'string' ? JSON.parse(current) : (current || { schemaVersion: 1, requests: [] });
    manifest.requests.push({ id, createdAt: new Date().toISOString() });
    harness.state[manifestPath] = manifest;
    harness.state[agentRequestPath(id, 'pending')] = {
        id, method, args: Array.isArray(args) ? args : [], createdAt: new Date().toISOString(),
    };
}

function createSharedWebLockMock() {
    let held = false;
    const calls = [];
    return {
        calls,
        request(name, options, callback) {
            calls.push({ name, options });
            assert.equal(options && options.ifAvailable, true);
            if (held) return Promise.resolve().then(() => callback(null));
            held = true;
            return Promise.resolve()
                .then(() => callback({ name }))
                .finally(() => { held = false; });
        },
    };
}

function installWebLockMock(locks) {
    if (!global.navigator) global.navigator = { userAgent: '' };
    global.navigator.locks = locks;
}

function completedAgentResult(harness, id) {
    const raw = harness.state[agentRequestPath(id, 'completed')];
    assert.ok(raw, 'completed result exists for ' + id);
    const file = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return file.result;
}

async function invoke(handler, args) {
    const transport = await handler(args);
    const encoded = transport && (transport.result || transport.error);
    assert.equal(typeof encoded, 'string', 'action returns the official Agent string envelope');
    return { transport, body: JSON.parse(encoded) };
}

const FORBIDDEN_AGENT_ERROR_TEXT = /patch\.[A-Za-z0-9_.-]+|\bUUID\b|\bformal(?:-v\d+)?\b|\bschema\b|\bsidecar\b|(?:assets|settings|financialEvents|subscriptionPeriods|prepaidTransactions)\.json|[A-Za-z]:[\\/]|(?:^|\s)at\s+[^\s(]+\s*\(/i;

function assertSafeAgentError(error, expectedCode, expectedLocale) {
    assert.equal(error.code, expectedCode);
    assert.equal(error.locale, expectedLocale);
    assert.equal(typeof error.message, 'string');
    assert.equal(typeof error.recovery, 'string');
    assert.doesNotMatch(error.message, FORBIDDEN_AGENT_ERROR_TEXT);
    assert.doesNotMatch(error.recovery, FORBIDDEN_AGENT_ERROR_TEXT);
}

function makeAssets() {
    return [
        asset(PHYSICAL_ID, 'physical', 'Alpha desk'),
        asset(SUBSCRIPTION_ID, 'virtualSubscription', 'Beta cloud'),
        asset(PREPAID_ID, 'prepaidCount', 'Gamma gym'),
        asset('44444444-4444-4444-8444-444444444444', 'physical', 'Delta chair'),
        asset('55555555-5555-4555-8555-555555555555', 'physical', 'Epsilon lamp'),
    ];
}

function testSettingsMigrationAndHelpers() {
    assert.deepEqual(agentActions.normalizeAgentSettings({}), agentActions.AGENT_DEFAULT_SETTINGS);
    assert.deepEqual(agentActions.AGENT_ACTION_NAMES, [
        'asset_query', 'asset_create', 'asset_update', 'asset_lifecycle', 'asset_price_update', 'asset_record', 'asset_delete',
        'asset_tag_update', 'asset_tag_create',
    ]);
    agentActions.AGENT_ACTION_NAMES.forEach(name => {
        assert.equal(typeof agentActions.AGENT_ACTION_DESCRIPTIONS[name], 'string');
        assert.ok(agentActions.AGENT_ACTION_DESCRIPTIONS[name].length > 40);
    });

    const migrated = storageApi.normalizeSettings({
        runtimeFlag: 'keep',
        aiEnabled: true,
        aiPrivacyScope: 'all',
        aiIncludeFinancial: true,
        aiIncludeNotes: true,
        aiMaxAssets: 50,
        aiLanguage: 'en-US',
    });
    assert.equal(migrated.runtimeFlag, 'keep');
    assert.equal(migrated.aiEnabled, true);
    assert.equal(migrated.aiAllowQuery, true);
    ['aiAllowCreate', 'aiAllowModify', 'aiAllowLifecycle', 'aiAllowRecords', 'aiAllowDelete']
        .forEach(key => assert.equal(migrated[key], false));
    agentActions.LEGACY_AGENT_SETTING_KEYS.forEach(key => {
        assert.equal(Object.prototype.hasOwnProperty.call(migrated, key), false, 'legacy setting removed: ' + key);
    });

    const projected = agentActions.projectSafeAsset(makeAssets()[0], completeDomain(makeAssets()), { includeNotes: true });
    assert.equal(projected.id, PHYSICAL_ID);
    assert.equal(projected.cover.kind, 'none');
    assert.equal(Object.prototype.hasOwnProperty.call(projected, 'indexBlockId'), false);
}

async function testPermissionMatrix() {
    const domain = completeDomain(makeAssets());
    let settings = allPermissions();
    let writes = 0;
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => settings,
        getDomain: () => domain,
        methods: {
            recordPhysicalSaleAsset: async () => { writes++; return domain.assets[0]; },
            renewSubscription: async () => { writes++; return domain.assets[1]; },
        },
    });

    settings = allPermissions({ aiEnabled: false });
    assert.equal((await invoke(handlers.asset_query, { op: 'count' })).body.error.code, 'AGENT_DISABLED');

    const matrix = [
        ['asset_query', 'aiAllowQuery'],
        ['asset_create', 'aiAllowCreate'],
        ['asset_update', 'aiAllowModify'],
        ['asset_lifecycle', 'aiAllowLifecycle'],
        ['asset_record', 'aiAllowRecords'],
        ['asset_delete', 'aiAllowDelete'],
    ];
    for (const [actionName, permission] of matrix) {
        settings = allPermissions({ [permission]: false });
        const result = await invoke(handlers[actionName], {});
        assert.equal(result.body.error.code, 'PERMISSION_DENIED', actionName + ' checks ' + permission);
    }

    settings = allPermissions({ aiAllowRecords: false });
    const sale = await invoke(handlers.asset_lifecycle, {
        op: 'sale', assetId: PHYSICAL_ID, soldOn: '2026-08-18', priceMinor: 1000,
    });
    assert.equal(sale.body.error.code, 'PERMISSION_DENIED');
    const renewal = await invoke(handlers.asset_lifecycle, {
        op: 'renewSubscription', assetId: SUBSCRIPTION_ID, startDate: '2026-08-18',
        endDate: '2026-09-17', amountMinor: 1200, cycle: 'monthly',
    });
    assert.equal(renewal.body.error.code, 'PERMISSION_DENIED');
    assert.equal(writes, 0, 'sale and renewal cannot bypass the live records permission');
}

async function testStableUserErrorBoundary() {
    const domain = completeDomain(makeAssets());
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => domain,
    });

    const unknownField = await invoke(handlers.asset_update, {
        locale: 'zh-CN', assetId: PHYSICAL_ID, patch: { 'details.unknown': 'leak-me' },
    });
    assertSafeAgentError(unknownField.body.error, 'UNKNOWN_FIELD', 'zh-CN');
    assert.match(unknownField.body.error.recovery, /移除/);
    assert.doesNotMatch(JSON.stringify(unknownField.body.error), /leak-me/);

    const invalidKind = await invoke(handlers.asset_record, {
        locale: 'en-US', op: 'subscriptionPaymentAmount', assetId: PHYSICAL_ID, amountMinor: 2000,
    });
    assertSafeAgentError(invalidKind.body.error, 'INVALID_KIND', 'en-US');
    assert.match(invalidKind.body.error.recovery, /Query|query/);

    const invalidAction = await invoke(handlers.asset_price_update, {
        locale: 'zh_CN', action: 'create', assetId: PHYSICAL_ID, amountMinor: 2000,
    });
    assertSafeAgentError(invalidAction.body.error, 'INVALID_ACTION', 'zh-CN');
    assert.match(invalidAction.body.error.recovery, /action/);

    const deniedHandlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions({ aiAllowQuery: false }),
        getDomain: () => domain,
    });
    const denied = await invoke(deniedHandlers.asset_query, { locale: 'zh-CN', op: 'count' });
    assertSafeAgentError(denied.body.error, 'PERMISSION_DENIED', 'zh-CN');
    assert.match(denied.body.error.recovery, /资产管理设置 → AI/);
    const legacyDenied = await invoke(deniedHandlers.asset_query, { op: 'count' });
    assert.equal(legacyDenied.body.error.locale, 'en-US');
    assert.match(legacyDenied.body.error.message, /资产管理设置 → AI/);

    const mapped = [
        ['UNKNOWN_FIELD', 'args.patch.details.secret is not supported'],
        ['INVALID_KIND', 'subscription asset is required'],
        ['INVALID_ACTION', 'asset_price_update requires action=update'],
        ['INVALID_STATUS', 'purchaseAmount requires an owned asset'],
        ['INVALID_AMOUNT', 'invalid subscription payment amount'],
        ['DOMAIN_UNAVAILABLE', 'formal asset data is not fully loaded at D:\\SiYuan\\assets.json'],
        ['PERMISSION_DENIED', 'permission is disabled for this tool'],
        ['AGENT_DISABLED', 'official Agent tools are disabled'],
    ];
    mapped.forEach(([code, message]) => {
        const body = JSON.parse(agentActions.failure(Object.assign(new Error(message), { agentCode: code }), 'zh-CN'));
        assertSafeAgentError(body.error, code, 'zh-CN');
    });

    const writeTimeoutEn = JSON.parse(agentActions.failure(
        Object.assign(new Error('frontend plugin did not respond'), { agentCode: 'WRITE_TIMEOUT' }),
        'en-US'
    ));
    assertSafeAgentError(writeTimeoutEn.error, 'WRITE_TIMEOUT', 'en-US');
    assert.equal(writeTimeoutEn.error.message, 'The Agent write request timed out because the frontend plugin did not respond.');
    assert.match(writeTimeoutEn.error.recovery, /Reload Asset Management|restart SiYuan/);

    const writeTimeoutZh = JSON.parse(agentActions.failure(
        Object.assign(new Error('前端插件未响应'), { agentCode: 'WRITE_TIMEOUT' }),
        'zh-CN'
    ));
    assertSafeAgentError(writeTimeoutZh.error, 'WRITE_TIMEOUT', 'zh-CN');
    assert.equal(writeTimeoutZh.error.message, 'Agent 写入请求超时，前端插件未响应。');
    assert.match(writeTimeoutZh.error.recovery, /重载资产管理插件|重启思源/);

    [
        ['QUEUE_CORRUPT', /重载资产管理插件|重启思源/],
        ['QUEUE_UNAVAILABLE', /重载资产管理插件|重启思源/],
    ].forEach(([code, recoveryPattern]) => {
        const body = JSON.parse(agentActions.failure(
            Object.assign(new Error('injected queue failure'), { agentCode: code }),
            'zh-CN'
        ));
        assertSafeAgentError(body.error, code, 'zh-CN');
        assert.match(body.error.recovery, recoveryPattern);
    });

    [
        Object.assign(new Error('formal schema reset required'), { agentCode: 'FORMAL_SCHEMA_RESET_REQUIRED' }),
        Object.assign(new Error('formal storage read failed'), { code: 'FORMAL_STORAGE_READ_FAILED' }),
        Object.assign(new Error('storage read failed'), { agentCode: 'STORAGE_READ_FAILED' }),
        Object.assign(new Error('storage write failed'), { code: 'STORAGE_WRITE_FAILED' }),
        Object.assign(new Error('file does not exist'), { code: 'ENOENT' }),
    ].forEach(error => {
        const body = JSON.parse(agentActions.failure(error, 'en-US'));
        assertSafeAgentError(body.error, 'ACTION_FAILED', 'en-US');
    });

    const overlap = JSON.parse(agentActions.failure(new Error('subscription period overlaps an existing billing period: subscriptionPeriods[0]'), 'en-US'));
    assertSafeAgentError(overlap.error, 'SUBSCRIPTION_PERIOD_OVERLAP', 'en-US');

    const renewal = JSON.parse(agentActions.failure(Object.assign(new Error('subscription billing cycle is missing'), { agentCode: 'ACTION_FAILED' }), 'zh-CN'));
    assertSafeAgentError(renewal.error, 'ACTION_FAILED', 'zh-CN');
    assert.match(renewal.error.message, /续费/);

    const unknown = JSON.parse(agentActions.failure(new Error('formal-v2 sidecar assets.json failed at D:\\SiYuan\\storage\\assets.json\n    at writeJson (storage.js:1:1)'), 'en-US'));
    assertSafeAgentError(unknown.error, 'ACTION_FAILED', 'en-US');
}

async function testQueryPaginationAndSummaryFallback() {
    const domain = completeDomain(makeAssets());
    let settings = allPermissions();
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => settings,
        getDomain: () => domain,
        methods: {},
    });
    const page = await invoke(handlers.asset_query, { op: 'search', offset: 1, pageSize: 2 });
    assert.equal(page.body.ok, true);
    assert.equal(page.body.data.length, 2);
    assert.deepEqual(page.body.data.map(item => item.name), ['Beta cloud', 'Gamma gym']);
    assert.equal(page.body.meta.total, 5);
    assert.equal(page.body.meta.offset, 1);
    assert.equal(page.body.meta.pageSize, 2);
    assert.equal(page.body.meta.hasMore, true);

    domain.financialEvents = [{ assetId: PHYSICAL_ID, localPath: 'D:/SiYuan/private.json' }];
    const summary = await invoke(handlers.asset_query, { op: 'summary' });
    assert.equal(summary.body.ok, true, 'unstable derived report fields fall back to stable counts');
    assert.equal(summary.body.data.counts.total, 5);
    assert.deepEqual(summary.body.data.risk, {});
    assert.ok(!JSON.stringify(summary.body).includes('D:/SiYuan'));

    settings = allPermissions({ aiAllowQuery: false });
    assert.equal((await invoke(handlers.asset_query, { op: 'count' })).body.error.code, 'PERMISSION_DENIED');
}

async function testCreateUpdateDeleteMapping() {
    const domain = completeDomain(makeAssets());
    const calls = [];
    const methods = {
        async addAsset(data, options) {
            calls.push(['addAsset', data.id, options]);
            domain.assets.push(data);
            return data;
        },
        async updateAsset(id, patch) {
            calls.push(['updateAsset', id, patch]);
            const current = domain.assets.find(item => item.id === id);
            const updated = Object.assign({}, current, patch, { updatedAt: '2026-08-18T00:00:00.000Z' });
            domain.assets = domain.assets.map(item => item.id === id ? updated : item);
            return updated;
        },
        async deleteAsset(id) {
            calls.push(['deleteAsset', id]);
            domain.assets = domain.assets.filter(item => item.id !== id);
            return true;
        },
    };
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => domain,
        methods: methods,
    });
    const created = await invoke(handlers.asset_create, {
        data: {
            kind: 'physical', name: 'Created camera', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-18', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
        purchaseAmountMinor: 1,
    });
    assert.equal(created.body.ok, true);
    assert.equal(calls[0][0], 'addAsset');
    assert.equal(calls[0][2].purchaseAmountMinor, 1);

    const updated = await invoke(handlers.asset_update, { assetId: PHYSICAL_ID, patch: { name: 'Renamed desk' } });
    assert.equal(updated.body.data.name, 'Renamed desk');
    assert.deepEqual(calls[1], ['updateAsset', PHYSICAL_ID, { name: 'Renamed desk' }]);

    const removed = await invoke(handlers.asset_delete, { assetId: PHYSICAL_ID });
    assert.equal(removed.body.data.deleted, true);
    assert.deepEqual(calls[2], ['deleteAsset', PHYSICAL_ID]);

    const legacyCreated = await invoke(handlers.asset_create, {
        data: Object.assign({}, makeAssets()[4], { id: '66666666-6666-4666-8666-666666666666' }),
        options: { purchaseAmountMinor: 1 },
    });
    assert.equal(legacyCreated.body.ok, true, 'legacy nested numeric amount remains compatible');
    assert.equal(calls[3][2].purchaseAmountMinor, 1);

    const missingMethodHandlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => completeDomain([]),
        methods: {},
    });
    const unavailable = await invoke(missingMethodHandlers.asset_create, {
        data: {
            kind: 'physical', name: 'No method', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-18', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
    });
    assert.equal(unavailable.body.error.code, 'METHOD_UNAVAILABLE');
}

async function testPurchaseAmountRecoveryMapping() {
    const domain = completeDomain(makeAssets());
    const calls = [];
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => domain,
        methods: {
            async correctPurchaseAmount(id, input) {
                calls.push(['purchase', id, input]);
                return domain.assets.find(item => item.id === id);
            },
            async correctSubscriptionPaymentAmount(id, input) {
                calls.push(['subscription', id, input]);
                return domain.assets.find(item => item.id === id);
            },
        },
    });
    const recorded = await invoke(handlers.asset_record, {
        op: 'purchaseAmount', assetId: PHYSICAL_ID, amountMinor: '9900',
    });
    assert.equal(recorded.body.ok, true);
    assert.deepEqual(calls[0], ['purchase', PHYSICAL_ID, { amountMinor: 9900 }]);

    const subscription = await invoke(handlers.asset_record, {
        op: 'purchaseAmount', assetId: SUBSCRIPTION_ID, amountMinor: 9900,
    });
    assert.equal(subscription.body.error.code, 'INVALID_KIND');

    const subscriptionCorrected = await invoke(handlers.asset_record, {
        op: 'subscriptionPaymentAmount', assetId: SUBSCRIPTION_ID, amountMinor: 2000,
    });
    assert.equal(subscriptionCorrected.body.ok, true);
    assert.deepEqual(calls[1], ['subscription', SUBSCRIPTION_ID, { amountMinor: 2000 }]);
    const wrongKind = await invoke(handlers.asset_record, {
        op: 'subscriptionPaymentAmount', assetId: PHYSICAL_ID, amountMinor: 2000,
    });
    assert.equal(wrongKind.body.error.code, 'INVALID_KIND');
    const zeroSubscriptionAmount = await invoke(handlers.asset_record, {
        op: 'subscriptionPaymentAmount', assetId: SUBSCRIPTION_ID, amountMinor: 0,
    });
    assert.equal(zeroSubscriptionAmount.body.error.code, 'INVALID_AMOUNT');

    const malformed = await invoke(handlers.asset_create, {
        data: {
            kind: 'physical', name: 'Bad price', status: 'active', currency: 'CNY',
            acquiredOn: '2026-08-18', categoryId: 'digital', tagIds: [], cover: { kind: 'none' },
            notes: '', details: { warrantyEndsOn: null, costGoal: null },
        },
        options: { purchaseAmountMinor: '99.00' },
    });
    assert.equal(malformed.body.error.code, 'INVALID_AMOUNT');

    const integration = createHarness([asset(PHYSICAL_ID, 'physical', 'Unpriced desk')]);
    const integrationHandlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => completeDomain(integration.plugin.assets),
        methods: { correctPurchaseAmount: integration.plugin.correctPurchaseAmount.bind(integration.plugin) },
    });
    const integrated = await invoke(integrationHandlers.asset_record, {
        op: 'purchaseAmount', assetId: PHYSICAL_ID, amountMinor: 9900,
    });
    assert.equal(integrated.body.ok, true);
    const events = integration.state['financialEvents.json'].events;
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'purchase');
    assert.equal(events[0].amountMinor, 9900);

    const subscriptionIntegration = createHarness([]);
    const subscriptionAsset = await subscriptionIntegration.plugin.addAsset(
        asset(SUBSCRIPTION_ID, 'virtualSubscription', 'QQ music'),
        { purchaseAmountMinor: 1800 },
    );
    const subscriptionHandlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => completeDomain(subscriptionIntegration.plugin.assets),
        methods: { correctSubscriptionPaymentAmount: subscriptionIntegration.plugin.correctSubscriptionPaymentAmount.bind(subscriptionIntegration.plugin) },
    });
    const subscriptionResult = await invoke(subscriptionHandlers.asset_record, {
        op: 'subscriptionPaymentAmount', assetId: subscriptionAsset.id, amountMinor: 2000,
    });
    assert.equal(subscriptionResult.body.ok, true);
    const subscriptionEvents = subscriptionIntegration.state['financialEvents.json'].events;
    const activePayments = subscriptionEvents.filter(event => event.eventType === 'subscriptionPayment' && !event.voidedAt);
    assert.equal(activePayments.length, 1, 'subscription correction keeps one active payment');
    assert.equal(activePayments[0].amountMinor, 2000);
    const oldPayment = subscriptionEvents.find(event => event.amountMinor === 1800);
    assert.ok(oldPayment && oldPayment.voidedAt, 'previous payment remains as voided audit history');
    const activePeriod = subscriptionIntegration.state['subscriptionPeriods.json'].records.find(period => !period.voidedAt);
    assert.equal(activePeriod.paymentEventId, activePayments[0].id, 'billing period points to replacement payment');
}

async function testDedicatedPriceUpdate() {
    const domain = completeDomain(makeAssets());
    const calls = [];
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => domain,
        methods: {
            async correctPurchaseAmount(id, input) { calls.push(['purchase', id, input]); return domain.assets.find(item => item.id === id); },
            async correctSubscriptionPaymentAmount(id, input) { calls.push(['subscription', id, input]); return domain.assets.find(item => item.id === id); },
        },
    });
    const physical = await invoke(handlers.asset_price_update, {
        action: 'update', assetId: PHYSICAL_ID, amountMinor: 2000,
    });
    assert.equal(physical.body.ok, true);
    assert.deepEqual(calls[0], ['purchase', PHYSICAL_ID, { amountMinor: 2000 }]);
    assert.equal(physical.body.data.eventType, 'purchase');

    const subscription = await invoke(handlers.asset_price_update, {
        action: 'update', assetId: SUBSCRIPTION_ID, amountMinor: 2000,
    });
    assert.equal(subscription.body.ok, true);
    assert.deepEqual(calls[1], ['subscription', SUBSCRIPTION_ID, { amountMinor: 2000 }]);
    assert.equal(subscription.body.data.eventType, 'subscriptionPayment');

    const wrongAction = await invoke(handlers.asset_price_update, {
        action: 'create', assetId: PHYSICAL_ID, amountMinor: 2000,
    });
    assert.equal(wrongAction.body.error.code, 'INVALID_ACTION');
}

async function testAgentFieldRoutingAndLocalization() {
    const physical = asset(PHYSICAL_ID, 'physical', 'Desk');
    physical.categoryId = 'digital';
    const subscription = asset(SUBSCRIPTION_ID, 'virtualSubscription', 'Cloud');
    const tag = { id: TAG_WORK_ID, label: 'Work', createdAt: '2026-08-18T00:00:00.000Z' };
    physical.tagIds = [tag.id];
    const domain = completeDomain([physical, subscription], [tag]);
    const calls = [];
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(),
        getDomain: () => domain,
        getQueryDomain: () => domain,
        methods: {
            async updateAsset(id, patch) {
                calls.push(['updateAsset', id, patch]);
                const current = domain.assets.find(item => item.id === id);
                const next = Object.assign({}, current, patch, { updatedAt: '2026-08-19T00:00:00.000Z' });
                domain.assets = domain.assets.map(item => item.id === id ? next : item);
                return next;
            },
            async updateSubscriptionStartDate(id, input) { calls.push(['start', id, input]); return domain.assets.find(item => item.id === id); },
            async updateSubscriptionPeriodEnd(id, input) { calls.push(['end', id, input]); return domain.assets.find(item => item.id === id); },
        },
    });

    const acquired = await invoke(handlers.asset_update, { assetId: PHYSICAL_ID, patch: { acquiredOn: '2026-08-20' } });
    assert.equal(acquired.body.ok, true);
    assert.equal(calls[0][2].acquiredOn, '2026-08-20');
    const category = await invoke(handlers.asset_update, { assetId: PHYSICAL_ID, patch: { category: '域名' } });
    assert.equal(category.body.error.code, 'CATEGORY_NOT_FOUND', '域名 cannot be assigned to a physical asset');
    const subAcquired = await invoke(handlers.asset_update, { assetId: SUBSCRIPTION_ID, patch: { acquiredOn: '2026-08-20' } });
    assert.equal(subAcquired.body.error.code, 'SUBSCRIPTION_START_DATE_USE_LIFECYCLE');
    const cycle = await invoke(handlers.asset_update, {
        assetId: SUBSCRIPTION_ID, patch: { details: { planName: 'Pro+', billingPlan: { cycle: 'halfYearly' } } },
    });
    assert.equal(cycle.body.ok, true);
    assert.equal(calls[1][2].details.billingPlan.cycle, 'halfYearly');
    assert.equal(cycle.body.data.details.billingPlan.cycle, 'halfYearly');
    const domainCategory = await invoke(handlers.asset_update, { assetId: SUBSCRIPTION_ID, patch: { category: '域名' } });
    assert.equal(domainCategory.body.ok, true);
    assert.equal(calls[2][2].categoryId, 'domain', 'domain is a category label, not a tag');
    const start = await invoke(handlers.asset_lifecycle, {
        op: 'updateStartDate', assetId: SUBSCRIPTION_ID, startDate: '2026-08-01', endDate: '2027-01-31',
    });
    assert.equal(start.body.ok, true);
    assert.deepEqual(calls[3], ['start', SUBSCRIPTION_ID, { startDate: '2026-08-01', endDate: '2027-01-31' }]);
    const end = await invoke(handlers.asset_lifecycle, { op: 'updatePeriodEnd', assetId: SUBSCRIPTION_ID, endDate: '2027-02-01' });
    assert.equal(end.body.ok, true);
    assert.deepEqual(calls[4], ['end', SUBSCRIPTION_ID, { endDate: '2027-02-01' }]);
    const wrongKind = await invoke(handlers.asset_lifecycle, { op: 'updatePeriodEnd', assetId: PHYSICAL_ID, endDate: '2027-02-01' });
    assert.equal(wrongKind.body.error.code, 'INVALID_KIND');
    const overlapHandlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(), getDomain: () => domain,
        methods: { updateSubscriptionStartDate: async () => { throw new Error('subscription period overlaps an existing billing period'); } },
    });
    const overlap = await invoke(overlapHandlers.asset_lifecycle, { op: 'updateStartDate', assetId: SUBSCRIPTION_ID, startDate: '2026-08-01' });
    assert.equal(overlap.body.error.code, 'SUBSCRIPTION_PERIOD_OVERLAP');
    const lifecycleDenied = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions({ aiAllowLifecycle: false }), getDomain: () => domain,
    });
    assert.equal((await invoke(lifecycleDenied.asset_lifecycle, { op: 'updateStartDate', assetId: SUBSCRIPTION_ID, startDate: '2026-08-01' })).body.error.code, 'PERMISSION_DENIED');

    const zh = await invoke(handlers.asset_query, { locale: 'zh_CN', op: 'detail', assetId: PHYSICAL_ID });
    assert.equal(zh.body.data.kind, 'physical');
    assert.equal(zh.body.data.display.locale, 'zh-CN');
    assert.equal(zh.body.data.display.kindLabel, '实物资产');
    assert.equal(zh.body.data.display.statusLabel, '在役');
    assert.equal(zh.body.data.display.categoryLabel, '数码');
    assert.deepEqual(zh.body.data.display.tags, [{ id: TAG_WORK_ID, label: 'Work' }]);
    const en = await invoke(handlers.asset_query, { locale: 'en_US', op: 'search', search: 'Desk' });
    assert.equal(en.body.data[0].display.locale, 'en-US');
    assert.equal(en.body.data[0].display.kindLabel, 'Physical asset');
    const tags = await invoke(handlers.asset_query, { locale: 'en-US', op: 'tags' });
    assert.deepEqual(tags.body.data, [{ id: TAG_WORK_ID, label: 'Work' }]);
    const defaultLocale = await invoke(handlers.asset_query, { op: 'detail', assetId: PHYSICAL_ID });
    assert.equal(defaultLocale.body.data.display.locale, 'zh-CN');
}

async function testAgentTagSemantics() {
    const tagged = asset(PHYSICAL_ID, 'physical', 'Tagged desk');
    tagged.tagIds = [TAG_WORK_ID];
    const tags = [
        { id: TAG_WORK_ID, label: 'Work', createdAt: '2026-08-18T00:00:00.000Z' },
        { id: TAG_HOME_ID, label: 'Home', createdAt: '2026-08-18T00:00:00.000Z' },
    ];
    const domain = completeDomain([tagged], tags);
    const calls = [];
    const handlers = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions(), getDomain: () => domain,
        methods: {
            async updateAssetTags(id, input) { calls.push(['update', id, input]); domain.assets[0] = Object.assign({}, domain.assets[0], { tagIds: input.mode === 'replace' ? [TAG_HOME_ID] : domain.assets[0].tagIds }); return domain.assets[0]; },
            async createAndBindAssetTags(id, input) { calls.push(['create', id, input]); return { asset: domain.assets[0], tags: tags }; },
        },
    });
    const add = await invoke(handlers.asset_tag_update, { action: 'update', assetId: PHYSICAL_ID, labels: [' home '] });
    assert.equal(add.body.ok, true);
    assert.equal(calls[0][2].mode, 'add');
    const remove = await invoke(handlers.asset_tag_update, { action: 'update', assetId: PHYSICAL_ID, labels: ['WORK'], mode: 'remove' });
    assert.equal(remove.body.ok, true);
    const replace = await invoke(handlers.asset_tag_update, { action: 'update', assetId: PHYSICAL_ID, labels: ['Home'], mode: 'replace' });
    assert.equal(replace.body.ok, true);
    const fuzzy = await invoke(handlers.asset_tag_update, { action: 'update', assetId: PHYSICAL_ID, labels: ['Hom'] });
    assert.equal(fuzzy.body.error.code, 'TAG_NOT_FOUND');
    const create = await invoke(handlers.asset_tag_create, { action: 'create', assetId: PHYSICAL_ID, labels: ['New tag'] });
    assert.equal(create.body.ok, true);
    assert.equal(calls[3][0], 'create');
    const denied = agentActions.createAgentActionHandlers({
        getSettings: () => allPermissions({ aiAllowCreate: false }), getDomain: () => domain,
        methods: { createAndBindAssetTags: async () => { throw new Error('must not run'); } },
    });
    assert.equal((await invoke(denied.asset_tag_create, { assetId: PHYSICAL_ID, labels: ['Other'] })).body.error.code, 'PERMISSION_DENIED');

    // Production transaction path: concurrent create+bind calls share the formal
    // FIFO, reuse the exact-match tag, and never leave an unbound duplicate.
    const h = createHarness([asset(PHYSICAL_ID, 'physical', 'Atomic desk')]);
    const created = await Promise.all([
        h.plugin.createAndBindAssetTags(PHYSICAL_ID, { labels: ['Race'] }),
        h.plugin.createAndBindAssetTags(PHYSICAL_ID, { labels: [' race '] }),
    ]);
    const durableTags = h.state['tags.json'].tags.filter(item => item.label.toLowerCase() === 'race');
    assert.equal(durableTags.length, 1, 'concurrent tag creation reuses one exact-match tag');
    assert.deepEqual(h.state['assets.json'].assets[0].tagIds, [durableTags[0].id]);
    assert.ok(created[0].tags || created[1].tags, 'create+bind returns the committed tag catalog');
    await assert.rejects(
        () => h.plugin.createAndBindAssetTags(PHYSICAL_ID, { labels: ['A', 'B', 'C', 'D'] }),
        error => error && error.agentCode === 'TAG_LIMIT_EXCEEDED',
        'tag creation must enforce the three-tag limit in the formal transaction'
    );
    assert.equal(h.state['tags.json'].tags.filter(item => ['a', 'b', 'c', 'd'].includes(item.label.toLowerCase())).length, 0);
}

async function testFrontendWriteQueueGate() {
    // v2.6.0：Agent 工具改由 kernel.js 注册；前端只轮询写队列并做权限二次校验。
    const harness = createHarness(makeAssets());
    const plugin = harness.plugin;
    const locks = createSharedWebLockMock();
    installWebLockMock(locks);
    plugin._formalDomainLoaded = true;
    const calls = [];
    const refreshes = [];
    plugin._runGuardedUiEffects = options => {
        if (plugin._agentWriteRefreshContext
            && (options.renderDock || options.refreshModal || options.refreshMainContent)) {
            plugin._agentWriteRefreshContext.handled = true;
        }
        refreshes.push(options);
        return true;
    };
    plugin._agentWriteMethods.addAsset = async (...args) => { calls.push(args); return args[0]; };

    // 总开关关闭 → AGENT_DISABLED，pending 保留且 completed 独立落盘
    plugin.settings = allPermissions({ aiEnabled: false });
    enqueueAgentRequest(harness, 'req-1', 'addAsset', [{ id: PHYSICAL_ID }]);
    await plugin._pollAgentWriteQueue();
    let results = completedAgentResult(harness, 'req-1');
    assert.equal(results.ok, false);
    assert.equal(results.error.code, 'AGENT_DISABLED');
    assert.ok(harness.state[agentRequestPath('req-1', 'pending')]);
    assert.equal(calls.length, 0);

    // Create 权限关闭 → PERMISSION_DENIED
    plugin.settings = allPermissions({ aiAllowCreate: false });
    enqueueAgentRequest(harness, 'req-2', 'addAsset', [{ id: PHYSICAL_ID }]);
    await plugin._pollAgentWriteQueue();
    results = completedAgentResult(harness, 'req-2');
    assert.equal(results.ok, false);
    assert.equal(results.error.code, 'PERMISSION_DENIED');

    // 未知方法 → METHOD_UNAVAILABLE
    plugin.settings = allPermissions();
    enqueueAgentRequest(harness, 'req-3', 'doesNotExist', []);
    await plugin._pollAgentWriteQueue();
    results = completedAgentResult(harness, 'req-3');
    assert.equal(results.error.code, 'METHOD_UNAVAILABLE');

    // formal 域未加载 → DOMAIN_UNAVAILABLE
    plugin._formalDomainLoaded = false;
    enqueueAgentRequest(harness, 'req-3b', 'addAsset', []);
    await plugin._pollAgentWriteQueue();
    plugin._formalDomainLoaded = true;
    results = completedAgentResult(harness, 'req-3b');
    assert.equal(results.error.code, 'DOMAIN_UNAVAILABLE');

    // 成功路径：委托业务方法 + processing 收据 + completed 结果
    enqueueAgentRequest(harness, 'req-4', 'addAsset', [{ id: PHYSICAL_ID, name: 'Queued desk' }]);
    await plugin._pollAgentWriteQueue();
    results = completedAgentResult(harness, 'req-4');
    assert.equal(results.ok, true);
    assert.equal(results.data.name, 'Queued desk');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].id, PHYSICAL_ID);
    assert.deepEqual(refreshes, [{ renderDock: true, refreshModal: true }], 'successful Agent writes refresh the visible UI');
    assert.ok(harness.state[agentRequestPath('req-4', 'pending')]);

    // 业务方法已经刷新时，队列边界不再重复渲染。
    refreshes.length = 0;
    plugin._agentWriteMethods.addAsset = async (...args) => {
        plugin._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return args[0];
    };
    enqueueAgentRequest(harness, 'req-5', 'addAsset', [{ id: PHYSICAL_ID }]);
    await plugin._pollAgentWriteQueue();
    assert.deepEqual(refreshes, [{ renderDock: true, refreshModal: true }], 'existing method refresh is not duplicated');
}

async function testFrontendWriteCoordinatorUnavailable() {
    // 没有 Web Lock 时只跳过轮询，不得走普通 storage lease 或执行业务方法。
    const harness = createHarness(makeAssets());
    const plugin = harness.plugin;
    plugin._formalDomainLoaded = true;
    plugin.settings = allPermissions();
    let calls = 0;
    plugin._agentWriteMethods.addAsset = async () => { calls++; return true; };
    enqueueAgentRequest(harness, 'no-web-lock', 'addAsset', [{ id: PHYSICAL_ID }]);

    await plugin._pollAgentWriteQueue();

    assert.equal(calls, 0, 'missing navigator.locks must not execute a business method');
    assert.equal(harness.state[agentRequestPath('no-web-lock', 'completed')], undefined);
    assert.equal(harness.state['agent-write-lease.json'], undefined, 'storage lease is not a coordination fallback');
    assert.equal(harness.io.writes.length, 0, 'unavailable coordination must not write storage');

    const unavailableCases = [
        { name: 'request unavailable', locks: {} },
        { name: 'lock unavailable', locks: { request: async () => null } },
        { name: 'request throws', locks: { request: async () => { throw new Error('lock failure'); } } },
    ];
    for (const scenario of unavailableCases) {
        installWebLockMock(scenario.locks);
        let taskCalls = 0;
        const result = await plugin._withAgentWriteCoordinator(async () => { taskCalls++; return true; });
        assert.equal(result, false, scenario.name + ' returns false');
        assert.equal(taskCalls, 0, scenario.name + ' must not enter the callback');
    }
}

function testStaticCleanupAndI18n() {
    assert.equal(fs.existsSync(path.join(ROOT, 'api', 'ai.js')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'ai.test.js')), false);
    const files = ['src.template.js', 'index.js', 'kernel.template.js', 'kernel.js', path.join('scripts', 'concat.js')];
    files.forEach(relative => {
        const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
        assert.doesNotMatch(text, /\/api\/ai\/chatGPT|__am_ai\b|requestIsolatedAI|api\/ai\.js/, relative + ' has no retired AI API');
    });
    const template = fs.readFileSync(path.join(ROOT, 'src.template.js'), 'utf8');
    assert.match(template, /_pollAgentWriteQueue\(\)/);
    assert.match(template, /_startAgentWriteQueuePolling\(\)/);
    assert.match(template, /locks\.request\(AGENT_WRITE_LOCK_NAME, \{ ifAvailable: true \}/);
    assert.doesNotMatch(template, /AGENT_WRITE_LEASE|_agentWriteLease|_acquireAgentWriteLease|_verifyAgentWriteLease/);
    assert.doesNotMatch(template, /this\.addAgentAction\(/);
    assert.doesNotMatch(template, /_getAIContextSnapshot|data-ai-answer|aiPrivacyScope|aiMaxAssets/);
    ['aiEnabled', ...agentActions.AGENT_PERMISSION_KEYS].forEach(key => assert.ok(template.includes(key)));

    const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'zh_CN.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'en_US.json'), 'utf8'));
    const keys = [
        'settingsTabAI', 'agentTitle', 'agentDescription', 'agentConfirmationNotice', 'agentEnabled',
        'agentKernelStatus', 'agentKernelStatusCount', 'agentKernelUnregistered', 'agentQueueHint',
        'agentPermissionsTitle', 'agentPermissionQuery', 'agentPermissionCreate', 'agentPermissionModify',
        'agentPermissionLifecycle', 'agentPermissionRecords', 'agentPermissionDelete',
        'agentPermissionHint',
    ];
    keys.forEach(key => assert.ok(zh[key] && en[key], 'i18n key exists in both locales: ' + key));
}

(async () => {
    testSettingsMigrationAndHelpers();
    await testPermissionMatrix();
    await testStableUserErrorBoundary();
    await testQueryPaginationAndSummaryFallback();
    await testCreateUpdateDeleteMapping();
    await testPurchaseAmountRecoveryMapping();
    await testDedicatedPriceUpdate();
    await testAgentFieldRoutingAndLocalization();
    await testAgentTagSemantics();
    await testFrontendWriteCoordinatorUnavailable();
    await testFrontendWriteQueueGate();
    testStaticCleanupAndI18n();
    console.log('[agent-actions] passed');
})().catch(error => {
    console.error('[agent-actions] failed:', error && error.stack || error);
    process.exitCode = 1;
});
