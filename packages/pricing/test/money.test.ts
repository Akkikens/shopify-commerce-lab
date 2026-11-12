import { describe, expect, it } from 'vitest';
import { convert, minorUnitDigits, parseScaled, formatScaled } from '../src/money';
import { roundPrice, defaultRoundingFor } from '../src/rounding';

describe('minor units', () => {
  it('follows ISO 4217 exponents', () => {
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('KWD')).toBe(3);
  });

  it('parses and formats decimals exactly', () => {
    expect(parseScaled('19.995', 2)).toBe(2000n);
    expect(parseScaled('0.1', 2) + parseScaled('0.2', 2)).toBe(30n);
    expect(formatScaled(5n, 2)).toBe('0.05');
    expect(formatScaled(1234n, 0)).toBe('1234');
  });
});

describe('convert', () => {
  it('converts with half-up rounding to target minor units', () => {
    expect(convert({ amount: '129.99', currencyCode: 'USD' }, 'CAD', '1.3712')).toEqual({ amount: '178.24', currencyCode: 'CAD' });
    expect(convert({ amount: '129.99', currencyCode: 'USD' }, 'JPY', '151.37')).toEqual({ amount: '19677', currencyCode: 'JPY' });
    expect(convert({ amount: '49.99', currencyCode: 'USD' }, 'KWD', '0.3071')).toEqual({ amount: '15.352', currencyCode: 'KWD' });
  });

  it('rejects non-positive rates', () => {
    expect(() => convert({ amount: '1', currencyCode: 'USD' }, 'EUR', '0')).toThrow();
  });
});

describe('roundPrice', () => {
  it('rounds up to a .99 ending', () => {
    expect(roundPrice({ amount: '41.20', currencyCode: 'EUR' }, { kind: 'ending', ending: '0.99' }).amount).toBe('41.99');
    expect(roundPrice({ amount: '41.99', currencyCode: 'EUR' }, { kind: 'ending', ending: '0.99' }).amount).toBe('41.99');
    expect(roundPrice({ amount: '42.00', currencyCode: 'EUR' }, { kind: 'ending', ending: '0.95' }).amount).toBe('42.95');
    expect(roundPrice({ amount: '0.10', currencyCode: 'EUR' }, { kind: 'ending', ending: '0.99' }).amount).toBe('0.99');
  });

  it('rounds up to increments, including zero-decimal currencies', () => {
    expect(roundPrice({ amount: '19676', currencyCode: 'JPY' }, { kind: 'increment', increment: '100' }).amount).toBe('19700');
    expect(roundPrice({ amount: '12.01', currencyCode: 'CHF' }, { kind: 'increment', increment: '0.05' }).amount).toBe('12.05');
    expect(roundPrice({ amount: '12.05', currencyCode: 'CHF' }, { kind: 'increment', increment: '0.05' }).amount).toBe('12.05');
  });

  it('picks a sensible default policy per currency', () => {
    expect(defaultRoundingFor('JPY')).toEqual({ kind: 'increment', increment: '100' });
    expect(defaultRoundingFor('GBP')).toEqual({ kind: 'ending', ending: '0.99' });
  });

  it('rejects endings that are not a fraction of one unit', () => {
    expect(() => roundPrice({ amount: '1.00', currencyCode: 'USD' }, { kind: 'ending', ending: '1.50' })).toThrow();
  });
});
