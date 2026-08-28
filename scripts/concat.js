#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * SiYuan 资产管理插件 — formal-v2 单文件构建
 *
 * 把 api/*.js 的内容用 IIFE 拼接到 src.template.js 顶部，生成单文件 index.js。
 *
 * 为什么要这个脚本？
 *   思源 loader (`app/src/plugin/loader.ts`) 只读取 `index.js` / `kernel.js` / `index.css` / `i18n/`
 *   不会读 `api/*.js`。插件代码里的 `require("./api/xxx")` 相对路径也解析不了
 *   （requireFunc 只支持 "siyuan" 模块名 + window.require 兜底）。
 *   因此部署产物必须是单文件，把 api 内联到 index.js 顶部。
 *
 * 用法：
 *   node scripts/concat.js            # 生成 index.js（覆盖）
 *   node scripts/concat.js --check    # 只输出 hash/size，不写文件
 *
 * 工作流：
 *   1. 修改 api/*.js 或 src.template.js
 *   2. 跑 `node scripts/concat.js`
 *   3. 生成最终 index.js
 *   4. cp index.js $WS/data/plugins/siyuan-plugin-asset-management/index.js
 *
 * 输出结构（index.js 顶部）：
 *   const { Plugin, Dialog, Menu } = require("siyuan");
 *   const __am_algos = (function() { ...algorithms 内容... return {...}; })();
 *   const __am_fx = (function() { ...exchange-rate-api 内容... return {...}; })();
 *   const __am_utils = (function() { ... });
 *   const __am_media = (function() { ... });
 *   const __am_resource_index = (function() { ... });
 *   const __am_assets = (function() { ... });
 *   const __am_reports = (function() { ... });
 *   const __am_agent_actions = (function() { ... });
 *   const __am_storage = (function() { ... });
 *   const __am_note_link = (function() { ... });
 *   const __am_icons = (function() { ... });
 *   // 然后是 src.template.js 的主代码
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');
const TEMPLATE_FILE = path.join(ROOT, 'src.template.js');
const INDEX_FILE = path.join(ROOT, 'index.js');
const KERNEL_TEMPLATE_FILE = path.join(ROOT, 'kernel.template.js');
const KERNEL_FILE = path.join(ROOT, 'kernel.js');
const PKG_FILE = path.join(ROOT, 'plugin.json');

const SOURCE_PLACEHOLDER = '// __AM_API_INJECTION_POINT__';

function readFile(p) {
    return fs.readFileSync(p, 'utf8');
}

function md5(s) {
    return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * 把单个 api 文件内容包成 IIFE（去掉 module.exports + 文件头注释 + 模块导出注释，挂到指定全局变量）。
 *
 * v0.9.2 精简策略：
 *   1. 删除文件顶部 JSDoc 注释块（`/* eslint-disable *\/` 到首个 `*\/`）
 *   2. 删除文件顶部 'use strict' 之后的所有 `// ======` 分隔线 + 标题块
 *   3. 删除文件底部 `// 模块导出` 注释 + `// ======` 分隔线 + module.exports 块
 *   4. 删除 body 里的 `const { x } = require('./y');`
 *
 * @param {string} src   原始文件内容
 * @param {string} nsName 输出 namespace 名（如 __am_algos）
 * @returns {string}
 */
function wrapAsIIFE(src, nsName) {
    // 1. 用 lastIndexOf 找 module.exports 块位置
    const exportsStart = src.lastIndexOf('module.exports');
    if (exportsStart < 0) {
        throw new Error(`未找到 module.exports 块`);
    }

    // 2. 从 module.exports 往后找匹配的 `}`
    const braceStart = src.indexOf('{', exportsStart);
    let depth = 0;
    let inStr = null;
    let inLineComment = false;
    let inBlockComment = false;
    let exportsEnd = -1;
    for (let i = braceStart; i < src.length; i++) {
        const ch = src[i];
        const next = src[i + 1];
        if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
        if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; i++; } continue; }
        if (inStr) {
            if (ch === '\\') { i++; continue; }
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) { exportsEnd = i + 1; break; }
        }
    }
    if (exportsEnd < 0) {
        throw new Error(`未找到 module.exports 块的结束 }`);
    }

    // 3. 提取 module.exports 内容（去掉外层 `{}`）
    const exportsBody = src.slice(braceStart + 1, exportsEnd - 1).trim();

    // 4. 删除 module.exports 块（+ 上方注释分隔线）
    const moduleExportComment = src.lastIndexOf('// 模块导出', exportsStart);
    let cutIdx;
    if (moduleExportComment >= 0) {
        const beforeBlock = src.lastIndexOf('\n// ====', moduleExportComment);
        cutIdx = beforeBlock >= 0 ? beforeBlock : src.lastIndexOf('\n', moduleExportComment - 1);
    } else {
        cutIdx = src.lastIndexOf('\n', exportsStart - 1);
    }
    let body = src.slice(0, cutIdx).trim();

    // 5. 删除文件顶部连续的 JSDoc / eslint 注释块
    //    重复匹配直到头部没有 /* 开头为止
    let prev;
    do {
        prev = body;
        body = body.replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, '');
    } while (body !== prev);

    // 6. 删除 'use strict' 之后的 `// ======` 分隔线块（包括上下分隔 + 中间标题）
    //    匹配连续的多行 `// =...=` 及其后紧跟的非空注释行
    body = body.replace(/^\/\/ ={3,}\s*\n(?:[^\n]*\n)*?\/\/ ={3,}\s*\n/gm, '');

    // 7. 删除单独一行的 `// ----- xxx -----` 之类的分隔
    body = body.replace(/^\/\/ -----+.*\n/gm, '');

    // 8. 删除单行 `// xxx` 注释（保留 JSDoc 形式已删除，普通行注释可删）
    //    保留含代码的单行（不在行首的 //）
    body = body.replace(/^[ \t]*\/\/[^\n]*\n/gm, '');

    // 9. 把多个连续空行压成单个
    body = body.replace(/\n{3,}/g, '\n\n').trim();

    // 10. 把 `const { x, y } = require('./mod');` 替换成对应的 __am_mod.x
    //     注意：mod 名 → nsName 映射由 build() 调用时传入
    body = injectRequireGlobals(body, nsName);

    return [
        `const ${nsName} = (function() {`,
        body,
        `    return {${exportsBody}};`,
        `})();`,
    ].join('\n\n');
}

/**
 * v0.15 destructure 块（main template 实际用到的导出）。
 * 清理过的引用：
 *   - 保留 formatRemainingBadge（详情卡 inner 在 src.template.js 3904/3966/4047 裸用，必须解构，否则详情面板 ReferenceError 崩溃）
 *   - 删 currencySymbol（主代码统一走 formatCurrency，不再单独取符号）
 *   - 删 STORAGE_FILES（main template 用 this.storage.raw.read 命名访问）
 *   - 删 toast / safe / safeAsync / formatRelativeTime（main template 自带 showToast）
 *
 * 仅注入 src.template.js 真正引用的顶层导出。账本 sidecar API 保持在
 * `createStorage()` 的实例上，当前阶段不向 UI 注入未使用的符号。
 *
 */
function getDestructureBlock() {
    return [
        'const { escapeHtml, genId, createStableId, formatDate: fmtDate, todayISO, daysBetween, daysUntil, formatCNY: fmtPrice, formatCurrency, ISO4217_CODES, currencyExponent, parseMajorToMinor, minorToMajorString, formatAmountMinor, formatRemainingBadge, DEFAULT_USD_CNY_RATE, convertToCNYMinor, formatCNYApproxHint } = __am_algos;',
        'const {',
        '    STATUSES,',
        '    SORTS,',
        '    STATUS_MAP,',
        '    SORT_MAP,',
        '    FORMAL_ASSET_KIND,',
        '    FORMAL_ASSET_KINDS,',
        '    FORMAL_WISHLIST_TARGET_GROUPS,',
        '    FORMAL_BILLING_CYCLES,',
        '    FORMAL_CATEGORIES,',
        '    ASSET_STATUS,',
        '    newFormalV2Asset,',
        '    validateFormalV2Asset,',
        '    mergeFormalV2AssetPatch,',
        '    projectFormalAsset,',
        '    projectFormalFinancials,',
        '    projectFormalSubscription,',
        '    projectFormalPrepaid,',
        '    projectFormalUsage,',
        '    getFormalExpiryOn,',
        '    getFormalNextImportantDate,',
        '    normalizeSubscriptionPeriodRecord,',
        '    normalizeFinancialRecord,',
        '    validateSubscriptionPeriodsNoOverlap,',
        '    validateFinancialReplacementChain,',
        '    addBusinessDays,',
        '    getSubscriptionPeriodEnd,',
        '    FINANCIAL_DIRECTION,',
        '    FINANCIAL_EVENT_TYPE,',
        '    LIFECYCLE_EVENT_TYPE,',
        '    formalDailyAmountMinor,',
        '    computeStats,',
        '    applyFilter,',
        '} = __am_assets;',
        'const { createStorage, DEFAULT_SETTINGS, OPERATION_LOG_MAX } = __am_storage;',
        'const agentActions = __am_agent_actions;',
        'const { createNoteLinkEngine, formatSyncTime } = __am_note_link;',
        'const { buildFormalReport, buildFormalDashboard, deriveWishlistHeartbeat, describeWishlistHeartbeat } = __am_reports;',
        'const media = __am_media;',
        'const resourceIndex = __am_resource_index;',
        'const icons = __am_icons;',
        // v2.6.4 阶段1：汇率 API 解析模块（前端专用，kernel 不注入）。
        'const exchangeRateApi = __am_fx;',
    ].join('\n');
}

/**
 * 压缩 main template 里的 HTML 模板字符串（保留 JS 代码可读）。
 *
 * 策略：找所有 `\`...\`` 模板字符串（反引号），对它们：
 *   1. 去掉每行前导空白
 *   2. 把多个连续空白压成单个空格
 *   3. 保留 JS 插值（${...}）原样
 *
 * 保留可读性：JS 逻辑部分（class methods、对象字面量）不动。
 */
function minifyHtmlTemplates(src) {
    return src.replace(/`([^`\\]|\\.)*`/g, (match) => {
        // match 是整个模板字符串（含外侧反引号）
        const inner = match.slice(1, -1);
        // 1. 去掉行前导空白（每行开头）
        const stripped = inner.replace(/^[ \t]+/gm, '');
        // 2. 把连续空白压成单个空格，但保留 ${} 表达式完整
        // 简单做法：先把 ${...} 占位符替换为不可见 token，再压缩空白，再换回
        const placeholders = [];
        const TOKEN = '\u0001__AM_TOKEN__\u0002';
        const tokenized = stripped.replace(/\$\{[^}]*\}/g, (m) => {
            placeholders.push(m);
            return TOKEN + (placeholders.length - 1) + TOKEN;
        });
        const collapsed = tokenized
            .replace(/\s*\n\s*/g, ' ')          // 跨行空白压成一个空格
            .replace(/[ \t]+/g, ' ')              // 多个空格压成一个
            .replace(/>\s+</g, '><')              // 标签间空白去掉
            .replace(/\s+>/g, '>')                // 闭合前空白
            .replace(/<\s+/g, '<')                // 开始后空白
            .trim();
        // 还原 ${...}
        const restored = collapsed.replace(new RegExp(TOKEN + '(\\d+)' + TOKEN, 'g'), (_, i) => placeholders[+i]);
        return '`' + restored + '`';
    });
}

/**
 * 把 `const { x, y } = require('./mod');` 替换成 `const { x, y } = __am_<ns>;`
 * mod 名 → nsName 映射（algorithms 不规则：api 文件名是 algorithms.js，但 ns 是 __am_algos）。
 */
const MOD_TO_NS = {
    algorithms: '__am_algos',
    'exchange-rate-api': '__am_fx',
    'agent-actions': '__am_agent_actions',
    assets: '__am_assets',
    media: '__am_media',
    'resource-index': '__am_resource_index',
    report: '__am_reports',
    storage: '__am_storage',
    'note-link': '__am_note_link',
    utils: '__am_utils',
    icons: '__am_icons',
};

function injectRequireGlobals(body, nsName) {
    return body.replace(
        /^[ \t]*const\s+\{([^}]+)\}\s*=\s*require\(['"]\.\/([a-z-]+)['"]\);?[ \t]*\r?\n/gm,
        (match, vars, depMod) => {
            const ns = MOD_TO_NS[depMod];
            if (!ns) return match; // 未知模块，不替换
            return `const {${vars}} = ${ns};\n`;
        }
    );
}

function build() {
    if (!fs.existsSync(API_DIR)) {
        throw new Error(`api/ not found: ${API_DIR}`);
    }
    if (!fs.existsSync(TEMPLATE_FILE)) {
        throw new Error(`src.template.js not found: ${TEMPLATE_FILE}`);
    }

    const algosSrc = readFile(path.join(API_DIR, 'algorithms.js'));
    const exchangeRateApiSrc = readFile(path.join(API_DIR, 'exchange-rate-api.js'));
    const agentActionsSrc = readFile(path.join(API_DIR, 'agent-actions.js'));
    const assetsSrc = readFile(path.join(API_DIR, 'assets.js'));
    const mediaSrc = readFile(path.join(API_DIR, 'media.js'));
    const resourceIndexSrc = readFile(path.join(API_DIR, 'resource-index.js'));
    const reportSrc = readFile(path.join(API_DIR, 'report.js'));
    const storageSrc = readFile(path.join(API_DIR, 'storage.js'));
    const noteLinkSrc = readFile(path.join(API_DIR, 'note-link.js'));
    const utilsSrc = readFile(path.join(API_DIR, 'utils.js'));
    const iconsSrc = readFile(path.join(API_DIR, 'icons.js'));

    const algosIIFE = wrapAsIIFE(algosSrc, '__am_algos');
    // v2.6.4 阶段1：汇率 API 解析模块（零依赖，紧跟 algos 之后；前端专用，不进 kernel）。
    const exchangeRateApiIIFE = wrapAsIIFE(exchangeRateApiSrc, '__am_fx');
    const agentActionsIIFE = wrapAsIIFE(agentActionsSrc, '__am_agent_actions');
    const utilsIIFE = wrapAsIIFE(utilsSrc, '__am_utils');  // 必须在 storage / assets 前（被 require）
    const assetsIIFE = wrapAsIIFE(assetsSrc, '__am_assets');
    const mediaIIFE = wrapAsIIFE(mediaSrc, '__am_media');
    const resourceIndexIIFE = wrapAsIIFE(resourceIndexSrc, '__am_resource_index');
    const reportIIFE = wrapAsIIFE(reportSrc, '__am_reports');
    const storageIIFE = wrapAsIIFE(storageSrc, '__am_storage');
    const noteLinkIIFE = wrapAsIIFE(noteLinkSrc, '__am_note_link');  // v2.5.0 阶段2：依赖 algos + assets，位于 storage 之后
    const iconsIIFE = wrapAsIIFE(iconsSrc, '__am_icons');

    let indexTpl = readFile(TEMPLATE_FILE);

    // 压缩 main template 里的 HTML 模板字符串（保留 JS 逻辑可读）
    indexTpl = minifyHtmlTemplates(indexTpl);

    if (!indexTpl.includes(SOURCE_PLACEHOLDER)) {
        throw new Error(
            `src.template.js 中没找到占位符 ${SOURCE_PLACEHOLDER}`
        );
    }

    const injection = [
        '// ============================================================',
        '// formal-v2 自动生成：11 个 api 模块 IIFE 内联',
        '// 源文件：algorithms / exchange-rate-api / utils / media / resource-index / assets / report / agent-actions / storage / note-link / icons',
        '// 构建脚本：scripts/concat.js',
        '// 注意：不要手动改这块，改完请重新跑 `node scripts/concat.js`',
        '// ============================================================',
        '',
        algosIIFE,
        '',
        exchangeRateApiIIFE,
        '',
        utilsIIFE,
        '',
        mediaIIFE,
        '',
        resourceIndexIIFE,
        '',
        assetsIIFE,
        '',
        reportIIFE,
        '',
        agentActionsIIFE,
        '',
        storageIIFE,
        '',
        noteLinkIIFE,
        '',
        iconsIIFE,
        '',
        '// ============================================================',
        '// 正式入口：从 __am_* 取出 main template 实际用到的导出',
        '// ============================================================',
        getDestructureBlock(),
        '',
    ].join('\n');

    const output = indexTpl.split(SOURCE_PLACEHOLDER).join(injection);

    // ---------- v2.6.0：kernel.js（内核插件产物，Goja 沙箱） ----------
    // 结构：IIFE(algorithms) → IIFE(utils) → IIFE(media) → IIFE(assets) →
    // IIFE(report) → IIFE(agent-actions) → 2 行别名 → kernel.template.js 主体。
    // media 必须在 assets 之前（assets.js require('./media') 取 normalizeCover）。
    // 不带 require("siyuan") / Plugin 类 / index.css 引用；kernel.template.js 自包 IIFE。
    if (!fs.existsSync(KERNEL_TEMPLATE_FILE)) {
        throw new Error(`kernel.template.js not found: ${KERNEL_TEMPLATE_FILE}`);
    }
    let kernelTpl = readFile(KERNEL_TEMPLATE_FILE);
    if (!kernelTpl.includes(SOURCE_PLACEHOLDER)) {
        throw new Error(`kernel.template.js 中没找到占位符 ${SOURCE_PLACEHOLDER}`);
    }
    if (/require\s*\(\s*["']siyuan["']\s*\)/.test(kernelTpl)) {
        throw new Error('kernel.template.js 不能 require("siyuan")（Goja 沙箱无 require）');
    }
    const kernelInjection = [
        '// ============================================================',
        '// v2.6.0 自动生成：内核插件 kernel.js 的 6 个 api 模块 IIFE 内联',
        '// 源文件：algorithms / utils / media / assets / report / agent-actions',
        '// 构建脚本：scripts/concat.js',
        '// 注意：不要手动改这块，改完请重新跑 `node scripts/concat.js`',
        '// ============================================================',
        '',
        algosIIFE,
        '',
        utilsIIFE,
        '',
        mediaIIFE,
        '',
        assetsIIFE,
        '',
        reportIIFE,
        '',
        agentActionsIIFE,
        '',
        '// ============================================================',
        '// kernel 侧别名：kernel.template.js 只用这两个符号',
        '// ============================================================',
        'const agentActions = __am_agent_actions;',
        'const { createStableId } = __am_algos;',
        '',
    ].join('\n');
    const kernelOutput = kernelTpl.split(SOURCE_PLACEHOLDER).join(kernelInjection);

    return {
        output,
        kernelOutput,
        hashes: {
            algorithms: md5(algosSrc),
            exchangeRateApi: md5(exchangeRateApiSrc),
            agentActions: md5(agentActionsSrc),
            assets: md5(assetsSrc),
            media: md5(mediaSrc),
            resourceIndex: md5(resourceIndexSrc),
            report: md5(reportSrc),
            storage: md5(storageSrc),
            noteLink: md5(noteLinkSrc),
            utils: md5(utilsSrc),
            icons: md5(iconsSrc),
            template: md5(indexTpl),
            index: md5(output),
            kernelTemplate: md5(kernelTpl),
            kernel: md5(kernelOutput),
        },
        sizes: {
            algorithms: algosSrc.length,
            exchangeRateApi: exchangeRateApiSrc.length,
            agentActions: agentActionsSrc.length,
            assets: assetsSrc.length,
            media: mediaSrc.length,
            resourceIndex: resourceIndexSrc.length,
            report: reportSrc.length,
            storage: storageSrc.length,
            noteLink: noteLinkSrc.length,
            utils: utilsSrc.length,
            icons: iconsSrc.length,
            template: indexTpl.length,
            index: output.length,
            kernelTemplate: kernelTpl.length,
            kernel: kernelOutput.length,
        },
    };
}

function main() {
    const args = process.argv.slice(2);
    const checkOnly = args.includes('--check');

    const { output, kernelOutput, hashes, sizes } = build();

    if (checkOnly) {
        console.log('[concat] hashes:');
        Object.entries(hashes).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
        console.log('[concat] sizes:');
        Object.entries(sizes).forEach(([k, v]) => console.log(`  ${k}: ${v} bytes`));
        // v2.6.0：--check 校验 index.js / kernel.js 与模板 + api 源一致
        const stale = [];
        [
            [INDEX_FILE, hashes.index, 'index'],
            [KERNEL_FILE, hashes.kernel, 'kernel'],
        ].forEach(([file, expected, label]) => {
            if (!fs.existsSync(file)) {
                stale.push(`${label}: 文件缺失 ${path.basename(file)}`);
            } else if (md5(readFile(file)) !== expected) {
                stale.push(`${label}: 与源不同步（需重跑 node scripts/concat.js）`);
            } else {
                console.log(`[concat] ${label}: in sync`);
            }
        });
        if (stale.length) {
            stale.forEach(line => console.error(`[concat] OUT OF SYNC ${line}`));
            process.exitCode = 1;
        }
        return;
    }

    fs.writeFileSync(INDEX_FILE, output, 'utf8');
    console.log('[concat] index.js written');
    fs.writeFileSync(KERNEL_FILE, kernelOutput, 'utf8');
    console.log('[concat] kernel.js written');
    Object.entries(hashes).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log('[concat] sizes:');
    Object.entries(sizes).forEach(([k, v]) => console.log(`  ${k}: ${v} bytes`));
    const pkg = JSON.parse(readFile(PKG_FILE));
    console.log(`[concat] plugin.json version: ${pkg.version}`);
}

if (require.main === module) {
    try {
        main();
    } catch (e) {
        console.error('[concat] FAILED:', e.message);
        process.exit(1);
    }
}

module.exports = { build, wrapAsIIFE, getDestructureBlock };
