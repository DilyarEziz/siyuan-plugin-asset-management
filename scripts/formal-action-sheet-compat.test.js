'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function methodSource(source, signature, nextSignature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `missing ${signature}`);
    const end = source.indexOf(nextSignature, start + signature.length);
    assert.notEqual(end, -1, `missing method boundary after ${signature}`);
    return source.slice(start, end);
}

function main() {
    const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
    const production = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const actionSheet = methodSource(template, '    openActionSheet(options) {', '    openVirtualFormalSheet(options) {');
    const formalSheet = methodSource(template, '    openFormalAssetSheet(kind, options) {', '    bindFormalJsonSettings(root) {');

    // The reachable action sheet exposes four choices. Each must enter the
    // formal editor family rather than a removed legacy editor implementation.
    const routes = [
        ['card="${key}"', 'FORMAL_ASSET_KIND.PHYSICAL'],
        ['card="${key}"', 'openVirtualFormalSheet()'],
        ['card="${key}"', 'openPrepaidFormalSheet()'],
        ['wishlist', 'openWishlistFormalSheet()'],
    ];
    for (const [entry, route] of routes) {
        if (entry === 'card="${key}"') assert.match(actionSheet, /data-action-card/, 'action sheet exposes formal type cards');
        else assert.match(actionSheet, new RegExp(`data-action-${entry}`), `action sheet exposes ${entry}`);
        assert.ok(actionSheet.includes(route), `${entry} routes through the formal editor family`);
    }
    assert.match(formalSheet, /FORMAL_ASSET_KINDS|FORMAL_ASSET_KIND/, 'formal sheet accepts formal kinds');
    assert.match(formalSheet, /opts\.wishlist/, 'wishlist entry remains a formal-sheet option');
    assert.doesNotMatch(actionSheet, /\b(?:openEditSheet|openVirtualSheet|openCorePrepaidSheet|openWishlistSheet)\s*\(/,
        'reachable action sheet never calls removed legacy editors');
    assert.match(production, /openActionSheet\(options\)/, 'generated plugin contains the formal action sheet');
    assert.doesNotMatch(methodSource(production, '    openActionSheet(options) {', '    openVirtualFormalSheet(options) {'),
        /\b(?:openEditSheet|openVirtualSheet|openCorePrepaidSheet|openWishlistSheet)\s*\(/,
        'generated action sheet preserves the formal-only boundary');
    console.log('[formal-action-sheet-compat] passed');
}

try { main(); } catch (error) { console.error('[formal-action-sheet-compat] failed:', error); process.exit(1); }
