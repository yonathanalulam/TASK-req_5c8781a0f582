const billing = require('../../src/services/billingService');

describe('billing calculators', () => {
  test('fixed rent returns fixedAmountCents', () => {
    const r = billing.compute({ ruleType: 'fixed', fixedAmountCents: 250000 }, {});
    expect(r.amountCents).toBe(250000);
  });
  test('tiered rent selects correct tier', () => {
    const rule = {
      ruleType: 'tiered',
      tiers: [
        { minBasisCents: 0, maxBasisCents: 99999, amountCents: 10000 },
        { minBasisCents: 100000, maxBasisCents: 499999, amountCents: 20000 },
        { minBasisCents: 500000, maxBasisCents: null, amountCents: 30000 },
      ],
    };
    expect(billing.compute(rule, { basisCents: 50000 }).amountCents).toBe(10000);
    expect(billing.compute(rule, { basisCents: 250000 }).amountCents).toBe(20000);
    expect(billing.compute(rule, { basisCents: 9999999 }).amountCents).toBe(30000);
  });
  test('tiered rent rejects overlapping ranges', () => {
    expect(() => billing.validateTiers([
      { minBasisCents: 0, maxBasisCents: 200, amountCents: 10 },
      { minBasisCents: 150, maxBasisCents: 400, amountCents: 20 },
    ])).toThrow(/overlapping/);
  });
  test('revenue share true-up formula', () => {
    const rule = { ruleType: 'revenue_share', revenueShareRate: 0.1 };
    const r = billing.compute(rule, { grossRevenueCents: 1000000, provisionalAmountsAlreadyBilledCents: 50000 });
    // 1_000_000 * 0.1 - 50_000 = 50_000
    expect(r.amountCents).toBe(50000);
  });
  test('revenue share negative clamps to zero by default', () => {
    const rule = { ruleType: 'revenue_share', revenueShareRate: 0.1 };
    const r = billing.compute(rule, { grossRevenueCents: 100000, provisionalAmountsAlreadyBilledCents: 50000 });
    expect(r.amountCents).toBe(0);
    expect(r.rawCents).toBe(10000 - 50000);
  });
});
