'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const start = template.indexOf('    confirmDelete(id) {');
const end = template.indexOf('    showDialog(title, content, bindFn, width) {', start);
assert.ok(start >= 0 && end > start, 'confirmDelete boundaries must exist');
const confirmDelete = template.slice(start, end);

assert.match(confirmDelete, /const host = this\.dockElement \|\| this\._modalContainer \|\| document\.body;/, 'delete confirmation must prefer the plugin dock or modal host');
assert.match(confirmDelete, /if \(typeof this\._pluginConfirmClose === 'function'\) this\._pluginConfirmClose\(\);/, 'reopening confirmation must close and clean up any existing plugin confirmation');
assert.match(confirmDelete, /host\.appendChild\(mask\);/, 'delete confirmation must mount in the selected plugin host');
assert.doesNotMatch(confirmDelete, /this\.showDialog\(/, 'asset delete confirmation must not use the global SiYuan dialog');
assert.match(confirmDelete, /data-plugin-confirm-cancel[\s\S]*?data-plugin-confirm-delete/, 'plugin-scoped confirmation must expose cancel and delete controls');
assert.match(confirmDelete, /await this\.deleteAsset\(id\);[\s\S]*?this\.showToast/, 'confirmation must retain the existing delete action and success feedback');
assert.match(confirmDelete, /document\.removeEventListener\('keydown', onKeydown\);[\s\S]*?this\._pluginConfirmClose = null;/, 'closing confirmation must remove its Escape listener and clear the lifecycle hook');
assert.match(template, /onunload\(\) \{[\s\S]*?if \(typeof this\._pluginConfirmClose === 'function'\) this\._pluginConfirmClose\(\);/, 'plugin unload must close the local confirmation and release its listener');
const dispatcherStart = template.indexOf('    handleAction(action, id, target, e) {');
const dispatcherEnd = template.indexOf('    switchTab(tab) {', dispatcherStart);
assert.doesNotMatch(template.slice(dispatcherStart, dispatcherEnd), /case "confirm-delete"/, 'delegated actions must not bypass the plugin-scoped confirmation');
assert.match(css, /\.am-plugin-confirm-mask\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/, 'plugin confirmation mask must cover only its host range');
assert.match(css, /\.am-plugin-confirm-mask--fallback\s*\{[\s\S]*?position:\s*fixed;/, 'body fallback must remain usable when no plugin host exists');

console.log('[plugin-delete-confirm] passed');
