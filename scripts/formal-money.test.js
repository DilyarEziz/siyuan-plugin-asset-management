'use strict';

const assert = require('node:assert/strict');
const money = require('../api/algorithms');

assert.equal(money.currencyExponent('JPY'), 0);
assert.equal(money.currencyExponent('BIF'), 0);
assert.equal(money.currencyExponent('CLP'), 0);
assert.equal(money.currencyExponent('CNY'), 2);
assert.equal(money.currencyExponent('KWD'), 3);
assert.equal(money.currencyExponent('UYW'), 4);
const exponent0 = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
const exponent3 = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];
const exponent4 = ['CLF', 'UYW'];
exponent0.forEach(code => assert.equal(money.currencyExponent(code), 0, code));
exponent3.forEach(code => assert.equal(money.currencyExponent(code), 3, code));
exponent4.forEach(code => assert.equal(money.currencyExponent(code), 4, code));
assert.equal(money.isISO4217Currency('XCG'), true, 'current Caribbean guilder code is active');
['ANG', 'HRK', 'SLL', 'ZWL'].forEach(code => assert.equal(money.isISO4217Currency(code), false, code + ' is withdrawn'));
assert.equal(money.parseMajorToMinor('123', 'JPY'), 123);
assert.equal(money.parseMajorToMinor('12.34', 'CNY'), 1234);
assert.equal(money.parseMajorToMinor('12.345', 'KWD'), 12345);
assert.equal(money.minorToMajorString(123, 'JPY'), '123');
assert.equal(money.minorToMajorString(1234, 'CNY'), '12.34');
assert.equal(money.minorToMajorString(12345, 'KWD'), '12.345');
assert.throws(() => money.parseMajorToMinor('0.1', 'JPY'), /precision/);
assert.throws(() => money.parseMajorToMinor('1.001', 'CNY'), /precision/);
assert.throws(() => money.parseMajorToMinor('90071992547409.92', 'CNY'), /safe integer/);
assert.throws(() => money.safeMinorAdd(Number.MAX_SAFE_INTEGER, 1), /safe integer range/);
assert.throws(() => money.safeMinorSubtract(-Number.MAX_SAFE_INTEGER, 1), /safe integer range/);
assert.match(money.formatAmountMinor(1234, 'CNY', 'zh-CN'), /12\.34/);
assert.match(money.formatAmountMinor(Number.MAX_SAFE_INTEGER, 'JPY', 'en-US'), /9,007,199,254,740,991/);
assert.match(money.formatAmountMinor(Number.MAX_SAFE_INTEGER, 'CNY', 'en-US'), /90,071,992,547,409\.91/);
assert.match(money.formatAmountMinor(Number.MAX_SAFE_INTEGER, 'KWD', 'en-US'), /9,007,199,254,740\.991/);
assert.match(money.formatAmountMinor(Number.MAX_SAFE_INTEGER, 'UYW', 'en-US'), /900,719,925,474\.0991/);
assert.equal(money.isISO4217Currency('ABC'), false);
assert.throws(() => money.currencyExponent('ABC'), /ISO 4217|definition/);

// Stage 2 symbol purification: CNY must render ¥ (never the CN prefix) and the
// other majors render their clean narrow symbols; grouping/decimals unchanged.
const cnyFmt = money.formatAmountMinor(123456, 'CNY');
assert.equal(cnyFmt.includes('CN'), false, 'CNY must not render the CN prefix');
assert.equal(cnyFmt.includes('¥'), true, 'CNY must render the ¥ symbol');
assert.equal(cnyFmt, '¥1,234.56');
const usdFmt = money.formatAmountMinor(123456, 'USD');
assert.equal(usdFmt.includes('$'), true, 'USD must render the $ symbol');
assert.equal(usdFmt, '$1,234.56');
assert.equal(money.formatAmountMinor(123456, 'EUR').includes('€'), true, 'EUR must render €');
assert.equal(money.formatAmountMinor(123456, 'GBP').includes('£'), true, 'GBP must render £');
// Grouping + 2-decimal behavior preserved for large values (with the clean symbol).
assert.match(money.formatAmountMinor(Number.MAX_SAFE_INTEGER, 'CNY', 'en-US'), /¥90,071,992,547,409\.91/);
// A valid ISO 4217 currency outside the explicit {CNY,USD,EUR,GBP} symbol map still
// formats gracefully via the narrowSymbol path (unknown-to-symbol-map currencies do not crash).
assert.doesNotThrow(() => money.formatAmountMinor(123, 'JPY'));
assert.equal(typeof money.formatAmountMinor(123, 'JPY'), 'string');
// Contract preserved (behavior unchanged): amountMinor must be a non-negative safe
// integer, so a negative value still throws rather than being formatted.
assert.throws(() => money.formatAmountMinor(-123456, 'CNY'), /non-negative/);

console.log('[formal-money] passed');
