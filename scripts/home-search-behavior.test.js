'use strict';

/**
 * v0.18 阶段3（顶部搜索框 bug 修复）行为回归测试。
 *
 * 覆盖用户报告的完整症状链：
 *  1. 输入即搜：input 事件 → filter.search 立即落值 → 150ms 防抖后 refreshList；
 *  2. 回车即搜：Enter keydown → 取消防抖并同步 refreshList（不等 150ms）；
 *  3. IME 安全：composition 组词期间（拼音阶段）input/Enter 均不误搜，
 *     compositionend 才提交搜索；
 *  4. 绑定不再被覆盖：_bindHomeSearchEvents 重复调用（renderDock / bindModalTabEvents
 *     双路径）不会丢失或重复绑定 —— 旧实现用 oninput 单槽属性赋值，二次绑定会
 *     整体覆盖前一份 handler，是「输入不搜、点别处再点回来才生效」的结构性根因；
 *  5. 渲染契约：搜索 input 不再携带 data-action="set-search"（click 委托冗余路径已移除），
 *     handleAction('set-search') 保留为防御性 no-op。
 */

const assert = require('node:assert/strict');
const Module = require('node:module');
const { createFormalV2AssetWrapper } = require('../api/assets');

const clone = value => structuredClone(value);
const now = '2026-07-24T08:00:00.000Z';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadPlugin() {
    const original = Module._load;
    const nav = Object.getOwnPropertyDescriptor(global, 'navigator');
    const doc = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    Module._load = function (request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } addIcons() {} addTopBar() {} addCommand() {} addDock() {} }, Dialog: class {}, Menu: class {} };
        return original.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = original;
        if (nav) Object.defineProperty(global, 'navigator', nav); else delete global.navigator;
        if (doc) Object.defineProperty(global, 'document', doc); else delete global.document;
    }
}

/** 最小事件容器：只实现 addEventListener / dispatch，模拟 dock / modal 容器。 */
function createFakeContainer() {
    const listeners = new Map();
    return {
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(fn);
        },
        dispatch(type, event) {
            (listeners.get(type) || []).forEach(fn => fn(event));
        },
        count(type) { return (listeners.get(type) || []).length; },
    };
}

function createFakeInput(value) {
    return {
        value,
        matches: selector => selector === '.am-search-box__input',
    };
}

function asset(id, name) {
    return {
        id, kind: 'physical', name, status: 'active', currency: 'CNY',
        acquiredOn: '2026-07-20', statusChangedOn: '2026-07-20', tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: now, updatedAt: now, details: { warrantyEndsOn: null, costGoal: null },
    };
}

async function main() {
    const documentDescriptor = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'document', { value: { addEventListener() {}, removeEventListener() {} }, configurable: true });
    try {
        const state = { 'assets.json': createFormalV2AssetWrapper([], { updatedAt: now }) };
        const Plugin = loadPlugin();
        const plugin = new Plugin({ async loadData(name) { return clone(state[name] == null ? null : state[name]); }, async saveData(name, value) { state[name] = clone(value); return true; } });
        plugin.loadPresetIconManifest = () => Promise.resolve();
        plugin.showToast = () => {};
        plugin.scheduleResourceIndexReconcile = () => {};
        await plugin.onload();

        await plugin.addAsset(asset('10000000-0000-4000-8000-000000000001', 'iPhone 15 Pro'), { purchaseAmountMinor: 799900 });
        await plugin.addAsset(asset('10000000-0000-4000-8000-000000000002', 'MacBook Air'), { purchaseAmountMinor: 899900 });
        await plugin.addAsset(asset('10000000-0000-4000-8000-000000000003', 'AirPods Pro'), { purchaseAmountMinor: 189900 });

        // refreshList 打点（真实实现依赖 dockElement / _modalContainer，headless 下打桩）
        let refreshCalls = 0;
        plugin.refreshList = () => { refreshCalls += 1; };

        const container = createFakeContainer();
        plugin._bindHomeSearchEvents(container);

        // ---- 1. 输入即搜：input → filter.search 立即落值，150ms 防抖后刷新列表 ----
        const input = createFakeInput('');
        input.value = 'iphone';
        container.dispatch('input', { target: input, isComposing: false });
        assert.equal(plugin.filter.search, 'iphone', 'input 事件必须立即把键入值写入 filter.search');
        assert.equal(refreshCalls, 0, '防抖窗口内不重复刷新列表');
        await sleep(220);
        assert.equal(refreshCalls, 1, '防抖窗口（150ms）结束后必须刷新列表');
        assert.equal(plugin.getHomeFilteredAssets().length, 1, '搜索后列表即时过滤（仅 iPhone 命中）');
        assert.equal(plugin.getHomeFilteredAssets()[0].name, 'iPhone 15 Pro');

        // ---- 2. 回车即搜：Enter keydown → 同步刷新，不等防抖 ----
        input.value = 'air';
        container.dispatch('keydown', { target: input, key: 'Enter', isComposing: false, preventDefault() {} });
        assert.equal(plugin.filter.search, 'air', 'Enter 必须立即提交当前输入值');
        assert.equal(refreshCalls, 2, 'Enter 必须同步触发 refreshList（不等 150ms 防抖）');
        assert.equal(plugin.getHomeFilteredAssets().length, 2, 'air 命中 MacBook Air 与 AirPods Pro');

        // 防抖定时器必须已被 Enter 取消：再等一个窗口也不得多刷一次
        await sleep(220);
        assert.equal(refreshCalls, 2, 'Enter 之后不得残留防抖定时器导致二次刷新');

        // ---- 3. IME 组词期间不误搜（拼音阶段的 input 与 Enter 都必须被吞掉） ----
        input.value = 'airp';
        container.dispatch('compositionstart', { target: input });
        input.value = 'airpo';
        container.dispatch('input', { target: input, isComposing: false }); // 组词中：_amImeComposing 标记生效
        assert.equal(plugin.filter.search, 'air', 'composition 组词期间的 input 不得触发搜索');
        container.dispatch('keydown', { target: input, key: 'Enter', isComposing: true, preventDefault() {} });
        assert.equal(plugin.filter.search, 'air', 'IME 组词期间的 Enter（提交候选词）不得触发搜索');
        assert.equal(refreshCalls, 2, 'IME 组词期间不得刷新列表');
        input.value = 'airpods';
        container.dispatch('compositionend', { target: input });
        assert.equal(plugin.filter.search, 'airpods', 'compositionend 必须提交最终候选词');
        await sleep(220);
        assert.equal(refreshCalls, 3, 'compositionend 后走防抖刷新');
        assert.equal(plugin.getHomeFilteredAssets().length, 1, '中文输入法路径同样能搜到结果');

        // isComposing 事件属性路径（部分浏览器不发 compositionstart 但标记 isComposing）
        container.dispatch('input', { target: createFakeInput('x'), isComposing: true });
        assert.equal(plugin.filter.search, 'airpods', 'isComposing=true 的 input 不得触发搜索');

        // ---- 4. 重绑守卫：renderDock 反复调 bindDockEvents，每容器仍只绑一次 ----
        // this.dockElement 是持久元素，renderDock 每次都对其重调 bindDockEvents；
        // 若无 _amSearchBound 守卫，addEventListener 会叠加，Enter 直连 _commitHomeSearch
        // 不走防抖 → N 个 keydown 监听 = 一次回车 N 次 refreshList（本阶段曾引入的回归）。
        for (let i = 0; i < 10; i++) plugin._bindHomeSearchEvents(container); // 模拟 renderDock 触发 10 次
        assert.equal(container.count('input'), 1, '重复绑定 10 次后 input 监听必须仍为 1 个（守卫生效）');
        assert.equal(container.count('keydown'), 1, '重复绑定 10 次后 keydown 监听必须仍为 1 个（守卫生效）');

        // Enter-after-rebind：直接钉死累积回归 —— 守卫失效时这里会变成 before+10
        const beforeEnter = refreshCalls;
        input.value = 'macbook';
        container.dispatch('keydown', { target: input, key: 'Enter', isComposing: false, preventDefault() {} });
        assert.equal(plugin.filter.search, 'macbook', '重复绑定后 Enter 仍立即提交当前输入值');
        assert.equal(refreshCalls, beforeEnter + 1, '重复绑定后一次 Enter 仅触发 1 次 refreshList（监听不得累积）');

        const before = refreshCalls;
        input.value = 'mac';
        container.dispatch('input', { target: input, isComposing: false });
        await sleep(220);
        assert.equal(refreshCalls, before + 1, '重复绑定后一次输入只触发一次刷新（防抖 + 守卫双保险）');

        const modalContainer = createFakeContainer();
        plugin._bindHomeSearchEvents(modalContainer); // 模拟 modal 路径独立绑定（新容器不受 dock 守卫影响）
        const modalInput = createFakeInput('pro');
        modalContainer.dispatch('input', { target: modalInput, isComposing: false });
        assert.equal(plugin.filter.search, 'pro', 'modal 容器的输入同样直达 filter.search');
        await sleep(220);

        // ---- 5. 渲染契约：input 不再携带 data-action，click 委托路径已移除 ----
        const topbarHtml = plugin.renderTopBar();
        assert.match(topbarHtml, /am-search-box__input/, 'topbar 必须渲染搜索输入框');
        assert.doesNotMatch(topbarHtml, /data-action="set-search"/, '搜索 input 不得再携带 data-action="set-search"（冗余 click 委托路径）');
        assert.match(topbarHtml, /aria-label=/, '搜索输入框必须带 aria-label');

        // handleAction('set-search') 保留为防御性 no-op：不改 filter、不触发刷新
        const guardBefore = refreshCalls;
        plugin.handleAction('set-search', undefined, { value: 'SHOULD_NOT_APPLY' }, { stopPropagation() {} });
        assert.notEqual(plugin.filter.search, 'SHOULD_NOT_APPLY', 'set-search click 委托路径不得再改写搜索值');
        assert.equal(refreshCalls, guardBefore, 'set-search click 委托路径不得再触发刷新');

        // ---- 6. 绑定健壮性：非搜索输入框的事件一律忽略 ----
        const otherInput = { value: 'noise', matches: selector => selector === '.something-else' };
        container.dispatch('input', { target: otherInput, isComposing: false });
        assert.notEqual(plugin.filter.search, 'noise', '非搜索输入框的 input 不得影响 filter.search');
        plugin._bindHomeSearchEvents(null); // 空容器不得抛错
        plugin._bindHomeSearchEvents({}); // 无 addEventListener 的容器不得抛错

        console.log('[home-search-behavior] passed');
    } finally {
        if (documentDescriptor) Object.defineProperty(global, 'document', documentDescriptor); else delete global.document;
    }
}

main().catch(error => { console.error('[home-search-behavior] failed:', error); process.exit(1); });
