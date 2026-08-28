'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'preset-icons', 'manifest.json'), 'utf8'));

function loadPluginClass() {
    const originalLoad = Module._load;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') {
            return { Plugin: class Plugin { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        }
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

async function testManifestLoadStates(AssetPlugin) {
    const originalFetch = global.fetch;
    try {
        const plugin = new AssetPlugin({});
        let fetchCalls = 0;
        global.fetch = async () => {
            fetchCalls++;
            return { ok: true, json: async () => manifest };
        };
        const [first, second] = await Promise.all([plugin.loadPresetIconManifest(), plugin.loadPresetIconManifest()]);
        assert.equal(fetchCalls, 1, 'concurrent manifest loads must share one local request');
        assert.equal(plugin._presetIconManifestState, 'ready');
        assert.equal(first.icons.length, 19);
        assert.equal(second.categories.length, 4);

        const failedPlugin = new AssetPlugin({});
        global.fetch = async () => ({ ok: false });
        const fallback = await failedPlugin.loadPresetIconManifest();
        assert.equal(failedPlugin._presetIconManifestState, 'failed');
        assert.deepEqual(fallback.icons, []);
        assert.deepEqual(fallback.categories, []);
    } finally {
        if (originalFetch) global.fetch = originalFetch;
        else delete global.fetch;
    }
}

function testGroupsCoverManifestCategories() {
    const srcTemplate = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    const groupsMatch = srcTemplate.match(/const GROUPS = \[([\s\S]*?)\];/);
    assert.ok(groupsMatch, 'GROUPS definition must exist in src.template.js');
    const covered = new Set();
    const catsRegex = /cats:\s*\[([^\]]*)\]/g;
    let match;
    while ((match = catsRegex.exec(groupsMatch[1])) !== null) {
        match[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).forEach(id => covered.add(id));
    }
    for (const category of manifest.categories) {
        assert.ok(covered.has(category.id), `manifest category "${category.id}" must be covered by GROUPS cats (otherwise its icons are invisible in the preset picker)`);
    }
}

async function main() {
    const AssetPlugin = loadPluginClass();
    await testManifestLoadStates(AssetPlugin);
    testGroupsCoverManifestCategories();
    console.log('[preset-icons-panel] passed');
}

main().catch(error => {
    console.error('[preset-icons-panel] failed:', error);
    process.exitCode = 1;
});
