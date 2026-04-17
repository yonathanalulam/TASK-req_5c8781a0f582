const { addBusinessDays, isBusinessDay, businessDaysBetween } = require('../../src/utils/businessCalendar');

describe('business calendar', () => {
  test('weekends are not business days', () => {
    expect(isBusinessDay(new Date('2026-04-11T00:00:00Z'))).toBe(false); // Saturday
    expect(isBusinessDay(new Date('2026-04-12T00:00:00Z'))).toBe(false); // Sunday
    expect(isBusinessDay(new Date('2026-04-13T00:00:00Z'))).toBe(true);  // Monday
  });
  test('US federal holiday is not business day', () => {
    expect(isBusinessDay(new Date('2026-07-03T00:00:00Z'))).toBe(false); // observed July 4 in 2026
  });
  test('addBusinessDays skips weekends', () => {
    // Monday 2026-04-13 + 10 business days => Monday 2026-04-27
    const d = addBusinessDays(new Date('2026-04-13T00:00:00Z'), 10);
    expect(d.toISOString().slice(0, 10)).toBe('2026-04-27');
  });
  test('businessDaysBetween', () => {
    const a = new Date('2026-04-13T00:00:00Z');
    const b = new Date('2026-04-27T00:00:00Z');
    expect(businessDaysBetween(a, b)).toBe(10);
  });
});
