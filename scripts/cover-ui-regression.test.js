'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const zh = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'zh_CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'en_US.json'), 'utf8'));

assert.match(template, /displayCover\.kind === 'preset' \? ' am-cover-image--preset' : ''/, 'form previews must mark preset covers');
assert.match(template, /presetId: media\.DEFAULT_PRESET_ICON_ID/, 'empty form covers must use the bundled Box preset');
assert.match(template, /resolved\.kind === 'preset' \? 'am-cover-image--preset' : ''/, 'asset cover renderer must mark preset covers');
assert.match(css, /\.am-asset-matrix__icon\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?flex:\s*0 0 40px;[\s\S]*?overflow:\s*hidden;/, 'matrix cover frame must remain a clipped 40px square');
assert.match(css, /\.am-asset-matrix__icon img\.am-cover-image--preset\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?padding:\s*0;/, 'matrix preset covers must crop-fill the frame');
assert.match(css, /\.am-asset-matrix__icon > \.am-asset-cover-fallback\s*\{[\s\S]*?padding:\s*6px;/, 'matrix emoji and missing-cover fallbacks must use the shared frame padding');
assert.match(css, /\.am-product-card__image\.am-cover-image--preset\s*\{[\s\S]*?object-fit:\s*cover;/, 'detail presets must crop-fill rather than contain');
assert.match(css, /\.am-asset-item__icon img,[\s\S]*?\.am-asset-matrix__icon img\s*\{[\s\S]*?object-fit: cover;/, 'non-preset asset images must retain cover cropping');

assert.equal(zh.coverUploading, '正在上传...');
assert.equal(en.coverUploading, 'Uploading...');

console.log('[cover-ui-regression] passed');
