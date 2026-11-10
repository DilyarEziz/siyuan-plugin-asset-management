'use strict';

/**
 * v2.7.0 快速退役/恢复在役入口回归测试（v2.7.1 收口后行为）。
 *
 * 覆盖目标（issue：买断/预付缺可见退役入口；用户实测反馈收口）：
 *   1) ••• 卡片菜单：买断/预付（金额+次数）active → 编辑/标记退役/删除；retired →
 *      编辑/重新启用/删除；wishlist → 仅 编辑/删除。
 *   2) 入口收口：实物与订阅（active）菜单只有 编辑/删除——退役属低频操作不占菜单，
 *      实物继续走编辑表单退役，订阅由到期投影与续订管理。
 *   3) 菜单快速退役（买断）：scoped 确认 → setStatus retired（statusChangedOn=今天）+
 *      lifecycle retired 事件 + 成功 toast + dock/modal 列表即时刷新。
 *   4) 菜单快速退役（预付余额>0）：确认文案含余额保留提示；确认后退役且流水保留。
 *   5) 菜单重新启用：setStatus active + lifecycle restored 事件 + toast + 列表刷新。
 *   6) 详情卡不放退役按钮（v2.7.1 收口）：买断/订阅/预付/实物 active 与 retired 均无
 *      data-formal-quick-retire / data-formal-status / data-formal-retire 退役入口 pill
 *      （实物退役唯一入口 = 编辑表单状态 pill）。
 *   7) 守卫：retired/wishlist/实物/订阅 走快速退役入口直接 no-op（不弹确认）。
 *
 * 注意：断言一律用 assert.ok + 布尔表达式，禁止 assert.equal(DOM节点, null)——
 * 失败路径的 util.inspect 会对 linkedom 节点的 Symbol 链无限遍历（每次访问生成新
 * 对象，环检测失效）导致测试进程假死。文件末尾显式 process.exit(0)：相关笔记查询
 * 会让 keep-alive socket 挂住事件循环，与其他既有测试的收尾约定一致。
 */

const assert = require('node:assert/strict');
const { createHarness, asset, flushDialog, NOW, wireForms } = require('./formal-workflow-harness.js');
const { createStableId } = require('../api/algorithms.js');

const TODAY = new Date().toISOString().slice(0, 10);

function wishlistAsset(id, kind, name) {
    return { id, kind, name, status: 'wishlist', currency: 'CNY',
        cover: { kind: 'none' }, createdAt: NOW, updatedAt: NOW,
        wishlist: { expectedAmountMinor: 9000, reason: '', targetGroup: kind === 'physical' ? 'physical' : 'virtual' } };
}

function menuLabels(plugin, id, document) {
    const target = document.createElement('button');
    document.body.appendChild(target);
    plugin.openItemMenu(id, target);
    const dropdown = document.body.querySelector('.am-dropdown--item');
    const labels = dropdown ? Array.from(dropdown.querySelectorAll('[data-pick-idx]')).map(b => b.textContent) : [];
    plugin._closeItemMenu();
    return labels;
}

(async () => {
    // T1: 买断 active 菜单项
    {
        const a = asset(createStableId(), 'virtualPerpetual', '买断软件');
        const h = createHarness([a]);
        assert.deepEqual(menuLabels(h.plugin, a.id, h.document), ['编辑', '标记退役', '删除'], 'active perpetual menu has retire item');
    }

    // T2: 买断 retired 菜单 → 重新启用 + 列表刷新
    {
        const a = Object.assign(asset(createStableId(), 'virtualPerpetual', '已退役买断'), { status: 'retired', statusChangedOn: '2026-07-05' });
        const h = createHarness([a]);
        const uiEffects = [];
        h.plugin._runGuardedUiEffects = options => { uiEffects.push(options); return true; };
        const target = h.document.createElement('button');
        h.document.body.appendChild(target);
        h.plugin.openItemMenu(a.id, target);
        const buttons = Array.from(h.document.body.querySelectorAll('.am-dropdown--item [data-pick-idx]'));
        assert.ok(buttons[1].textContent === '重新启用', 'retired asset shows reactivate');
        buttons[1].onclick({ preventDefault() {}, stopPropagation() {} });
        await flushDialog();
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.ok(after.status === 'active', 'reactivate sets status active');
        assert.ok(h.plugin.toasts.some(t => t.includes('已恢复在役')), 'reactivate success toast');
        assert.ok(uiEffects.some(o => o && o.renderDock === true && o.refreshModal === true), 'reactivate refreshes dock & modal');
        const lifecycle = (h.state['lifecycleEvents.json'].events || []);
        assert.ok(lifecycle.some(e => e.kind === 'restored' && e.assetId === a.id), 'restored lifecycle event recorded');
    }

    // T3: wishlist 资产菜单只有 编辑/删除
    {
        const a = wishlistAsset(createStableId(), 'virtualSubscription', '种草订阅');
        const h = createHarness([a]);
        assert.deepEqual(menuLabels(h.plugin, a.id, h.document), ['编辑', '删除'], 'wishlist menu has no retire entry');
    }

    // T4: 入口收口——实物/订阅 active 菜单只有 编辑/删除；预付（金额/次数）有 标记退役
    {
        const physical = asset(createStableId(), 'physical', '实物资产');
        const h1 = createHarness([physical]);
        assert.deepEqual(menuLabels(h1.plugin, physical.id, h1.document), ['编辑', '删除'], 'physical menu has no quick retire (edit-form retire only)');

        const sub = asset(createStableId(), 'virtualSubscription', '订阅资产');
        const h2 = createHarness([sub]);
        assert.deepEqual(menuLabels(h2.plugin, sub.id, h2.document), ['编辑', '删除'], 'subscription menu has no quick retire');

        const prepaidAmount = asset(createStableId(), 'prepaidAmount', '储值卡');
        const h3 = createHarness([prepaidAmount]);
        assert.deepEqual(menuLabels(h3.plugin, prepaidAmount.id, h3.document), ['编辑', '标记退役', '删除'], 'prepaidAmount menu has retire item');

        const prepaidCount = asset(createStableId(), 'prepaidCount', '次卡');
        const h4 = createHarness([prepaidCount]);
        assert.deepEqual(menuLabels(h4.plugin, prepaidCount.id, h4.document), ['编辑', '标记退役', '删除'], 'prepaidCount menu has retire item');
    }

    // T5: 菜单快速退役（买断）→ 确认弹窗 → setStatus retired + 列表刷新
    {
        const a = asset(createStableId(), 'virtualPerpetual', '买断退役');
        const h = createHarness([a]);
        const uiEffects = [];
        h.plugin._runGuardedUiEffects = options => { uiEffects.push(options); return true; };
        const target = h.document.createElement('button');
        h.document.body.appendChild(target);
        h.plugin.openItemMenu(a.id, target);
        const buttons = Array.from(h.document.body.querySelectorAll('.am-dropdown--item [data-pick-idx]'));
        buttons[1].onclick({ preventDefault() {}, stopPropagation() {} });
        const mask = h.document.body.querySelector('.am-plugin-confirm-mask');
        assert.ok(mask, 'quick retire opens scoped confirm');
        assert.ok(mask.querySelector('.am-confirm__title').textContent.includes('标记退役'), 'confirm title is retire');
        assert.ok(!!mask.querySelector('.am-plugin-confirm__actions--center'), 'confirm actions centered');
        assert.ok(!!mask.querySelector('[data-scoped-confirm-ok].am-scoped-confirm__button--primary'), 'confirm button uses primary tone');
        assert.ok(!mask.querySelector('[data-scoped-confirm-ok].am-scoped-confirm__button--danger'), 'confirm button is not danger tone');
        mask.querySelector('[data-scoped-confirm-ok]').onclick();
        await flushDialog();
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.ok(after.status === 'retired', 'quick retire sets status retired');
        assert.ok(after.statusChangedOn === TODAY, 'quick retire sets statusChangedOn to today');
        assert.ok(h.plugin.toasts.some(t => t.includes('已标记退役')), 'quick retire success toast');
        assert.ok(uiEffects.some(o => o && o.renderDock === true && o.refreshModal === true), 'quick retire refreshes dock & modal');
        const lifecycle = (h.state['lifecycleEvents.json'].events || []);
        assert.ok(lifecycle.some(e => e.kind === 'retired' && e.assetId === a.id), 'retired lifecycle event recorded');
        assert.ok(!h.plugin.toasts.some(t => t.includes('⚠️')), 'no error toast');
    }

    // T6: 预付余额>0 → 确认文案含余额保留提示
    {
        const a = asset(createStableId(), 'prepaidAmount', '储值卡');
        const h = createHarness([a]);
        await h.plugin.addPrepaidTransaction(a.id, { type: 'inflow', amountMinor: 10000, date: '2026-07-02', note: '充值' });
        h.plugin._quickRetireFromMenu(a.id);
        const mask = h.document.body.querySelector('.am-plugin-confirm-mask');
        assert.ok(mask, 'prepaid quick retire opens confirm');
        assert.ok(mask.innerHTML.includes('100.00'), 'confirm hints prepaid balance');
        assert.ok(mask.innerHTML.includes('保留'), 'confirm hints balance kept');
        mask.querySelector('[data-scoped-confirm-ok]').onclick();
        await flushDialog();
        const after = h.plugin.assets.find(x => x.id === a.id);
        assert.ok(after.status === 'retired', 'prepaid quick retire sets retired');
        const txs = (h.state['prepaidTransactions.json'].records || []).filter(r => r.assetId === a.id);
        assert.ok(txs.length === 1, 'transactions preserved on retire');
    }

    // T7: 详情卡不放退役按钮（v2.7.1 收口：低频操作不占详情卡主操作区）
    {
        const mk = async (kind, status) => {
            let a;
            if (status === 'wishlist') {
                a = wishlistAsset(createStableId(), kind, kind + '-wishlist');
            } else {
                a = Object.assign(asset(createStableId(), kind, kind + '-' + status), { status: status });
            }
            const h = createHarness([a]);
            await h.plugin.openFormalProductCard(a.id);
            const card = h.plugin._productCardHost.querySelector('.am-product-card');
            return { h, card };
        };
        {
            const { card } = await mk('virtualPerpetual', 'active');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'active perpetual card has no retire pill');
            assert.ok(!card.querySelector('[data-formal-status]'), 'active perpetual card has no restore pill');
        }
        {
            const { card } = await mk('virtualPerpetual', 'retired');
            assert.ok(!card.querySelector('[data-formal-status="active"]'), 'retired perpetual card has no restore pill');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'retired perpetual card has no retire pill');
        }
        {
            const { card } = await mk('virtualSubscription', 'active');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'subscription card has no retire pill');
        }
        {
            const { card } = await mk('prepaidAmount', 'active');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'prepaid card has no retire pill');
        }
        {
            const { card } = await mk('physical', 'active');
            assert.ok(!card.querySelector('[data-formal-retire]'), 'physical card has no retire pill (edit-form retire only)');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'physical card has no generic retire pill');
        }
        {
            const { card } = await mk('physical', 'wishlist');
            assert.ok(!card.querySelector('[data-formal-quick-retire]'), 'wishlist card has no retire pill');
            assert.ok(!card.querySelector('[data-formal-retire]'), 'wishlist card has no physical retire pill');
        }
    }

    // T8: 守卫——retired/wishlist/实物/订阅 走快速退役 no-op
    {
        const retired = Object.assign(asset(createStableId(), 'virtualPerpetual', '已退役'), { status: 'retired', statusChangedOn: '2026-07-05' });
        const h = createHarness([retired]);
        h.plugin._quickRetireFromMenu(retired.id);
        assert.ok(!h.document.body.querySelector('.am-plugin-confirm-mask'), 'retired asset quick retire is a no-op');

        const wish = wishlistAsset(createStableId(), 'virtualSubscription', '种草');
        const h2 = createHarness([wish]);
        h2.plugin._quickRetireFromMenu(wish.id);
        assert.ok(!h2.document.body.querySelector('.am-plugin-confirm-mask'), 'wishlist asset quick retire is a no-op');

        const physical = asset(createStableId(), 'physical', '实物');
        const h3 = createHarness([physical]);
        h3.plugin._quickRetireFromMenu(physical.id);
        assert.ok(!h3.document.body.querySelector('.am-plugin-confirm-mask'), 'physical quick retire is a no-op (edit-form retire only)');

        const sub = asset(createStableId(), 'virtualSubscription', '订阅');
        const h4 = createHarness([sub]);
        h4.plugin._quickRetireFromMenu(sub.id);
        assert.ok(!h4.document.body.querySelector('.am-plugin-confirm-mask'), 'subscription quick retire is a no-op');
    }

    // T9: 买断/预付编辑表单「物品状态」pill（通用样式，退役日期仅退役态显示）
    {
        const { wireForms, setValue } = require('./formal-workflow-harness.js');

        // a) active 买断：pill 在役态、无退役日期输入
        const active = asset(createStableId(), 'virtualPerpetual', '在役买断');
        const h1 = createHarness([active]);
        const mask1 = h1.plugin.openFormalAssetSheet('virtualPerpetual', { asset: active });
        wireForms(mask1);
        const pills1 = mask1.querySelectorAll('[data-status-pill]');
        assert.ok(pills1.length === 2, 'perpetual edit form shows status pills');
        assert.ok(pills1[0].getAttribute('aria-pressed') === 'true', 'active pill pressed for active perpetual');
        assert.ok(!mask1.querySelector('[name="retiredDate"]'), 'active perpetual hides retired date input');

        // b) pill 切退役 → 退役日期出现（默认今天）→ 保存走域事务
        pills1[1].onclick();
        const rd1 = mask1.querySelector('[name="retiredDate"]');
        assert.ok(!!rd1, 'switching to retired reveals retired date input');
        setValue(mask1, 'retiredDate', '2026-08-01');
        const form1 = mask1.querySelector('form');
        await form1.onsubmit({ preventDefault() {}, currentTarget: form1 });
        const after1 = h1.plugin.assets.find(x => x.id === active.id);
        assert.ok(after1.status === 'retired', 'form pill retire sets status retired');
        assert.ok(after1.statusChangedOn === '2026-08-01', 'form pill retire honors picked date');
        const lifecycle1 = (h1.state['lifecycleEvents.json'].events || []);
        assert.ok(lifecycle1.some(e => e.kind === 'retired' && e.assetId === active.id), 'form pill retire records lifecycle');

        // c) retired 买断：打开表单即显示退役日期（statusChangedOn 回填）
        const retired = Object.assign(asset(createStableId(), 'virtualPerpetual', '已退役买断'), { status: 'retired', statusChangedOn: '2026-07-05' });
        const h2 = createHarness([retired]);
        const mask2 = h2.plugin.openFormalAssetSheet('virtualPerpetual', { asset: retired });
        wireForms(mask2);
        const rd2 = mask2.querySelector('[name="retiredDate"]');
        assert.ok(!!rd2 && rd2.value === '2026-07-05', 'retired perpetual form shows statusChangedOn as retired date');

        // d) retired → 切回在役 → 保存写 restored lifecycle
        const pills2 = mask2.querySelectorAll('[data-status-pill]');
        pills2[0].onclick();
        assert.ok(!mask2.querySelector('[name="retiredDate"]'), 'reactivate in form hides retired date input');
        const form2 = mask2.querySelector('form');
        await form2.onsubmit({ preventDefault() {}, currentTarget: form2 });
        const after2 = h2.plugin.assets.find(x => x.id === retired.id);
        assert.ok(after2.status === 'active', 'form pill reactivate sets status active');
        const lifecycle2 = (h2.state['lifecycleEvents.json'].events || []);
        assert.ok(lifecycle2.some(e => e.kind === 'restored' && e.assetId === retired.id), 'form pill reactivate records restored lifecycle');

        // e) 预付（次数）同样有 pill；新建买断与订阅编辑无此 pill
        const prepaidCount = asset(createStableId(), 'prepaidCount', '次卡');
        const h3 = createHarness([prepaidCount]);
        const mask3 = h3.plugin.openFormalAssetSheet('prepaidCount', { asset: prepaidCount });
        wireForms(mask3);
        assert.ok(mask3.querySelectorAll('[data-status-pill]').length === 2, 'prepaidCount edit form shows status pills');

        const h4 = createHarness([]);
        const mask4 = h4.plugin.openFormalAssetSheet('virtualPerpetual', {});
        wireForms(mask4);
        assert.ok(!mask4.querySelector('[data-status-row]'), 'new perpetual form has no status pill');

        const sub = asset(createStableId(), 'virtualSubscription', '订阅');
        const h5 = createHarness([sub]);
        const mask5 = h5.plugin.openFormalAssetSheet('virtualSubscription', { asset: sub });
        wireForms(mask5);
        assert.ok(!mask5.querySelector('[data-status-row]'), 'subscription edit form has no generic status pill');
    }

    // T11: 预付快捷记账（消费）为插件内 sheet——不再是思源原生 Dialog（浮在插件外）
    {
        const a = asset(createStableId(), 'prepaidAmount', '储值卡快捷');
        const h = createHarness([a]);
        const before = h.dialogStats.created;
        const mask = h.plugin.openPrepaidQuickActionSheet(a.id, 'charge', h.document.body);
        wireForms(mask);
        assert.ok(!!mask.classList && mask.classList.contains('am-edit-sheet-mask'), 'quick action returns plugin sheet mask');
        assert.ok(mask.classList.contains('am-workflow-sheet-mask'), 'quick sheet floats above detail card (workflow mask)');
        assert.ok(!!mask.querySelector('form[data-prepaid-quick-form]'), 'quick sheet contains quick form');
        assert.ok(!!mask.querySelector('[name="amount"]'), 'charge sheet has amount field');
        assert.ok(!!mask.querySelector('[name="effectiveDate"]'), 'charge sheet has date field');
        assert.ok(!mask.querySelector('.b3-dialog'), 'no native dialog chrome');
        assert.ok(h.dialogStats.created === before, 'quick action does not create native Dialog');
        // 提交：域方法与成功后 toast 保持不变（充值无余额前置校验）
        const amountInput = mask.querySelector('[name="amount"]');
        amountInput.value = '30';
        const form = mask.querySelector('form[data-prepaid-quick-form]');
        await form.onsubmit({ preventDefault() {} });
        await flushDialog();
        const txs = (h.state['prepaidTransactions.json'].records || []).filter(r => r.assetId === a.id);
        assert.ok(txs.length === 1 && txs[0].type === 'inflow', 'charge writes inflow transaction');
        assert.ok(h.plugin.toasts.some(t => t.includes('已充值')), 'charge success toast');
    }

    console.log('quick-retire-menu.test.js: all assertions passed');
    process.exit(0);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
