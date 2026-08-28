'use strict';

const assert = require('node:assert/strict');
const { FORMAL_ASSET_KIND } = require('../api/assets');
const { createHarness, wireForms } = require('./formal-workflow-harness');

// linkedom 基线补丁（与 calendar-warranty-link.test.js 同款，仅用于让测试在 Node 24 上运行）。
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

function control(form, name, value) {
    const node = form.querySelector(`[name="${name}"]`);
    if (!node) return;
    node.value = String(value);
}

async function assertSingleFlightSheet(mode, expectedKind) {
    const { plugin, state, document } = createHarness([]);
    const open = {
        physical: () => plugin.openPhysicalFormalSheet(),
        virtual: () => plugin.openVirtualFormalSheet(),
        prepaid: () => plugin.openPrepaidFormalSheet(),
        wishlist: () => plugin.openWishlistFormalSheet(),
    }[mode];
    open();
    const mask = document.querySelector('.am-edit-sheet-mask');
    wireForms(mask);
    const form = mask.querySelector('form');
    control(form, 'name', `single-flight-${mode}`);
    control(form, 'amount', '12');
    control(form, 'acquiredOn', '2026-07-19');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const realAdd = plugin.addAsset.bind(plugin);
    let mutations = 0;
    plugin.addAsset = async (...args) => { mutations += 1; await gate; return realAdd(...args); };
    const first = form.onsubmit({ preventDefault() {} });
    const second = form.onsubmit({ preventDefault() {} });
    assert.equal(mutations, 1, `${mode} ignores a concurrent second submit`);
    const save = mask.querySelector('.am-form-shell__save') || mask.querySelector('.am-edit-sheet__submit');
    assert.equal(save.disabled, true, `${mode} disables save while persisting`);
    assert.equal(save.getAttribute('aria-busy'), 'true', `${mode} exposes busy state`);
    release();
    await Promise.all([first, second]);
    assert.equal(plugin.assets.length, 1, `${mode} commits one asset`);
    assert.equal(plugin.assets[0].kind, expectedKind, `${mode} commits its canonical kind`);
    if (mode === 'wishlist') {
        assert.equal(state['financialEvents.json'].events.length, 0, 'wishlist duplicate submit creates no financial sidecar');
        assert.equal(state['prepaidTransactions.json'].records.length, 0, 'wishlist duplicate submit creates no prepaid sidecar');
    } else {
        assert.equal(state['financialEvents.json'].events.length, 1, `${mode} creates one financial sidecar`);
        if (mode === 'prepaid') assert.equal(state['prepaidTransactions.json'].records.length, 1, 'prepaid duplicate submit creates one opening sidecar');
        if (mode === 'virtual') assert.equal(state['subscriptionPeriods.json'].records.length, 1, 'subscription duplicate submit creates one period sidecar');
    }
}

async function assertFailedSaveCanRetry(mode, expectedKind) {
    const { plugin, state, document } = createHarness([]);
    const open = {
        physical: () => plugin.openPhysicalFormalSheet(),
        virtual: () => plugin.openVirtualFormalSheet(),
        prepaid: () => plugin.openPrepaidFormalSheet(),
        wishlist: () => plugin.openWishlistFormalSheet(),
    }[mode];
    open();
    const mask = document.querySelector('.am-edit-sheet-mask');
    wireForms(mask);
    const form = mask.querySelector('form');
    const name = `retry-${mode}`;
    const amount = '12';
    const notes = `draft-${mode}`;
    control(form, 'name', name); control(form, 'amount', amount); control(form, 'notes', notes); control(form, 'acquiredOn', '2026-07-19');
    if (mode === 'virtual') control(form, 'periodStart', '2026-07-19');
    if (mode === 'prepaid') control(form, 'provider', 'retry-provider');
    if (mode === 'wishlist') control(form, 'wishlistReason', 'retry-reason');
    const realAdd = plugin.addAsset.bind(plugin);
    let attempts = 0;
    plugin.addAsset = async (...args) => { attempts += 1; if (attempts === 1) throw new Error('injected save failure'); return realAdd(...args); };
    await form.onsubmit({ preventDefault() {} });
    const save = mask.querySelector('.am-form-shell__save') || mask.querySelector('.am-edit-sheet__submit');
    assert.equal(attempts, 1, `${mode} failed save performs one mutation attempt`);
    assert.equal(save.disabled, false, `${mode} failed save re-enables the submit button`);
    assert.equal(save.getAttribute('aria-busy'), 'false', `${mode} failed save clears busy state`);
    assert.equal(form.querySelector('[name="name"]').value, name, `${mode} failed save retains name draft`);
    const amountEl = form.querySelector('[name="amount"]') || form.querySelector('[name="expectedAmount"]');
    if (amountEl) assert.equal(amountEl.value, mode === 'wishlist' ? '' : amount, `${mode} failed save retains amount draft`);
    const notesEl = form.querySelector('[name="notes"]');
    if (notesEl) assert.equal(notesEl.value, notes, `${mode} failed save retains notes draft`);
    assert.equal(plugin.assets.length, 0, `${mode} failed save leaves canonical assets unchanged`);
    assert.equal(state['financialEvents.json'].events.length, 0, `${mode} failed save writes no financial sidecar`);
    assert.equal(state['prepaidTransactions.json'].records.length, 0, `${mode} failed save writes no prepaid sidecar`);
    assert.equal(state['subscriptionPeriods.json'].records.length, 0, `${mode} failed save writes no subscription sidecar`);
    await form.onsubmit({ preventDefault() {} });
    assert.equal(attempts, 2, `${mode} retry invokes persistence again`);
    assert.equal(plugin.assets.length, 1, `${mode} retry commits the asset`);
    assert.equal(plugin.assets[0].kind, expectedKind, `${mode} retry preserves canonical kind`);
    if (mode === 'wishlist') {
        assert.equal(state['financialEvents.json'].events.length, 0, 'wishlist retry creates no financial sidecar');
        assert.equal(state['prepaidTransactions.json'].records.length, 0, 'wishlist retry creates no prepaid sidecar');
        assert.equal(state['subscriptionPeriods.json'].records.length, 0, 'wishlist retry creates no subscription sidecar');
    } else {
        assert.equal(state['financialEvents.json'].events.length, 1, `${mode} retry creates one financial sidecar`);
        assert.equal(state['prepaidTransactions.json'].records.length, mode === 'prepaid' ? 1 : 0, `${mode} retry creates the expected prepaid sidecar count`);
        assert.equal(state['subscriptionPeriods.json'].records.length, mode === 'virtual' ? 1 : 0, `${mode} retry creates the expected subscription sidecar count`);
    }
}

async function main() {
    const { plugin, document } = createHarness([]);
    plugin._tags = [{ id: 'a1000000-0000-4000-8000-000000000001', label: '工作', emoji: '💼' }];
    let saved = null;
    plugin.addAsset = async (dto, peripheral) => { saved = { dto, peripheral }; return dto; };

    plugin.openPhysicalFormalSheet();
    let mask = document.querySelector('.am-edit-sheet-mask');
    assert.ok(mask.querySelector('.am-form-shell'));
    assert.ok(mask.querySelector('form [name="name"][required]'));
    assert.ok(mask.querySelector('form [name="amount"][min="0"][step="0.01"]'));
    assert.ok(mask.querySelector('[name="usageTrackingEnabled"]') === null, 'formal physical form never exposes legacy usage tracking');
    assert.ok(mask.querySelector('[name="skipNextRenewal"]') === null, 'formal physical form never exposes legacy skip');
    wireForms(mask); let form = mask.querySelector('form');
    control(form, 'name', '相机'); control(form, 'amount', '10'); control(form, 'acquiredOn', '2026-07-19');
    await form.onsubmit({ preventDefault() {} });
    assert.equal(saved.dto.kind, FORMAL_ASSET_KIND.PHYSICAL);
    assert.equal(Object.hasOwn(saved.dto, 'price'), false, 'canonical DTO contains no legacy price field');
    assert.equal(saved.peripheral.purchaseAmountMinor, 1000, 'physical opening financial amount stays in sidecar transaction input');

    plugin.openVirtualFormalSheet(); mask = document.querySelector('.am-edit-sheet-mask');
    wireForms(mask); form = mask.querySelector('form'); control(form, 'name', 'Service'); control(form, 'amount', '8');
    mask.querySelector('[data-switch-kind="virtualPerpetual"]').onclick();
    wireForms(mask); form = mask.querySelector('form');
    assert.equal(form.querySelector('[name="name"]').value, 'Service', 'draft name survives subtype rerender');
    control(form, 'acquiredOn', '2026-07-19'); await form.onsubmit({ preventDefault() {} });
    assert.equal(saved.dto.kind, FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL);
    assert.ok(mask.querySelector('[name="skipNextRenewal"]') === null, 'formal perpetual form never exposes legacy renewal score');

    plugin.openPrepaidFormalSheet(); mask = document.querySelector('.am-edit-sheet-mask');
    assert.ok(mask.querySelector('.am-prepaid-sheet'));
    assert.ok(mask.querySelector('[data-switch-kind="prepaidAmount"]'));
    assert.ok(mask.querySelector('[data-switch-kind="prepaidCount"]'));
    mask.querySelector('[data-switch-kind="prepaidCount"]').onclick();
    wireForms(mask); form = mask.querySelector('form'); control(form, 'name', '健身'); control(form, 'amount', '12'); control(form, 'acquiredOn', '2026-07-19'); control(form, 'openingCount', '20');
    await form.onsubmit({ preventDefault() {} });
    assert.equal(saved.dto.kind, FORMAL_ASSET_KIND.PREPAID_COUNT);
    assert.equal(saved.peripheral.prepaidOpeningCount, 20);
    assert.ok(mask.querySelector('[name="prepaidBalance"]') === null, 'formal prepaid form never edits a legacy balance directly');

    plugin.openWishlistFormalSheet(); mask = Array.from(document.querySelectorAll('.am-edit-sheet-mask')).pop();
    assert.ok(mask.classList.contains('am-wishlist-sheet') || mask.querySelector('.am-wishlist-sheet'));
    wireForms(mask); form = mask.querySelector('form'); form.checkValidity = () => false; form.reportValidity = () => { form.reported = true; };
    let mutations = 0; plugin.addAsset = async () => { mutations += 1; };
    await form.onsubmit({ preventDefault() {}, currentTarget: form });
    assert.equal(form.reported, true, 'invalid native form remains open and reports validity');
    assert.equal(mutations, 0, 'invalid sheet cannot mutate');
    await assertSingleFlightSheet('physical', FORMAL_ASSET_KIND.PHYSICAL);
    await assertSingleFlightSheet('virtual', FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION);
    await assertSingleFlightSheet('prepaid', FORMAL_ASSET_KIND.PREPAID_AMOUNT);
    await assertSingleFlightSheet('wishlist', FORMAL_ASSET_KIND.PHYSICAL);
    await assertFailedSaveCanRetry('physical', FORMAL_ASSET_KIND.PHYSICAL);
    await assertFailedSaveCanRetry('virtual', FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION);
    await assertFailedSaveCanRetry('prepaid', FORMAL_ASSET_KIND.PREPAID_AMOUNT);
    await assertFailedSaveCanRetry('wishlist', FORMAL_ASSET_KIND.PHYSICAL);
    console.log('[ui-parity-special-sheets] passed');
}

main().catch(error => { console.error('[ui-parity-special-sheets] failed:', error); process.exit(1); });
