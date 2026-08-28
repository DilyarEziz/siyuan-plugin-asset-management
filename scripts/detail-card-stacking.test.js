'use strict';

/**
 * v1.3 阶段 3/4 — 产品详情卡 + 维修/预付流水 sheet 层级（纯静态契约测试）
 *
 * 说明：原版本基于 linkedom 创建 DOM 并 dispatch 事件，在 Node 24 + linkedom 上反复
 * openFormalProductCard / click / dispatchEscape 会累积 OOM（Array buffer allocation
 * failed）。本测试改为纯静态契约：只读 src.template.js + index.css 做正则断言，
 * 零 DOM、零 harness、零事件派发，覆盖 Reviewer 4 项修复落盘：
 *   1. 同 host：workflow mask 必须与详情卡同一 host（preferredHost + _productCardHost 优先）
 *   2. Escape：window capture 阶段 + preventDefault + stopPropagation + 同参数 removeEventListener
 *   3. 局部 stacking context：.am-dock / .am-modal--main / .am-plugin-overlay-host isolation:isolate
 *   4. z-index 变量：edit 50 < detail 55 < workflow 60
 *
 * 动态行为（maintenance/prepaid workflow 真实 CRUD、关闭、刷新）由
 * formal-maintenance-workflow.test.js / formal-prepaid-workflow.test.js 覆盖。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS_FILE = path.join(ROOT, 'index.css');
const TEMPLATE_FILE = path.join(ROOT, 'src.template.js');

function readClassProp(css, selector, prop) {
    const escaped = selector.replace(/\./g, '\\.');
    const re = new RegExp(escaped + '\\s*\\{[^}]*?' + prop + '\\s*:\\s*([^;]+?);', 'm');
    const m = css.match(re);
    return m ? String(m[1]).trim() : null;
}

function readRootVar(css, name) {
    const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
    if (!rootMatch) return null;
    const re = new RegExp('--' + name.replace(/^--/, '') + '\\s*:\\s*(\\d+)\\s*;');
    const m = rootMatch[1].match(re);
    return m ? Number(m[1]) : null;
}

function main() {
    const css = fs.readFileSync(CSS_FILE, 'utf8');
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    // ===== Reviewer #4：z-index 层级变量 =====
    assert.equal(readRootVar(css, 'am-z-edit-sheet'), 50, '--am-z-edit-sheet must be 50');
    assert.equal(readRootVar(css, 'am-z-detail-card'), 55, '--am-z-detail-card must be 55');
    assert.equal(readRootVar(css, 'am-z-workflow-sheet'), 60, '--am-z-workflow-sheet must be 60');
    assert.match(readClassProp(css, '.am-edit-sheet-mask', 'z-index') || '', /var\(--am-z-edit-sheet/,
        '.am-edit-sheet-mask z-index must reference --am-z-edit-sheet');
    assert.match(readClassProp(css, '.am-product-card-mask', 'z-index') || '', /var\(--am-z-detail-card/,
        '.am-product-card-mask z-index must reference --am-z-detail-card');
    assert.match(readClassProp(css, '.am-workflow-sheet-mask', 'z-index') || '', /var\(--am-z-workflow-sheet/,
        '.am-workflow-sheet-mask z-index must reference --am-z-workflow-sheet');

    // ===== Reviewer #3：局部 stacking context（isolation:isolate）=====
    assert.match(readClassProp(css, '.am-dock', 'isolation') || '', /isolate/, '.am-dock must isolation:isolate');
    assert.match(readClassProp(css, '.am-modal--main', 'isolation') || '', /isolate/, '.am-modal--main must isolation:isolate');
    assert.match(readClassProp(css, '.am-plugin-overlay-host', 'isolation') || '', /isolate/, '.am-plugin-overlay-host must isolation:isolate');
    // mask 自身 position:absolute（全屏遮罩前提）
    assert.match(readClassProp(css, '.am-edit-sheet-mask', 'position') || '', /absolute/, '.am-edit-sheet-mask position:absolute');
    assert.match(readClassProp(css, '.am-product-card-mask', 'position') || '', /absolute/, '.am-product-card-mask position:absolute');

    // ===== Reviewer #1：同 host =====
    // openFormalWorkflowDialog 必须接受 preferredHost
    assert.match(template, /openFormalWorkflowDialog\(id,\s*mode,\s*preferredHost\)/,
        'openFormalWorkflowDialog signature must include preferredHost');
    // openMaintenanceSheet / openPrepaidTransactionSheet 必须转发 preferredHost
    assert.match(template, /openMaintenanceSheet\(id,\s*preferredHost\)\s*\{\s*return\s+this\.openFormalWorkflowDialog\(id,\s*['"]maintenance['"]\s*,\s*preferredHost\)/,
        'openMaintenanceSheet must forward preferredHost');
    assert.match(template, /openPrepaidTransactionSheet\(id,\s*preferredHost\)\s*\{\s*return\s+this\.openFormalWorkflowDialog\(id,\s*['"]prepaid['"]\s*,\s*preferredHost\)/,
        'openPrepaidTransactionSheet must forward preferredHost');
    // host 解析顺序：preferredHost 优先，_productCardHost 次之（在 dockElement 之前）
    const hostOrderMatch = template.match(/const\s+host\s*=\s*preferredHost[^;]+_productCardHost[^;]+;/);
    assert.ok(hostOrderMatch, 'must declare host with preferredHost first and _productCardHost second');
    const hostOrder = hostOrderMatch[0];
    assert.ok(hostOrder.indexOf('preferredHost') >= 0, 'preferredHost in host resolution');
    assert.ok(hostOrder.indexOf('_productCardHost') > hostOrder.indexOf('preferredHost'),
        '_productCardHost must come after preferredHost');
    assert.ok(hostOrder.indexOf('dockElement') > hostOrder.indexOf('_productCardHost'),
        'dockElement must come after _productCardHost (so detail-card host wins)');
    // 详情卡按钮闭包必须传 host（maintenance + prepaid）
    assert.match(template, /workflow\(\s*'\[data-formal-maintenance\]'\s*,\s*\(\)\s*=>\s*this\.openMaintenanceSheet\(asset\.id,\s*host\)\)/,
        'maintenance button closure must pass host');
    assert.match(template, /workflow\(\s*'\[data-formal-prepaid\]'\s*,\s*\(\)\s*=>\s*this\.openPrepaidTransactionSheet\(asset\.id,\s*host\)\)/,
        'prepaid button closure must pass host');

    // ===== Reviewer #2：Escape capture + 消费 =====
    // KEYDOWN_CAPTURE_OPTS 常量
    assert.match(template, /const\s+KEYDOWN_CAPTURE_OPTS\s*=\s*\{\s*capture:\s*true\s*\}/,
        'must define KEYDOWN_CAPTURE_OPTS = { capture: true }');
    // window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS) 至少 2 处（workflow + renew）
    const addMatches = template.match(/window\.addEventListener\(['"]keydown['"],\s*\w+,\s*KEYDOWN_CAPTURE_OPTS\)/g) || [];
    assert.ok(addMatches.length >= 2, 'must register window keydown capture in at least workflow + renew sheets');
    // window.removeEventListener 必须用同样 KEYDOWN_CAPTURE_OPTS（成对移除，否则泄漏）
    const removeMatches = template.match(/window\.removeEventListener\(['"]keydown['"],\s*\w+,\s*KEYDOWN_CAPTURE_OPTS\)/g) || [];
    assert.ok(removeMatches.length >= 2, 'must remove window keydown capture with same opts (no leak)');
    // keydown handler 内必须 preventDefault + stopPropagation（阻止冒泡到思源 window）
    // 在 openFormalWorkflowDialog 的 onKeydown 区域内：event.key === 'Escape' 分支
    const wfKeydownBlock = template.slice(
        template.indexOf('openFormalWorkflowDialog(id, mode, preferredHost)'),
        template.indexOf('host.appendChild(mask);', template.indexOf('openFormalWorkflowDialog(id, mode, preferredHost)'))
    );
    assert.ok(/event\.key\s*(?:===|!==)\s*['"]Escape['"]/.test(wfKeydownBlock), 'workflow keydown must handle Escape');
    assert.ok(/event\.preventDefault\(\)/.test(wfKeydownBlock), 'workflow Escape must preventDefault');
    assert.ok(/event\.stopPropagation\(\)/.test(wfKeydownBlock) || /stopImmediatePropagation/.test(wfKeydownBlock),
        'workflow Escape must stopPropagation');

    // ===== _pluginOverlayRoot（body 后备 host，自带 isolation）=====
    assert.match(template, /plugin\._pluginOverlayRoot/, '_pluginOverlayRoot lifecycle must exist');
    assert.match(template, /root\.className\s*=\s*['"]am-plugin-overlay-host['"]/, 'overlay host must carry am-plugin-overlay-host class');

    console.log('[detail-card-stacking] passed');
}

main();
