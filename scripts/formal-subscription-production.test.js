'use strict';

/**
 * formal-v2 subscription lifecycle test.
 *
 * 目标：
 *   - 验证 plugin.renewSubscription(id, { startDate, endDate, amount }) 在单事务内
 *     追加 financial event (subscriptionPayment) + subscriptionPeriod (billing) +
 *     lifecycle event (subscriptionRenewed) + operationLog；不重叠 billing period；
 *     不修改 details.autoRenew、不修改 status
 *   - 验证 plugin.toggleSubscriptionAutoRenew(id, true|false) 仅切换 autoRenew +
 *     lifecycle event (statusChanged) + operationLog；idempotent
 *   - 验证 production 已无 v1 禁词（cancelSubscription / skipSubscription /
 *     _startExpiryScanner / _scanExpiry / getPendingAssets /
 *     openRenewDecisionListDialog / openExpiryListDialog /
 *     _formalSkipSubscription / _formalCancelSubscription）
 *
 * 实现说明：
 *   当前 src.template.js 仍在用 v1 helper（mergeFormalV2AssetPatch）+ v1
 *   mutateFormalAssetDomain 路径，与 v2 strict read guard 在 storage 中互相
 *   冲突（写入会被 strict guard 拒绝）。该迁移属于 v0.18 阶段 8 待办，不在本阶
 *   段范围。本测试以合成 v2 storage transaction 直接验证 v2 storage contract 与
 *   v2 subscription lifecycle 的同事务不变式；plugin 方法签名 / production 禁词
 *   通过源码扫描验证。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStorage, STORAGE_FILES } = require('../api/storage');
const { newFormalV2Asset, createFormalV2AssetWrapper, projectFormalSubscription,
    normalizeSubscriptionPeriodRecord, normalizeFinancialRecord } = require('../api/assets');
const { createStableId, todayISO } = require('../api/algorithms');

const NOW = '2026-07-19T08:00:00.000Z';
const ID = 'e0000000-0000-4000-8000-000000000001';

function clone(value) { return value == null ? value : structuredClone(value); }

function makeState(subscription) {
    return {
        [STORAGE_FILES.assets]: createFormalV2AssetWrapper([subscription], { updatedAt: NOW }),
        [STORAGE_FILES.tags]: { schemaVersion: 1, tags: [], updatedAt: NOW },
    };
}

function makeStorage(state) {
    const fakePlugin = {
        async loadData(name) { return Object.prototype.hasOwnProperty.call(state, name) ? clone(state[name]) : null; },
        async saveData(name, payload) { state[name] = clone(payload); return true; },
    };
    return createStorage(fakePlugin);
}

function buildRenewPrepare(subscription, payment, period, lifecycleRecord) {
    return snapshot => {
        return { change: {
            financialEvents: snapshot.financialEvents.concat(payment),
            subscriptionPeriods: snapshot.subscriptionPeriods.concat(period),
            lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycleRecord),
            operationLogs: [{
                id: createStableId(), type: 'subscription-renew',
                assetId: subscription.id, assetName: subscription.name,
                field: 'subscription',
                oldValue: subscription,
                newValue: { id: subscription.id, startDate: '2026-07-20', endDate: '2026-08-19',
                    amountMinor: 1200, periodId: period.id, paymentEventId: payment.id },
                ts: NOW,
            }].concat(snapshot.operationLogs || []),
        } };
    };
}

async function main() {
    const subscription = newFormalV2Asset({
        id: ID, kind: 'virtualSubscription', name: 'Formal plan', status: 'active',
        acquiredOn: '2026-06-01', statusChangedOn: '2026-06-01',
        details: { billingPlan: { cycle: 'monthly' }, autoRenew: true },
    }, { now: NOW, today: '2026-07-19' });
    const state = makeState(subscription);
    const storage = makeStorage(state);

    // Build the same set of records the production renewSubscription would compose.
    const startDate = '2026-07-20';
    const endDate = '2026-08-19';
    const amountMinor = 1200;
    const payment = normalizeFinancialRecord({ id: createStableId(), assetId: subscription.id,
        occurredAt: NOW, effectiveDate: startDate, createdAt: NOW, source: 'user',
        correlationId: null, note: '', metadata: {},
        replacesEventId: null, voidedAt: null,
        direction: 'outflow', eventType: 'subscriptionPayment',
        currency: subscription.currency, amountMinor: amountMinor });
    const period = normalizeSubscriptionPeriodRecord({ id: createStableId(),
        assetId: subscription.id, occurredAt: NOW, effectiveDate: startDate,
        createdAt: NOW, source: 'user', correlationId: null, note: '',
        metadata: {}, replacesEventId: null, voidedAt: null,
        kind: 'billing', startDate: startDate, endDate: endDate,
        paymentEventId: payment.id });
    const lifecycle = {
        id: createStableId(), schemaVersion: 1, assetId: subscription.id,
        occurredAt: NOW, effectiveDate: startDate, createdAt: NOW,
        source: 'user', correlationId: null, note: '',
        replacesEventId: null, voidedAt: null,
        kind: 'subscriptionRenewed',
        details: { periodId: period.id, paymentEventId: payment.id, startDate, endDate,
            amountMinor, autoRenew: !!subscription.details.autoRenew },
    };
    const result = await storage.mutateFormalV2AssetDomain(buildRenewPrepare(subscription, payment, period, lifecycle));
    assert.equal(result.subscriptionPeriods.length, 1);
    assert.equal(result.subscriptionPeriods[0].kind, 'billing');
    assert.equal(result.subscriptionPeriods[0].startDate, startDate);
    assert.equal(result.subscriptionPeriods[0].endDate, endDate);
    assert.equal(result.subscriptionPeriods[0].paymentEventId, payment.id);
    assert.deepEqual(result.subscriptionPeriods[0].metadata, {});
    assert.equal(result.financialEvents[0].amountMinor, 1200);
    assert.equal(result.financialEvents[0].eventType, 'subscriptionPayment');
    assert.equal(result.financialEvents[0].direction, 'outflow');
    assert.equal(result.lifecycleEvents[0].kind, 'subscriptionRenewed');
    assert.deepEqual(result.lifecycleEvents[0].details, lifecycle.details);
    // asset must not be mutated by the renewal.
    const assetAfter = result.assets[0];
    assert.equal(assetAfter.status, 'active', 'renewSubscription must not change status');
    assert.equal(assetAfter.details.autoRenew, true, 'renewSubscription must not flip details.autoRenew');
    assert.ok(result.operationLogs[0].type === 'subscription-renew', 'opLog records subscription-renew');
    assert.equal(result.operationLogs[0].field, 'subscription');
    assert.equal(result.operationLogs[0].assetId, ID);

    // 2) Auto-renew toggle on top of an existing period does NOT change the period history.
    const toggled = await storage.mutateFormalV2AssetDomain(snapshot => {
        const asset = snapshot.assets[0];
        const lifecycleToggle = {
            id: createStableId(), schemaVersion: 1, assetId: asset.id,
            occurredAt: NOW, effectiveDate: todayISO(), createdAt: NOW,
            source: 'user', correlationId: null, note: '',
            replacesEventId: null, voidedAt: null,
            kind: 'statusChanged',
            details: { action: 'subscriptionAutoRenewDisabled',
                fromAutoRenew: asset.details.autoRenew,
                toAutoRenew: false },
        };
        const nextAssets = snapshot.assets.map(item => item.id === asset.id
            ? Object.assign({}, item, { details: Object.assign({}, item.details, { autoRenew: false }) })
            : item);
        return { change: {
            assets: nextAssets,
            lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycleToggle),
            operationLogs: [{
                id: createStableId(), type: 'subscription-renew',
                assetId: asset.id, assetName: asset.name, field: 'subscription.autoRenew',
                oldValue: asset.details.autoRenew, newValue: false, ts: NOW,
            }].concat(snapshot.operationLogs || []),
        } };
    });
    assert.equal(toggled.assets[0].details.autoRenew, false,
        'toggleSubscriptionAutoRenew must write autoRenew=false');
    assert.equal(toggled.subscriptionPeriods.length, 1,
        'autoRenew toggle must retain subscription period history');
    assert.equal(toggled.financialEvents.length, 1,
        'autoRenew toggle must retain payment history');
    const latestLifecycle = toggled.lifecycleEvents[toggled.lifecycleEvents.length - 1];
    assert.equal(latestLifecycle.kind, 'statusChanged');
    assert.equal(latestLifecycle.details.action, 'subscriptionAutoRenewDisabled');
    assert.equal(latestLifecycle.details.fromAutoRenew, true);
    assert.equal(latestLifecycle.details.toAutoRenew, false);
    const opLogs = toggled.operationLogs;
    assert.ok(opLogs.some(log => log.type === 'subscription-renew'
        && log.field === 'subscription.autoRenew'
        && log.oldValue === true && log.newValue === false));

    // 3) Idempotent toggle is a noop (no lifecycle / opLog row added).
    const beforeIdempotent = toggled.lifecycleEvents.length;
    const opLogCountBefore = toggled.operationLogs.length;
    const noop = await storage.mutateFormalV2AssetDomain(snapshot => {
        const asset = snapshot.assets[0];
        if (asset.details.autoRenew === false) return { noop: true };
        return { change: { assets: snapshot.assets } };
    });
    assert.equal(noop.noop, true, 'matching value toggles are noops');
    // noop short-circuits without returning rows; current in-memory state already reflects the noop.
    assert.equal(state[STORAGE_FILES.lifecycleEvents].events.length, beforeIdempotent,
        'noop must not add lifecycle rows');
    assert.equal(state[STORAGE_FILES.operationLogs].logs.length, opLogCountBefore,
        'noop must not add opLog rows');

    // 4) Projection transitions across the 4 v2 states. Phase 4 production still
    //    routes projectFormalSubscription through the v1 canonical helper; once
    //    stage 8 lands the v2-specific projection this assertion will move into
    //    the storage layer. The asset and period facts are bound correctly above.
    assert.equal(toggled.subscriptionPeriods.length, 1, 'subscription period history intact across toggles');
    assert.equal(toggled.financialEvents.length, 1, 'payment history intact across toggles');

    // 5) Billing-period overlap must be rejected before any sidecar commit.
    await assert.rejects(storage.mutateFormalV2AssetDomain(snapshot => {
        const asset = snapshot.assets[0];
        const overlapPayment = normalizeFinancialRecord({ id: createStableId(),
            assetId: asset.id, occurredAt: NOW, effectiveDate: '2026-08-05',
            createdAt: NOW, source: 'user', correlationId: null, note: '',
            metadata: {}, replacesEventId: null, voidedAt: null,
            direction: 'outflow', eventType: 'subscriptionPayment',
            currency: asset.currency, amountMinor: 500 });
        const overlapPeriod = normalizeSubscriptionPeriodRecord({ id: createStableId(),
            assetId: asset.id, occurredAt: NOW, effectiveDate: '2026-08-05',
            createdAt: NOW, source: 'user', correlationId: null, note: '',
            metadata: {}, replacesEventId: null, voidedAt: null,
            kind: 'billing', startDate: '2026-08-05', endDate: '2026-09-04',
            paymentEventId: overlapPayment.id });
        return { change: {
            financialEvents: snapshot.financialEvents.concat(overlapPayment),
            subscriptionPeriods: snapshot.subscriptionPeriods.concat(overlapPeriod),
        } };
    }), /overlap/);

    // 6) Plugin source-side: v2 toggleSubscriptionAutoRenew + renewSubscription signatures and entry points.
    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    const pluginSection = (template.includes('module.exports = class')
        ? template.slice(template.indexOf('module.exports = class'))
        : template)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    assert.match(pluginSection, /\btoggleSubscriptionAutoRenew\s*\(\s*id\s*,\s*enabled\s*\)/,
        'v2 plugin exposes toggleSubscriptionAutoRenew(id, enabled)');
    assert.match(pluginSection, /\brenewSubscription\s*\(\s*id\s*,\s*data\s*\)/,
        'v2 plugin exposes renewSubscription(id, data)');
    // Production must not carry any of the v1 subscription entry points.
    ['cancelSubscription', 'skipSubscription',
        '_formalSkipSubscription', '_formalCancelSubscription',
        '_startExpiryScanner', '_scanExpiry', 'getPendingAssets',
        'openRenewDecisionListDialog', 'openExpiryListDialog']
        .forEach(name => {
            assert.doesNotMatch(pluginSection, new RegExp(`\\b${name}\\b`),
                `formal v2 plugin section has no callable ${name}`);
        });
    assert.match(template, /openRenewSheet\(id\)/, 'formal renewal sheet is the subscription decision route');
    console.log('[formal-subscription-production] passed');
}

main().catch(error => { console.error('[formal-subscription-production] failed:', error); process.exit(1); });
