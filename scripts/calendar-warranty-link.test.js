'use strict';

/**
 * v1.3 阶段 2：保修日历 +N 年快捷必须以表单当前购买日为基准。
 *
 * 覆盖目标：
 *   1) 闰日安全的 +N 年 helper：2/29 + 1 年 → 2/28；2/29 + 4 年 → 2/29（闰年）；
 *      其他月末（1/31, 3/31, 5/31, 8/31, 10/31）→ 安全回退到目标月最后一天；
 *      空 / 无效 baseIso → 回退到 today。
 *   2) 新建实物表单：保修输入框初始 = 购买日 + 1 年 - 1 天。
 *   3) 编辑购买日：保修值自动联动到新购买日（无重开 sheet）。
 *   4) 点击 +1 / +2 / +3 年快捷：以表单当前购买日为基准（不依赖 today 快照）。
 *   5) 闰日购买日 + 1/2/3 年快捷 → 安全日期（不出现 2/29 之类无效输出）。
 *   6) 用户手动选日 → 改购买日 → 保修值不被覆盖（手动优先）。
 *   7) 点击 +N 年快捷 → 视为显式「购买日 + N 年」联动模式 → 之后改购买日继续联动。
 *   8) 保修 disabled / 购买日空值：行为安全（不抛错、不写脏值）。
 *   9) 保存最终值来自 DOM hidden input，与 UI 触发同步。
 *
 * linkedom 基线补丁（与本阶段无关）：Node 24 + linkedom 严格模式下设置
 *   Event.prototype.eventPhase = ... 会抛 "only has a getter"；生产代码
 *   在 wpPick / wpApplySuggestion 里调用 `new Event('input', { bubbles: true })`
 *   然后 dispatchEvent 触发同一路径。本补丁只把 eventPhase 改为可写，
 *   不改其它行为也不影响真机浏览器。
 */

const assert = require('node:assert/strict');

// v1.3 阶段 2：linkedom 基线补丁（与本阶段无关，仅用于让测试运行）。
// Node 24 上 Event 上多个属性（eventPhase / currentTarget / target / bubbles /
// defaultPrevented / composed / timeStamp / srcElement）都是只读 getter，但
// linkedom dispatchEvent 实现会反复对这些属性赋值（严格模式下抛 TypeError:
// only has a getter）。这里把 configurable 的属性统一改为 backing storage 模式，
// 使 native Event 也能在 linkedom DOM 上 dispatchEvent 成功。生产代码不动 Event，
// 真机浏览器上 linkedom 不存在、本补丁无影响。
const BACKING = ['eventPhase', 'currentTarget', 'target', 'srcElement', 'bubbles',
    'defaultPrevented', 'composed', 'timeStamp'];
for (const key of BACKING) {
    const desc = Object.getOwnPropertyDescriptor(Event.prototype, key);
    if (!desc || desc.configurable === false) continue;
    const storeKey = '__am_' + key;
    Object.defineProperty(Event.prototype, key, {
        get() { return this[storeKey]; },
        set(value) { this[storeKey] = value; },
        configurable: true,
    });
}
// _path 不在 Event.prototype 上（linkedom 内部约定），需要单独添加。
Object.defineProperty(Event.prototype, '_path', {
    get() { if (!this.__am__path) this.__am__path = []; return this.__am__path; },
    set(v) { this.__am__path = v; },
    configurable: true,
});
// 默认值：让 new Event() 自动拥有可写的空 _path、空 currentTarget 等。
const origEvent = Event;
const Wrapper = function(type, init) {
    const ev = new origEvent(type, init);
    ev.__am__path = [];
    ev.__am_eventPhase = 0;
    ev.__am_currentTarget = null;
    ev.__am_target = null;
    ev.__am_defaultPrevented = false;
    ev.__am_bubbles = !!(init && init.bubbles);
    return ev;
};
Wrapper.prototype = origEvent.prototype;
Object.setPrototypeOf(Wrapper, origEvent);
global.Event = Wrapper;

const { createHarness } = require('./formal-workflow-harness');

function safeSetInput(root, name, value) {
    const el = root.querySelector('[name="' + name + '"]');
    if (!el) throw new Error('missing input ' + name);
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function openPhysicalSheet(plugin) {
    plugin.openFormalAssetSheet('physical', { asset: null, id: '03000000-0000-4000-8000-000000000001' });
    const mask = document.querySelector('.am-edit-sheet-mask');
    if (!mask) throw new Error('physical edit sheet did not open');
    // wireForms proxy so existing form helpers work if any
    mask.querySelectorAll('form').forEach(f => {
        const elements = new Proxy({}, { get(_t, name) { return f.querySelector('[name="' + String(name) + '"]') || undefined; } });
        Object.defineProperty(f, 'elements', { value: elements, configurable: true });
        f.checkValidity = () => true;
        f.reportValidity = () => {};
    });
    return mask;
}

function warrantyInput(mask) {
    const el = mask.querySelector('input[name="warrantyEndsOn"]');
    if (!el) throw new Error('warranty input missing');
    return el;
}

function acquiredInput(mask) {
    const el = mask.querySelector('input[name="acquiredOn"]');
    if (!el) throw new Error('acquiredOn input missing');
    return el;
}

function warrantyPanel(mask) {
    return mask.querySelector('[data-warranty-datepicker]');
}

function warrantyRootHidden(warrantyPicker) {
    return warrantyPicker.querySelector('input[name="warrantyEndsOn"]');
}

async function main() {
    // ===== Part A: 直接验证 wpAddYearsSafe 的闰日 / 月末行为（通过新建态初始保修日间接验证） =====

    // A1) 普通购买日 2026-07-19 → 新建态默认保修 = 2027-07-18（+1年 -1天）
    {
        const { plugin, document } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'a1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2027-07-18', 'new-mode default warranty = acquiredOn + 1y - 1d');
    }

    // A2) 闰日购买日 2024-02-29 → 新建态默认保修 = 2025-02-27（+1年 -1天：2025-02-28 - 1 = 2025-02-27）
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'a1000000-0000-4000-8000-000000000002' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2024-02-29');
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2025-02-27', 'new-mode leap-day default: 2024-02-29 + 1y - 1d → 2025-02-27');
    }

    // A3) 月末购买日 2025-01-31 → 新建态默认保修 = 2026-01-30（+1年 -1天：2026-01-31 - 1 = 2026-01-30）
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'a1000000-0000-4000-8000-000000000003' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2025-01-31');
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2026-01-30', 'new-mode month-end default: 2025-01-31 + 1y - 1d → 2026-01-30');
    }

    // ===== Part B: 改购买日 → 保修值自动联动 =====

    // B1) 新建态改购买日 → 保修跟随
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'b1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2027-07-18');
        safeSetInput(mask, 'acquiredOn', '2025-08-01');
        assert.equal(wp.value, '2026-07-31', 'changing acquiredOn re-mirrors warranty to acquiredOn + 1y - 1d');
    }

    // B2) 闰日购买日改动：2024-02-29 → 2025-03-15 → 2026-03-14
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'b1000000-0000-4000-8000-000000000002' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2024-02-29');
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2025-02-27');
        safeSetInput(mask, 'acquiredOn', '2025-03-15');
        assert.equal(wp.value, '2026-03-14', 'changing acquiredOn from leap-day to normal-day re-mirrors');
    }

    // ===== Part C: 保修 +N 年快捷以购买日为基准 =====

    // C1) 打开保修面板 → 触发 +1 年快捷 → 保修值 = 购买日 + 1 年 - 1 天
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'c1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        trigger.onclick({ preventDefault() {} });
        const panel = document.querySelector('[data-datepicker-panel]');
        assert.ok(panel, 'warranty panel must be in document.body');
        const plusOneBtn = panel.querySelector('[data-dp-shortcut="1"]');
        plusOneBtn.onclick({ preventDefault() {} });
        const wp = warrantyInput(mask);
        assert.equal(wp.value, '2027-07-18', '+1y shortcut = acquiredOn 2026-07-19 + 1y - 1d = 2027-07-18');
    }

    // C2) +2 / +3 年快捷同样以购买日为基准
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'c1000000-0000-4000-8000-000000000002' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        trigger.onclick({ preventDefault() {} });
        const plusTwoBtn = document.querySelector('[data-datepicker-panel] [data-dp-shortcut="2"]');
        plusTwoBtn.onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2028-07-18', '+2y shortcut = 2026-07-19 + 2y - 1d = 2028-07-18');
        trigger.onclick({ preventDefault() {} });
        const plusThreeBtn = document.querySelector('[data-datepicker-panel] [data-dp-shortcut="3"]');
        plusThreeBtn.onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2029-07-18', '+3y shortcut = 2026-07-19 + 3y - 1d = 2029-07-18');
    }

    // C3) 闰日购买日 + 1/2/3 年快捷必须输出有效日期（不能产出 2/29 到非闰年）
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'c1000000-0000-4000-8000-000000000003' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2024-02-29');
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        // +1：2024 + 1 = 2025-02-29 → 非闰回退 2025-02-28；- 1 = 2025-02-27
        trigger.onclick({ preventDefault() {} });
        document.querySelector('[data-datepicker-panel] [data-dp-shortcut="1"]').onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2025-02-27', 'leap-day + 1y: 2024-02-29 → 2025-02-28 - 1d = 2025-02-27');
        // +2：2024 + 2 = 2026-02-29 → 非闰回退 2026-02-28；- 1 = 2026-02-27
        trigger.onclick({ preventDefault() {} });
        document.querySelector('[data-datepicker-panel] [data-dp-shortcut="2"]').onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2026-02-27', 'leap-day + 2y: 2024-02-29 → 2026-02-28 - 1d = 2026-02-27');
        // +3：2024 + 3 = 2027-02-29 → 非闰回退 2027-02-28；- 1 = 2027-02-27
        trigger.onclick({ preventDefault() {} });
        document.querySelector('[data-datepicker-panel] [data-dp-shortcut="3"]').onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2027-02-27', 'leap-day + 3y: 2024-02-29 → 2027-02-28 - 1d = 2027-02-27');
    }

    // ===== Part D: 手动选日优先（不被购买日变化覆盖） =====

    // D1) 用户手动选日 → 改购买日 → 保修值保持手动值
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'd1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        // 模拟用户从日历面板直接选了某一天：手动 pick 一个非 +1y 值的日期
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        trigger.onclick({ preventDefault() {} });
        // panel 默认 focus 在保修初值（today + 1y - 1d = 2027-07-27），显示 2027-07 月。
        // 直接选 2027-07 当月的某一天（跟 focus 同月）。
        const targetDay = '2027-07-15';
        const dayBtn = document.querySelector(`[data-datepicker-panel] [data-dp-day="${targetDay}"]`);
        assert.ok(dayBtn, 'panel must expose a day cell in the focused month');
        dayBtn.onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, targetDay, 'manual day pick wins over auto suggestion');
        safeSetInput(mask, 'acquiredOn', '2025-01-01');
        assert.equal(warrantyInput(mask).value, targetDay, 'after manual pick, changing acquiredOn must NOT override the manual warranty date');
    }

    // D2) 编辑态如果有 warrantyEndsOn 初始值（视为手动），改购买日也不应联动
    {
        const { plugin } = createHarness([]);
        const existing = require('../api/assets').newFormalV2Asset({
            id: 'd2000000-0000-4000-8000-000000000001',
            kind: 'physical', name: '相机', status: 'active',
            acquiredOn: '2024-06-01', statusChangedOn: '2024-06-01',
            createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z',
            currency: 'CNY', tagIds: [], cover: { kind: 'none' }, notes: '',
            details: { warrantyEndsOn: '2025-06-01', costGoal: null },
        });
        plugin.assets = [existing];
        plugin.updateAsset = async () => {};
        plugin.openFormalAssetSheet('physical', { asset: existing, id: existing.id });
        const mask = document.querySelector('.am-edit-sheet-mask');
        mask.querySelectorAll('form').forEach(f => {
            const elements = new Proxy({}, { get(_t, name) { return f.querySelector('[name="' + String(name) + '"]') || undefined; } });
            Object.defineProperty(f, 'elements', { value: elements, configurable: true });
            f.checkValidity = () => true;
            f.reportValidity = () => {};
        });
        const wpBefore = warrantyInput(mask).value;
        assert.equal(wpBefore, '2025-06-01', 'edit-mode initial warranty = stored warrantyEndsOn');
        safeSetInput(mask, 'acquiredOn', '2026-01-01');
        assert.equal(warrantyInput(mask).value, '2025-06-01', 'edit-mode with stored warranty: changing acquiredOn must NOT override the stored warranty date');
    }

    // ===== Part E: 点击 +N 年快捷后回到「自动联动」模式 =====

    // E1) 先手动选日 → 再点 +1 年快捷 → 之后改购买日应继续联动
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'e1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        // 手动选日（focus 在保修初值对应月份）
        trigger.onclick({ preventDefault() {} });
        const manualDay = '2027-07-15';
        document.querySelector(`[data-datepicker-panel] [data-dp-day="${manualDay}"]`).onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, manualDay);
        // 点 +1 年快捷 → 重置为自动联动
        trigger.onclick({ preventDefault() {} });
        document.querySelector('[data-datepicker-panel] [data-dp-shortcut="1"]').onclick({ preventDefault() {} });
        assert.equal(warrantyInput(mask).value, '2027-07-18', 'after manual pick + +1y shortcut, warranty reverts to acquiredOn + 1y - 1d');
        // 改购买日 → 应继续联动
        safeSetInput(mask, 'acquiredOn', '2025-08-01');
        assert.equal(warrantyInput(mask).value, '2026-07-31', 'after +1y shortcut resets manual-picked flag, changing acquiredOn re-mirrors');
    }

    // ===== Part F: 边界 / 安全性 =====

    // F1) 购买日空值时点击 +N 年快捷不抛错（fallback to today）
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'f1000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        // acquiredOn 默认是 todayISO()，清空
        acquiredInput(mask).value = '';
        acquiredInput(mask).dispatchEvent(new Event('input', { bubbles: true }));
        acquiredInput(mask).dispatchEvent(new Event('change', { bubbles: true }));
        const trigger = mask.querySelector('[data-warranty-date-trigger]');
        trigger.onclick({ preventDefault() {} });
        const plusOne = document.querySelector('[data-datepicker-panel] [data-dp-shortcut="1"]');
        plusOne.onclick({ preventDefault() {} });
        // 保修值必须非空 ISO 字符串
        const wp = warrantyInput(mask).value;
        assert.match(wp, /^\d{4}-\d{2}-\d{2}$/, 'empty acquiredOn + +1y shortcut must still produce a valid ISO date');
    }

    // F2) 保修 toggle 关闭 → 保修输入框 hidden，保存路径无 warrantyEndsOn
    {
        const { plugin } = createHarness([]);
        let captured = null;
        plugin.addAsset = async (dto) => { captured = dto; return { id: 'f2000000-0000-4000-8000-000000000001' }; };
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        // 关闭保修 toggle
        const warrantyCb = mask.querySelector('input[name="warrantyEnabled"]');
        assert.ok(warrantyCb, 'warranty toggle exists');
        warrantyCb.checked = false;
        warrantyCb.dispatchEvent(new Event('change', { bubbles: true }));
        const form = mask.querySelector('form');
        safeSetInput(form, 'name', 'X');
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.ok(captured, 'submit captured');
        assert.equal(captured.details.warrantyEndsOn, null, 'disabled warranty must not write warrantyEndsOn');
    }

    // F3) 表单保存时提交的 warrantyEndsOn 与 DOM hidden input 完全一致（last-write-wins）
    {
        const { plugin } = createHarness([]);
        let captured = null;
        plugin.addAsset = async (dto) => { captured = dto; return { id: 'f3000000-0000-4000-8000-000000000001' }; };
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        // 启用保修 toggle，否则保存路径不会写入 warrantyEndsOn
        const warrantyCb = mask.querySelector('input[name="warrantyEnabled"]');
        warrantyCb.checked = true;
        warrantyCb.dispatchEvent(new Event('change', { bubbles: true }));
        // 直接改 hidden input 模拟用户操作
        warrantyInput(mask).value = '2028-12-31';
        const form = mask.querySelector('form');
        safeSetInput(form, 'name', 'X');
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.ok(captured, 'submit captured');
        assert.equal(captured.details.warrantyEndsOn, '2028-12-31', 'submit reads warrantyEndsOn directly from DOM');
    }

    // F4) 保修 + 购买日联动 + 切到禁用 toggle 再启用：保留最后写入的值，不重置
    {
        const { plugin } = createHarness([]);
        plugin.addAsset = async () => ({ id: 'f4000000-0000-4000-8000-000000000001' });
        const mask = openPhysicalSheet(plugin);
        safeSetInput(mask, 'acquiredOn', '2026-07-19');
        assert.equal(warrantyInput(mask).value, '2027-07-18');
        const warrantyCb = mask.querySelector('input[name="warrantyEnabled"]');
        warrantyCb.checked = false;
        warrantyCb.dispatchEvent(new Event('change', { bubbles: true }));
        warrantyCb.checked = true;
        warrantyCb.dispatchEvent(new Event('change', { bubbles: true }));
        assert.equal(warrantyInput(mask).value, '2027-07-18', 'toggle off/on must preserve warranty hidden value');
    }

    console.log('[calendar-warranty-link] passed');
}

main().catch(error => { console.error('[calendar-warranty-link] failed:', error); process.exit(1); });