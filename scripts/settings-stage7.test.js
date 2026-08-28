'use strict';

// v0.18 阶段 7：设置优化 + 汇率手动维护 + 操作日志中文化 验收测试。
// 覆盖：
//   1. 数据 Tab 精简（无 JSON 导入导出 / 无初始化正式数据，仅 Markdown 导出）
//   2. 常规 Tab 汇率设置入口
//   3. 关于 Tab（无 Github、作者链接跳 ld246、版本 1.1.0）
//   4. 操作日志：时间格式化（非 ISO 裸串）、type→中文、历史英文 note 中文化
//   5. 汇率写入语义（用户填 7.20 → rates.USD≈0.1389 → convertToCNYMinor 得 72000）
//   6. 脚注判据收敛（hasUserRates 仅看 rates 非空）
//   7. v2.6.4 自动刷新闸门：存量（有 rates 无 source）/显式 manual 绝不覆盖；
//      source=auto 按 24h 续更；新用户（无 rates）首启拉取

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');

function loadPluginClass() {
    const originalLoad = Module._load;
    if (!global.navigator) global.navigator = { userAgent: '' };
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class {}, Dialog: class {}, Menu: class {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally { Module._load = originalLoad; }
}

const NO_ASCII_LETTER = /^[^A-Za-z]*$/;

function uiContracts() {
    const PluginClass = loadPluginClass();
    const plugin = new PluginClass();
    plugin._t = (_key, fallback) => fallback;
    plugin.settings = { defaultSort: 'default', defaultViewMode: 'list' };
    plugin._exchangeRates = null;

    // --- 1. 数据 Tab 精简 ---
    const dataHtml = plugin.renderSettingsData();
    assert.doesNotMatch(dataHtml, /formal-json-download/, 'JSON 导出 UI 已隐藏');
    assert.doesNotMatch(dataHtml, /formal-json-copy/, 'JSON 复制 UI 已隐藏');
    assert.doesNotMatch(dataHtml, /formal-json-import/, 'JSON 导入 UI 已隐藏');
    assert.doesNotMatch(dataHtml, /data-formal-json-file/, 'JSON 文件选择器已隐藏');
    assert.doesNotMatch(dataHtml, /formal-reset-all/, '初始化正式数据 UI 已移除');
    assert.doesNotMatch(dataHtml, /am-settings-danger-zone/, '危险区已移除');
    assert.match(dataHtml, /data-action="markdown-export"/, 'Markdown 导出保留');
    assert.match(dataHtml, /data-action="markdown-copy"/, 'Markdown 复制保留');
    assert.match(dataHtml, /data-markdown-export-result/, 'Markdown 结果框保留');

    // --- 2. 常规 Tab 汇率设置入口（v2.6.4 重构：输入框改占位提示，空=保持不变）---
    const generalHtml = plugin.renderSettingsGeneral();
    assert.match(generalHtml, /am-exchange-rate-settings/, '汇率设置区块存在');
    assert.match(generalHtml, /name="exchangeRateUsdToCny"/, '汇率输入框存在');
    assert.match(generalHtml, /data-action="exchange-rate-save"/, '汇率保存按钮存在');
    assert.match(generalHtml, /placeholder="7\.2000"/, 'rates 空时 USD 输入框以默认参考 7.2000 作占位');
    assert.match(generalHtml, /name="exchangeRateAutoRefresh"/, '自动更新开关存在');
    assert.match(generalHtml, /am-exchange-rate-settings__badge--default/, 'rates 空时显示默认参考徽章');

    // 已有汇率时占位值 = 1 / rates.USD
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 } };
    const generalHtml2 = plugin.renderSettingsGeneral();
    assert.match(generalHtml2, /placeholder="7\.1994"/, '占位值 = 1 / rates.USD（≈7.1994）');
    assert.match(generalHtml2, /am-exchange-rate-settings__badge--manual/, '存量数据（无 source）落手动设置徽章');

    // v2.6.4：source 徽章渲染分支
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, source: 'auto' };
    const generalHtml3 = plugin.renderSettingsGeneral();
    assert.match(generalHtml3, /am-exchange-rate-settings__badge--auto/, 'source=auto 显示自动更新徽章');
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, source: 'manual' };
    const generalHtml4 = plugin.renderSettingsGeneral();
    assert.match(generalHtml4, /am-exchange-rate-settings__badge--manual/, 'source=manual 显示手动设置徽章');
    plugin._exchangeRates = null;

    // --- 3. 关于 Tab ---
    const aboutHtml = plugin.renderSettingsAbout();
    assert.doesNotMatch(aboutHtml, /github\.com/i, '关于页不再出现 Github 地址');
    assert.doesNotMatch(aboutHtml, /GITHUB_URL/, '关于页不再引用 GITHUB_URL');
    assert.match(aboutHtml, /https:\/\/ld246\.com\/member\/Dilyar/, '作者链接跳转 ld246 社区主页');
    assert.match(aboutHtml, /am-settings__about-author-link/, '作者名为可点击链接');
    const pluginVersion = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).version;
    assert.match(aboutHtml, new RegExp('v' + pluginVersion.split('.').join('\\.')), '关于页版本 == plugin.json ' + pluginVersion);

    // --- 6. 脚注判据收敛（源码级）---
    assert.match(source, /const hasUserRates = Object\.keys\(rates\)\.length > 0;/,
        'hasUserRates 收敛为「rates 非空才算手动设置」');
    assert.doesNotMatch(source, /hasUserRates = Object\.keys\(rates\)\.length > 0 \|\| !!ratesObj\.updatedAt/,
        '旧的 updatedAt 误判分支已移除');
}

function opLogHelpers() {
    const PluginClass = loadPluginClass();
    const plugin = new PluginClass();
    plugin._t = (_key, fallback) => fallback; // 返回中文兜底，验证「无英文字符」

    // --- 4a. 时间格式化：ISO 裸串 → 本地 YYYY-MM-DD HH:mm ---
    const formatted = plugin._formatOperationLogTime('2026-07-24T15:30:00.000Z');
    assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, '格式化为本地日期+时间');
    assert.ok(!formatted.includes('T') && !formatted.includes('Z'), '不含 ISO 裸串的 T/Z');
    assert.equal(plugin._formatOperationLogTime(null), '', '空时间戳返回空串');
    assert.equal(plugin._formatOperationLogTime('not-a-date'), '', '非法时间戳返回空串');

    // --- 4b. type → 中文，覆盖代码中全部 action 取值 ---
    const cases = {
        'add': '新增', 'update': '修改', 'delete': '删除', 'set-status': '状态变更',
        'wishlist-purchase': '种草转正', 'wishlist-abandon': '拔草',
        'subscription-renew': '订阅续订', 'subscription-auto-renew-toggle': '自动续费切换',
        'prepaid-opening': '预付开卡', 'prepaid-inflow': '预付充值',
        'prepaid-outflow': '预付消费', 'prepaid-refund': '预付退款', 'prepaid-adjust': '预付校正',
        'maintenance-add': '添加维保', 'physical-retire': '实物退役', 'physical-sale': '实物转让',
        'tag-create': '标签创建', 'tag-delete': '标签删除',
    };
    for (const [type, zh] of Object.entries(cases)) {
        const label = plugin._operationLogTypeLabel(type);
        assert.equal(label, zh, `type ${type} → ${zh}`);
        assert.match(label, NO_ASCII_LETTER, `type ${type} 标签无英文字符`);
    }
    assert.equal(plugin._operationLogTypeLabel('something-unknown'), '其它', '未知 type 落「其它」');
    assert.match(plugin._operationLogTypeLabel('something-unknown'), NO_ASCII_LETTER, '兜底标签无英文字符');

    // --- 4c. 历史英文 note 中文化 ---
    assert.equal(plugin._normalizeOperationLogNote('formal-v2 count adjustment'), '次数校正');
    assert.equal(plugin._normalizeOperationLogNote('formal-v2 amount adjustment'), '金额校正');
    assert.equal(plugin._normalizeOperationLogNote('FORMAL-V2 COUNT ADJUSTMENT'), '次数校正', '大小写不敏感');
    assert.equal(plugin._normalizeOperationLogNote(''), '', '空 note 返回空串');
    assert.equal(plugin._normalizeOperationLogNote(null), '', 'null note 返回空串');
    assert.equal(plugin._normalizeOperationLogNote('自定义原因'), '自定义原因', '中文 note 原样保留');
}

async function exchangeRateWriteSemantics() {
    const { asset, createHarness } = require('./formal-workflow-harness');
    const algos = require('../api/algorithms');
    const ID = 'a5000000-0000-4000-8000-000000000001';
    const h = createHarness([asset(ID, 'physical', 'Phone')]);

    // 用户填 X = 7.20（1 USD = 7.20 CNY）→ rates.USD = 1 / 7.20
    const X = 7.20;
    const usdRate = 1 / X;
    assert.ok(Math.abs(usdRate - 0.1389) < 0.001, '1/7.20 ≈ 0.1389');

    const transaction = await h.plugin.storage.mutateFormalAssetDomain(async () => ({
        change: { exchangeRates: { baseCurrency: 'CNY', rates: { USD: usdRate } } },
    }));
    const committed = transaction.exchangeRates;
    assert.equal(committed.baseCurrency, 'CNY', 'baseCurrency 写为 CNY');
    assert.ok(Math.abs(committed.rates.USD - usdRate) < 1e-12, 'rates.USD = 1/X 持久化');
    assert.equal(committed.schemaVersion, 1, 'schemaVersion 由 storage 补齐为 1');
    assert.ok(typeof committed.updatedAt === 'string' && committed.updatedAt.length > 0, 'updatedAt 由 storage 补齐');

    // 读回一致
    const readBack = await h.plugin.storage.readExchangeRates();
    assert.ok(Math.abs(readBack.rates.USD - usdRate) < 1e-12, 'readExchangeRates 读回一致');

    // 换算语义：$100.00（10000 minor）→ ¥720.00（72000 minor），非 fallback
    const result = algos.convertToCNYMinor(10000, 'USD', committed);
    assert.equal(result.isFallback, false, '用户汇率非 fallback');
    assert.equal(result.cnyMinor, 72000, 'amountCNY = amountUSD * 7.20（¥720.00）');

    // 空 rates（重置后空态）→ 严格走默认参考汇率（fallback）
    const empty = { schemaVersion: 1, baseCurrency: 'CNY', rates: {}, updatedAt: committed.updatedAt };
    const fallback = algos.convertToCNYMinor(10000, 'USD', empty);
    assert.equal(fallback.isFallback, true, 'rates 空 → 默认参考汇率');
    assert.equal(fallback.cnyMinor, 72000, '默认 7.20 同样得 ¥720.00');
}

async function maybeAutoRefreshGate() {
    const PluginClass = loadPluginClass();
    const plugin = new PluginClass();
    plugin._t = (_key, fallback) => fallback;
    plugin._unloaded = false;
    plugin._settingsLoadGateLoaded = true; // 视为设置已加载，跳过 gate 等待
    plugin.settings = { exchangeRateAutoRefresh: true };

    // spy 替代真实 _refreshExchangeRates：只计调用次数，不真正发网络请求
    let refreshCalls = 0;
    plugin._refreshExchangeRates = () => { refreshCalls += 1; return Promise.resolve(true); };

    // --- 7a. ≤2.6.3 存量：有 rates 但无 source → 绝不触发自动刷新 ---
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, updatedAt: '2020-01-01T00:00:00.000Z' };
    await plugin._maybeAutoRefreshExchangeRates();
    assert.equal(refreshCalls, 0, '存量汇率（有 rates 无 source）不被自动刷新覆盖');

    // --- 7b. 显式 manual → 同样不覆盖 ---
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, source: 'manual', updatedAt: '2020-01-01T00:00:00.000Z' };
    await plugin._maybeAutoRefreshExchangeRates();
    assert.equal(refreshCalls, 0, '显式手动汇率不被自动刷新覆盖');

    // --- 7c. source=auto 且已过期（>24h）→ 续更 ---
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, source: 'auto', updatedAt: '2020-01-01T00:00:00.000Z' };
    await plugin._maybeAutoRefreshExchangeRates();
    assert.equal(refreshCalls, 1, 'auto 来源且已过期触发静默刷新');

    // --- 7d. source=auto 但未过期 → 不刷新 ---
    plugin._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 }, source: 'auto', updatedAt: new Date().toISOString() };
    await plugin._maybeAutoRefreshExchangeRates();
    assert.equal(refreshCalls, 1, 'auto 来源未过期不触发刷新');

    // --- 7e. 新用户（无 rates）→ 首启拉取 ---
    plugin._exchangeRates = null;
    await plugin._maybeAutoRefreshExchangeRates();
    assert.equal(refreshCalls, 2, '新用户无汇率首启触发拉取');
}

(async () => {
    uiContracts();
    opLogHelpers();
    await exchangeRateWriteSemantics();
    await maybeAutoRefreshGate();
    console.log('[settings-stage7] passed');
})().catch(error => { console.error(error); process.exit(1); });
