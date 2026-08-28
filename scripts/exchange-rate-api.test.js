'use strict';

const assert = require('node:assert/strict');
const fx = require('../api/exchange-rate-api');

const {
    EXCHANGE_RATE_API_URL,
    EXCHANGE_RATE_TARGET_CURRENCIES,
    EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS,
    parseExchangeRateApiResponse,
    isExchangeRateStale,
    normalizeExchangeRateSource,
} = fx;

// ---------- 常量 ----------
assert.equal(EXCHANGE_RATE_API_URL, 'https://open.er-api.com/v6/latest/CNY', 'API URL');
assert.deepEqual([...EXCHANGE_RATE_TARGET_CURRENCIES], ['USD', 'EUR', 'GBP'], 'target currencies');
assert.equal(Object.isFrozen(EXCHANGE_RATE_TARGET_CURRENCIES), true, 'target currencies frozen');
assert.equal(EXCHANGE_RATE_AUTO_REFRESH_MAX_AGE_MS, 24 * 3600 * 1000, 'max age = 24h');

// 实测样例结构（2026-08-28 抓取，rates 语义 = 1 CNY 兑换 X 单位外币）。
function sampleResponse(overrides) {
    return Object.assign({
        result: 'success',
        base_code: 'CNY',
        time_last_update_unix: 1787875351,
        time_last_update_utc: 'Fri, 28 Aug 2026 00:02:31 +0000',
        rates: {
            USD: 0.148432,
            EUR: 0.127502,
            GBP: 0.109311,
            JPY: 21.855,
            AUD: 0.2165,
        },
    }, overrides);
}

// ---------- S1: 成功解析 ----------
{
    const input = sampleResponse();
    const parsed = parseExchangeRateApiResponse(input);
    // 三个汇率值精确断言（直存语义，无换算）
    assert.equal(parsed.rates.USD, 0.148432, 'S1: USD rate exact');
    assert.equal(parsed.rates.EUR, 0.127502, 'S1: EUR rate exact');
    assert.equal(parsed.rates.GBP, 0.109311, 'S1: GBP rate exact');
    // 只取三个目标币种（JPY/AUD 被丢弃）
    assert.deepEqual(Object.keys(parsed.rates).sort(), ['EUR', 'GBP', 'USD'], 'S1: only target currencies kept');
    // providerUpdatedAt = time_last_update_unix 转 ISO 串
    assert.equal(parsed.providerUpdatedAt, '2026-08-28T00:02:31.000Z', 'S1: providerUpdatedAt ISO');
    assert.equal(parsed.providerUpdatedAt, new Date(1787875351 * 1000).toISOString(), 'S1: providerUpdatedAt matches unix');
    // 返回值冻结
    assert.equal(Object.isFrozen(parsed), true, 'S1: result frozen');
    // rates 内层冻结
    assert.equal(Object.isFrozen(parsed.rates), true, 'S1: rates frozen');
    // rates 深拷贝：与输入不共享引用
    assert.notEqual(parsed.rates, input.rates, 'S1: rates deep-copied');
}

// ---------- S2: result 非 success → throw（消息含 result 值） ----------
{
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ result: 'error' })),
        /result is not success: error/,
        'S2: result error throws with value in message'
    );
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ result: undefined })),
        /result is not success/,
        'S2: missing result throws'
    );
}

// ---------- S3: base_code 非 CNY → throw ----------
{
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ base_code: 'USD' })),
        /base_code is not CNY: USD/,
        'S3: wrong base_code throws with value in message'
    );
}

// ---------- S4: rates 缺 EUR → throw（消息含币种） ----------
{
    const partial = sampleResponse();
    delete partial.rates.EUR;
    assert.throws(() => parseExchangeRateApiResponse(partial), /EUR/, 'S4: missing EUR throws with currency in message');
}

// ---------- S5: GBP <= 0 → throw ----------
{
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: { USD: 0.148432, EUR: 0.127502, GBP: 0 } })),
        /GBP/,
        'S5: GBP=0 throws'
    );
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: { USD: 0.148432, EUR: 0.127502, GBP: -0.5 } })),
        /GBP/,
        'S5: GBP negative throws'
    );
}

// ---------- S6: USD 非数字 → throw ----------
{
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: { USD: '0.148432', EUR: 0.127502, GBP: 0.109311 } })),
        /USD/,
        'S6: USD string throws'
    );
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: { USD: NaN, EUR: 0.127502, GBP: 0.109311 } })),
        /USD/,
        'S6: USD NaN throws'
    );
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: { USD: Infinity, EUR: 0.127502, GBP: 0.109311 } })),
        /USD/,
        'S6: USD Infinity throws'
    );
}

// ---------- S7: time_last_update_unix 缺失 → providerUpdatedAt null，整体成功 ----------
{
    const parsed = parseExchangeRateApiResponse(sampleResponse({ time_last_update_unix: undefined }));
    assert.equal(parsed.providerUpdatedAt, null, 'S7: missing unix → null');
    assert.equal(parsed.rates.USD, 0.148432, 'S7: parse still succeeds');
}
// time_last_update_unix 非法（非安全整数）→ 同样 null
{
    const parsed = parseExchangeRateApiResponse(sampleResponse({ time_last_update_unix: '1787875351' }));
    assert.equal(parsed.providerUpdatedAt, null, 'S7b: unix string → null');
}

// ---------- S8: 非对象输入 → throw 'not an object' ----------
{
    [null, undefined, [], 'text', 42].forEach(input => {
        assert.throws(
            () => parseExchangeRateApiResponse(input),
            /response is not an object/,
            'S8: non-object input throws: ' + String(input)
        );
    });
}
// rates 非对象 → throw
{
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: null })),
        /rates is not an object/,
        'S8b: rates null throws'
    );
    assert.throws(
        () => parseExchangeRateApiResponse(sampleResponse({ rates: [1, 2] })),
        /rates is not an object/,
        'S8c: rates array throws'
    );
}

// ---------- T1: isExchangeRateStale ----------
{
    const now = Date.parse('2026-08-28T12:00:00.000Z');
    const h = 3600 * 1000;
    // 无 updatedAt（null / undefined / ''）→ true
    assert.equal(isExchangeRateStale(null, now), true, 'T1: null → stale');
    assert.equal(isExchangeRateStale(undefined, now), true, 'T1: undefined → stale');
    assert.equal(isExchangeRateStale('', now), true, 'T1: empty string → stale');
    // 23 小时前 → false
    assert.equal(isExchangeRateStale(new Date(now - 23 * h).toISOString(), now), false, 'T1: 23h ago → fresh');
    // 25 小时前 → true
    assert.equal(isExchangeRateStale(new Date(now - 25 * h).toISOString(), now), true, 'T1: 25h ago → stale');
    // 非法串 → true
    assert.equal(isExchangeRateStale('not-a-date', now), true, 'T1: invalid string → stale');
    assert.equal(isExchangeRateStale(12345, now), true, 'T1: non-string → stale');
    // 边界：恰好 24h → false（> 才过期）
    assert.equal(isExchangeRateStale(new Date(now - 24 * h).toISOString(), now), false, 'T1: exactly 24h → fresh');
    // 24h + 1ms → true
    assert.equal(isExchangeRateStale(new Date(now - 24 * h - 1).toISOString(), now), true, 'T1: 24h+1ms → stale');
}

// ---------- N1: normalizeExchangeRateSource ----------
{
    assert.equal(normalizeExchangeRateSource('auto'), 'auto', 'N1: auto passthrough');
    assert.equal(normalizeExchangeRateSource('manual'), 'manual', 'N1: manual passthrough');
    assert.equal(normalizeExchangeRateSource(''), null, 'N1: empty → null');
    assert.equal(normalizeExchangeRateSource('x'), null, 'N1: unknown string → null');
    assert.equal(normalizeExchangeRateSource('AUTO'), null, 'N1: case-sensitive → null');
    assert.equal(normalizeExchangeRateSource(null), null, 'N1: null → null');
    assert.equal(normalizeExchangeRateSource(undefined), null, 'N1: undefined → null');
    assert.equal(normalizeExchangeRateSource(1), null, 'N1: number → null');
}

console.log('[exchange-rate-api] all parse/stale/source tests passed');
