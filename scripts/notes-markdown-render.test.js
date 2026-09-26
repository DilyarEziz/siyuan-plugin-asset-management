'use strict';

/**
 * v1.3 阶段 1：Markdown 备注输入与安全渲染 — 回归测试。
 *
 * 覆盖目标：
 *   1) _renderAssetNotesHtml 对 XSS 输入安全（HTML escape 优先，绝不执行或激活）
 *      - <script>alert(1)</script>
 *      - <img src=x onerror=alert(1)>
 *      - <a href="javascript:alert(1)">x</a>
 *      - <svg onload=alert(1)>
 *      - <iframe src=javascript:...>
 *      - HTML 实体编码 &lt;script&gt; 注入
 *      - 事件属性 onclick / onerror / onload / onmouseover
 *   2) 多级标题 #~###### 语义化渲染
 *   3) 有序列表（数字 + 英文句点 + 空格）
 *   4) 无序列表（- / * / + 三种 marker）
 *   5) 普通文本保留换行（<br>），不被吞行
 *   6) 边界条件
 *      - 空 / null / undefined / 纯空白
 *      - 正文里出现 "7.5%" 之类含数字的句不应被误识别为有序列表
 *      - 标题前不留空格也必须识别
 *      - 列表项换行后不连续的不被合并
 *   7) 表单保存路径：textarea 仍保存原始 Markdown 字符串（持久化契约不被改）
 *   8) 产品详情卡渲染路径：物理 / 虚拟订阅 / 预付 三个 product card 都嵌入 notes section
 *      并使用 _renderAssetNotesHtml 输出（与上层契约一致）
 *   9) 现有 form 提交、detail 渲染、其他受控标记不回归
 */

const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { newFormalV2Asset, normalizeFinancialRecord } = require('../api/assets');
const { createHarness } = require('./formal-workflow-harness');

function purchaseEvent(id, assetId, amountMinor) {
    return normalizeFinancialRecord({
        id, assetId, occurredAt: '2026-07-01T08:00:00.000Z', effectiveDate: '2026-07-01',
        createdAt: '2026-07-01T08:00:00.000Z', source: 'user', correlationId: null,
        note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'purchase', currency: 'CNY', amountMinor,
    }, { now: '2026-07-01T08:00:00.000Z' });
}

/** Inject all sidecar arrays required by _formalDomainSnapshot. */
function fillSidecars(plugin, events) {
    plugin._financialEvents = events || [];
    plugin._subscriptionPeriods = [];
    plugin._prepaidTransactions = [];
    plugin._maintenanceRecords = [];
    plugin._usageRecords = [];
    plugin._lifecycleEvents = [];
    plugin._opLogs = [];
}

function detailsForKind(kind) {
    if (kind === 'physical') return { warrantyEndsOn: null, costGoal: null };
    if (kind === 'virtualSubscription') return { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: true };
    if (kind === 'virtualPerpetual') return { licenseAccountLabel: null };
    return { provider: 'Store', expiresOn: null };
}

function buildAsset(id, kind, name, notes) {
    return newFormalV2Asset({
        id, kind, name: name || kind, status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-01', statusChangedOn: '2026-07-01',
        tagIds: [], cover: { kind: 'none' }, notes: notes == null ? '' : notes,
        createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
        details: detailsForKind(kind),
    });
}

/** 提取 _renderAssetNotesHtml 实际输出的 HTML 文本（已在 linkedom 中安全的转义）。 */
function notesHtml(plugin, asset) {
    return plugin._renderAssetNotesHtml(asset.notes || '');
}

/** 断言渲染输出中**不**含危险 token（任何形式的活动标签、事件属性、javascript: 协议）。
 *  关键：检测器必须**只**匹配未转义的活动标签 / 事件属性。escape 后的 "&lt;img onerror=&gt;"
 *  是纯文本，浏览器不会激活，但我们的正则要把这种文本放行。
 *  因此正则一律要求"未转义的活动标签"：<tag ... on*= ...> 形式。 */
function assertNoActiveTokens(html) {
    // 1) 解析出所有未转义的活动标签（< 后面是字母，紧跟 on*= 属性）
    // 匹配 <tag ... on*=
    const liveTagWithEvent = /<[a-zA-Z][^>]*\son[a-z]+\s*=/i;
    assert.equal(liveTagWithEvent.test(html), false, `live tag with on*= event attribute leaked: ${html}`);
    // 2) 解析所有未转义的 <script / <iframe / <object / <embed / <svg / <math / <form
    //    （_renderAssetNotesHtml 只输出 h1-h6 / ol / ul / li / p / br 六个受控标签）
    const liveActiveTags = html.match(/<\s*(script|iframe|object|embed|svg|math|form|link|style|meta|base)\b/gi);
    assert.deepEqual(liveActiveTags, null, `forbidden live tag appeared: ${html}`);
    // 3) 未转义的 javascript: 协议
    const liveJsScheme = /<[^>]*javascript:/i;
    assert.equal(liveJsScheme.test(html), false, `live javascript: scheme leaked: ${html}`);
    // 4) 未转义的 data:text/html 协议
    const liveDataHtml = /<[^>]*data\s*:\s*text\/html/i;
    assert.equal(liveDataHtml.test(html), false, `live data:text/html leaked: ${html}`);
}

async function main() {
    // ===== Part A: 直接对 _renderAssetNotesHtml 做受控语法 / XSS 验证 =====
    const { plugin } = createHarness([]);

    // A0) 空 / null / 空白 / undefined → 返回 ''，不抛错
    assert.equal(plugin._renderAssetNotesHtml(''), '', 'empty notes returns empty string');
    assert.equal(plugin._renderAssetNotesHtml('   \n\t  \n  '), '', 'whitespace-only notes returns empty string');
    assert.equal(plugin._renderAssetNotesHtml(null), '', 'null notes returns empty string');
    assert.equal(plugin._renderAssetNotesHtml(undefined), '', 'undefined notes returns empty string');

    // A1) XSS：<script> 标签必须 escape 化（不是活动元素）
    const xssScript = '<script>alert(1)</script>';
    const out1 = notesHtml(plugin, { notes: xssScript });
    assertNoActiveTokens(out1);
    assert.ok(out1.includes('&lt;script&gt;'), 'script tag must be HTML-escaped');
    assert.ok(out1.includes('&lt;/script&gt;'), 'script closing tag must be escaped');
    assert.ok(!/<script/i.test(out1), 'no live <script> tag in output');

    // A2) XSS：<img onerror=...>
    const xssImg = '<img src=x onerror=alert(1)>';
    const out2 = notesHtml(plugin, { notes: xssImg });
    assertNoActiveTokens(out2);
    assert.ok(out2.includes('&lt;img'), 'img tag escaped');
    assert.ok(!/<img\b/i.test(out2), 'no live <img> tag in output');

    // A3) XSS：<a href="javascript:...">
    const xssAnchor = '<a href="javascript:alert(1)">click</a>';
    const out3 = notesHtml(plugin, { notes: xssAnchor });
    assertNoActiveTokens(out3);
    assert.ok(!/<a\b[^>]*href\s*=\s*["']?\s*javascript:/i.test(out3), 'no live <a href="javascript:..."> tag');
    assert.ok(out3.includes('&lt;a'), 'anchor opening escaped');

    // A4) XSS：<svg onload=...>
    const xssSvg = '<svg onload=alert(1)></svg>';
    const out4 = notesHtml(plugin, { notes: xssSvg });
    assertNoActiveTokens(out4);
    assert.ok(out4.includes('&lt;svg'), 'svg tag escaped');

    // A5) XSS：<iframe>
    const xssIframe = '<iframe src="javascript:alert(1)"></iframe>';
    const out5 = notesHtml(plugin, { notes: xssIframe });
    assertNoActiveTokens(out5);
    assert.ok(out5.includes('&lt;iframe'), 'iframe tag escaped');

    // A6) XSS：HTML 实体绕过尝试（&lt;script&gt;alert&lt;/script&gt;）→ escape 后只是普通字符
    const entityBypass = '&lt;script&gt;alert(1)&lt;/script&gt;';
    const out6 = notesHtml(plugin, { notes: entityBypass });
    assertNoActiveTokens(out6);
    // escape 后再 escape：& → &amp;  → 输出里只剩 &amp;lt;script&amp;gt; 文本
    assert.ok(out6.includes('&amp;lt;'), 'ampersand itself escaped');

    // A7) XSS：混合事件属性 + 受控语法（标题 + 列表 + 攻击）
    const mixed = '# 标题\n<script>alert(1)</script>\n- item 1\n1. first\n<img src=x onerror=alert(2)>';
    const out7 = notesHtml(plugin, { notes: mixed });
    assertNoActiveTokens(out7);
    // 受控语法部分必须语义化
    assert.ok(out7.startsWith('<h1>'), 'first heading rendered as h1');
    assert.ok(out7.includes('<ul>'), 'unordered list rendered');
    assert.ok(out7.includes('<li>item 1</li>'), 'ul item content rendered');
    assert.ok(out7.includes('<ol>'), 'ordered list rendered');
    assert.ok(out7.includes('<li>first</li>'), 'ol item content rendered');
    // 攻击部分必须 escape（标签 escape，属性作为文本）
    assert.ok(out7.includes('&lt;script&gt;'), 'script tag still escaped when mixed with headings');
    assert.ok(out7.includes('&lt;img'), 'img tag still escaped');
    assert.ok(!/<script\b/i.test(out7), 'no live <script> in mixed output');
    assert.ok(!/<img\b/i.test(out7), 'no live <img> in mixed output');

    // A8) 边界：正文里出现 "7.5%"、"v1.0" 不应被识别为有序列表
    const decimalSentence = 'Coverage 7.5% per year.\nAnd v1.0 was released.';
    const out8 = notesHtml(plugin, { notes: decimalSentence });
    assert.equal(out8.includes('<ol>'), false, '7.5% must not be treated as ordered list');
    assert.equal(out8.includes('<li>'), false, 'no <li> for decimal sentence');
    assert.ok(out8.includes('<p>'), 'decimal sentence is a paragraph');
    assert.ok(out8.includes('7.5%'), 'decimal preserved');
    assert.ok(out8.includes('v1.0'), 'version preserved');

    // A9) 边界：标题前不留空格 + 6 级
    const headings = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const out9 = notesHtml(plugin, { notes: headings });
    assert.equal(out9, '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>', 'h1-h6 all rendered');
    // 7 个 # 不被识别为合法标题（避免误匹配）
    const tooDeep = '####### too deep';
    const out9b = notesHtml(plugin, { notes: tooDeep });
    assert.ok(!out9b.includes('<h7>'), '7 hashes must not become h7');
    assert.ok(!out9b.includes('<h6>'), '7 hashes must not become h6 either');

    // A10) 有序列表：连续数字列表
    const olSample = '1. first\n2. second\n3. third';
    const out10 = notesHtml(plugin, { notes: olSample });
    assert.equal(out10, '<ol><li>first</li><li>second</li><li>third</li></ol>', 'ordered list rendered in order');

    // A11) 无序列表：- * + 三种 marker
    const ulDash = '- a\n- b\n- c';
    assert.equal(notesHtml(plugin, { notes: ulDash }), '<ul><li>a</li><li>b</li><li>c</li></ul>', 'dash ul list rendered');
    const ulStar = '* a\n* b';
    assert.equal(notesHtml(plugin, { notes: ulStar }), '<ul><li>a</li><li>b</li></ul>', 'star ul list rendered');
    const ulPlus = '+ a\n+ b\n+ c';
    assert.equal(notesHtml(plugin, { notes: ulPlus }), '<ul><li>a</li><li>b</li><li>c</li></ul>', 'plus ul list rendered');

    // A12) 段落：单行 & 多行
    const single = 'hello world';
    assert.equal(notesHtml(plugin, { notes: single }), '<p>hello world</p>', 'single line paragraph rendered');
    const multiline = 'line one\nline two\nline three';
    assert.equal(notesHtml(plugin, { notes: multiline }), '<p>line one<br>line two<br>line three</p>', 'multi-line paragraph uses <br>');
    const twoParagraphs = 'first paragraph\n\nsecond paragraph';
    assert.equal(notesHtml(plugin, { notes: twoParagraphs }), '<p>first paragraph</p><p>second paragraph</p>', 'blank line splits paragraphs');

    // A13) 综合：标题 + 段落 + 列表 + 段落
    const composed = '# Title\n\nIntro paragraph.\n\n- bullet one\n- bullet two\n\n1. numbered one\n2. numbered two\n\nTrailing text';
    const out13 = notesHtml(plugin, { notes: composed });
    assert.equal(out13, '<h1>Title</h1><p>Intro paragraph.</p><ul><li>bullet one</li><li>bullet two</li></ul><ol><li>numbered one</li><li>numbered two</li></ol><p>Trailing text</p>', 'composed doc rendered');

    // A14) 列表项内部不解析子语法（安全：绝不会嵌套 ul/ol）
    const listWithQuote = '- line one\n  continuation indented\n- line two';
    const out14 = notesHtml(plugin, { notes: listWithQuote });
    assert.ok(out14.includes('<ul>'), 'ul wrapper present');
    // indented 续行不应是独立 <li>（保持单层安全）
    const liCount14 = (out14.match(/<li>/g) || []).length;
    assert.equal(liCount14, 2, 'indented continuation must not become a separate <li>');
    // 续行作为正文，但与上一 li 用 <br> 合并 → "line one<br>  continuation indented"
    assert.ok(out14.includes('<li>line one<br>  continuation indented</li>') || out14.includes('<li>line one'), 'indented continuation joined with <br>');

    // A15) 原文保存契约：textarea 仍存原始字符串（不修改）
    const orig = '# H1\n<script>alert(1)</script>\n- a';
    const asset15 = buildAsset('01000000-0000-4000-8000-000000000001', 'virtualSubscription', 'svc', orig);
    assert.equal(asset15.notes, orig, 'asset.notes keeps raw markdown source after formal-v2 construction');

    // A16) HTML 实体字符 & 在原文里：渲染时再 escape 一次
    const ampText = 'A & B & C';
    assert.equal(notesHtml(plugin, { notes: ampText }), '<p>A &amp; B &amp; C</p>', 'ampersand escaped');
    const ltText = '1 < 2 and 2 > 1';
    assert.equal(notesHtml(plugin, { notes: ltText }), '<p>1 &lt; 2 and 2 &gt; 1</p>', 'lt/gt escaped');

    // A17) 性能：5000 字不崩
    const longText = 'a\n\n'.repeat(2500);
    const out17 = notesHtml(plugin, { notes: longText });
    assert.ok(out17.length > 0, '5000-char input renders without crash');
    assert.ok((out17.match(/<p>/g) || []).length >= 1000, '5000-char text yields many paragraphs');

    // A18) 标题里直接含 < 也必须 escape
    const headingWithLt = '# 1 < 2';
    assert.equal(notesHtml(plugin, { notes: headingWithLt }), '<h1>1 &lt; 2</h1>', 'lt inside heading escaped');
    const listWithXss = '- <img src=x onerror=alert(1)>';
    const out18 = notesHtml(plugin, { notes: listWithXss });
    assertNoActiveTokens(out18);
    assert.ok(out18.includes('&lt;img'), 'img inside li escaped');

    // A19) v2.6.7 行内 Markdown：加粗 / 斜体 / 删除线 / 行内代码
    // 加粗 **x**
    assert.equal(notesHtml(plugin, { notes: 'plain **bold** text' }), '<p>plain <strong>bold</strong> text</p>', 'bold rendered');
    // 斜体 *x*（行首单星无空格不会被误判为无序列表）
    assert.equal(notesHtml(plugin, { notes: '*em* text' }), '<p><em>em</em> text</p>', 'italic rendered');
    // 删除线 ~~x~~
    assert.equal(notesHtml(plugin, { notes: '~~gone~~ now' }), '<p><del>gone</del> now</p>', 'strikethrough rendered');
    // 行内代码 `x`
    assert.equal(notesHtml(plugin, { notes: 'run `npm test` now' }), '<p>run <code>npm test</code> now</p>', 'inline code rendered');
    // 代码内部的其他标记保持字面（代码片段语义优先）
    assert.equal(notesHtml(plugin, { notes: '`a **b** c`' }), '<p><code>a **b** c</code></p>', 'marks inside inline code stay literal');
    // 同一段混排
    const mixedInline = '**加粗** 和 *斜体* 和 ~~删除~~ 和 `代码`';
    assert.equal(notesHtml(plugin, { notes: mixedInline }), '<p><strong>加粗</strong> 和 <em>斜体</em> 和 <del>删除</del> 和 <code>代码</code></p>', 'mixed inline marks rendered');
    // 列表项 / 标题内也支持行内标记
    assert.equal(notesHtml(plugin, { notes: '- **重点** 事项' }), '<ul><li><strong>重点</strong> 事项</li></ul>', 'bold inside list item');
    assert.equal(notesHtml(plugin, { notes: '## **标题**' }), '<h2><strong>标题</strong></h2>', 'bold inside heading');
    // 误判防护：乘号空白分隔不转斜体（CommonMark flanking 简化版）
    assert.equal(notesHtml(plugin, { notes: '3 * 4 * 5' }), '<p>3 * 4 * 5</p>', 'spaced single stars stay literal');
    // 误判防护：不支持下划线语法，snake_case / __init__ 原样保留
    assert.equal(notesHtml(plugin, { notes: 'hello_world and __init__' }), '<p>hello_world and __init__</p>', 'underscore syntax not supported, snake_case intact');
    // 未配对标记保持字面
    assert.equal(notesHtml(plugin, { notes: 'a ** b * c' }), '<p>a ** b * c</p>', 'unpaired marks stay literal');
    // XSS 安全：行内标记包裹的脚本必须 escape
    const boldXss = '**<img src=x onerror=alert(1)>**';
    const out19 = notesHtml(plugin, { notes: boldXss });
    assertNoActiveTokens(out19);
    assert.equal(out19, '<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>', 'bold content is escaped text');
    // 加粗 + 实体字符混排
    assert.equal(notesHtml(plugin, { notes: '**A & B**' }), '<p><strong>A &amp; B</strong></p>', 'ampersand inside bold escaped');

    // A20) v2.6.7 下划线 ++x++（Markdown 扩展通用约定，与 ⌘U 快捷键配套）
    assert.equal(notesHtml(plugin, { notes: '++underline++ me' }), '<p><u>underline</u> me</p>', 'underline rendered');
    assert.equal(notesHtml(plugin, { notes: '**粗** 和 ++线++ 和 ~~删~~ 和 `码`' }), '<p><strong>粗</strong> 和 <u>线</u> 和 <del>删</del> 和 <code>码</code></p>', 'underline mixed with other inline marks');
    // 误判防护：普通加号 / C++ 字面保留
    assert.equal(notesHtml(plugin, { notes: '1 + 2 + 3' }), '<p>1 + 2 + 3</p>', 'spaced plus signs stay literal');
    assert.equal(notesHtml(plugin, { notes: 'C++ and Rust' }), '<p>C++ and Rust</p>', 'trailing ++ in C++ stays literal');
    // 代码片段内的下划线标记保持字面
    assert.equal(notesHtml(plugin, { notes: '`a ++b++ c`' }), '<p><code>a ++b++ c</code></p>', 'underline marks inside inline code stay literal');
    assert.equal(notesHtml(plugin, { notes: '++ a ++' }), '<p>++ a ++</p>', 'space-flanked ++ not treated as underline');

    // ===== Part B: 产品详情卡渲染路径 =====
    // 验证 _renderAssetNotesSectionHtml 在 three product card 渲染路径中被使用，
    // 且输出受控 HTML 注入到 .am-product-notes 容器。

    // B1) 物理资产 detail
    const physical = buildAsset('02000000-0000-4000-8000-000000000001', 'physical', '相机', '# 镜头\n- 24mm\n- 50mm');
    const { plugin: p1 } = createHarness([physical]);
    fillSidecars(p1, [purchaseEvent('00000000-0000-4000-8000-000000000101', physical.id, 12345)]);
    // v2.6.3 测试修复：openFormalProductCard 自 v2.4 起为 async（冷缓存先 hydrate
    // 种草事件再渲染），必须 await 后再断言，否则卡尚未挂载。
    await p1.openFormalProductCard(physical.id);
    const card1 = p1._productCardHost && p1._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    assert.ok(card1, 'physical product card rendered');
    const notes1 = card1.querySelector('.am-product-notes');
    assert.ok(notes1, 'physical product card contains .am-product-notes');
    const notesHtml1 = notes1.innerHTML;
    assertNoActiveTokens(notesHtml1);
    assert.ok(notesHtml1.includes('<h1>'), 'physical notes: h1 rendered');
    assert.ok(notesHtml1.includes('<ul>'), 'physical notes: ul rendered');
    assert.ok(notesHtml1.includes('24mm'), 'physical notes: list item content preserved');
    assert.equal(card1.querySelector('.am-product-section--notes .am-product-section__title').textContent.trim(), '备注', 'physical notes section title is "备注"');

    // B2) 虚拟订阅 detail
    const sub = buildAsset('02000000-0000-4000-8000-000000000002', 'virtualSubscription', 'Pro Plan', '1. 每月 88\n2. 自动续费');
    const { plugin: p2 } = createHarness([sub]);
    fillSidecars(p2, [purchaseEvent('00000000-0000-4000-8000-000000000102', sub.id, 8800)]);
    await p2.openFormalProductCard(sub.id);
    const card2 = p2._productCardHost && p2._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    assert.ok(card2, 'subscription product card rendered');
    const notes2 = card2.querySelector('.am-product-notes');
    assert.ok(notes2, 'subscription product card contains .am-product-notes');
    const notesHtml2 = notes2.innerHTML;
    assertNoActiveTokens(notesHtml2);
    assert.ok(notesHtml2.includes('<ol>'), 'subscription notes: ol rendered');
    assert.ok(notesHtml2.includes('每月 88'), 'subscription notes: ol item content preserved');

    // B3) 预付金额 detail
    const prepaid = buildAsset('02000000-0000-4000-8000-000000000003', 'prepaidAmount', 'Store Card', '## 充值说明\n\n一次充 500 起');
    const { plugin: p3 } = createHarness([prepaid]);
    fillSidecars(p3, [purchaseEvent('00000000-0000-4000-8000-000000000103', prepaid.id, 50000)]);
    await p3.openFormalProductCard(prepaid.id);
    const card3 = p3._productCardHost && p3._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    assert.ok(card3, 'prepaid product card rendered');
    const notes3 = card3.querySelector('.am-product-notes');
    assert.ok(notes3, 'prepaid product card contains .am-product-notes');
    const notesHtml3 = notes3.innerHTML;
    assertNoActiveTokens(notesHtml3);
    assert.ok(notesHtml3.includes('<h2>'), 'prepaid notes: h2 rendered');
    assert.ok(notesHtml3.includes('<p>一次充 500 起</p>'), 'prepaid notes: trailing paragraph preserved');

    // B4) 空备注不渲染空容器（避免布局异常）
    const empty = buildAsset('02000000-0000-4000-8000-000000000004', 'physical', '空', '');
    const { plugin: p4 } = createHarness([empty]);
    fillSidecars(p4, [purchaseEvent('00000000-0000-4000-8000-000000000104', empty.id, 1000)]);
    await p4.openFormalProductCard(empty.id);
    const card4 = p4._productCardHost && p4._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    assert.ok(card4, 'empty-notes product card rendered');
    const section4 = card4.querySelector('.am-product-section--notes');
    assert.equal(section4, null, 'empty notes must not produce a .am-product-section--notes container');

    // B5) 纯空白备注同样不渲染
    const blank = buildAsset('02000000-0000-4000-8000-000000000005', 'physical', '空白', '   \n  \t \n');
    const { plugin: p5 } = createHarness([blank]);
    fillSidecars(p5, [purchaseEvent('00000000-0000-4000-8000-000000000105', blank.id, 1000)]);
    await p5.openFormalProductCard(blank.id);
    const card5 = p5._productCardHost && p5._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    assert.equal(card5.querySelector('.am-product-section--notes'), null, 'whitespace notes must not produce a section');

    // B6) 产品卡注入：详情卡 body 内必须存在受控标签 h1/h2/.../ol/ul（保证 XSS 仍受控）
    const xssAsset = buildAsset('02000000-0000-4000-8000-000000000006', 'physical', 'XSS',
        '<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a>');
    const { plugin: p6 } = createHarness([xssAsset]);
    fillSidecars(p6, [purchaseEvent('00000000-0000-4000-8000-000000000106', xssAsset.id, 1000)]);
    await p6.openFormalProductCard(xssAsset.id);
    const card6 = p6._productCardHost && p6._productCardHost.querySelector('.am-product-card-mask .am-product-card');
    const html6 = card6.querySelector('.am-product-notes').innerHTML;
    assertNoActiveTokens(html6);
    assert.ok(html6.includes('&lt;script&gt;'), 'script in detail card escaped');
    assert.ok(html6.includes('&lt;img'), 'img in detail card escaped');
    assert.ok(html6.includes('&lt;a'), 'anchor in detail card escaped');
    // 解析后的 DOM 中不应有 script / iframe / img / svg 标签作为子节点
    const parsed6 = parseHTML(`<div>${html6}</div>`).document;
    assert.equal(parsed6.querySelector('script'), null, 'no <script> child in detail card notes');
    assert.equal(parsed6.querySelector('img'), null, 'no <img> child in detail card notes');
    assert.equal(parsed6.querySelector('iframe'), null, 'no <iframe> child in detail card notes');
    assert.equal(parsed6.querySelector('a'), null, 'no <a> child in detail card notes (anchor not in supported syntax)');

    // ===== Part D: v2.6.7 行内快捷键（⌘/Ctrl+B 加粗等，交互对齐思源默认键位）=====
    {
        const { plugin: p8, document: doc8 } = createHarness([]);
        const ta = doc8.createElement('textarea');
        ta.setAttribute('name', 'notes');
        doc8.body.appendChild(ta);
        const binding = p8._bindMarkdownTextarea(ta);

        // D1) _mdToggleInlineWrap 纯交互：包裹 / 解除 / 紧贴成对 / 空选区
        ta.value = 'hello world';
        ta.selectionStart = 0; ta.selectionEnd = 5;
        p8._mdToggleInlineWrap(ta, '**');
        assert.equal(ta.value, '**hello** world', 'shortcut wraps selection with bold marker');
        ta.selectionStart = 0; ta.selectionEnd = 9;
        p8._mdToggleInlineWrap(ta, '**');
        assert.equal(ta.value, 'hello world', 're-applying on wrapped selection unwraps it');
        ta.value = '**hello** world';
        ta.selectionStart = 2; ta.selectionEnd = 7;
        p8._mdToggleInlineWrap(ta, '**');
        assert.equal(ta.value, 'hello world', 'selection hugging a marker pair removes the markers');
        ta.value = 'abc';
        ta.selectionStart = 3; ta.selectionEnd = 3;
        p8._mdToggleInlineWrap(ta, '~~');
        assert.equal(ta.value, 'abc~~~~', 'empty selection inserts an empty marker pair');

        // D2) keydown 路由：Cmd/Ctrl+B → 加粗、Ctrl+Shift+S → 删除线、Cmd+Option+B（标题档）不受影响
        const fireKey = (init) => {
            const ev = new doc8.defaultView.Event('keydown', { bubbles: true, cancelable: true });
            Object.assign(ev, init);
            ta.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        ta.value = 'select me';
        ta.selectionStart = 0; ta.selectionEnd = 9;
        assert.equal(fireKey({ code: 'KeyB', ctrlKey: true, shiftKey: false, altKey: false }), true, 'Ctrl+B is consumed by the notes editor');
        assert.equal(ta.value, '**select me**', 'Ctrl+B routes to bold wrap');
        ta.selectionStart = 2; ta.selectionEnd = 11;
        assert.equal(fireKey({ code: 'KeyS', ctrlKey: true, shiftKey: true, altKey: false }), true, 'Ctrl+Shift+S is consumed by the notes editor');
        assert.equal(ta.value, '**~~select me~~**', 'Ctrl+Shift+S routes to strikethrough wrap');
        ta.selectionStart = 0; ta.selectionEnd = 0;
        assert.equal(fireKey({ code: 'KeyU', ctrlKey: true, shiftKey: false, altKey: false }), true, 'Ctrl+U is consumed by the notes editor');
        assert.equal(ta.value, '++++**~~select me~~**', 'Ctrl+U routes to underline wrap');
        ta.value = '# plain heading line';
        ta.selectionStart = 2; ta.selectionEnd = 2;
        assert.equal(fireKey({ code: 'KeyB', ctrlKey: true, altKey: true, shiftKey: false }), false, 'Cmd+Option+B (heading tier combo) is not intercepted');
        assert.equal(ta.value, '# plain heading line', 'heading combo leaves the value untouched');

        // D3) 备注输入框渲染快捷键提示行；销毁后随 wrapper 移除
        const hint = ta.parentNode.querySelector('[data-md-shortcut-hint]');
        assert.ok(hint, 'notes textarea shows the shortcut hint line');
        assert.match(hint.textContent, /Ctrl\+B/, 'hint lists the bold shortcut');
        binding.destroy();
        assert.equal(doc8.querySelector('[data-md-shortcut-hint]'), null, 'destroy removes the hint with the wrapper');
    }

    // ===== Part C: 表单保存路径不回归 =====
    // C1) 编辑表单 notes textarea 仍保存原始 Markdown 字符串。
    const { plugin: p7, document: doc7 } = createHarness([]);
    p7.addAsset = async () => ({ id: '03000000-0000-4000-8000-000000000001' });
    p7.openFormalAssetSheet('virtualSubscription', { asset: null, id: '03000000-0000-4000-8000-000000000001' });
    const mask7 = doc7.querySelector('.am-edit-sheet-mask');
    assert.ok(mask7, 'edit sheet mask opened for virtualSubscription');
    // Wire form elements proxy + checkValidity (linkedom 不带原生 form 方法)
    mask7.querySelectorAll('form').forEach(f => {
        const elements = new Proxy({}, { get(_t, name) { return f.querySelector(`[name="${String(name)}"]`) || undefined; } });
        Object.defineProperty(f, 'elements', { value: elements, configurable: true });
        f.checkValidity = () => true;
        f.reportValidity = () => {};
    });
    const form7 = mask7.querySelector('form');
    assert.ok(form7.querySelector('textarea[name="notes"]'), 'virtualSubscription form exposes notes textarea');
    const md = '# 备注标题\n- a\n- b';
    form7.querySelector('textarea[name="notes"]').textContent = md;
    // 抓取 DTO 路径：用 addAsset stub 收集 dto
    let captured = null;
    p7.addAsset = async (dto) => { captured = dto; return { id: '03000000-0000-4000-8000-000000000001' }; };
    return Promise.resolve(form7.onsubmit({ preventDefault() {}, currentTarget: form7 })).then(() => {
        assert.ok(captured, 'submit captured');
        assert.equal(captured.notes, md, 'submitted dto.notes preserves raw markdown (form save does not mutate)');
        console.log('[notes-markdown-render] passed');
    });
}

(async () => { await main(); })().catch(error => { console.error('[notes-markdown-render] failed:', error); process.exit(1); });
