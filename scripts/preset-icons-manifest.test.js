'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { DEFAULT_PRESET_ICON_ID, resolveCoverUrl } = require('../api/media');

const PRESET_ICON_DIR = path.join(__dirname, '..', 'assets', 'preset-icons');
const MANIFEST_FILE = path.join(PRESET_ICON_DIR, 'manifest.json');
const NOTICES_FILE = path.join(__dirname, '..', 'THIRD_PARTY_NOTICES.md');
const PLUGIN_ROOT = '/plugins/siyuan-plugin-asset-management/assets/preset-icons/';

function main() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.version, 5);
    // 图标数量不硬编码（历史 19 张已扩到 33 张）：manifest 必须与目录内 PNG 一一对应。
    const bundledPngFiles = fs.readdirSync(PRESET_ICON_DIR).filter(file => file.endsWith('.png'));
    assert.equal(manifest.icons.length, bundledPngFiles.length, 'manifest must cover every bundled PNG preset');
    assert.deepEqual(manifest.source, {
        name: 'Icons8', provider: 'Icons8', url: 'https://icons8.com',
    });
    assert.equal(
        manifest.categories.reduce((total, category) => total + category.iconCount, 0),
        manifest.icons.length,
        'category icon counts must match the manifest'
    );

    const loaded = manifest.icons.filter(icon => icon && icon.id && icon.filename);
    assert.equal(loaded.length, manifest.icons.length, 'every manifest entry must load');
    assert.equal(loaded.some(icon => icon.id === DEFAULT_PRESET_ICON_ID), true, 'Box must remain available as the default preset');

    for (const icon of loaded) {
        assert.match(icon.id, /^icons8-[a-z0-9-]+$/, `${icon.id} must use the safe Icons8 namespace`);
        assert.match(icon.filename, /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/, `${icon.id} has an unsafe PNG filename`);
        assert.equal(fs.existsSync(path.join(PRESET_ICON_DIR, icon.filename)), true, `${icon.id} PNG is missing`);
        assert.equal(
            resolveCoverUrl({ kind: 'preset', presetId: icon.id }, manifest),
            PLUGIN_ROOT + icon.filename,
            `${icon.id} must resolve to its local PNG`
        );
    }

    const bundledFiles = fs.readdirSync(PRESET_ICON_DIR);
    assert.equal(bundledFiles.some(file => file.endsWith('.svg')), false, 'IconPark SVGs must not remain bundled');
    assert.equal(bundledFiles.includes('LICENSE-APACHE-2.0.txt'), false, 'the removed IconPark license must not remain bundled');
    assert.match(fs.readFileSync(NOTICES_FILE, 'utf8'), /Icons8[\s\S]*https:\/\/icons8\.com/);

    console.log(`[preset-icons-manifest] loaded and resolved ${loaded.length} Icons8 icon(s)`);
}

try {
    main();
} catch (error) {
    console.error('[preset-icons-manifest] failed:', error);
    process.exitCode = 1;
}
