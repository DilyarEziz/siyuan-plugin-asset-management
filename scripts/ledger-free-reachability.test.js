'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
const final = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const assets = fs.readFileSync(path.join(__dirname, '..', 'api', 'assets.js'), 'utf8');
const legacyRuntimeNames = ['_startExpiryScanner', '_scanExpiry', 'getPendingAssets', 'openRenewDecisionListDialog', 'openExpiryListDialog'];

function classMethods(source) {
    const matcher = /^    (?:async )?([A-Za-z_$][\w$]*)\([^\n]*\) \{/gm;
    const headers = [...source.matchAll(matcher)];
    return headers.map((match, index) => ({ name: match[1], body: source.slice(match.index, index + 1 < headers.length ? headers[index + 1].index : source.length) }));
}

function assertLedgerFreeMethods(artifact, label) {
    const forbidden = /\.(?:assetType|targetType|expectedPrice|price|billingCycle)\b|\b(?:assetType|targetType|expectedPrice|price|billingCycle)\s*:|(?:normalizeAsset|runAssetPersistenceTransaction|mutateCoreAssets|readCoreAssets|runAssetLedgerUnitOfWork|openResubscribeSheet|openPendingRenewalConfirmSheet)\s*\(/;
    classMethods(artifact).forEach(method => {
        assert.doesNotMatch(method.body, forbidden, `${label} ${method.name} has no legacy field, handler, or persistence API`);
        assert.doesNotMatch(method.body, /\b_legacyRemoved[A-Za-z0-9_]*\b/, `${label} ${method.name} has no legacy implementation identifier`);
    });
}

function main() {
    [source, final].forEach((artifact, index) => {
        const label = index ? 'generated plugin' : 'template';
        assert.doesNotMatch(artifact, /_legacyRemoved[A-Za-z0-9_]*/, `${label} contains no legacy implementation identifier`);
        legacyRuntimeNames.forEach(name => assert.doesNotMatch(artifact, new RegExp(`^    (?:async )?${name}\\(`, 'm'), `${label} has no callable ${name}`));
        assert.doesNotMatch(artifact, /settings-scan-now|open-expiry-list/, `${label} exposes no legacy expiry UI route`);
        assertLedgerFreeMethods(artifact, label);
    });
    assert.match(assets, /function projectFormalSubscription\(/, 'formal subscription state is read as a projection');
    assert.match(source, /openRenewSheet\(id\)/, 'renewal remains routed to the formal renewal sheet');
    assert.match(source, /_formalRenewSubscription|renewSubscription/, 'renewal writes only through formal subscription mutations');
    assert.match(source, /^    autoExpireVirtualAssets\(\)\s*\{\s*return 0;/m, 'automatic expiry is an explicit no-op');
    console.log('[ledger-free-reachability] passed');
}
try { main(); } catch (error) { console.error('[ledger-free-reachability] failed:', error); process.exitCode = 1; }
