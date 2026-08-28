'use strict';

/**
 * v2.4.1 阶段3：种草详情卡价格趋势曲线 + 更新价格 UI 测试。
 *
 * 覆盖：
 *   (1) 种草资产 + 2 条 expectedPriceChanged 事件 → 详情卡渲染「价格趋势」section
 *       （成本 section 之后）、svg 曲线（与报表同源样式类）、贴点值用完整金额
 *       （非报表 xxK 格式）、x 轴 MM-DD 日期标签、底部「更新价格」按钮；
 *   (2) 无事件且无期望价 → 不画曲线，渲染空态文案；更新价格按钮仍在；
 *       非 wishlist 资产不渲染价格趋势 section 与更新价格按钮；
 *   (3) 冷缓存：openFormalProductCard 先 hydrate wishlistEvents 再渲染；
 *       提交更新（updateWishlistExpectedPrice 域方法，即 sheet 保存路径）后重开卡 →
 *       曲线包含新点、sidecar 事件数 +1；
 *   (4) 报表回归：_renderAmountTrendSvg 两参调用与传 {} 的三参输出逐字节一致，
 *       默认 kfmt「xxK」与 aria 标签不变。
 *
 * harness 复用 formal-workflow-harness.createHarness（linkedom + index.js 生产构建）；
 * linkedom eventPhase 基线补丁与 ui-parity-special-sheets.test.js 同款（Node 24 兼容）。
 */

const assert = require('node:assert/strict');
const { newFormalV2Asset } = require('../api/assets');
const { NOW, asset, createHarness, wireForms } = require('./formal-workflow-harness');

// linkedom 基线补丁（与 ui-parity-special-sheets.test.js 同款，仅用于让测试在 Node 24 上运行）。
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

const WISH_ID = '71000000-0000-4000-8000-000000000001';
const EMPTY_WISH_ID = '71000000-0000-4000-8000-000000000002';
const COLD_WISH_ID = '71000000-0000-4000-8000-000000000003';
const OWNED_ID = '71000000-0000-4000-8000-000000000004';

function wish(id, expectedAmountMinor, name) {
    return newFormalV2Asset({
        id, kind: 'physical', name: name || '种草相机', status: 'wishlist', currency: 'CNY',
        cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW,
        wishlist: { expectedAmountMinor, reason: 'price watch', targetGroup: 'physical' },
    });
}

/** 与 updateWishlistExpectedPrice 域方法产出的事件同形的 canonical 记录。 */
function priceEvent(id, source, previousAmountMinor, expectedAmountMinor, occurredAt) {
    return {
        id, eventType: 'expectedPriceChanged', sourceWishlistId: source.id,
        targetAssetId: null, targetKind: source.kind, sourceTargetGroup: source.wishlist.targetGroup,
        occurredAt, financialEventId: null, abandonReason: null, currency: source.currency,
        previousAmountMinor, expectedAmountMinor, sourceSnapshot: source,
    };
}

/** 详情卡 vm 依赖 formal 域快照的全部 sidecar 数组显式在场（createHarness 不注入）。 */
function prepareDomain(plugin) {
    plugin._financialEvents = [];
    plugin._subscriptionPeriods = [];
    plugin._prepaidTransactions = [];
    plugin._maintenanceRecords = [];
    plugin._usageRecords = [];
    plugin._lifecycleEvents = [];
    plugin._opLogs = [];
}

async function openCard(plugin, document, id) {
    await plugin.openFormalProductCard(id);
    const card = document.querySelector('.am-formal-product-card-mask');
    assert.ok(card, 'product detail card rendered for ' + id);
    return card;
}

async function main() {
    // ---- (1) 2 条价格变化事件 → 趋势 section + 曲线 + 更新价格按钮 ----
    {
        const s0 = wish(WISH_ID, 90000);
        const s1 = wish(WISH_ID, 120000);
        const current = wish(WISH_ID, 99900);
        const { plugin, document } = createHarness([current]);
        prepareDomain(plugin);
        plugin.wishlistEvents = [
            priceEvent('72000000-0000-4000-8000-000000000001', s0, 90000, 120000, '2026-07-20T10:00:00.000Z'),
            priceEvent('72000000-0000-4000-8000-000000000002', s1, 120000, 99900, '2026-08-01T03:30:00.000Z'),
        ];
        plugin._wishlistEventsLoaded = true;
        const card = await openCard(plugin, document, WISH_ID);
        const titles = Array.from(card.querySelectorAll('.am-product-section__title')).map(el => el.textContent);
        assert.ok(titles.indexOf('价格趋势') >= 0, 'price trend section title rendered');
        assert.ok(titles.indexOf('成本') < 0, 'wishlist card hides the cost section (no purchase yet)');
        assert.ok(card.querySelector('.am-dashboard-trend-svg'), 'trend container uses the report class');
        assert.ok(card.querySelector('svg .am-trend-line'), 'trend line path rendered');
        assert.ok(card.querySelector('svg .am-trend-area'), 'trend area path rendered');
        const vals = Array.from(card.querySelectorAll('.am-trend-val')).map(el => el.textContent);
        assert.equal(vals.length, 3, 'initial point + two change points = three value labels');
        assert.ok(vals.some(v => v.indexOf('900') >= 0), 'value labels show full amounts');
        assert.ok(vals.every(v => v.indexOf('K') < 0), 'value labels must not use the report xxK format');
        const xlabels = Array.from(card.querySelectorAll('.am-trend-xlabels span')).map(el => el.textContent).filter(Boolean);
        assert.ok(xlabels.indexOf('08-01') >= 0, 'x-axis labels use point dates MM-DD');
        assert.ok(card.querySelector('[data-wishlist-update-price]'), 'update-price button rendered');
        plugin.closeProductCard();
    }

    // ---- (2) 无事件且无期望价 → 空态；非 wishlist 不渲染 ----
    {
        const owned = asset(OWNED_ID, 'physical', '在役相机');
        const { plugin, document } = createHarness([wish(EMPTY_WISH_ID, null), owned]);
        prepareDomain(plugin);
        plugin.wishlistEvents = [];
        plugin._wishlistEventsLoaded = true;
        const card = await openCard(plugin, document, EMPTY_WISH_ID);
        assert.equal(card.querySelector('.am-dashboard-trend-svg'), null, 'no curve for a single/null point');
        assert.match(card.textContent, /暂无价格变化/, 'empty-state copy rendered');
        assert.ok(card.querySelector('[data-wishlist-update-price]'), 'update-price button still available');
        plugin.closeProductCard();
        const ownedCard = await openCard(plugin, document, OWNED_ID);
        assert.equal(ownedCard.querySelector('[data-wishlist-update-price]'), null, 'non-wishlist card has no update-price button');
        assert.ok(ownedCard.textContent.indexOf('价格趋势') < 0, 'non-wishlist card has no price trend section');
        plugin.closeProductCard();
    }

    // ---- (3) 冷缓存 warm + 提交更新 → 新点出现在曲线 ----
    {
        const s0 = wish(COLD_WISH_ID, 50000);
        const current = wish(COLD_WISH_ID, 60000);
        const { plugin, state, document } = createHarness([current]);
        prepareDomain(plugin);
        state['wishlistEvents.json'].events = [
            priceEvent('72000000-0000-4000-8000-000000000003', s0, 50000, 60000, '2026-07-20T10:00:00.000Z'),
        ];
        assert.equal(plugin._wishlistEventsLoaded, false, 'cache is cold before opening the detail card');
        const card = await openCard(plugin, document, COLD_WISH_ID);
        assert.equal(plugin._wishlistEventsLoaded, true, 'openFormalProductCard hydrates cold wishlist history');
        assert.equal(plugin.wishlistEvents.length, 1, 'warm reads the sidecar history event');
        assert.equal(card.querySelectorAll('.am-trend-val').length, 2, 'initial point + one change point');
        // 提交更新（openWishlistPriceSheet 保存时调用同一域方法）后重开详情卡。
        await plugin.updateWishlistExpectedPrice(COLD_WISH_ID, 45000);
        assert.equal(state['wishlistEvents.json'].events.length, 2, 'update commits one new expectedPriceChanged event');
        plugin.closeProductCard();
        const reopened = await openCard(plugin, document, COLD_WISH_ID);
        assert.equal(reopened.querySelectorAll('.am-trend-val').length, 3, 'reopened card curve includes the new point');
        const points = plugin._wishlistPricePoints(plugin.assets.find(a => a.id === COLD_WISH_ID));
        assert.equal(points.length, 3, 'point sequence grows with the new event');
        assert.equal(points[2].minor, 45000, 'last point is the newly submitted expected price');
        plugin.closeProductCard();
    }

    // ---- (4) 更新价格 sheet：结构 / 预填 / 保存 / 失败保留输入 ----
    {
        const SHEET_WISH_ID = '71000000-0000-4000-8000-000000000005';
        const current = wish(SHEET_WISH_ID, 88800, '种草耳机');
        const { plugin, document } = createHarness([current]);
        prepareDomain(plugin);
        plugin.wishlistEvents = [];
        plugin._wishlistEventsLoaded = true;
        await plugin.openFormalProductCard(SHEET_WISH_ID);
        const entryBtn = document.querySelector('.am-formal-product-card-mask [data-wishlist-update-price]');
        assert.ok(entryBtn, 'detail card exposes the update-price entry');
        entryBtn.onclick();
        const sheet = document.querySelector('.am-edit-sheet-mask');
        assert.ok(sheet, 'price sheet opens from the detail card');
        assert.match(sheet.className, /am-workflow-sheet-mask/, 'price sheet mask floats above the detail card (z=60)');
        assert.match(sheet.textContent, /更新期望价格/, 'sheet title uses wishlistPriceSheetTitle');
        assert.equal(sheet.querySelector('.am-form-card'), null, 'price sheet input row has no framed card box');
        assert.ok(sheet.textContent.indexOf('留空即清除期望价') < 0, 'hint text removed from the price sheet');
        const currencyTrigger = sheet.querySelector('[data-am-glass-select="wishPriceCurrency"] [data-am-glass-select-trigger]');
        assert.ok(currencyTrigger, 'price row shows the currency glass dropdown like the asset forms');
        assert.ok(currencyTrigger.disabled, 'currency dropdown is locked in the price sheet');
        assert.ok(sheet.querySelector('.am-fpc1-divider'), 'price row keeps the divider line like other forms');
        assert.ok(sheet.querySelector('input.am-form-row__amount[name="expectedAmount"]'), 'amount input uses the form price-row style');
        wireForms(sheet);
        const input = sheet.querySelector('input[name="expectedAmount"]');
        assert.equal(input.value, '888', 'input prefills the current expected price in major units');
        input.value = '654.32';
        await sheet.querySelector('form[data-wishlist-price-form]').onsubmit({ preventDefault() {} });
        assert.equal(plugin.assets.find(a => a.id === SHEET_WISH_ID).wishlist.expectedAmountMinor, 65432,
            'sheet save commits the new expected price');
        assert.equal(document.querySelector('.am-edit-sheet-mask'), null, 'sheet closes after a successful save');
        assert.ok(plugin.toasts.some(t => t.indexOf('期望价格已更新') >= 0), 'success toast shown');
        const reopened = document.querySelector('.am-formal-product-card-mask');
        assert.ok(reopened, 'detail card reopens after save');
        assert.equal(reopened.querySelectorAll('.am-trend-val').length, 2, 'reopened card trend includes the new point');
        // 失败路径：域方法抛错 → sheet 与输入保留、保存按钮恢复可用。
        reopened.querySelector('[data-wishlist-update-price]').onclick();
        const retrySheet = document.querySelector('.am-edit-sheet-mask');
        wireForms(retrySheet);
        const retryInput = retrySheet.querySelector('input[name="expectedAmount"]');
        retryInput.value = '999';
        const realUpdate = plugin.updateWishlistExpectedPrice.bind(plugin);
        plugin.updateWishlistExpectedPrice = async () => { throw new Error('injected save failure'); };
        await retrySheet.querySelector('form[data-wishlist-price-form]').onsubmit({ preventDefault() {} });
        plugin.updateWishlistExpectedPrice = realUpdate;
        assert.ok(retrySheet.parentNode, 'failed save keeps the sheet open');
        assert.equal(retryInput.value, '999', 'failed save retains the typed amount');
        assert.equal(retrySheet.querySelector('[type="submit"]').disabled, false, 'failed save re-enables submit');
        assert.ok(plugin.toasts.some(t => t.indexOf('injected save failure') >= 0), 'failure toast surfaces the message');
        plugin.closeProductCard();
    }

    // ---- (5) 报表回归：默认行为逐字节不变 ----
    {
        const { plugin } = createHarness([]);
        const series = [500000, 1000000, 0, 250000];
        const labels = ['01', '02', '03', '04'];
        const twoArgs = plugin._renderAmountTrendSvg(series, labels);
        const threeArgsEmpty = plugin._renderAmountTrendSvg(series, labels, {});
        assert.equal(twoArgs, threeArgsEmpty, 'options={} must be byte-identical to the two-arg call');
        assert.match(twoArgs, /5K/, 'default value labels keep the xxK format');
        assert.match(twoArgs, /aria-label="金额趋势"/, 'default aria label stays the report amount trend');
    }

    // ---- (6) 种草详情卡清理：保修/维修/到期/订阅历程/预付流水等记录不渲染 ----
    {
        const PHYS_WISH = '71000000-0000-4000-8000-000000000010';
        const VIRT_WISH = '71000000-0000-4000-8000-000000000011';
        const PREP_WISH = '71000000-0000-4000-8000-000000000012';
        const physWish = wish(PHYS_WISH, 30000, '种草键盘');
        const virtWish = newFormalV2Asset({ id: VIRT_WISH, kind: 'virtualSubscription', name: '种草会员', status: 'wishlist', currency: 'CNY', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW, wishlist: { expectedAmountMinor: 2500, reason: '', targetGroup: 'virtual' } });
        const prepWish = newFormalV2Asset({ id: PREP_WISH, kind: 'prepaidAmount', name: '种草储值卡', status: 'wishlist', currency: 'CNY', cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW, wishlist: { expectedAmountMinor: 50000, reason: '', targetGroup: 'prepaid' } });
        const { plugin, document } = createHarness([physWish, virtWish, prepWish]);
        prepareDomain(plugin);
        plugin.wishlistEvents = [];
        plugin._wishlistEventsLoaded = true;

        const physCard = await openCard(plugin, document, PHYS_WISH);
        const physTitles = Array.from(physCard.querySelectorAll('.am-product-section__title')).map(el => el.textContent);
        assert.ok(physTitles.indexOf('保养与维修') < 0, 'physical wishlist card hides the maintenance section');
        assert.ok(physTitles.indexOf('到期') < 0, 'physical wishlist card hides the warranty/expiry section');
        assert.ok(physTitles.indexOf('成本') < 0, 'physical wishlist card hides the cost section (no purchase yet)');
        assert.equal(physCard.querySelector('[data-formal-maintenance]'), null, 'physical wishlist card hides the maintenance entry');
        assert.ok(physCard.querySelector('[data-wishlist-update-price]'), 'physical wishlist card keeps update-price');
        assert.ok(physCard.querySelector('[data-formal-edit]'), 'physical wishlist card keeps edit entry');
        plugin.closeProductCard();

        const virtCard = await openCard(plugin, document, VIRT_WISH);
        const virtTitles = Array.from(virtCard.querySelectorAll('.am-product-section__title')).map(el => el.textContent);
        assert.ok(virtTitles.indexOf('到期') < 0, 'virtual wishlist card hides the expiry section');
        assert.ok(virtTitles.indexOf('订阅历程') < 0, 'virtual wishlist card hides the subscription history section');
        assert.ok(virtTitles.indexOf('成本') < 0, 'virtual wishlist card hides the cost section (no purchase yet)');
        assert.equal(virtCard.querySelector('[data-formal-auto-renew-link]'), null, 'virtual wishlist card hides auto-renew control');
        assert.equal(virtCard.querySelector('[data-formal-renew]'), null, 'virtual wishlist card has no renew action');
        plugin.closeProductCard();

        const prepCard = await openCard(plugin, document, PREP_WISH);
        const prepTitles = Array.from(prepCard.querySelectorAll('.am-product-section__title')).map(el => el.textContent);
        assert.ok(prepTitles.indexOf('预付权益') < 0, 'prepaid wishlist card hides the prepaid ledger section');
        assert.ok(prepTitles.indexOf('成本') < 0, 'prepaid wishlist card hides the cost section (no purchase yet)');
        assert.ok(prepCard.textContent.indexOf('商户名称') < 0, 'prepaid wishlist card hides merchant row');
        assert.ok(prepCard.textContent.indexOf('有效期') < 0, 'prepaid wishlist card hides expiry row');
        assert.equal(prepCard.querySelector('[data-formal-prepaid]'), null, 'prepaid wishlist card hides ledger entry');
        assert.equal(prepCard.querySelector('[data-prepaid-quick]'), null, 'prepaid wishlist card hides quick actions');
        plugin.closeProductCard();
    }

    // ---- (7) 删除价格记录：链重接 / 末条回退当前价 / noop ----
    {
        const DEL_WISH = '71000000-0000-4000-8000-000000000020';
        const s0 = wish(DEL_WISH, 90000);
        const current = wish(DEL_WISH, 80000);
        const { plugin, state } = createHarness([current]);
        prepareDomain(plugin);
        const e1 = priceEvent('72000000-0000-4000-8000-000000000011', s0, 90000, 120000, '2026-07-01T10:00:00.000Z');
        const e2 = priceEvent('72000000-0000-4000-8000-000000000012', s0, 120000, 99900, '2026-07-10T10:00:00.000Z');
        const e3 = priceEvent('72000000-0000-4000-8000-000000000013', s0, 99900, 80000, '2026-07-20T10:00:00.000Z');
        // 域方法读 storage 快照：种子必须落 state，同时保持内存缓存一致。
        state['wishlistEvents.json'].events = [e1, e2, e3];
        plugin.wishlistEvents = [e1, e2, e3];
        plugin._wishlistEventsLoaded = true;
        // 删除中间事件 → 下一条 previous 重接为被删事件的 previous，当前价不变。
        await plugin.deleteWishlistPriceEvent(DEL_WISH, e2.id);
        let events = state['wishlistEvents.json'].events.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        assert.equal(events.length, 2, 'middle event removed');
        assert.equal(events[1].previousAmountMinor, 120000, 'next event restitched to removed.previous');
        assert.equal(plugin.assets.find(a => a.id === DEL_WISH).wishlist.expectedAmountMinor, 80000,
            'current price unchanged when deleting a middle record');
        // 删除末条事件 → 当前价回退为该记录的 previous（e3 已重接为 120000）。
        await plugin.deleteWishlistPriceEvent(DEL_WISH, e3.id);
        assert.equal(plugin.assets.find(a => a.id === DEL_WISH).wishlist.expectedAmountMinor, 120000,
            'deleting the last record reverts the current price to its (restitched) previous value');
        // 不存在的 eventId → noop，不写 sidecar。
        const beforeCount = state['wishlistEvents.json'].events.length;
        await plugin.deleteWishlistPriceEvent(DEL_WISH, '72000000-0000-4000-8000-000000000099');
        assert.equal(state['wishlistEvents.json'].events.length, beforeCount, 'unknown event id is a noop');
        // 删除唯一事件 → 当前价回退到首条 previous（种草初始期望价）。
        await plugin.deleteWishlistPriceEvent(DEL_WISH, e1.id);
        assert.equal(state['wishlistEvents.json'].events.length, 0, 'last remaining record removed');
        assert.equal(plugin.assets.find(a => a.id === DEL_WISH).wishlist.expectedAmountMinor, 90000,
            'current price reverts to the initial expected price');
    }

    // ---- (8) 详情卡更新记录列表 + 卡内删除闭环 ----
    {
        const REC_WISH = '71000000-0000-4000-8000-000000000021';
        const s0 = wish(REC_WISH, 50000);
        const current = wish(REC_WISH, 45000);
        const { plugin, state, document } = createHarness([current]);
        prepareDomain(plugin);
        const recEvents = [
            priceEvent('72000000-0000-4000-8000-000000000021', s0, 50000, 60000, '2026-07-01T10:00:00.000Z'),
            priceEvent('72000000-0000-4000-8000-000000000022', s0, 60000, 45000, '2026-07-15T10:00:00.000Z'),
        ];
        state['wishlistEvents.json'].events = recEvents;
        plugin.wishlistEvents = recEvents;
        plugin._wishlistEventsLoaded = true;
        const card = await openCard(plugin, document, REC_WISH);
        const items = card.querySelectorAll('.am-workflow-item');
        assert.equal(items.length, 2, 'price trend section lists both update records');
        assert.match(card.textContent, /更新记录/, 'records header rendered');
        const deleteButtons = card.querySelectorAll('[data-wishlist-price-event-delete]');
        assert.equal(deleteButtons.length, 2, 'each record exposes a delete button');
        // 卡内删除最新一条 → 先弹插件范围内确认，确认后当前价回退 + 列表剩 1 条。
        const newest = Array.from(deleteButtons).find(b => b.dataset.wishlistPriceEventDelete === '72000000-0000-4000-8000-000000000022');
        assert.ok(newest, 'newest record delete button present');
        newest.onclick();
        const confirmMask = document.querySelector('.am-plugin-confirm-mask');
        assert.ok(confirmMask, 'deletion asks for a scoped confirmation first');
        assert.match(confirmMask.textContent, /删除价格记录/, 'confirm dialog shows the delete title');
        assert.equal(plugin.assets.find(a => a.id === REC_WISH).wishlist.expectedAmountMinor, 45000,
            'nothing is deleted before confirmation');
        // 取消 → 不删除。
        confirmMask.querySelector('[data-scoped-confirm-cancel]').onclick();
        assert.equal(document.querySelector('.am-plugin-confirm-mask'), null, 'cancel closes the confirm');
        assert.equal(plugin.assets.find(a => a.id === REC_WISH).wishlist.expectedAmountMinor, 45000,
            'cancel keeps the record and current price');
        // 确认 → 删除并回退（onConfirm 为异步链，等待其完成）。
        newest.onclick();
        document.querySelector('.am-plugin-confirm-mask').querySelector('[data-scoped-confirm-ok]').onclick();
        await new Promise(resolve => setTimeout(resolve, 50));
        const reopened = document.querySelector('.am-formal-product-card-mask');
        assert.ok(reopened, 'detail card reopens after record deletion');
        assert.equal(reopened.querySelectorAll('.am-workflow-item').length, 1, 'one record remains after deletion');
        assert.equal(plugin.assets.find(a => a.id === REC_WISH).wishlist.expectedAmountMinor, 60000,
            'current price reverted after deleting the newest record');
        plugin.closeProductCard();
    }

    console.log('[wishlist-price-trend] passed');
}

main().catch(error => { console.error('[wishlist-price-trend] failed:', error); process.exit(1); });
