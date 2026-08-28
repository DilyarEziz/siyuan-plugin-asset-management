'use strict';

const assert = require('node:assert/strict');
const algos = require('../api/algorithms');

const { convertToCNYMinor, formatCNYApproxHint, formatAmountMinor, DEFAULT_USD_CNY_RATE } = algos;

// ---------- DEFAULT_USD_CNY_RATE ----------
assert.equal(DEFAULT_USD_CNY_RATE, 7.20, 'built-in USD fallback rate');

// ---------- A1: CNY identity ----------
{
    const r = convertToCNYMinor(12345, 'CNY', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.deepEqual(r, { cnyMinor: 12345, cnyPerUnit: 1, isFallback: false }, 'A1: CNY identity');
}
// CNY identity with non-empty rates (CNY should still be identity)
{
    const r = convertToCNYMinor(999, 'CNY', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.14 } });
    assert.deepEqual(r, { cnyMinor: 999, cnyPerUnit: 1, isFallback: false }, 'A1b: CNY identity ignores rates');
}
// baseCurrency !== CNY but currency === baseCurrency → identity
{
    const r = convertToCNYMinor(500, 'USD', { schemaVersion: 1, baseCurrency: 'USD', rates: {} });
    assert.deepEqual(r, { cnyMinor: 500, cnyPerUnit: 1, isFallback: false }, 'A1c: baseCurrency identity');
}

// ---------- A2: USD with user rate ----------
// rates[USD] = 0.1389 means 1 CNY = 0.1389 USD → 1 USD = 1/0.1389 ≈ 7.1994 CNY
{
    const ratesObj = { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 } };
    const r = convertToCNYMinor(10000, 'USD', ratesObj); // $100.00
    assert.equal(r.isFallback, false, 'A2: user rate is not fallback');
    // cnyPerUnit = 1/0.1389 ≈ 7.19942...
    // cnyMinor = round(10000 * 7.19942...) = round(71994.24...) = 71994
    assert.equal(r.cnyMinor, Math.round(10000 / 0.1389), 'A2: USD with user rate');
}

// ---------- A3: USD without user rate → default 7.20 fallback ----------
{
    const r = convertToCNYMinor(10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r.isFallback, true, 'A3: USD fallback flag');
    assert.equal(r.cnyPerUnit, 7.20, 'A3: cnyPerUnit = 7.20');
    assert.equal(r.cnyMinor, 72000, 'A3: $100 → ¥720.00 (72000 minor)');
}
// $100 → ¥720 verification
{
    const r = convertToCNYMinor(10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(formatAmountMinor(r.cnyMinor, 'CNY'), '¥720.00', 'A3: formatted $100 → ¥720.00');
}

// ---------- A4: rounding (half-up away from zero) ----------
// $0.07 = 7 minor units; 7 * 7.20 = 50.4 → round = 50 → ¥0.50
{
    const r = convertToCNYMinor(7, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r.cnyMinor, 50, 'A4: $0.07 → ¥0.50 (50 minor)');
}
// $0.01 = 1 minor; 1 * 7.20 = 7.2 → round = 7 → ¥0.07
{
    const r = convertToCNYMinor(1, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r.cnyMinor, 7, 'A4b: $0.01 → ¥0.07');
}
// Half case: 2.5 → round(2.5) = 3 (away from zero via Math.round on positive)
{
    // Construct a rate that produces exactly x.5: amountMinor=5, cnyPerUnit=0.5 → 2.5
    // rates[USD] = 1/0.5 = 2.0 (1 CNY = 2 USD)
    const r = convertToCNYMinor(5, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 2.0 } });
    assert.equal(r.cnyMinor, 3, 'A4c: 5 * 0.5 = 2.5 → rounds to 3 (away from zero)');
}

// ---------- A5: negative net amount (refunds) ----------
{
    const r = convertToCNYMinor(-10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r.cnyMinor, -72000, 'A5: negative net converts correctly');
    assert.equal(r.isFallback, true, 'A5: still fallback');
}
{
    const r = convertToCNYMinor(-7, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r.cnyMinor, -50, 'A5b: negative rounding away from zero');
}

// ---------- A6: no rate → null (EUR) ----------
{
    const r = convertToCNYMinor(5000, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(r, null, 'A6: EUR without rate → null');
}
{
    const r = convertToCNYMinor(5000, 'GBP', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.14 } });
    assert.equal(r, null, 'A6b: GBP without rate (only USD set) → null');
}

// ---------- A7: isFallback flag ----------
{
    const userRate = convertToCNYMinor(100, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.14 } });
    assert.equal(userRate.isFallback, false, 'A7: user rate → isFallback false');
    const fallback = convertToCNYMinor(100, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(fallback.isFallback, true, 'A7: default rate → isFallback true');
    const identity = convertToCNYMinor(100, 'CNY', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(identity.isFallback, false, 'A7: CNY identity → isFallback false');
}

// ---------- A8: rates[currency] <= 0 or non-finite → treated as no rate ----------
{
    const r1 = convertToCNYMinor(100, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: { EUR: 0 } });
    assert.equal(r1, null, 'A8: rate=0 → null');
    const r2 = convertToCNYMinor(100, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: { EUR: -1.5 } });
    assert.equal(r2, null, 'A8: negative rate → null');
    const r3 = convertToCNYMinor(100, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: { EUR: Infinity } });
    assert.equal(r3, null, 'A8: Infinity rate → null');
    const r4 = convertToCNYMinor(100, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: { EUR: NaN } });
    assert.equal(r4, null, 'A8: NaN rate → null');
    const r5 = convertToCNYMinor(100, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: { EUR: 'bad' } });
    assert.equal(r5, null, 'A8: string rate → null');
}
// USD with invalid user rate → falls through to default fallback
{
    const r = convertToCNYMinor(10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0 } });
    assert.equal(r.isFallback, true, 'A8b: USD with rate=0 → default fallback');
    assert.equal(r.cnyMinor, 72000, 'A8b: USD with rate=0 → uses 7.20');
}

// ---------- A9: invalid inputs ----------
{
    assert.equal(convertToCNYMinor(1.5, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), null, 'A9: non-integer amount');
    assert.equal(convertToCNYMinor(NaN, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), null, 'A9: NaN amount');
    assert.equal(convertToCNYMinor(100, 'INVALID', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), null, 'A9: invalid currency');
    assert.equal(convertToCNYMinor(100, null, { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), null, 'A9: null currency');
}
// null/undefined ratesObj → CNY identity still works, USD uses fallback
{
    const r1 = convertToCNYMinor(100, 'CNY', null);
    assert.deepEqual(r1, { cnyMinor: 100, cnyPerUnit: 1, isFallback: false }, 'A9: null ratesObj CNY identity');
    const r2 = convertToCNYMinor(10000, 'USD', null);
    assert.equal(r2.cnyMinor, 72000, 'A9: null ratesObj USD fallback');
    assert.equal(r2.isFallback, true, 'A9: null ratesObj USD isFallback');
    const r3 = convertToCNYMinor(100, 'EUR', null);
    assert.equal(r3, null, 'A9: null ratesObj EUR → null');
}

// ---------- formatCNYApproxHint ----------
// CNY → ''
{
    assert.equal(formatCNYApproxHint(12345, 'CNY', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), '', 'hint: CNY → empty');
}
// baseCurrency match → ''
{
    assert.equal(formatCNYApproxHint(100, 'USD', { schemaVersion: 1, baseCurrency: 'USD', rates: {} }), '', 'hint: baseCurrency match → empty');
}
// USD with fallback → '≈ ¥...'
{
    const hint = formatCNYApproxHint(10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(hint.startsWith('≈ '), true, 'hint: starts with ≈');
    assert.equal(hint.includes('¥'), true, 'hint: contains ¥');
    assert.equal(hint, '≈ ¥720.00', 'hint: $100 → ≈ ¥720.00');
}
// EUR without rate → ''
{
    assert.equal(formatCNYApproxHint(5000, 'EUR', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), '', 'hint: EUR no rate → empty');
}
// USD with user rate → '≈ ¥...' (not fallback but still shows hint)
{
    const hint = formatCNYApproxHint(10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: { USD: 0.1389 } });
    assert.equal(hint.startsWith('≈ '), true, 'hint: user rate still shows ≈');
    assert.equal(hint.includes('¥'), true, 'hint: user rate contains ¥');
}
// Negative amount → '-≈ ¥...'
{
    const hint = formatCNYApproxHint(-10000, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(hint.startsWith('-≈ '), true, 'hint: negative starts with -≈');
}
// Invalid currency → ''
{
    assert.equal(formatCNYApproxHint(100, 'INVALID', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} }), '', 'hint: invalid currency → empty');
}
// Zero amount → '≈ ¥0.00'
{
    const hint = formatCNYApproxHint(0, 'USD', { schemaVersion: 1, baseCurrency: 'CNY', rates: {} });
    assert.equal(hint, '≈ ¥0.00', 'hint: zero amount');
}

console.log('[exchange-rate-convert] all A1-A9 + formatCNYApproxHint tests passed');
