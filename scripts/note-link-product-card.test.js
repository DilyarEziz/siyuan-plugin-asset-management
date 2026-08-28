'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { parseHTML } = require('linkedom');

const ASSET_ID = 'f5f1457b-9dd2-43cb-b052-9c56e210dc2b';
const REF_BLOCK = '20260817090001-refbloc';
const TAG_BLOCK = '20260817090002-tagbloc';
const MANUAL_BLOCK = '20260817090003-manbloc';

function loadPluginClass() {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        delete require.cache[require.resolve('../index.js')];
        return require('../index.js');
    } finally {
        Module._load = originalLoad;
    }
}

function translate(_key, fallback, vars) {
    let value = String(fallback == null ? '' : fallback);
    Object.keys(vars || {}).forEach(key => { value = value.replaceAll('{' + key + '}', String(vars[key])); });
    return value;
}

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

(async () => {
    const zh = require('../i18n/zh_CN.json');
    const en = require('../i18n/en_US.json');
    assert.equal(zh.relatedNotesTitle, '笔记关联', '中文 section 标题更新');
    assert.equal(en.relatedNotesTitle, 'Note Links', '英文 section 标题更新');

    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    assert.equal((template.match(/<button[^>]*data-formal-copy-ref/g) || []).length, 0, '源码中旧位置 copy button 清零');
    assert.equal((template.match(/<button[^>]*data-related-notes-copy-ref/g) || []).length, 1, '源码中 header copy button 唯一');
    const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
    const relatedCss = css.slice(css.indexOf('/* v2.5.0 P3'), css.indexOf('/* v2.5.1.1'));
    assert.doesNotMatch(relatedCss, /\bgap\s*:/, '笔记关联 CSS 不使用 flex gap');
    assert.match(relatedCss, /\.am-related-notes__copy[\s\S]*?min-height:\s*44px/, '复制 pill 触摸目标至少 44px');
    assert.match(relatedCss, /\.am-related-notes__title[\s\S]*?font-size:[^;]*14px[\s\S]*?font-weight:\s*600/, '主标题 14px/600');
    assert.match(relatedCss, /\.am-related-notes__remove[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/, '关闭按钮触摸目标 44x44');

    const descriptors = {
        document: Object.getOwnPropertyDescriptor(global, 'document'),
        window: Object.getOwnPropertyDescriptor(global, 'window'),
        navigator: Object.getOwnPropertyDescriptor(global, 'navigator'),
        Element: Object.getOwnPropertyDescriptor(global, 'Element'),
    };
    const dom = parseHTML('<!doctype html><html><body></body></html>');
    Object.defineProperty(global, 'document', { value: dom.document, configurable: true });
    Object.defineProperty(global, 'window', { value: dom.window, configurable: true });
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'Element', { value: dom.window.Element, configurable: true });

    try {
        const PluginClass = loadPluginClass();
        const plugin = new PluginClass();
        plugin._t = translate;
        plugin.showToast = () => {};

        assert.equal(plugin._relatedNoteDisplayTitle({ blockId: REF_BLOCK, preview: '# **关联块名称**\n第二行', docTitle: '所属文档' }), '关联块名称 第二行', 'preview 去 Markdown 并压成单行');
        assert.equal(plugin._relatedNoteDisplayTitle({ blockId: REF_BLOCK, preview: '', docTitle: '所属文档' }), '所属文档', '无 preview 时使用 docTitle');
        assert.equal(plugin._relatedNoteDisplayTitle({ blockId: REF_BLOCK, preview: '', docTitle: '' }), REF_BLOCK.slice(0, 8), '无文本时使用短 ID');

        ['_renderPhysicalProductCardInner', '_renderVirtualProductCardInner', '_renderPrepaidProductCardInner']
            .forEach(name => assert.doesNotMatch(String(plugin[name]), /data-formal-copy-ref/, name + ' 不再渲染 footer 复制按钮'));

        const host = dom.document.createElement('div');
        const card = dom.document.createElement('div');
        card.innerHTML = '<div class="am-product-card__body"><section class="am-product-section"><div class="am-product-section__title">基础</div></section></div>';
        host.appendChild(card);
        dom.document.body.appendChild(host);
        const asset = { id: ASSET_ID, status: 'active' };
        let copyCalls = 0;
        plugin._copyAssetBlockRef = async id => { assert.equal(id, ASSET_ID); copyCalls += 1; };
        plugin.noteLink = { getRelatedNotes: async () => [] };
        plugin._mountRelatedNotesSection(card, asset, host);
        await flush();
        assert.equal(card.querySelectorAll('[data-formal-copy-ref]').length, 0, '旧位置复制按钮清零');
        assert.equal(card.querySelectorAll('[data-related-notes-copy-ref]').length, 1, 'header 只有一个复制入口');
        card.querySelector('[data-related-notes-copy-ref]').onclick();
        assert.equal(copyCalls, 1, 'header 复制入口复用 _copyAssetBlockRef');

        const list = card.querySelector('[data-related-notes-list]');
        const entries = [
            { source: 'ref', blockId: REF_BLOCK, preview: '**引用块内容**', docTitle: '引用文档', addedAt: '2026-08-17T00:00:00.000Z' },
            { source: 'tag', blockId: TAG_BLOCK, preview: '# 标记块名称', docTitle: '3.8max体验日记', addedAt: '2026-08-17T00:00:00.000Z' },
            { source: 'manual', blockId: MANUAL_BLOCK, preview: '同名文档', docTitle: '同名文档', addedAt: '2026-08-17T00:00:00.000Z' },
        ];
        let jumpCalls = 0;
        plugin._jumpToBlock = () => { jumpCalls += 1; };
        plugin._renderRelatedNotesList(list, asset, entries, host);
        const rows = list.querySelectorAll('[data-related-note-block]');
        assert.equal(rows[1].querySelector('.am-related-notes__title').textContent.trim(), '标记块名称', '第一行显示关联块名称');
        assert.equal(rows[1].querySelector('.am-related-notes__context').textContent.trim(), '3.8max体验日记', '第二行显示所属文档');
        assert.equal(rows[2].querySelector('.am-related-notes__context'), null, '主标题与 docTitle 相同时副行只保留来源');
        assert.doesNotMatch(list.textContent, /2026-08-17|addedAt/, 'UI 不展示关联日期');
        assert.equal(rows[0].querySelector('[data-related-note-remove]'), null, 'ref 来源不显示取消按钮');
        assert.ok(rows[1].querySelector('[data-related-note-remove]'), 'tag 来源显示取消按钮');
        assert.ok(rows[2].querySelector('[data-related-note-remove]'), 'manual 来源显示取消按钮');

        let manualCalls = 0;
        plugin._removeRelatedNote = async () => { manualCalls += 1; };
        const manualButton = rows[2].querySelector('[data-related-note-remove]');
        manualButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        assert.equal(jumpCalls, 0, '点击 × 不冒泡触发行跳转');
        let mask = host.querySelector('.am-plugin-confirm-mask');
        assert.match(mask.textContent, /取消笔记关联[\s\S]*确认取消与「同名文档」的关联？[\s\S]*保留[\s\S]*取消关联/, '确认框文案与按钮完整');
        mask.querySelector('[data-scoped-confirm-cancel]').onclick();
        assert.equal(manualCalls, 0, '取消确认零写入');

        manualButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        const escapeEvent = new dom.window.Event('keydown');
        Object.defineProperty(escapeEvent, 'key', { value: 'Escape' });
        dom.window.dispatchEvent(escapeEvent);
        assert.equal(manualCalls, 0, 'Esc 零写入');

        manualButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        mask = host.querySelector('.am-plugin-confirm-mask');
        mask.onclick({ target: mask });
        assert.equal(manualCalls, 0, '遮罩取消零写入');

        manualButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        const manualConfirm = host.querySelector('[data-scoped-confirm-ok]');
        await Promise.all([manualConfirm.onclick(), manualConfirm.onclick()]);
        assert.equal(manualCalls, 1, 'manual 确认双击最多调用一次现有删除方法');

        let unlinkCalls = 0;
        let refreshCalls = 0;
        plugin.noteLink.unlinkBlockFromAsset = async id => { assert.equal(id, TAG_BLOCK); unlinkCalls += 1; };
        plugin.closeProductCard = () => {};
        plugin.openFormalProductCard = (id, target) => { assert.equal(id, ASSET_ID); assert.equal(target, host); refreshCalls += 1; };
        rows[1].querySelector('[data-related-note-remove]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await host.querySelector('[data-scoped-confirm-ok]').onclick();
        assert.equal(unlinkCalls, 1, 'tag 确认调用 unlinkBlockFromAsset');
        assert.equal(refreshCalls, 1, 'tag 取消后刷新产品卡');

        rows[0].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        assert.equal(jumpCalls, 1, '普通行点击仍执行跳转');

        let p2Calls = 0;
        plugin._openScopedConfirm(host, { title: '重新创建索引文档', text: 'P2', onConfirm: async () => { p2Calls += 1; } });
        mask = host.querySelector('.am-plugin-confirm-mask');
        assert.equal(mask.querySelector('[data-scoped-confirm-cancel]').textContent, '取消', 'P2 旧调用保留默认取消文案');
        const p2Confirm = mask.querySelector('[data-scoped-confirm-ok]');
        await Promise.all([p2Confirm.onclick(), p2Confirm.onclick()]);
        assert.equal(p2Calls, 1, 'P2 旧调用仍受单次确认保护');

        console.log('[note-link-product-card] passed');
    } finally {
        Object.keys(descriptors).forEach(key => {
            if (descriptors[key]) Object.defineProperty(global, key, descriptors[key]);
            else delete global[key];
        });
    }
})().catch(error => { console.error(error); process.exit(1); });
