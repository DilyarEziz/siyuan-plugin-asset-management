'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const zh = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'zh_CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'en_US.json'), 'utf8'));

const dashboardKeys = [
    'dashboardTitle', 'dashboardRange30Days', 'dashboardRange6Months', 'dashboardRange12Months',
    'dashboardSummaryTitle', 'dashboardCurrencyTitle', 'dashboardCompositionTitle', 'dashboardTrendTitle',
    'dashboardAttentionTitle', 'dashboardRankingTitle', 'dashboardEmpty', 'dashboardClose',
];

dashboardKeys.forEach(key => {
    assert.equal(typeof zh[key], 'string', 'missing zh_CN key: ' + key);
    assert.equal(typeof en[key], 'string', 'missing en_US key: ' + key);
});
assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'i18n keys must stay symmetric');

assert.match(source, /this\.dashboardTimeRange = '12m'/);
assert.match(source, /buildFormalDashboard\(snapshot, range, \{ now: new Date\(\)\.toISOString\(\) \}\)/, 'report page must use the formal dashboard projection');
assert.match(source, /this\._buildFullFormalReport\(snapshot\)/, 'report page must use the complete formal report projection');
assert.match(source, /data-action="dashboard-detail"/);
assert.match(source, /openDashboardDetail\(id\)/);
assert.doesNotMatch(source, /reportFilter|_reportSnapshot|report-refresh|report-filter|report-date-from|report-date-end/);
const dashboardSource = source.slice(source.indexOf('    renderReportPage()'), source.indexOf('    _formalDomainSnapshot()'));
assert.doesNotMatch(dashboardSource, /(?:readMaintenance|readUsage|readPrepaidTransactions|readSubscriptionPeriods|readFinancialEvents|readLifecycleEvents)\s*\(/);
assert.doesNotMatch(dashboardSource, /statusWishlist/);
// v2.6.2 清理：v1.5.0 起「即将到期 / 价格排行」即在报表内复用数据产品卡
// （am-dashboard-asset-row + data-action="card"），该断言与已发布行为矛盾，同样过期。
assert.match(css, /\.am-dashboard__ranges button \{[\s\S]*?min-height: 44px/);
assert.match(css, /\.am-dashboard-detail-mask/);
assert.doesNotMatch(css, /\.am-report-filter/);
console.log('dashboard UI static checks: ok');
