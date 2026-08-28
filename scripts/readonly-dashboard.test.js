'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '..');

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class Plugin { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve('../index.js')];
        return require('../index.js');
    } finally {
        Module._load = originalLoad;
        if (navigatorDescriptor) Object.defineProperty(global, 'navigator', navigatorDescriptor);
        else delete global.navigator;
    }
}

const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
assert.doesNotMatch(template, /saveSettings\(\)[\s\S]{0,300}dashboardTimeRange/);
const detailSource = template.slice(template.indexOf('    openDashboardDetail(id) {'), template.indexOf('    renderEmptyPage('));
assert.match(detailSource, /this\._buildFullFormalReport\(snapshot\)/,
    'dashboard detail must use the complete formal report projection');
assert.match(detailSource, /buildFormalDashboard\(snapshot, this\.dashboardTimeRange/,
    'dashboard detail must use the formal dashboard projection');
assert.doesNotMatch(detailSource, /\b(?:updateAsset|addAsset|deleteAsset|setStatus|_commitSubscriptionAction|_commitPrepaidAction|openEdit(?:Dialog|Sheet)?|openRenewSheet|openPrepaid(?:Transaction|Sheet)?|runAssetPersistenceTransaction|writeAssets(?:WithMediaCompensation)?|readAssets|saveData|loadData|(?:read|write)(?:Settings|WishlistEvents|OperationLogs|Maintenance|Usage|Tags|PrepaidTransactions|FinancialEvents|LifecycleEvents|SubscriptionPeriods|ExchangeRates))\s*\(/,
    'dashboard detail must not invoke asset mutations, business-action sheets, or persistence APIs');
assert.doesNotMatch(detailSource, /\braw\.(?:read|write)\s*\(/,
    'dashboard detail must not access sidecar storage directly');

const AssetPlugin = loadPluginClass();
const plugin = new AssetPlugin({});
let writes = 0;
plugin.storage = new Proxy({}, { get() { return () => { writes++; }; } });
plugin.assets = [];
plugin._formalDomainLoaded = false;
plugin.refreshMainContent = () => {};
plugin.switchTab('report');
plugin.handleAction('dashboard-time', null, { dataset: { range: '30d' } });
assert.equal(plugin.dashboardTimeRange, '30d');
assert.equal(writes, 0, 'entering or switching the dashboard must not write storage');
assert.match(plugin.renderReportPage(), /正式报表数据不可用/);
console.log('readonly dashboard checks: ok');
