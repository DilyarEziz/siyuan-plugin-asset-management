'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { newFormalV2Asset, normalizeSubscriptionPeriodRecord } = require('../api/assets');

function loadPluginClass() {
    const originalLoad = Module._load;
    const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class Plugin { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = originalLoad;
        if (descriptor) Object.defineProperty(global, 'navigator', descriptor); else delete global.navigator;
    }
}

const Plugin = loadPluginClass();
const subscription = newFormalV2Asset({ id: 'f0000000-0000-4000-8000-000000000001', kind: 'virtualSubscription',
    name: '<formal>', acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01',
    details: { billingPlan: { cycle: 'monthly' }, autoRenew: true } }, { today: '2026-07-19' });
const period = normalizeSubscriptionPeriodRecord({ id: 'f1000000-0000-4000-8000-000000000001', assetId: subscription.id,
    kind: 'billing', startDate: '2026-07-01', endDate: '2026-07-31', source: 'user',
    paymentEventId: 'f3000000-0000-4000-8000-000000000001' });
const payment = {
    id: period.paymentEventId, schemaVersion: 1, assetId: subscription.id,
    occurredAt: '2026-07-01T00:00:00.000Z', effectiveDate: '2026-07-01', createdAt: '2026-07-01T00:00:00.000Z',
    source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
    direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 100,
};

function pluginWithCompleteDomain() {
    const plugin = new Plugin({});
    plugin.assets = [subscription];
    plugin._formalDomainLoaded = true;
    plugin._formalDomainError = null;
    plugin._subscriptionPeriods = [period];
    plugin._prepaidTransactions = [];
    plugin._usageRecords = [];
    plugin._financialEvents = [payment];
    plugin._maintenanceRecords = [];
    plugin._lifecycleEvents = [];
    plugin.wishlistEvents = [];
    plugin._opLogs = [];
    return plugin;
}

const valid = pluginWithCompleteDomain();
assert.match(valid.renderReportPage(), /am-dashboard-summary/);
assert.doesNotMatch(valid.renderReportPage(), /am-dashboard-error/);

for (const corrupt of ['period', 'prepaid']) {
    const plugin = pluginWithCompleteDomain();
    if (corrupt === 'period') plugin._subscriptionPeriods[0] = Object.assign({}, period, { endDate: 'bad-date' });
    else plugin._prepaidTransactions = [{ id: 'f2000000-0000-4000-8000-000000000001', assetId: subscription.id,
        type: 'opening', dimension: 'amount', direction: 'inflow', amountMinor: 1,
        effectiveDate: '2026-07-19', occurredAt: '2026-07-19T00:00:00.000Z', createdAt: '2026-07-19T00:00:00.000Z', note: '' }];
    assert.doesNotThrow(() => plugin.renderReportPage(), corrupt + ' corruption must not escape rendering');
    const html = plugin.renderReportPage();
    assert.match(html, /am-dashboard-error/);
    assert.match(html, /data-action="dashboard-retry"/);
    assert.doesNotMatch(html, /am-dashboard-summary/);
}

const missing = pluginWithCompleteDomain();
missing._formalDomainLoaded = false;
missing._formalDomainError = new Error('sidecar read failed');
assert.match(missing.renderReportPage(), /sidecar read failed/);
assert.doesNotMatch(missing.renderReportPage(), /暂无资产|No assets/);

function deferred() {
    let resolve;
    const promise = new Promise(next => { resolve = next; });
    return { promise, resolve };
}

function delegatedClickTarget() {
    const button = { dataset: { action: 'dashboard-retry' }, tagName: 'BUTTON' };
    button.closest = selector => selector === '[data-action]' ? button : null;
    return button;
}

async function testDelegatedRetrySingleFlight() {
    const retry = pluginWithCompleteDomain();
    const gate = deferred();
    let reloads = 0;
    let refreshes = 0;
    retry.loadAssets = async () => { reloads++; await gate.promise; };
    retry.refreshMainContent = () => { refreshes++; };
    const container = {};
    const button = delegatedClickTarget();
    retry.bindActionDelegate(container);
    const event = { target: button, stopPropagation() {} };
    container.onclick(event);
    const pending = retry._formalDashboardRetryPromise;
    container.onclick(event);
    assert.equal(reloads, 1, 'rapid delegated clicks start one formal reload');
    assert.equal(retry._formalDashboardRetryPromise, pending, 'rapid retries share one Promise');
    gate.resolve();
    await pending;
    assert.equal(refreshes, 1, 'single-flight retry refreshes once');

    const failed = pluginWithCompleteDomain();
    failed.refreshMainContent = () => {};
    failed.loadAssets = async () => {
        failed._formalDomainLoaded = false;
        failed._formalDomainError = new Error('retry sidecar read failed');
        throw failed._formalDomainError;
    };
    const failedContainer = {};
    const failedButton = delegatedClickTarget();
    failed.bindActionDelegate(failedContainer);
    failedContainer.onclick({ target: failedButton, stopPropagation() {} });
    await failed._formalDashboardRetryPromise;
    const failedHtml = failed.renderReportPage();
    assert.match(failedHtml, /am-dashboard-error/);
    assert.match(failedHtml, /retry sidecar read failed/);
}

testDelegatedRetrySingleFlight()
    .then(() => console.log('[formal-dashboard-error-panel] passed'))
    .catch(error => { console.error('[formal-dashboard-error-panel] failed:', error); process.exit(1); });
