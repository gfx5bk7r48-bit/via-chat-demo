import { describe, expect, it } from 'vitest';
import { customerWindow, deriveLookup, demoRouting, phone10, verdict, windowPart } from './sd';

const now = new Date('2026-10-07T14:00:00-04:00');
const raw = (date: string, window: string, tech = 'NH') => ({ invoice: 555101, name: 'MCCOY, DIANE', date, window, tech, machine: 'ALL IN ONE W/D', city: 'CROFTON', zip: '21114' });

describe('ServiceDesk shape helpers', () => {
  it('normalises phones to 10 digits', () => {
    expect(phone10('+1 (410) 555-0199')).toBe('4105550199');
    expect(phone10('+44 20 7946 0000')).toBe('');
  });
  it('treats 8-12 / 12-4 as buckets, not windows', () => {
    expect(windowPart('10/8 THU 8-12')).toEqual({ part: 'morning', known: true, exact: null });
    expect(windowPart('10/8 THU 12-4').exact).toBeNull();
    expect(windowPart('10/8 THU 9-12').exact).toBe('9-12');
    expect(windowPart('10/2 FRI !').known).toBe(false);
  });
  it('never puts a bucket in customer-facing text', () => {
    const l = deriveLookup([raw('2026-10-08', '10/8 THU 8-12'), raw('2026-10-09', '10/9 FRI 12-4')], undefined, now);
    for (const a of l.appointments) expect(customerWindow(a)).not.toMatch(/8-12|12-4|8 and 12|12 and 4/);
  });
  it('derives when / priority / verdict', () => {
    const l = deriveLookup([raw('2026-10-08', '10/8 THU 8-12'), raw('2026-09-01', '9/1 TUE AM')], undefined, now);
    expect(l.appointments[1].when).toBe('tomorrow');
    expect(l.priority).toBe('high');
    expect(verdict(l).text).toBe('Tomorrow');
    expect(verdict(deriveLookup([], undefined, now)).text).toBe('No appointment on file');
    expect(deriveLookup([raw('2026-10-08', '10/8 THU 8-12', 'OF')], undefined, now).appointments[0].tech_assigned).toBe(false);
  });
  it('demo routing: no Sundays, today never bookable', () => {
    const r = demoRouting('21114', now);
    expect(r.days).toHaveLength(7);
    expect(r.days.some((d) => d.day.startsWith('Sun'))).toBe(false);
    expect(r.days[0].bookable).toBe(false);
  });
});
