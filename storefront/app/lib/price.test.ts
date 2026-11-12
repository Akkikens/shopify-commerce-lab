import { describe, expect, it } from 'vitest';
import { getSaving } from './price';

const usd = (amount: string) => ({ amount, currencyCode: 'USD' });

describe('getSaving', () => {
  it('shows compare-at only when strictly above price, rounding the saving down', () => {
    expect(getSaving(usd('49.99'), usd('64.99'))).toEqual({ compareAtPrice: usd('64.99'), percentOff: 23 });
    expect(getSaving(usd('45.0'), usd('58.5'))).toEqual({ compareAtPrice: usd('58.5'), percentOff: 23 });
  });

  it('hides equal, lower, missing or cross-currency compare-at prices', () => {
    expect(getSaving(usd('10.00'), usd('10.0'))).toBeNull();
    expect(getSaving(usd('10.00'), usd('9.99'))).toBeNull();
    expect(getSaving(usd('10.00'), null)).toBeNull();
    expect(getSaving(usd('10.00'), { amount: '20.00', currencyCode: 'CAD' })).toBeNull();
  });
});
