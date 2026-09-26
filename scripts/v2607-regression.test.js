'use strict';

/**
 * v2.6.7 回归测试（过保文案收口 + 过保不改圆点 + 提醒措辞区分 + 详情卡可选中）：
 *   1. 过保实物：列表卡徽章「已过保」（不再是「已过期」），圆点保持彩色（am-dot--active）——
 *      灰色只表达退役（含过期订阅视同退役），过保不算退役。
 *   2. 保修临期实物：徽章「N 天后过保」（badgeWarrantyDaysLeft），圆点彩色。
 *   3. 过期订阅：徽章仍「已过期」，圆点灰色（am-dot--expired）——回归确认不被实物改动影响。
 *   4. 详情卡保修块（_warrantyTier）：过期→已过保 / 当天→今日过保 / 1-7 天→即将过保 / 8 天以上→剩 N 天。
 *   5. 报表「即将到期」行：实物→「即将过保」（不裸显日期），订阅→保持日期文本。
 *   6. 详情卡文字可选中：index.css 对 .am-product-card 显式恢复 user-select（思源 .dock 全局 none）。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./formal-workflow-harness');
const { newFormalV2Asset, normalizeSubscriptionPeriodRecord, normalizeFinancialRecord } = require('../api/assets');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src.template.js'), 'utf8');

function dateKeyOffset(days) {
    const date = new Date(Date.now() + days * 86400000);
    return date.toISOString().slice(0, 10);
}

const PHY_EXPIRED_ID = 'a2000000-0000-4000-8000-000000000001';
const PHY_SOON_ID = 'a2000000-0000-4000-8000-000000000002';
const SUB_EXPIRED_ID = 'a2000000-0000-4000-8000-000000000003';
const SUB_ACTIVE_ID = 'a2000000-0000-4000-8000-000000000004';

function physicalAsset(id, warrantyOffsetDays) {
    return newFormalV2Asset({
        id, kind: 'physical', name: 'Phys ' + id.slice(-4), status: 'active', currency: 'CNY',
        acquiredOn: '2024-01-01', statusChangedOn: '2024-01-01', tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
        details: { warrantyEndsOn: dateKeyOffset(warrantyOffsetDays), costGoal: null },
    });
}

function subscriptionAsset(id, autoRenew, acquiredOn) {
    return newFormalV2Asset({
        id, kind: 'virtualSubscription', name: 'Sub ' + id.slice(-4), status: 'active', currency: 'CNY',
        acquiredOn, statusChangedOn: acquiredOn, tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: acquiredOn + 'T00:00:00.000Z', updatedAt: acquiredOn + 'T00:00:00.000Z',
        details: { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew },
    });
}

/** 已结束当期周期（endDate = daysAgo 前结束）+ 配套 subscriptionPayment 事件，使投影 state=expired。 */
function buildExpiredSubscriptionFixture(id, endDaysAgo) {
    const startDate = dateKeyOffset(-endDaysAgo - 30);
    const endDate = dateKeyOffset(-endDaysAgo);
    const event = normalizeFinancialRecord({
        id: 'd2000000-0000-4000-8000-000000000001', assetId: id, occurredAt: startDate + 'T00:00:00.000Z',
        effectiveDate: startDate, createdAt: startDate + 'T00:00:00.000Z', source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 3000,
    });
    const period = normalizeSubscriptionPeriodRecord({
        id: 'c2000000-0000-4000-8000-000000000001', assetId: id, occurredAt: startDate + 'T00:00:00.000Z',
        effectiveDate: startDate, createdAt: startDate + 'T00:00:00.000Z', source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        kind: 'billing', startDate, endDate, paymentEventId: event.id,
    });
    return { asset: subscriptionAsset(id, false, startDate), period, event };
}

function injectSubscriptionSidecars(plugin, fixture) {
    plugin._subscriptionPeriods = (plugin._subscriptionPeriods || []).concat([fixture.period]);
    plugin._financialEvents = (plugin._financialEvents || []).concat([fixture.event]);
    plugin._formalDomainStateSnapshot.subscriptionPeriods = (plugin._formalDomainStateSnapshot.subscriptionPeriods || []).concat([fixture.period]);
    plugin._formalDomainStateSnapshot.financialEvents = (plugin._formalDomainStateSnapshot.financialEvents || []).concat([fixture.event]);
}

/** 单卡渲染 HTML 的切片（从本卡 data-asset-card-id 到下一个卡或结尾）。 */
function cardSlice(html, id) {
    const start = html.indexOf('data-asset-card-id="' + id + '"');
    assert.ok(start >= 0, 'card rendered for ' + id);
    const next = html.indexOf('data-asset-card-id="', start + 1);
    return html.slice(start, next < 0 ? html.length : next);
}

(async () => {
    // ---------- 5. CSS：详情卡恢复文字可选中 ----------
    assert.match(css, /\.am-product-card,\s*\n\.am-product-card \* \{[\s\S]*?user-select: text/, 'product card restores text selection over SiYuan .dock user-select:none');

    {
        // ---------- 1/2/3：列表卡徽章与圆点 ----------
        const phyExpired = physicalAsset(PHY_EXPIRED_ID, -10);   // 保修已过 10 天
        const phySoon = physicalAsset(PHY_SOON_ID, 3);           // 保修还剩 3 天
        const subExpiredFixture = buildExpiredSubscriptionFixture(SUB_EXPIRED_ID, 10);
        const subActiveFixture = buildExpiredSubscriptionFixture(SUB_ACTIVE_ID, -5); // endDate 在未来 5 天 → 在役
        const { plugin } = createHarness([
            phyExpired, phySoon, subExpiredFixture.asset, subActiveFixture.asset,
        ]);
        injectSubscriptionSidecars(plugin, subExpiredFixture);
        injectSubscriptionSidecars(plugin, subActiveFixture);

        // 过保实物：徽章已过保 + 彩点
        const expiredHtml = cardSlice(plugin.renderFormalAssetListCard(phyExpired), PHY_EXPIRED_ID);
        assert.match(expiredHtml, /am-card-badge--expired[^>]*>已过保</, 'expired warranty badge shows 已过保');
        assert.ok(!expiredHtml.includes('已过期'), 'expired warranty card must not show 已过期');
        assert.match(expiredHtml, /am-dot--active/, 'out-of-warranty physical keeps colored dot');
        assert.ok(!expiredHtml.includes('am-dot--expired'), 'out-of-warranty physical must not gray the dot');

        // 保修临期实物：N 天后过保 + 彩点
        const soonHtml = cardSlice(plugin.renderFormalAssetListCard(phySoon), PHY_SOON_ID);
        assert.match(soonHtml, /天后过保/, 'soon-expiry warranty badge uses warranty wording');
        assert.ok(!soonHtml.includes('天后到期'), 'warranty badge must not use subscription wording');
        assert.match(soonHtml, /am-dot--active/, 'soon-expiry physical keeps colored dot');

        // 过期订阅：仍已过期 + 灰点
        const subHtml = cardSlice(plugin.renderFormalAssetListCard(subExpiredFixture.asset), SUB_EXPIRED_ID);
        assert.match(subHtml, /am-card-badge--expired[^>]*>已过期</, 'expired subscription keeps 已过期 badge');
        assert.match(subHtml, /am-dot--expired/, 'expired subscription keeps gray dot');

        // 在役订阅（5 天后到期）：「天后到期」+ 彩点
        const subActiveHtml = cardSlice(plugin.renderFormalAssetListCard(subActiveFixture.asset), SUB_ACTIVE_ID);
        assert.match(subActiveHtml, /天后到期/, 'active subscription keeps subscription wording');
        assert.match(subActiveHtml, /am-dot--active/, 'active subscription keeps colored dot');
    }

    {
        // ---------- 4：详情卡保修块措辞 ----------
        const { plugin } = createHarness([]);
        assert.equal(plugin._warrantyTier(dateKeyOffset(-10)).label, '已过保', 'warranty tier expired label');
        assert.equal(plugin._warrantyTier(dateKeyOffset(0)).label, '今日过保', 'warranty tier today label');
        assert.equal(plugin._warrantyTier(dateKeyOffset(3)).label, '即将过保', 'warranty tier urgent label');
        assert.equal(plugin._warrantyTier(dateKeyOffset(20)).label, '剩 20 天', 'warranty tier normal label');
        assert.equal(plugin._warrantyTier(null), null, 'no warranty date returns null');
    }

    {
        // ---------- 5：报表「即将到期」行措辞 ----------
        const phySoon = physicalAsset(PHY_SOON_ID, 3);
        const subActiveFixture = buildExpiredSubscriptionFixture(SUB_ACTIVE_ID, -5);
        const { plugin } = createHarness([phySoon, subActiveFixture.asset]);
        injectSubscriptionSidecars(plugin, subActiveFixture);
        const html = plugin.renderReportPage();
        const section = html.slice(html.indexOf('am-dashboard-expiring'));
        assert.ok(section.length > 0, 'expiring section rendered');
        // 实物行：固定「即将过保」，不再裸显保修日期
        assert.match(section, new RegExp('data-id="' + PHY_SOON_ID + '"[\\s\\S]{0,160}?<strong>即将过保</strong>'), 'warranty row shows 即将过保');
        assert.ok(!section.includes('即将到期</strong>'), 'warranty row never shows the raw warranty date as label');
        // 订阅行：保持日期文本
        assert.match(section, new RegExp('data-id="' + SUB_ACTIVE_ID + '"[\\s\\S]{0,160}?<strong>' + dateKeyOffset(5)), 'subscription row keeps date text');
        assert.ok(!section.includes('天内过保'), 'report rows no longer use the old 天内过保 wording');
    }

    // ---------- 静态口径检查：实物不参与灰点判定 / 提醒行分支 ----------
    assert.match(source, /dotState === 'active' && asset\.kind !== FORMAL_ASSET_KIND\.PHYSICAL/, 'dot expiry check excludes physical (warranty never grays the dot)');
    assert.match(source, /warrantyExpiredBadge[\s\S]{0,120}已过保/, 'badge expired branch keeps warranty label');

    console.log('[v2607-regression] passed');
})().catch(error => { console.error('[v2607-regression] failed:', error); process.exit(1); });
