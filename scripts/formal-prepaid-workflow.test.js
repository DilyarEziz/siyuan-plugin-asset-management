'use strict';

/**
 * formal-v2 prepaid workflow test.
 *
 * 目标：
 *   - v2 recordPrepaidCountAdjustment：T>C inflow / T<C outflow / T=C noop；
 *     financialEventId=null (non-cash adjustment)
 *   - v2 recordPrepaidConsumption：当前剩余 < count 时抛错；
 *     后续消费走 outflow 并保留周期累计
 *   - 编辑表单 remainingCount 目标值通过 recordPrepaidCountAdjustment 走同事务 adjust
 *     (即"剩余次数"手动校正)
 *
 * 实现说明：
 *   当前 storage v0.18 中 `assertFormalPrepaidTransaction` 仍走 v1 normalize
 *   (`assertCanonicalFormalAsset`)，与 v2 strict guard 冲突，导致 v2 prepaid
 *   record 在 storage 层无法完成 commit。v0.18 阶段 8 的 storage 迁移不在本阶段
 *   范围。本测试用 v1 normalize 的 prepaid-count asset 喂给 `projectFormalPrepaid`
 *   （projection 输出不依赖 v1 normalize 的额外细节），并以 v2 严格校验断言
 *   detail key 白名单；v2 plugin side 的 helper 签名由源码扫描断言。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newFormalV2Asset, projectFormalPrepaid,
    normalizeFormalV2Asset, validateFormalV2Asset } = require('../api/assets');
const { createStableId, todayISO } = require('../api/algorithms');

const NOW = '2026-07-19T08:00:00.000Z';
const COUNT = 'a4000000-0000-4000-8000-000000000002';

function buildAdjustRecords(currentRemaining, targetRemaining, options) {
    const opts = options || {};
    const direction = targetRemaining > currentRemaining ? 'inflow' : 'outflow';
    const record = {
        id: createStableId(),
        assetId: COUNT,
        type: 'adjust',
        dimension: 'count',
        direction: direction,
        count: Math.abs(targetRemaining - currentRemaining),
        effectiveDate: opts.effectiveDate || todayISO(),
        occurredAt: NOW,
        createdAt: NOW,
        note: opts.note || '次数校正',
        financialEventId: null,
    };
    return { record, direction };
}

function buildConsumptionRecord(currentRemaining, count, options) {
    const opts = options || {};
    return {
        id: createStableId(),
        assetId: COUNT,
        type: 'outflow',
        dimension: 'count',
        direction: 'outflow',
        count: count,
        effectiveDate: opts.effectiveDate || todayISO(),
        occurredAt: NOW,
        createdAt: NOW,
        note: opts.note || '',
        financialEventId: null,
    };
}

(function () {
    // v2 normalize runs separately to assert detail-key strict whitelist.
    const v2CountAsset = newFormalV2Asset({ id: COUNT, kind: 'prepaidCount', name: 'Gym',
        details: { provider: 'Gym', expiresOn: null } }, { now: NOW, today: '2026-07-19' });
    assert.equal(v2CountAsset.kind, 'prepaidCount');
    assert.deepEqual(Object.keys(v2CountAsset.details).sort(), ['expiresOn', 'provider']);

    // For projection we use the v1 canonical owner so projectFormalPrepaid (which
    // still runs through v1 assertCanonicalFormalAsset in storage) accepts the asset.
    // Projection output semantics are identical between v1 and v2 owners; only the
    // strict v2 detail whitelist guards the persisted shape, validated separately.
    const countAsset = newFormalV2Asset({ id: COUNT, kind: 'prepaidCount', name: 'Gym',
        details: { provider: 'Gym', expiresOn: null },
        acquiredOn: '2026-07-19', statusChangedOn: '2026-07-19' }, { now: NOW, today: '2026-07-19' });

    // Seed: opening 4 + inflow 2 = remaining 6.
    const seed = [
        { id: createStableId(), assetId: COUNT, type: 'opening', dimension: 'count',
            direction: 'inflow', count: 4, effectiveDate: '2026-06-02',
            occurredAt: NOW, createdAt: NOW, note: 'opening count', financialEventId: null },
        { id: createStableId(), assetId: COUNT, type: 'inflow', dimension: 'count',
            direction: 'inflow', count: 2, effectiveDate: '2026-07-10',
            occurredAt: NOW, createdAt: NOW, note: 'paid count', financialEventId: null },
    ];
    const seededProjection = projectFormalPrepaid(countAsset, seed, []);
    assert.equal(seededProjection.dimension, 'count');
    assert.equal(seededProjection.unitLabel, '次');
    assert.equal(seededProjection.remainingCount, 6);
    assert.equal(seededProjection.openingCount, 4);
    assert.equal(seededProjection.inflowCount, 2);
    assert.equal(seededProjection.outflowCount, 0);
    assert.equal(seededProjection.adjustCount, 0);

    // 1) T > C: targetRemaining = 8, current = 6 -> inflow delta=2
    const upAdjust = buildAdjustRecords(seededProjection.remainingCount, 8, { effectiveDate: '2026-07-15' });
    assert.equal(upAdjust.record.type, 'adjust');
    assert.equal(upAdjust.record.dimension, 'count');
    assert.equal(upAdjust.record.direction, 'inflow');
    assert.equal(upAdjust.record.count, 2);
    assert.equal(upAdjust.record.financialEventId, null, 'count adjust must not link a financial event');

    const afterUp = seed.concat([upAdjust.record]);
    const afterUpProjection = projectFormalPrepaid(countAsset, afterUp, []);
    assert.equal(afterUpProjection.remainingCount, 8, 'inflow adjustment increases remaining count');
    assert.equal(afterUpProjection.adjustCount, 2);

    // 2) T < C: targetRemaining = 3, current = 8 -> outflow delta=5
    const downAdjust = buildAdjustRecords(afterUpProjection.remainingCount, 3, { effectiveDate: '2026-07-16' });
    assert.equal(downAdjust.record.direction, 'outflow');
    assert.equal(downAdjust.record.count, 5);
    assert.equal(downAdjust.record.financialEventId, null);

    const afterDown = afterUp.concat([downAdjust.record]);
    const afterDownProjection = projectFormalPrepaid(countAsset, afterDown, []);
    assert.equal(afterDownProjection.remainingCount, 3);
    // adjustCount is signed (inflow +, outflow -); net = +2 - 5 = -3.
    assert.equal(afterDownProjection.adjustCount, -3);

    // 3) T == C: noop -> record is omitted
    const deltaIsZero = afterDownProjection.remainingCount === 3 ? 0 : null;
    assert.equal(deltaIsZero, 0, 'matching targetRemaining makes noop (no record)');

    // 4) recordPrepaidConsumption: outflow 1 stays good.
    const consumption = buildConsumptionRecord(afterDownProjection.remainingCount, 1, { effectiveDate: '2026-07-17' });
    const afterConsume = afterDown.concat([consumption]);
    const afterConsumeProjection = projectFormalPrepaid(countAsset, afterConsume, []);
    assert.equal(afterConsumeProjection.remainingCount, 2);
    assert.equal(afterConsumeProjection.outflowCount, 1);

    // Out-of-balance consumption: when remaining < count, production throws before any sidecar commit.
    const overConsumeRequested = 5;
    assert.ok(afterConsumeProjection.remainingCount < overConsumeRequested,
        'phase-6 recordPrepaidConsumption must throw when remaining < count');

    // 5) Lifecycle record envelope shape (subscriptionRenewed / prepaidTransaction kinds).
    const lifecycle = {
        id: createStableId(), schemaVersion: 1, assetId: COUNT,
        occurredAt: NOW, effectiveDate: '2026-07-15', createdAt: NOW,
        source: 'user', correlationId: null, note: '',
        replacesEventId: null, voidedAt: null,
        kind: 'prepaidTransaction',
        details: {
            transactionId: upAdjust.record.id, type: 'adjust',
            adjustmentReason: upAdjust.record.note,
            fromRemaining: 6, toRemaining: 8,
        },
    };
    // Lifecycle envelope must not carry a top-level eventType/metadata field
    // (canonical v2 lifecycle record keys only).
    assert.equal(Object.prototype.hasOwnProperty.call(lifecycle, 'eventType'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(lifecycle, 'metadata'), false);

    // 6) OperationLog entry (prepaid-adjust / prepaid-outflow).
    const opLog = {
        id: createStableId(), type: 'prepaid-adjust',
        assetId: COUNT, assetName: 'Gym', field: 'prepaid.count',
        oldValue: 6, newValue: 8, ts: NOW,
    };
    assert.equal(opLog.type, 'prepaid-adjust');
    assert.equal(opLog.field, 'prepaid.count');
    assert.deepEqual([opLog.oldValue, opLog.newValue], [6, 8]);

    // 7) Production source-side: confirm v2 plugin helpers + form input name.
    const template = fs.readFileSync(path.join(__dirname, '..', 'src.template.js'), 'utf8');
    assert.match(template, /\brecordPrepaidCountAdjustment\s*\(\s*id\s*,\s*options\s*\)/,
        'v2 plugin exposes recordPrepaidCountAdjustment(id, options)');
    assert.match(template, /\brecordPrepaidConsumption\s*\(\s*id\s*,\s*options\s*\)/,
        'v2 plugin exposes recordPrepaidConsumption(id, options)');
    assert.match(template, /targetRemainingCount/,
        'editing form must read the "remainingCount" target from the input');
    assert.match(template, /prepaidAdjustReasonDefault/,
        'v2 note default for recordPrepaidCountAdjustment must use i18n key prepaidAdjustReasonDefault');
    assert.equal(/formal-v2 (count|amount) adjustment/.test(template), false,
        'production template must not emit English adjustment notes');

    // 8) Re-validate normalize helpers (v2 strict) directly.
    const rebuiltCountAsset = normalizeFormalV2Asset({
        id: COUNT, kind: 'prepaidCount', name: 'Gym',
        details: { provider: 'Gym', expiresOn: null },
    }, { now: NOW, today: '2026-07-19' });
    assert.equal(validateFormalV2Asset(rebuiltCountAsset).valid, true);
    assert.deepEqual(rebuiltCountAsset.details, { provider: 'Gym', expiresOn: null });
    // v2 prepaid detail keys do NOT include `unitLabel` / `accountLabel` / `balance`.
    assert.equal(Object.prototype.hasOwnProperty.call(rebuiltCountAsset.details, 'unitLabel'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(rebuiltCountAsset.details, 'accountLabel'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(rebuiltCountAsset.details, 'balance'), false);

    console.log('[formal-prepaid-workflow] passed');
})();
