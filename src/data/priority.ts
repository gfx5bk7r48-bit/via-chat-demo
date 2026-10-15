// Appointment-within-24h priority (set server-side by sd-proxy, or by an agent / Ray via Chatwoot's API).
// Contract: Chatwoot conversation.priority 'high' | 'urgent' = priority; label 'appt-24h' + custom attribute
// appt_at (ISO start of the appointment window) = auto-flagged because of a ServiceDesk appointment.
import type { Conversation } from './types';

export const APPT_LABEL = 'appt-24h';
export const priorityRank = (c: Pick<Conversation, 'priority' | 'apptAt'>) => (c.priority === 'urgent' ? 2 : c.priority === 'high' || c.apptAt ? 1 : 0);
/** Priority = Chatwoot priority high/urgent, or the appt-24h label (apptAt is only set when the label is present). */
export const isPriority = (c: Pick<Conversation, 'priority' | 'apptAt'>) => priorityRank(c) > 0;

/** "Fri 8:00 AM" in Eastern time (internal/staff display; the server stores the window start). */
export function apptLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const t = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${day} ${t}`;
}
export const priorityText = (c: Pick<Conversation, 'priority' | 'apptAt'>) =>
  c.apptAt ? `Priority · appt ${apptLabel(c.apptAt)}` : c.priority === 'urgent' ? 'Urgent' : 'Priority';

/** Priority first (urgent, then high; sooner appointment first), otherwise keep the incoming order. */
export function sortForList<T extends Pick<Conversation, 'priority' | 'apptAt'>>(list: T[]): T[] {
  return list.map((c, i) => ({ c, i })).sort((a, b) => {
    const r = priorityRank(b.c) - priorityRank(a.c);
    if (r) return r;
    if (priorityRank(a.c)) {
      const x = a.c.apptAt ? Date.parse(a.c.apptAt) : Infinity, y = b.c.apptAt ? Date.parse(b.c.apptAt) : Infinity;
      if (x !== y) return x - y;
    }
    return a.i - b.i;
  }).map((x) => x.c);
}
