'use strict';

// SPEC C — wishlist → formal purchase prefill.
// Covers:
//   C1 name prefilled from wish.name
//   C2 price prefilled from wishlist.expectedAmountMinor (minor -> major string)
//   C3 currency prefilled from wish.currency
//   C4 null expected price -> price input left empty (not 0), no hint
//   C5 currency locked to wish.currency (glass select: hidden input + disabled trigger across all kinds)
//   C6 prefill hint shown iff expected price non-null
//   C7 abandon (拔草) does NOT prefill / never opens a formal form
//   C8 virtual / prepaid routing carries name + price + currency into the routed formal form

const assert = require('node:assert/strict');
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

/** Create a wishlist asset through the real wishlist form (targetGroup via pill click). */
async function createWish(plugin, document, opts) {
    plugin.openWishlistFormalSheet();
    const mask = Array.from(document.querySelectorAll('.am-edit-sheet-mask')).pop();
    if (opts.targetGroup && opts.targetGroup !== 'physical') {
        const pill = mask.querySelector('[data-wishlist-target="' + opts.targetGroup + '"]');
        assert.ok(pill, 'target-group pill exists for ' + opts.targetGroup);
        pill.onclick();
    }
    wireForms(mask);
    const form = mask.querySelector('form');
    form.querySelector('input[name="name"]').value = opts.name;
    const amount = form.querySelector('input[name="expectedAmount"]');
    if (amount) amount.value = opts.expectedAmount == null ? '' : String(opts.expectedAmount);
    await form.onsubmit({ preventDefault() {} });
    return plugin.assets.find(a => a && a.status === 'wishlist');
}

/** The formal purchase form mask (has a price field; excludes the wishlist sheet + kind picker). */
function formalMask(document) {
    const masks = Array.from(document.querySelectorAll('.am-edit-sheet-mask'))
        .filter(m => m.querySelector('form input[name="amount"]'));
    return masks.length ? masks[masks.length - 1] : null;
}

async function testPhysicalPrefill() {
    const { plugin, document } = createHarness([]);
    const wish = await createWish(plugin, document, { name: '种草相机', expectedAmount: '88.88', targetGroup: 'physical' });
    assert.ok(wish, 'wishlist asset created');
    assert.equal(wish.wishlist.expectedAmountMinor, 8888, 'expected price stored as minor');
    assert.equal(wish.wishlist.targetGroup, 'physical', 'targetGroup physical');

    await plugin.purchaseWishlistAsset(wish.id);
    const mask = formalMask(document);
    assert.ok(mask, 'physical formal form opened');
    wireForms(mask);
    const form = mask.querySelector('form');

    assert.equal(form.querySelector('input[name="name"]').value, '种草相机', 'C1 name prefilled');
    assert.equal(form.querySelector('input[name="amount"]').value, '88.88', 'C2 price prefilled from expected minor');
    assert.equal(form.querySelector('input[name="currency"]').value, 'CNY', 'C3 currency prefilled');
    assert.ok(form.querySelector('select[name="currency"]') === null, 'C5 physical exposes no editable currency select');
    assert.ok(form.querySelector('input[name="currency"][type="hidden"]'), 'C5 physical currency is a locked hidden input');
    assert.ok(mask.querySelector('[data-wishlist-prefill-hint]'), 'C6 hint shown when expected price present');
    console.log('  C1/C2/C3/C5(physical)/C6 physical prefill ok');
}

async function testNullExpectedPrice() {
    const { plugin, document } = createHarness([]);
    const wish = await createWish(plugin, document, { name: '空价种草', expectedAmount: '', targetGroup: 'physical' });
    assert.ok(wish, 'wishlist asset created');
    // The form normalizes an empty price to 0; simulate a genuinely null expected price
    // (valid per formal-v2 schema, e.g. imported data) to exercise the prefill null branch.
    wish.wishlist.expectedAmountMinor = null;

    await plugin.purchaseWishlistAsset(wish.id);
    const mask = formalMask(document);
    wireForms(mask);
    const form = mask.querySelector('form');

    assert.equal(form.querySelector('input[name="name"]').value, '空价种草', 'C4 name still prefilled');
    assert.equal(form.querySelector('input[name="amount"]').value, '', 'C4 null expected price leaves amount empty (not 0)');
    assert.ok(mask.querySelector('[data-wishlist-prefill-hint]') === null, 'C4/C6 no hint when expected price is null');
    console.log('  C4 null expected price leaves amount empty ok');
}

async function testVirtualPrefill() {
    const { plugin, document } = createHarness([]);
    const wish = await createWish(plugin, document, { name: '种草会员', expectedAmount: '25', targetGroup: 'virtual' });
    assert.ok(wish, 'wishlist asset created');
    assert.equal(wish.wishlist.targetGroup, 'virtual', 'targetGroup virtual');

    await plugin.purchaseWishlistAsset(wish.id);
    const mask = formalMask(document);
    assert.ok(mask, 'virtual formal form opened via routing');
    wireForms(mask);
    const form = mask.querySelector('form');

    assert.equal(form.querySelector('input[name="name"]').value, '种草会员', 'C8 virtual name prefilled');
    assert.equal(form.querySelector('input[name="amount"]').value, '25', 'C8 virtual price prefilled');
    const currencyInput = form.querySelector('input[name="currency"][type="hidden"]');
    assert.ok(currencyInput, 'virtual form has a currency glass select (hidden input)');
    assert.equal(currencyInput.value, 'CNY', 'C3 virtual currency prefilled');
    const currencyTrigger = form.querySelector('[data-am-glass-select="currency"] [data-am-glass-select-trigger]');
    assert.ok(currencyTrigger && currencyTrigger.hasAttribute('disabled'), 'C5 virtual currency locked to wish currency');
    assert.ok(mask.querySelector('[data-wishlist-prefill-hint]'), 'C6 virtual hint shown');
    console.log('  C3/C5/C6/C8 virtual routing prefill ok');
}

async function testPrepaidPrefill() {
    const { plugin, document } = createHarness([]);
    const wish = await createWish(plugin, document, { name: '种草储值卡', expectedAmount: '100', targetGroup: 'prepaid' });
    assert.ok(wish, 'wishlist asset created');
    assert.equal(wish.wishlist.targetGroup, 'prepaid', 'targetGroup prepaid');

    await plugin.purchaseWishlistAsset(wish.id);
    const mask = formalMask(document);
    assert.ok(mask, 'prepaid formal form opened via routing');
    wireForms(mask);
    const form = mask.querySelector('form');

    assert.equal(form.querySelector('input[name="name"]').value, '种草储值卡', 'C8 prepaid name prefilled');
    assert.equal(form.querySelector('input[name="amount"]').value, '100', 'C8 prepaid price prefilled');
    const currencyInput = form.querySelector('input[name="currency"][type="hidden"]');
    assert.ok(currencyInput, 'prepaid form has a currency glass select (hidden input)');
    assert.equal(currencyInput.value, 'CNY', 'C3 prepaid currency prefilled');
    const currencyTrigger = form.querySelector('[data-am-glass-select="currency"] [data-am-glass-select-trigger]');
    assert.ok(currencyTrigger && currencyTrigger.hasAttribute('disabled'), 'C5 prepaid currency locked to wish currency');
    assert.ok(mask.querySelector('[data-wishlist-prefill-hint]'), 'C6 prepaid hint shown');
    console.log('  C3/C5/C6/C8 prepaid routing prefill ok');
}

async function testAbandonNoPrefill() {
    const { plugin, document } = createHarness([]);
    const wish = await createWish(plugin, document, { name: '拔草测试', expectedAmount: '50', targetGroup: 'physical' });
    assert.ok(wish, 'wishlist asset created');

    plugin.openWishlistAbandonSheet(wish.id);
    const abandonMask = Array.from(document.querySelectorAll('.am-edit-sheet-mask')).pop();
    assert.ok(abandonMask.classList.contains('wishlist-abandon'), 'C7 abandon reason sheet opened');
    assert.ok(abandonMask.querySelector('input[name="amount"]') === null, 'C7 abandon sheet has no formal price field');
    assert.ok(abandonMask.querySelector('[data-wishlist-prefill-hint]') === null, 'C7 abandon sheet shows no prefill hint');

    abandonMask.querySelector('[data-wishlist-abandon-confirm]').onclick();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(plugin.assets.filter(a => a && a.status === 'wishlist').length, 0, 'C7 abandon removes the wish');
    assert.equal(plugin.assets.filter(a => a && a.status !== 'wishlist').length, 0, 'C7 abandon creates no formal asset');
    console.log('  C7 abandon does not prefill ok');
}

async function main() {
    await testPhysicalPrefill();
    await testNullExpectedPrice();
    await testVirtualPrefill();
    await testPrepaidPrefill();
    await testAbandonNoPrefill();
    console.log('[wishlist-prefill] passed');
}

main().catch(error => { console.error('[wishlist-prefill] failed:', error); process.exit(1); });
