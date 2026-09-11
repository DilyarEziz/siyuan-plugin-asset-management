'use strict';

/**
 * v2.6.6 回归测试（五项实测反馈优化）：
 *   1. 品牌 / 渠道删除放开——有引用时级联置空引用 + 审计日志，无引用直接删；
 *      设置页品牌 / 渠道删除按钮不再因引用禁用（标签保持禁用）。
 *   2. 设置弹窗高度固定——shell 根节点带内联 height。
 *   3. 种草历程门卫——仅种草中或存在种草转购买事件的商品渲染；直接新建不渲染。
 *   4. 首页退役分组——退役（含过期订阅）排在「已退役」分割线之后；纯退役无分割线；
 *      过期订阅卡片带「已过期」徽章。
 *   5. 「过期 = 退役」口径——首页状态筛选 / computeStats / 报表概览计数一致：
 *      在役排除过期订阅、已退役包含过期订阅；待确认续订（开自动续费）仍算在役。
 */

const assert = require('node:assert/strict');
const { asset, createHarness, flushDialog } = require('./formal-workflow-harness');
const { newFormalV2Asset, normalizeSubscriptionPeriodRecord, normalizeFinancialRecord } = require('../api/assets');

function dateKeyOffset(days) {
    const date = new Date(Date.now() + days * 86400000);
    return date.toISOString().slice(0, 10);
}

const P_ID = 'a1000000-0000-4000-8000-000000000001';
const R_ID = 'a1000000-0000-4000-8000-000000000002';
const SUB_EXPIRED_ID = 'a1000000-0000-4000-8000-000000000003';
const SUB_ACTIVE_ID = 'a1000000-0000-4000-8000-000000000004';
const BRAND_ID = 'b0000000-0000-4000-8000-000000000001';

function subscriptionAsset(id, autoRenew, acquiredOn) {
    return newFormalV2Asset({
        id, kind: 'virtualSubscription', name: 'Sub ' + id.slice(-4), status: 'active', currency: 'CNY',
        acquiredOn, statusChangedOn: acquiredOn, tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: acquiredOn + 'T00:00:00.000Z', updatedAt: acquiredOn + 'T00:00:00.000Z',
        details: { planName: 'Pro', accountLabel: null, billingPlan: { cycle: 'monthly' }, autoRenew },
    });
}

/** 过期订阅 + 已结束当期周期（endDate = 今天前 10 天）+ 配套 subscriptionPayment 事件。 */
function buildExpiredSubscriptionFixture(id) {
    const startDate = dateKeyOffset(-40);
    const endDate = dateKeyOffset(-10);
    const event = normalizeFinancialRecord({
        id: 'd0000000-0000-4000-8000-000000000001', assetId: id, occurredAt: startDate + 'T00:00:00.000Z',
        effectiveDate: startDate, createdAt: startDate + 'T00:00:00.000Z', source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'subscriptionPayment', currency: 'CNY', amountMinor: 3000,
    });
    const period = normalizeSubscriptionPeriodRecord({
        id: 'c0000000-0000-4000-8000-000000000001', assetId: id, occurredAt: startDate + 'T00:00:00.000Z',
        effectiveDate: startDate, createdAt: startDate + 'T00:00:00.000Z', source: 'user',
        correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null,
        kind: 'billing', startDate, endDate, paymentEventId: event.id,
    });
    return { asset: subscriptionAsset(id, false, startDate), period, event };
}

function retiredPhysical(id) {
    return newFormalV2Asset({
        id, kind: 'physical', name: 'Old ' + id.slice(-4), status: 'retired', currency: 'CNY',
        acquiredOn: '2023-01-01', statusChangedOn: '2024-06-01', tagIds: [], cover: { kind: 'none' }, notes: '',
        createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z',
        details: { warrantyEndsOn: null, costGoal: null },
    });
}

/** 把过期订阅的周期 + 付款事件注入插件内存域（home 筛选 / 统计 / 报表共用）。 */
function injectExpiredSubscription(plugin, fixture) {
    plugin._subscriptionPeriods = [fixture.period];
    plugin._financialEvents = [fixture.event];
    plugin._formalDomainStateSnapshot.subscriptionPeriods = [fixture.period];
    plugin._formalDomainStateSnapshot.financialEvents = [fixture.event];
}

(async () => {
    // ---------- 1. 品牌 / 渠道级联删除 ----------
    {
        const { plugin } = createHarness([asset(P_ID, 'physical', 'Camera')]);
        const brand = await plugin.createBrand({ label: 'Canon' });
        await plugin.updateAsset(P_ID, { brandId: brand.id });
        assert.equal(plugin._getDimensionReferenceCount('brands', brand.id), 1);

        const result = await plugin.deleteBrand(brand.id);
        assert.deepEqual(result, { deleted: true, clearedRefs: 1 }, 'brand delete returns cascade summary');
        assert.equal(plugin._getDimensionDirectory('brands').length, 0, 'brand removed from directory');
        const updated = plugin.assets.find(item => item.id === P_ID);
        assert.equal(updated.brandId, null, 'asset brand reference cleared');
        const deleteLogs = plugin._opLogs.filter(log => log.type === 'brand-delete');
        const refLogs = plugin._opLogs.filter(log => log.type === 'update' && log.field === 'brandId' && log.assetId === P_ID);
        assert.equal(deleteLogs.length, 1, 'exactly one brand-delete audit log');
        assert.equal(refLogs.length, 1, 'exactly one reference-clear audit log');
        // 落盘断言：事务后 storage 快照内资产外键为 null
        const diskAssets = await new Promise(resolve => {
            plugin.storage.readFormalV2AssetDomainSnapshot
                ? plugin.storage.readFormalV2AssetDomainSnapshot().then(snapshot => resolve(snapshot.assets))
                : resolve([]);
        });
        assert.equal((diskAssets.find(item => item.id === P_ID) || {}).brandId, null, 'cleared reference persisted');
    }
    {
        const { plugin } = createHarness([asset(P_ID, 'physical', 'Camera')]);
        const channel = await plugin.createChannel({ label: 'Official Store' });
        const result = await plugin.deleteChannel(channel.id);
        assert.deepEqual(result, { deleted: true, clearedRefs: 0 }, 'unreferenced channel deletes cleanly');
        assert.equal(plugin._getDimensionDirectory('channels').length, 0);
        // UI：品牌 / 渠道删除按钮不因引用禁用；标签被引用仍禁用
        const tag = await plugin.createTag({ label: 'Keep' });
        await plugin.updateAsset(P_ID, { tagIds: [tag.id] });
        const brandsHtml = plugin.renderSettingsTags();
        assert.doesNotMatch(brandsHtml, /disabled[^>]*data-settings-entry-delete|data-settings-entry-delete[^>]*disabled/, 'brand/channel delete button never disabled by refs');
        plugin._settingsCatalogTab = 'tags';
        const tagsHtml = plugin.renderSettingsTags();
        assert.match(tagsHtml, /data-settings-tag-delete[^>]* disabled|disabled[^>]*data-settings-tag-delete/, 'tag delete stays disabled when referenced');
    }

    // ---------- 2. 设置弹窗高度固定 ----------
    {
        const h = createHarness([asset(P_ID, 'physical', 'Camera')]);
        h.plugin.openSettingsDialog();
        await flushDialog();
        const shell = h.connectedDialogs()[0].element.querySelector('.am-settings-dialog');
        assert.ok(shell, 'settings shell rendered');
        assert.match(String(shell.getAttribute('style') || ''), /height:\s*\d+px/, 'settings dialog height is fixed inline');
    }

    // ---------- 3. 种草历程门卫 ----------
    {
        const { plugin } = createHarness([asset(P_ID, 'physical', 'Camera')]);
        plugin.wishlistEvents = [];
        // 直接新建（无种草事件）→ 不渲染
        const fresh = { id: 'e0000000-0000-4000-8000-000000000001', status: 'active', createdAt: '2024-03-01T00:00:00.000Z' };
        assert.equal(plugin._renderWishlistJourneySectionHtml(fresh), '', 'directly created asset renders no journey');
        // 种草中 → 渲染
        const wish = { id: 'e0000000-0000-4000-8000-000000000002', status: 'wishlist', createdAt: '2024-03-01T00:00:00.000Z' };
        assert.match(plugin._renderWishlistJourneySectionHtml(wish), /种草历程/, 'wishlist asset renders journey');
        // 有购买转化事件 → 渲染
        const converted = { id: 'e0000000-0000-4000-8000-000000000003', status: 'active', createdAt: '2024-03-01T00:00:00.000Z' };
        plugin.wishlistEvents = [{
            id: 'f0000000-0000-4000-8000-000000000001', eventType: 'purchased', sourceWishlistId: 'e0000000-0000-4000-8000-000000000009',
            targetAssetId: converted.id, occurredAt: '2024-04-01T00:00:00.000Z',
            sourceSnapshot: { createdAt: '2024-03-01T00:00:00.000Z' },
        }];
        assert.match(plugin._renderWishlistJourneySectionHtml(converted), /种草历程/, 'converted asset renders journey');
    }

    // ---------- 4 + 5. 首页分组 / 分割线 / 过期即退役口径 ----------
    {
        const fixture = buildExpiredSubscriptionFixture(SUB_EXPIRED_ID);
        const assets = [
            asset(P_ID, 'physical', 'Camera'),
            retiredPhysical(R_ID),
            fixture.asset,
            subscriptionAsset(SUB_ACTIVE_ID, true, dateKeyOffset(-20)),
        ];
        const { plugin } = createHarness(assets);
        injectExpiredSubscription(plugin, fixture);
        plugin.filter.status = 'all';

        // 首页集合：在役排除过期订阅，已退役包含过期订阅
        const all = plugin.getHomeFilteredAssets();
        assert.ok(all.some(item => item.id === SUB_EXPIRED_ID), 'expired subscription still listed with status=all');
        plugin.filter.status = 'active';
        assert.equal(plugin.getHomeFilteredAssets().some(item => item.id === SUB_EXPIRED_ID), false, 'active filter excludes expired subscription');
        assert.ok(plugin.getHomeFilteredAssets().some(item => item.id === SUB_ACTIVE_ID), 'pending-renewal subscription stays active');
        plugin.filter.status = 'retired';
        const retiredView = plugin.getHomeFilteredAssets();
        assert.ok(retiredView.some(item => item.id === SUB_EXPIRED_ID), 'retired filter includes expired subscription');
        assert.ok(retiredView.some(item => item.id === R_ID), 'retired filter includes retired physical');

        // 分组渲染：active 卡 → 分割线 → retired 卡 + 过期订阅卡（在最后）
        plugin.filter.status = 'all';
        plugin.settings.viewMode = 'list';
        const html = plugin.renderFormalAssetCollection(plugin.getHomeFilteredAssets());
        const dividerAt = html.indexOf('am-retired-divider');
        assert.ok(dividerAt > 0, 'retired divider rendered once group split exists');
        assert.equal(html.split('class="am-retired-divider"').length - 1, 1, 'single divider');
        const cameraAt = html.indexOf('data-product-id="' + P_ID) >= 0 ? html.indexOf(P_ID) : html.indexOf('Camera');
        const oldAt = html.indexOf(R_ID);
        const expiredSubAt = html.indexOf(SUB_EXPIRED_ID);
        const activeSubAt = html.indexOf(SUB_ACTIVE_ID);
        assert.ok(cameraAt >= 0 && activeSubAt >= 0, 'active cards rendered');
        assert.ok(cameraAt < dividerAt && activeSubAt < dividerAt, 'non-retired cards before divider');
        assert.ok(oldAt > dividerAt && expiredSubAt > dividerAt, 'retired + expired subscription after divider');
        assert.match(html, /已过期/, 'expired subscription card carries expired badge');

        // 纯退役列表 → 无分割线
        const onlyRetired = plugin.renderFormalAssetCollection([retiredPhysical(R_ID)]);
        assert.equal(onlyRetired.includes('am-retired-divider'), false, 'no divider when everything is retired');

        // computeStats 口径
        const stats = plugin.computeStats(plugin.assets.filter(item => item.status !== 'wishlist'));
        assert.equal(stats.activeCount, 2, 'active count excludes expired subscription');
        assert.equal(stats.retiredCount, 2, 'retired count includes expired subscription');

        // 报表概览口径
        const report = plugin._buildFullFormalReport(plugin._formalDomainSnapshot());
        assert.equal(report.counts.byStatus.active, 2, 'report active count excludes expired subscription');
        assert.equal(report.counts.byStatus.retired, 2, 'report retired count includes expired subscription');

        // 矩阵视图同样分组（分割线在 grid 内）
        plugin.settings.viewMode = 'matrix';
        plugin.filter.status = 'all';
        const matrixHtml = plugin.renderFormalAssetCollection(plugin.getHomeFilteredAssets());
        assert.ok(matrixHtml.includes('am-asset-grid') && matrixHtml.includes('am-retired-divider'), 'matrix view groups too');
    }

    console.log('[v2606-regression] passed');
})().catch(error => { console.error(error); process.exit(1); });
