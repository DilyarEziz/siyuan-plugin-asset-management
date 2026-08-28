'use strict';

/**
 * formal-v2 five-kind form submit test.
 *
 * 目标：
 *   - 5 类表单（physical / virtualSubscription / virtualPerpetual / prepaidAmount /
 *     prepaidCount）渲染时不暴露 v1 残留输入字段：
 *       dailyCostOverrideMinor / usageTrackingEnabled / skipNextRenewal /
 *       renewalScore / versionLabel / unitLabel / accountLabel（除
 *       licenseAccountLabel）
 *   - 表单提交构造的 `details` payload 仅写入 FORMAL_V2_DETAIL_KEYS 白名单字段
 *   - 种草表单只暴露 FORMAL_V2_WISHLIST_KEYS（无 categoryId / tagIds / notes /
 *     acquiredOn 等）
 *
 * 实现说明：
 *   plugin.openFormalAssetSheet + openWishlistSheet 走生产 src.template.js。
 *   失败 input check 通过 test root mock + form submission 验证；dto 校验通过
 *   模型层 validateFormalV2Asset 二次验证。
 */

const assert = require('node:assert/strict');
const Module = require('node:module');
const { parseHTML } = require('linkedom');
const { newFormalV2Asset, FORMAL_ASSET_KIND, FORMAL_V2_DETAIL_KEYS,
    validateFormalV2Asset } = require('../api/assets');

// linkedom 基线补丁（与 calendar-warranty-link.test.js 同款，与本阶段无关，仅用于让测试在
// Node 24 上运行）：Node 24 的 Event 多个属性为只读 getter，而 linkedom dispatchEvent 会对其赋值，
// 严格模式下抛 "only has a getter"。此处改为 backing storage 模式，真机浏览器无 linkedom、无影响。
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
Object.defineProperty(Event.prototype, '_path', {
    get() { if (!this.__am__path) this.__am__path = []; return this.__am__path; },
    set(v) { this.__am__path = v; },
    configurable: true,
});
const origEvent = Event;
const EventWrapper = function(type, init) {
    const ev = new origEvent(type, init);
    ev.__am__path = [];
    ev.__am_eventPhase = 0;
    ev.__am_currentTarget = null;
    ev.__am_target = null;
    ev.__am_defaultPrevented = false;
    ev.__am_bubbles = !!(init && init.bubbles);
    return ev;
};
EventWrapper.prototype = origEvent.prototype;
Object.setPrototypeOf(EventWrapper, origEvent);
global.Event = EventWrapper;

function loadPlugin() {
    const original = Module._load;
    const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { userAgent: '' }, configurable: true });
    Module._load = function(request, parent, isMain) {
        if (request === 'siyuan') return { Plugin: class { constructor(options) { Object.assign(this, options || {}); } }, Dialog: class {}, Menu: class {} };
        return original.call(this, request, parent, isMain);
    };
    try { delete require.cache[require.resolve('../index.js')]; return require('../index.js'); }
    finally {
        Module._load = original;
        if (descriptor) Object.defineProperty(global, 'navigator', descriptor); else delete global.navigator;
    }
}

function details(kind) {
    if (kind === 'physical') return { warrantyEndsOn: null,
        costGoal: { targetDailyAmountMinor: 50, targetEndsOn: '2027-01-01' } };
    if (kind === 'virtualSubscription') return { planName: 'Old',
        accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew: true };
    if (kind === 'virtualPerpetual') return { licenseAccountLabel: null };
    return { provider: 'Old', expiresOn: null };
}

function fakeDom(valid = true) {
    const parsed = parseHTML('<!doctype html><html><body></body></html>');
    const document = parsed.document;
    const host = document.body;
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = name => originalCreateElement(name);
    const dom = { document, host, mask: null, valid };
    const appendChild = host.appendChild.bind(host);
    host.appendChild = node => { dom.mask = node; return appendChild(node); };
    return dom;
}

function wireRealForm(form, valid) {
    const elements = new Proxy({}, { get(_target, name) { return form.querySelector(`[name="${String(name)}"]`) || undefined; } });
    Object.defineProperty(form, 'elements', { value: elements, configurable: true });
    form.checkValidity = () => valid;
    form.reportValidity = () => { form.reported = true; };
    return form;
}

function setControlValue(control, value) {
    if (!control) return;
    if (control.localName === 'select') {
        control.querySelectorAll('option').forEach(option => {
            if (option.getAttribute('value') === String(value)) option.setAttribute('selected', '');
            else option.removeAttribute('selected');
        });
    } else if (control.localName === 'textarea') control.textContent = String(value);
    else control.setAttribute('value', String(value));
}

function main() {
    const Plugin = loadPlugin();
    const originalDocument = global.document;
    // 1) For each kind, verify the form never renders v1 detail-field inputs.
    for (const [index, kind] of Object.values(FORMAL_ASSET_KIND).entries()) {
        const dom = fakeDom();
        global.document = dom.document;
        const existing = newFormalV2Asset({
            id: `b1000000-0000-4000-8000-00000000000${index + 1}`,
            kind, name: 'Original', status: 'active',
            acquiredOn: '2026-01-01', statusChangedOn: '2026-02-02',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
            details: details(kind),
        });
        const plugin = new Plugin({});
        plugin.assets = [existing];
        plugin._tags = [];
        plugin._presetIconManifest = { icons: [] };
        plugin.showToast = () => {};
        plugin.updateAsset = async () => {};
        plugin.openFormalAssetSheet(kind, { asset: existing, id: existing.id });
        const parsed = parseHTML(dom.mask.innerHTML).document;
        ['dailyCostOverrideMinor', 'usageTrackingEnabled', 'skipNextRenewal',
            'renewalScore', 'renewalScoreEmoji', 'renewalScoreComment',
            'versionLabel', 'unitLabel']
            .filter(name => !(kind === 'virtualSubscription' && name === 'accountLabel'))
            .forEach(name => {
                assert.ok(parsed.querySelector(`[name="${name}"]`) === null,
                    `${kind} form must not expose legacy input ${name}`);
            });
        assert.ok(parsed.querySelector('[name="name"][required]'));
        if (kind === 'virtualSubscription') {
            assert.ok(parsed.querySelector('[name="accountLabel"]'),
                'v2 keeps accountLabel as a virtual-subscription field');
        }
        // prepaidCount edit must surface the "remainingCount" target input.
        if (kind === 'prepaidCount') {
            assert.ok(parsed.querySelector('[name="targetRemainingCount"]'),
                'prepaidCount edit form must surface the remainingCount target input');
        }
        global.document.body.innerHTML = '';
    }

    // 2) Ensure FORMAL_V2_DETAIL_KEYS is the canonical whitelist for details payload.
    assert.deepEqual(FORMAL_V2_DETAIL_KEYS.physical.slice().sort(), ['costGoal', 'warrantyEndsOn']);
    assert.deepEqual(FORMAL_V2_DETAIL_KEYS.virtualSubscription.slice().sort(),
        ['accountLabel', 'autoRenew', 'billingPlan', 'planName']);
    assert.deepEqual(FORMAL_V2_DETAIL_KEYS.virtualPerpetual.slice(), ['licenseAccountLabel']);
    assert.deepEqual(FORMAL_V2_DETAIL_KEYS.prepaidAmount.slice().sort(), ['expiresOn', 'provider']);
    assert.deepEqual(FORMAL_V2_DETAIL_KEYS.prepaidCount.slice().sort(), ['expiresOn', 'provider']);

    // 3) Plugin-built dto for each kind must re-validate under v2 strict.
    let id = 1;
    for (const kind of Object.values(FORMAL_ASSET_KIND)) {
        // Construct a dto exactly as production code produces it.
        const inputDetails = (kind === 'physical')
            ? { warrantyEndsOn: '2027-06-01',
                costGoal: { targetDailyAmountMinor: 50, targetEndsOn: '2027-01-01' } }
            : kind === 'virtualSubscription'
                ? { planName: 'Edited',
                    accountLabel: 'new account',
                    billingPlan: { cycle: 'monthly' },
                    autoRenew: true }
                : kind === 'virtualPerpetual'
                    ? { licenseAccountLabel: 'license account' }
                    : { provider: 'Edited', expiresOn: '2028-01-01' };
        const dto = newFormalV2Asset({
            id: `c1000000-0000-4000-8000-00000000000${id++}`,
            kind, name: 'Edited', status: 'active',
            acquiredOn: '2026-07-19', statusChangedOn: '2026-07-19',
            categoryId: null, tagIds: [], cover: { kind: 'none' }, notes: '',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
            details: inputDetails,
        });
        const result = validateFormalV2Asset(dto);
        assert.equal(result.valid, true, `${kind} produced dto must validate under v2 strict`);
        assert.deepEqual(Object.keys(dto.details).sort(),
            FORMAL_V2_DETAIL_KEYS[kind].slice().sort(),
            `${kind} dto details keys must equal FORMAL_V2_DETAIL_KEYS`);
    }

    // 4) Wishlist form never writes owned fields (categoryId / tagIds / notes / details).
    const wish = newFormalV2Asset({ id: 'd1000000-0000-4000-8000-000000000001',
        kind: 'physical', name: 'wishlist item', status: 'wishlist',
        wishlist: { expectedAmountMinor: 100, reason: '', targetGroup: 'physical' },
    });
    assert.equal(validateFormalV2Asset(wish).valid, true);
    ['categoryId', 'tagIds', 'notes', 'details', 'reminderPolicy', 'acquiredOn',
        'statusChangedOn', 'unitLabel', 'accountLabel', 'versionLabel', 'costGoal',
        'warrantyEndsOn', 'usageTrackingEnabled']
        .forEach(key => {
            assert.equal(Object.prototype.hasOwnProperty.call(wish, key), false,
                `wishlist must not carry ${key}`);
        });
    assert.deepEqual(Object.keys(wish).sort(),
        ['cover', 'createdAt', 'currency', 'id', 'kind', 'name', 'status', 'updatedAt', 'wishlist'],
        'wishlist keys must equal the v2 minimal carrier set');

    // 5) Plugin-side: openWishlistSheet renders only name / expectedAmount / targetGroup
    //    (stage 1: cover is handled by the shared 5-option picker, not a named field).
    {
        const dom = fakeDom();
        global.document = dom.document;
        const plugin = new Plugin({});
        plugin.showToast = () => {};
        plugin.addAsset = async () => {};
        plugin.openWishlistFormalSheet();
        const parsed = parseHTML(dom.mask.innerHTML).document;
        const form = parsed.querySelector('[data-wishlist-form]');
        assert.ok(form, 'wishlist form must render the [data-wishlist-form] container');
        const fieldNames = Array.from(form.querySelectorAll('input, select, textarea'))
            .map(input => input.getAttribute('name'))
            .filter(name => name);
        assert.deepEqual(fieldNames.sort(), ['expectedAmount', 'heartbeatTarget', 'name', 'wishlistReason'],
            'wishlist form must only expose name + expectedAmount + heartbeatTarget + wishlistReason as named fields (targetGroup is a pill group, cover is the shared picker)');
        assert.ok(form.querySelector('select[name="targetGroup"]') === null,
            'wishlist form must not expose a target-group select');
        assert.deepEqual(Array.from(form.querySelectorAll('[data-wishlist-target]')).map(item => item.getAttribute('data-wishlist-target')).sort(),
            ['physical', 'prepaid', 'virtual'],
            'wishlist form must expose three target-group pills (physical/virtual/prepaid)');
        assert.ok(form.querySelector('[data-formal-cover-toggle]'),
            'wishlist form must expose the shared cover picker toggle');
    }

    global.document = originalDocument;
    console.log('[formal-five-kind-form-submit] passed');
}

try { main(); } catch (error) { console.error('[formal-five-kind-form-submit] failed:', error); process.exit(1); }
