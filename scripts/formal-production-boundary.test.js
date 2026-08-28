'use strict';

/**
 * formal-v2 production boundary test.
 *
 * 目标：
 *   - 验证 src.template.js / index.js 已经清除所有 v1 残留 runtime 入口与字段
 *   - 验证 v2 新增 public entry（toggleSubscriptionAutoRenew / retirePhysicalAsset /
 *     recordPhysicalSaleAsset / recordPrepaidCountAdjustment / recordPrepaidConsumption）
 *     是 canonical public surface
 *   - 禁词扫描（生产代码中不得出现）：
 *     skipSubscription / cancelSubscription / _formalSkipSubscription /
 *     _formalCancelSubscription / _startExpiryScanner / _scanExpiry /
 *     getPendingAssets / openRenewDecisionListDialog / openExpiryListDialog /
 *     openUsageSheet / markAssetUsed / addUsageRecord / deleteUsageRecord /
 *     saveUsageRecord / supportsFormalUsageTracking / projectFormalUsage /
 *     //     usageTrackingEnabled / skipNextRenewal / renewalScore /
 *     worthRenewingScore / dailyCostOverrideMinor / versionLabel /
 *     soldPrice / prepaidAdjust* 字眼 / _legacyRemoved
 *   - LEGACY 标识符（assetType / targetType / expectedPrice / price …）不再出现
 *   - 顶层 reminderPolicy 已从 owned 资产移除
 *   - 公开入口集合必须是 formal-v2 可见的最终公开 API
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FORBIDDEN_ROUTES = /(?:openEditSheet|openVirtualSheet|openCorePrepaidSheet|openResubscribeSheet|openPendingRenewalConfirmSheet|loadFormalPeripheralDomain|runAssetPersistenceTransaction|mutateCoreAssets|readCoreAssets|runAssetLedgerUnitOfWork)\s*\(/;
const LEGACY_ASSET_FIELDS = [
    'assetType', 'targetType', 'expectedPrice', 'billingCycle', 'warrantyEndDate', 'expiryReminder',
];
const LEGACY_HOME_RENDERERS = ['renderAssetsOnly', 'renderAssetList', 'renderAssetItem', 'renderAssetMatrixItem'];
const FORBIDDEN_LEGACY_WISHLIST_METHODS = [
    'loadWishlistEvents',
    'confirmWishlistAbandonedEventDelete',
    'deleteWishlistAbandonedEvent',
];
// v0.18 production no longer exposes these entry points or runtime keywords.
const FORBIDDEN_V1_PUBLIC = [
    // deleted renewal/skip/cancel paths
    'skipSubscription', 'cancelSubscription',
    '_formalSkipSubscription', '_formalCancelSubscription',
    '_startExpiryScanner', '_scanExpiry', 'getPendingAssets',
    'openRenewDecisionListDialog', 'openExpiryListDialog',
    'openResubscribeSheet', 'openPendingRenewalConfirmSheet',
    // deleted usage paths
    'openUsageSheet', 'markAssetUsed', 'addUsageRecord',
    'deleteUsageRecord', 'saveUsageRecord',
    'supportsFormalUsageTracking', 'projectFormalUsage',
];
// v0.18 production never lets these fields flow through the asset schema; a regex
// match in src.template.js (the literal payload boundaries) is a fail.
const FORBIDDEN_V1_FIELDS = [
    'usageTrackingEnabled', 'skipNextRenewal', 'renewalScore',
    'worthRenewingScore', 'dailyCostOverrideMinor', 'versionLabel',
    // soldPrice is the v1 retire sheet field name — v2 uses priceMinor in recordPhysicalSaleAsset.
    'soldPrice',
];

function classMethods(source) {
    const matcher = /^    (?:async )?([A-Za-z_$][\w$]*)\([^\n]*\) \{/gm;
    return [...source.matchAll(matcher)].map(match => {
        const methodEnd = source.indexOf('\n    }', match.index);
        assert.ok(methodEnd >= 0, `method ${match[1]} has a class-level closing brace`);
        return {
            name: match[1],
            body: source.slice(match.index, methodEnd + '\n    }'.length),
        };
    });
}

function assertFormalOnly(method, label) {
    assert.doesNotMatch(method.body, FORBIDDEN_ROUTES, `${label} does not route through archived UI or persistence`);
    const legacyField = LEGACY_ASSET_FIELDS.find(field => new RegExp(`\\b${field}\\b`).test(method.body));
    assert.equal(legacyField, undefined, `${label} does not contain a legacy asset field identifier: ${legacyField || ''}`);
    assert.doesNotMatch(method.body, /\b_legacyRemoved[A-Za-z0-9_]*\b/, `${label} cannot contain a legacy implementation identifier`);
}

function assertAllNonLegacyMethodsFormal(source, label) {
    classMethods(source).forEach(method => assertFormalOnly(method, `${label} ${method.name}`));
}

// v2 canonical public entry set — the only routes production must expose.
const V2_PUBLIC_ENTRIES = [
    'onload', 'onunload', 'initDock', 'renderDock', 'renderMainPanel', 'handleAction',
    'openActionSheet', 'openFormalAssetSheet', 'openFormalProductCard', 'openFormalWorkflowDialog',
    'openRenewSheet', 'openSettingsDialog', 'openMainDialog', 'openEditDialog',
    'openWishlistFormalSheet', 'openWishlistPurchaseKindSheet',
    'renewSubscription', 'toggleSubscriptionAutoRenew',
    'retirePhysicalAsset', 'recordPhysicalSaleAsset',
    'recordPrepaidCountAdjustment', 'recordPrepaidConsumption',
    'addAsset', 'updateAsset', 'setStatus', 'deleteAsset',
    'loadAssets', 'loadSettings',
];

function assertProductionBoundary(source, label) {
    const methods = classMethods(source);
    const byName = new Map(methods.map(method => [method.name, method]));
    V2_PUBLIC_ENTRIES.forEach(name => {
        assert.ok(byName.has(name), `${label} includes canonical public entry ${name}`);
        assertFormalOnly(byName.get(name), `${label} ${name}`);
    });
    // Every public entry that starts with `open` (i.e. user-routable) plus the
    // externally callable subscription/auto-renew entries must remain formal-only.
    methods.filter(method => /^(?:onload|onunload|open[A-Z]|renewSubscription|toggleSubscriptionAutoRenew)$/.test(method.name))
        .forEach(method => assertFormalOnly(method, `${label} externally callable ${method.name}`));
}

function extractPluginSection(source) {
    // index.js is produced by concatenating api/*.js IIFEs into src.template.js;
    // the plugin section starts at the trailing `module.exports = class … extends Plugin`.
    // In src.template.js the whole file is the plugin section. api/* files legitimately
    // retain v1 reserved keys (FORMAL_V1_DEPRECATED_DETAIL_KEYS) for compatibility —
    // they must NOT be flagged by the runtime boundary scan.
    if (/module\.exports\s*=\s*class/.test(source)) {
        const start = source.indexOf('module.exports = class');
        return source.slice(start);
    }
    return source;
}

function assertForbiddenSubscribersAbsent(source, label) {
    // Strip line and block comments so changelog / v1 removal notes do not trip the
    // forbidden-word scan. The scan only enforces that no running v2 code carries
    // the v1 word; changelog JSDoc paragraphs are documentation, not payload.
    const pluginSection = extractPluginSection(source)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of FORBIDDEN_V1_PUBLIC) {
        assert.doesNotMatch(pluginSection, new RegExp(`\\b${forbidden}\\b`),
            `${label} must not reference the deleted v1 entry point ${forbidden}`);
    }
    // Block only the variant v1 adjust helpers; the v2 "prepaidAdjust*ReasonDefault"
    // i18n key is intentionally retained as the canonical v2 note for adjust flows.
    assert.doesNotMatch(pluginSection, /\bprepaidAdjustWithFinancialEvent\b|\bprepaidAdjustWithoutFinancialEvent\b|\b_prepaidAdjustBatch\b/,
        `${label} rejects specific v1 prepaidAdjust* variant helpers`);
    for (const field of FORBIDDEN_V1_FIELDS) {
        assert.doesNotMatch(pluginSection, new RegExp(`\\b${field}\\b`),
            `${label} rejects v1 dangling field ${field}`);
    }
}

function main() {
    const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
    const production = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

    [template, production].forEach((source, index) => assert.doesNotMatch(source, /_legacyRemoved[A-Za-z0-9_]*/,
        `${index ? 'generated plugin' : 'template'} contains no legacy implementation identifier`));
    const names = classMethods(template).map(method => method.name);
    FORBIDDEN_V1_PUBLIC.forEach(name => {
        assert.ok(!names.includes(name), `template removes callable legacy ${name}`);
    });
    FORBIDDEN_LEGACY_WISHLIST_METHODS.forEach(name => {
        assert.ok(!names.includes(name), `template removes non-archived legacy wishlist handler ${name}`);
        assert.doesNotMatch(template, new RegExp(`\\b${name}\\b`), `template has no legacy wishlist reference ${name}`);
        assert.doesNotMatch(production, new RegExp(`\\b${name}\\b`), `generated plugin has no legacy wishlist reference ${name}`);
    });
    [template, production].forEach((source, index) => assert.doesNotMatch(source, /\bnormalizeWishlistEvent\b/,
        `${index ? 'generated plugin' : 'template'} does not use a legacy wishlist event normalizer`));
    assert.doesNotMatch(classMethods(template).map(method => method.body).join('\n'), /settings-scan-now|notificationIntervalMinutes/,
        'template has no automatic timer reminder route');
    // formal-v2 removes the legacy reminderPolicy field from the asset schema.
    assert.doesNotMatch(template, /\bremainderPolicy\b|\breminderPolicy\s*:/,
        'v2 owned assets must not carry reminderPolicy; no field declaration in template');
    assert.match(template, /openFormalWorkflowDialog\(id, mode\)/, 'formal workflow dialog remains the only workflow host');
    assert.match(template, /openRenewSheet\(id\)/, 'formal renewal sheet remains available from the formal workflow');
    // v2 must expose the new public entry points.
    ['toggleSubscriptionAutoRenew', 'retirePhysicalAsset', 'recordPhysicalSaleAsset',
        'recordPrepaidCountAdjustment', 'recordPrepaidConsumption'].forEach(name => {
        assert.ok(names.includes(name), `v2 production exposes ${name}`);
    });
    assertProductionBoundary(template, 'template');
    assertProductionBoundary(production, 'generated plugin');
    assertAllNonLegacyMethodsFormal(template, 'template');
    assertAllNonLegacyMethodsFormal(production, 'generated plugin');
    LEGACY_HOME_RENDERERS.forEach(name => {
        assert.doesNotMatch(template, new RegExp(`\\b${name}\\b`), `template removes legacy home renderer ${name}`);
        assert.doesNotMatch(production, new RegExp(`\\b${name}\\b`), `generated plugin removes legacy home renderer ${name}`);
    });

    // Public entry bodies: forbid every v1 residual identifier.
    [template, production].forEach((source, index) => {
        assertForbiddenSubscribersAbsent(source, index ? 'generated plugin' : 'template');
    });

    // Storage layer still exports the v2 mutation / read boundaries.
    const storage = fs.readFileSync(path.join(root, 'api/storage.js'), 'utf8');
    assert.match(storage, /function readFormalV2AssetDomainSnapshot\(\)/, 'storage exports the public formal v2 startup-domain loader');
    assert.match(storage, /function mutateFormalV2AssetDomain\(prepare\)/, 'storage exposes the public formal v2 mutation boundary');
    assert.doesNotMatch(storage, /function loadFormalPeripheralDomain\s*\(/, 'removed peripheral loader is not the production domain mechanism');
    console.log('[formal-production-boundary] passed');
}

try { main(); } catch (error) { console.error('[formal-production-boundary] failed:', error); process.exit(1); }
