'use strict';

/**
 * v2.7.0 备注笔记链接回归测试。
 *
 * 覆盖目标：
 *   1) 行内渲染器：[文本](siyuan://blocks/<合法ID>) → 受控锚点 <a class="am-note-link"
 *      data-note-block-id="...">，文本保持 escape 后注入；非 siyuan://blocks 协议
 *      （http / javascript 等）与非合法 ID 一律字面转义，无任何注入面。
 *   2) 优先级与字面保护：代码包裹的链接保持字面；链接文本内的行内标记保持字面
 *      （单遍不回扫）；普通 [1] / 空格方括号不受影响。
 *   3) 块级渲染路径：标题 / 列表行内的链接同样生效（_renderAssetNotesHtml 全线走
 *      _renderAssetNotesInlineHtml）。
 *   4) 点击定位列映射：_stripNotesInlineMarkers 剥离链接定界符与 URL，链接后的文本
 *      列映射仍准确（_buildNotesLineMap → _mdNotesOffsetFromRendered 往返一致）。
 *   5) 触发检测：`[[` 与 `【【`（中文 IME）命中、边界（caret<2 / 文本中间 / 其他字符）。
 *   6) 显示文本净化：[ ] 换行剔除、空白压缩、超长截断。
 *   7) 选择浮层：searchDocs 响应解析（path 尾段 → ID，hPath 尾段 → 标题，非法 ID 过滤）、
 *      选中插入替换触发符、API 失败文案、空关键词空态。
 *   8) 详情卡集成：备注含链接的资产打开详情卡 → 锚点带 data-note-block-id，点击触发
 *      _jumpToBlock（openTab 桌面路径）。
 *   9) 编辑表单 blur 预览：点击链接直达笔记且不进入编辑态（未保存内容不被破坏）。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const harness = require('./formal-workflow-harness.js');
const createHarness = harness.createHarness;
const harnessAsset = harness.asset;
const NOW = harness.NOW;
const { normalizeFinancialRecord } = require('../api/assets');

const VALID_ID = '20260101120000-abcdefg';

function buildAsset(id, kind, name, notes) {
    return Object.assign(harnessAsset(id, kind, name), { notes: notes || '' });
}

function purchaseEvent(id, assetId, amountMinor) {
    return normalizeFinancialRecord({
        id, assetId, occurredAt: '2026-07-01T08:00:00.000Z', effectiveDate: '2026-07-01',
        createdAt: '2026-07-01T08:00:00.000Z', source: 'user', correlationId: null,
        note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor,
    }, { now: '2026-07-01T08:00:00.000Z' });
}

(async () => {
    const { plugin } = createHarness([]);
    const inline = s => plugin._renderAssetNotesInlineHtml(s);

    // linkedom 的 Element 未挂到 node global：派发真实事件走 `instanceof Element` 判定
    // 的生产路径前，用同一 linkedom realm 的 Element 补齐（与生产浏览器语义一致）。
    {
        const probe = parseHTML('<!doctype html><html><body></body></html>');
        global.Element = probe.window.Element;
        global.HTMLElement = probe.window.HTMLElement;
    }

    // ===== A) 行内渲染器 =====

    // A1) 合法链接 → 受控锚点（无 href，data-note-block-id 承载块 ID）
    assert.equal(
        inline('[' + '看板笔记' + '](siyuan://blocks/' + VALID_ID + ')'),
        '<a class="am-note-link" data-note-block-id="' + VALID_ID + '">看板笔记</a>',
        'valid siyuan link renders controlled anchor');

    // A2) 链接文本先经外层 escapeHtml：注入向量只出现在 escape 后文本里，不会被激活
    {
        const raw = '[<script>alert(1)</script>](siyuan://blocks/' + VALID_ID + ')';
        const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const html = inline(escaped);
        assert.ok(html.includes('<a class="am-note-link"'), 'escaped link text still anchors');
        assert.ok(html.includes('&lt;script&gt;'), 'script tag stays escaped inside anchor');
        assert.ok(!html.includes('<script>'), 'no active script element');
    }

    // A3) 非 siyuan 协议一律字面（javascript: / http: 不得渲染为锚点）
    assert.equal(inline('[x](javascript:alert(1))'), '[x](javascript:alert(1))', 'javascript: URL stays literal');
    assert.equal(inline('[x](https://example.com)'), '[x](https://example.com)', 'https URL stays literal');
    assert.equal(inline('[x](siyuan://plugins/other)'), '[x](siyuan://plugins/other)', 'non-block siyuan URL stays literal');

    // A4) 非法块 ID 格式一律字面
    assert.equal(inline('[x](siyuan://blocks/123)'), '[x](siyuan://blocks/123)', 'short id stays literal');
    assert.equal(inline('[x](siyuan://blocks/20260101120000-ABCDEF!)'), '[x](siyuan://blocks/20260101120000-ABCDEF!)', 'malformed id stays literal');

    // A5) 行内代码优先：代码内的链接保持字面
    assert.equal(
        inline('\u0060[x](siyuan://blocks/' + VALID_ID + ')\u0060'),
        '<code>[x](siyuan://blocks/' + VALID_ID + ')</code>',
        'link inside inline code stays literal');

    // A6) 链接文本内的行内标记保持字面（单遍不回扫，与代码同类已知限制）
    assert.equal(
        inline('[**加粗**](siyuan://blocks/' + VALID_ID + ')'),
        '<a class="am-note-link" data-note-block-id="' + VALID_ID + '">**加粗**</a>',
        'inline marks inside link text stay literal');

    // A7) 普通方括号文本不受影响
    assert.equal(inline('见 [1] 附录'), '见 [1] 附录', 'plain brackets stay literal');
    assert.equal(inline('[未闭合链接](siyuan://blocks/'), '[未闭合链接](siyuan://blocks/', 'unclosed link stays literal');

    // A8) 链接与加粗混排：各自命中
    assert.equal(
        inline('**前** [' + '笔记' + '](siyuan://blocks/' + VALID_ID + ') **后**'),
        '<strong>前</strong> <a class="am-note-link" data-note-block-id="' + VALID_ID + '">笔记</a> <strong>后</strong>',
        'link and bold coexist');

    // ===== B) 块级渲染路径 =====

    // B1) 标题行与列表行内的链接
    {
        const html = plugin._renderAssetNotesHtml('# 使用 [' + '手册' + '](siyuan://blocks/' + VALID_ID + ')\n- 参考 [' + 'FAQ' + '](siyuan://blocks/' + VALID_ID + ')');
        assert.ok(html.includes('<h1>使用 <a class="am-note-link" data-note-block-id="' + VALID_ID + '">手册</a></h1>'), 'link inside heading renders');
        assert.ok(html.includes('<li>参考 <a class="am-note-link" data-note-block-id="' + VALID_ID + '">FAQ</a></li>'), 'link inside list item renders');
    }

    // ===== C) 点击定位列映射 =====

    // C1) 链接剥离：可见文本只剩 text，colMap 指向原始 text 列
    {
        const line = '前缀 [' + '标题' + '](siyuan://blocks/' + VALID_ID + ') 后缀';
        const stripped = plugin._stripNotesInlineMarkers(line);
        assert.equal(stripped.text, '前缀 标题 后缀', 'link stripped to visible text');
        const visibleIdx = stripped.text.indexOf('标');
        assert.equal(line.charAt(stripped.colMap[visibleIdx]), '标', 'colMap maps visible link text back to raw');
        const afterIdx = stripped.text.indexOf('后');
        assert.equal(line.charAt(stripped.colMap[afterIdx]), '后', 'colMap maps text after link back to raw');
    }

    // C2) 行映射往返：渲染偏移 → 原始偏移含链接行仍准确
    {
        const raw = '普通行\n链接 [' + '目标' + '](siyuan://blocks/' + VALID_ID + ') 尾行';
        const entries = plugin._buildNotesLineMap(raw);
        const stripped = plugin._stripNotesInlineMarkers('链接 [' + '目标' + '](siyuan://blocks/' + VALID_ID + ') 尾行');
        const renderedOffset = entries[1].renderedStart + stripped.text.indexOf('尾');
        const rawOffset = plugin._mdNotesOffsetFromRendered(entries, renderedOffset);
        assert.equal(raw.charAt(rawOffset), '尾', 'rendered offset maps to raw offset across a link');
    }

    // ===== D) 触发检测与显示文本净化 =====

    // D1) [[ 与 【【 命中
    assert.deepEqual(plugin._detectNoteLinkTrigger('abc[[', 5), { start: 3, end: 5 }, '[[ triggers');
    assert.deepEqual(plugin._detectNoteLinkTrigger('abc\u3010\u3010', 5), { start: 3, end: 5 }, '【【 triggers');
    // D2) 边界
    assert.equal(plugin._detectNoteLinkTrigger('[[', 1), null, 'caret inside trigger no match');
    assert.equal(plugin._detectNoteLinkTrigger('a [', 3), null, 'single bracket no match');
    assert.equal(plugin._detectNoteLinkTrigger('abc[[x', 6), null, 'chars after trigger no match');
    assert.equal(plugin._detectNoteLinkTrigger('', 0), null, 'empty value no match');
    assert.deepEqual(plugin._detectNoteLinkTrigger('[[', 2), { start: 0, end: 2 }, 'trigger at start');

    // D3) 净化
    assert.equal(plugin._sanitizeNoteLinkText('a[b]c'), 'a b c', 'brackets replaced with space');
    assert.equal(plugin._sanitizeNoteLinkText('a\nb\rc'), 'a b c', 'newlines replaced');
    assert.equal(plugin._sanitizeNoteLinkText('  多   空格  '), '多 空格', 'whitespace collapsed');
    assert.equal(plugin._sanitizeNoteLinkText('x'.repeat(100)).length, 80, 'long text truncated to 80');
    assert.equal(plugin._sanitizeNoteLinkText('[[['), '', 'brackets-only sanitizes to empty');

    // ===== E) 选择浮层 =====

    // E1) searchDocs 响应解析 + 选中插入
    {
        global.fetch = async (path, options) => ({
            ok: true,
            json: async () => {
                assert.equal(path, '/api/filetree/searchDocs', 'picker queries searchDocs endpoint');
                const body = JSON.parse(options.body);
                assert.equal(body.k, '手册', 'picker forwards keyword');
                return { code: 0, msg: '', data: [
                    { path: '/data/' + VALID_ID + '.sy', hPath: '/日记/2026/使用手册' },
                    { path: '/data/bad-id.sy', hPath: '/bad' },
                    { path: '/data/20260202120000-zzzzzzz.sy', hPath: '/手册/另一个' },
                ] };
            },
        });
        const { document } = parseHTML('<!doctype html><html><body></body></html>');
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        const textarea = document.createElement('textarea');
        textarea.value = '前文 [[';
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);

        const trigger = plugin._detectNoteLinkTrigger(textarea.value, textarea.value.length);
        assert.ok(trigger, 'trigger detected before opening picker');
        let closedCalls = 0;
        const picker = plugin._openNoteLinkPicker(textarea, trigger, () => { closedCalls += 1; });
        assert.ok(picker, 'picker opens inside md wrapper');
        assert.equal(wrapper.querySelectorAll('.am-note-link-picker').length, 1, 'picker panel appended to wrapper');

        const input = wrapper.querySelector('.am-note-link-picker__input');
        const listEl = wrapper.querySelector('.am-note-link-picker__list');
        assert.ok(input && listEl, 'picker has search input and list');

        const ViewEvent = textarea.ownerDocument.defaultView.Event;
        input.value = '手册';
        input.dispatchEvent(new ViewEvent('input', {}));
        await new Promise(resolve => setTimeout(resolve, 400));

        const rows = listEl.querySelectorAll('[data-pick-idx]');
        assert.equal(rows.length, 2, 'invalid-id doc filtered, valid docs listed');
        assert.ok(listEl.innerHTML.includes('使用手册'), 'title from hPath last segment');
        assert.ok(listEl.innerHTML.includes('/日记/2026/使用手册'), 'hPath shown');

        rows[0].dispatchEvent(new ViewEvent('click', { bubbles: true }));
        assert.equal(textarea.value, '前文 [使用手册](siyuan://blocks/' + VALID_ID + ')', 'pick replaces trigger with markdown link');
        assert.equal(closedCalls, 1, 'pick closes picker and notifies host');
        assert.equal(wrapper.querySelectorAll('.am-note-link-picker').length, 0, 'panel removed after pick');

        // E2) 渲染回环：插入的链接可在详情卡里渲染为锚点（数据契约闭环）
        assert.ok(plugin._renderAssetNotesHtml(textarea.value).includes('data-note-block-id="' + VALID_ID + '"'), 'inserted link renders back as anchor');
    }

    // E3) API 失败 → 失败文案
    {
        global.fetch = async () => ({ ok: true, json: async () => ({ code: 500, msg: 'boom', data: null }) });
        const { document } = parseHTML('<!doctype html><html><body></body></html>');
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        const textarea = document.createElement('textarea');
        textarea.value = '[[';
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);
        const picker = plugin._openNoteLinkPicker(textarea, { start: 0, end: 2 }, () => {});
        const input = wrapper.querySelector('.am-note-link-picker__input');
        const ViewEvent = textarea.ownerDocument.defaultView.Event;
        input.value = '关键词';
        input.dispatchEvent(new ViewEvent('input', {}));
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.ok(wrapper.querySelector('.am-note-link-picker__empty').innerHTML.includes('搜索失败'), 'api failure shows failed text');
        picker.destroy();
        assert.equal(wrapper.querySelectorAll('.am-note-link-picker').length, 0, 'destroy removes panel');
    }

    // E4) 空关键词 → 空态文案（不发请求）
    {
        let fetchCalls = 0;
        global.fetch = async () => { fetchCalls += 1; return { ok: true, json: async () => ({ code: 0, msg: '', data: [] }) }; };
        const { document } = parseHTML('<!doctype html><html><body></body></html>');
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        const textarea = document.createElement('textarea');
        textarea.value = '[[';
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);
        const picker = plugin._openNoteLinkPicker(textarea, { start: 0, end: 2 }, () => {});
        const input = wrapper.querySelector('.am-note-link-picker__input');
        const ViewEvent = textarea.ownerDocument.defaultView.Event;
        input.dispatchEvent(new ViewEvent('input', {}));
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.equal(fetchCalls, 0, 'empty keyword does not fetch');
        assert.ok(wrapper.querySelector('.am-note-link-picker__empty'), 'empty keyword shows empty state');
        picker.destroy();
    }

    delete global.fetch;

    // ===== F) 详情卡集成 =====

    // F1) 备注含合法链接 → 锚点渲染 + 点击直达（openTab）
    {
        const a = buildAsset('02000000-0000-4000-8000-000000000011', 'virtualPerpetual', '买断软件', '相关文档 [' + '设计笔记' + '](siyuan://blocks/' + VALID_ID + ')');
        const h = createHarness([a]);
        h.plugin._formalDomainStateSnapshot.financialEvents = [purchaseEvent('00000000-0000-4000-8000-000000000201', a.id, 9900)];
        let openedWith = null;
        globalThis.__amOpenTabHook = options => { openedWith = options; };
        await h.plugin.openFormalProductCard(a.id);
        const card = h.plugin._productCardHost.querySelector('.am-product-card');
        const linkEl = card.querySelector('.am-note-link[data-note-block-id="' + VALID_ID + '"]');
        assert.ok(linkEl, 'detail card renders note link anchor with block id');
        linkEl.onclick({ preventDefault() {}, stopPropagation() {} });
        assert.ok(openedWith && openedWith.doc && openedWith.doc.id === VALID_ID, 'link click jumps via openTab with block id');
        delete globalThis.__amOpenTabHook;
    }

    // F2) 非法链接在详情卡保持字面（无锚点）
    {
        const a = buildAsset('02000000-0000-4000-8000-000000000012', 'physical', '相机', '[坏链接](siyuan://blocks/short)');
        const h = createHarness([a]);
        await h.plugin.openFormalProductCard(a.id);
        const card = h.plugin._productCardHost.querySelector('.am-product-card');
        assert.equal(card.querySelector('.am-note-link'), null, 'invalid link renders no anchor in detail card');
        assert.ok(card.querySelector('.am-product-notes').innerHTML.includes('[坏链接]'), 'invalid link stays literal text');
    }

    // ===== G) 编辑表单 blur 预览：链接点击直达且不进入编辑态 =====

    {
        const { document } = parseHTML('<!doctype html><html><body></body></html>');
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        const textarea = document.createElement('textarea');
        textarea.value = '文档 [' + '笔记' + '](siyuan://blocks/' + VALID_ID + ')';
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);
        let openedWith = null;
        globalThis.__amOpenTabHook = options => { openedWith = options; };
        plugin._bindMarkdownTextarea(textarea);
        const rendered = wrapper.querySelector('.am-md-rendered');
        assert.ok(rendered.querySelector('.am-note-link[data-note-block-id="' + VALID_ID + '"]'), 'blur preview renders link anchor');
        const linkEl = rendered.querySelector('.am-note-link');
        const ViewEvent = textarea.ownerDocument.defaultView.MouseEvent || textarea.ownerDocument.defaultView.Event;
        linkEl.dispatchEvent(new ViewEvent('click', { bubbles: true }));
        assert.ok(openedWith && openedWith.doc.id === VALID_ID, 'preview link click jumps to note');
        assert.ok(!wrapper.classList.contains('is-editing'), 'preview link click does not switch to edit mode');
        delete globalThis.__amOpenTabHook;
    }

    // G2) 移动端点击预览：光标直接落到末尾（不拆双链），桌面保持点击定位
    {
        const { document } = parseHTML('<!doctype html><html><body></body></html>');
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        const textarea = document.createElement('textarea');
        textarea.value = '文档 [' + '笔记' + '](siyuan://blocks/' + VALID_ID + ') 尾部';
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);
        globalThis.__amOpenTabHook = () => {};
        plugin.isMobile = true;
        // linkedom 无 getComputedStyle（getNotesScroller 未包 try），补最小 stub；
        // global.window 为 harness defineProperty 只读，改在其 defaultView 上挂 stub
        const g2View = document.defaultView;
        if (!g2View.getComputedStyle) g2View.getComputedStyle = () => ({ overflowY: 'visible' });
        if (!global.window) global.window = g2View;
        const selCalls = [];
        textarea.setSelectionRange = (start, end) => { selCalls.push([start, end]); };
        plugin._bindMarkdownTextarea(textarea);
        const rendered = wrapper.querySelector('.am-md-rendered');
        const ViewEvent = textarea.ownerDocument.defaultView.MouseEvent || textarea.ownerDocument.defaultView.Event;
        // 点击非链接区域（预览容器本身）
        rendered.dispatchEvent(new ViewEvent('click', { bubbles: true }));
        assert.ok(selCalls.length === 1 && selCalls[0][0] === textarea.value.length
            && selCalls[0][1] === textarea.value.length, 'mobile preview click moves caret to end');
        // 移动端点击链接仍跳转（截获分支优先于光标逻辑）；移动端走 openMobileFileById 钩子
        selCalls.length = 0;
        const linkEl = rendered.querySelector('.am-note-link');
        let mobileJumped = false;
        globalThis.__amOpenMobileHook = () => { mobileJumped = true; };
        linkEl.dispatchEvent(new ViewEvent('click', { bubbles: true }));
        assert.ok(mobileJumped, 'mobile link click still jumps via openMobileFileById');
        assert.ok(selCalls.length === 0, 'mobile link click does not set caret');
        plugin.isMobile = false;
        delete globalThis.__amOpenTabHook;
        delete globalThis.__amOpenMobileHook;
    }

    // ===== H) CSS 契约：锚点与浮层样式存在 =====

    {
        const cssText = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
        assert.match(cssText, /\.am-note-link-picker \{/, 'picker panel styles present');
        assert.match(cssText, /\.am-note-link-picker__row \{/, 'picker row styles present');
        assert.match(cssText, /\.am-product-notes \.am-note-link,/, 'detail card link styles present');
    }

    console.log('notes-note-link.test.js: all assertions passed');
    process.exit(0);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
