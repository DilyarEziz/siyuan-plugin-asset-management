'use strict';

/**
 * v2.6.2 regression: creating a NEW physical asset directly as retired must
 * route the sale price / retired date through the domain transactions.
 *
 * Bug background:
 *   - The form submit path only wrote sale/retire sidecars on the
 *     "active -> retired" EDIT transition (retireTransition branch).
 *   - On NEW creation with the retired pill selected, dto.status='retired'
 *     was passed straight to addAsset and the salePrice input was silently
 *     dropped: the asset ended up retired but no sale financial event and
 *     no retired lifecycle event were ever written.
 *
 * Fix under test (production path openFormalAssetSheet -> form.onsubmit):
 *   - new physical + retired pill -> create as active via addAsset, then
 *     salePrice>0  -> recordPhysicalSaleAsset (sale event + retired status)
 *     salePrice='' -> retirePhysicalAsset (retire only, no sale event)
 *
 * Cases:
 *   T1: new physical, retired pill, salePrice=300.00, retiredDate=2026-07-20
 *       -> status=retired, statusChangedOn=retiredDate,
 *          financialEvents: eventType='sale', direction='inflow', amountMinor=30000,
 *          lifecycleEvents: kind='retired', opLog: physical-sale.
 *   T2 (control): new physical, retired pill, empty salePrice
 *       -> status=retired, NO sale event, opLog: physical-retire.
 */

const assert = require('node:assert/strict');
const { createHarness, wireForms } = require('./formal-workflow-harness.js');

(async () => {
    // T1: new + direct retire + sale price -> sale financial event + retired lifecycle
    {
        const h = createHarness([]);
        const mask = h.plugin.openFormalAssetSheet('physical', {});
        wireForms(mask);
        const form = mask.querySelector('form');
        const nameInput = mask.querySelector('[name="name"]'); if (nameInput) nameInput.value = '新建退役带转让';
        const amountInput = mask.querySelector('[name="amount"]'); if (amountInput) amountInput.value = '500';
        mask.querySelector('[data-status-pill="retired"]').onclick();
        const rd = mask.querySelector('[name="retiredDate"]');
        assert.ok(rd, 'retiredDate input must render after picking the retired pill');
        rd.value = '2026-07-20';
        const sp = mask.querySelector('[name="salePrice"]');
        assert.ok(sp, 'salePrice input must render after picking the retired pill');
        sp.value = '300';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'submit must not raise an error toast: ' + h.plugin.toasts.join(' | '));
        const after = h.plugin.assets.find(x => x.name === '新建退役带转让');
        assert.ok(after, 'asset must be created');
        assert.equal(after.status, 'retired', 'new asset created directly retired must end up retired');
        assert.equal(after.statusChangedOn, '2026-07-20', 'statusChangedOn must equal the retired date');
        const sales = (h.state['financialEvents.json'].events || []).filter(e => e.assetId === after.id && e.eventType === 'sale');
        assert.equal(sales.length, 1, 'exactly one sale financial event must exist');
        assert.equal(sales[0].direction, 'inflow', 'sale event direction must be inflow');
        assert.equal(sales[0].amountMinor, 30000, 'sale event amountMinor must be 30000 (300.00)');
        const lifecycle = (h.state['lifecycleEvents.json'].events || []).filter(e => e.assetId === after.id && e.kind === 'retired');
        assert.ok(lifecycle.length >= 1, 'lifecycleEvents must contain a retired event');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(l => l.type === 'physical-sale' && l.assetId === after.id), 'physical-sale opLog must persist through the whitelist');
    }

    // T2 (control): new + direct retire + empty sale price -> retire only, no sale event
    {
        const h = createHarness([]);
        const mask = h.plugin.openFormalAssetSheet('physical', {});
        wireForms(mask);
        const form = mask.querySelector('form');
        const nameInput = mask.querySelector('[name="name"]'); if (nameInput) nameInput.value = '新建退役无转让';
        const amountInput = mask.querySelector('[name="amount"]'); if (amountInput) amountInput.value = '500';
        mask.querySelector('[data-status-pill="retired"]').onclick();
        const rd = mask.querySelector('[name="retiredDate"]'); if (rd) rd.value = '2026-07-21';
        const sp = mask.querySelector('[name="salePrice"]'); if (sp) sp.value = '';
        await form.onsubmit({ preventDefault() {}, currentTarget: form });
        assert.equal(h.plugin.toasts.length, 0, 'submit must not raise an error toast: ' + h.plugin.toasts.join(' | '));
        const after = h.plugin.assets.find(x => x.name === '新建退役无转让');
        assert.ok(after, 'asset must be created');
        assert.equal(after.status, 'retired', 'new asset created directly retired must end up retired');
        assert.equal(after.statusChangedOn, '2026-07-21', 'statusChangedOn must equal the retired date');
        const sales = (h.state['financialEvents.json'].events || []).filter(e => e.assetId === after.id && e.eventType === 'sale');
        assert.equal(sales.length, 0, 'no sale event may exist when salePrice is empty');
        const lifecycle = (h.state['lifecycleEvents.json'].events || []).filter(e => e.assetId === after.id && e.kind === 'retired');
        assert.ok(lifecycle.length >= 1, 'lifecycleEvents must contain a retired event');
        const logs = h.state['operationLogs.json'].logs || [];
        assert.ok(logs.some(l => l.type === 'physical-retire' && l.assetId === after.id), 'physical-retire opLog must persist through the whitelist');
    }

    console.log('formal-new-retired-sale.test.js: ALL PASSED');
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
