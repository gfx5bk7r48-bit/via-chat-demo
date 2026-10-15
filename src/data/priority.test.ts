import { describe, it, expect } from 'vitest';
import { sortForList, apptLabel, priorityText, isPriority } from './priority';

describe('priority', () => {
  it('sorts urgent, then high by appointment time, then the rest in original order', () => {
    const l = [
      { id: 'a', priority: null }, { id: 'b', priority: 'high' as const, apptAt: '2026-10-16T16:00:00Z' },
      { id: 'c', priority: undefined }, { id: 'd', priority: 'high' as const, apptAt: '2026-10-16T12:00:00Z' },
      { id: 'e', priority: 'urgent' as const }, { id: 'f', priority: 'low' as const },
    ];
    expect(sortForList(l).map((c) => c.id)).toEqual(['e', 'd', 'b', 'a', 'c', 'f']);
  });
  it('labels in Eastern time', () => {
    expect(apptLabel('2026-10-16T12:00:00.000Z')).toBe('Fri 8:00 AM');
    expect(priorityText({ priority: 'high', apptAt: '2026-10-16T16:00:00Z' })).toBe('Priority · appt Fri 12:00 PM');
    expect(priorityText({ priority: 'urgent' })).toBe('Urgent');
    expect(isPriority({ priority: 'medium' })).toBe(false);
  });
});
