/**
 * ServiceDesk customer context, in the shape of VIA's internal customer
 * lookup and availability responses.
 *
 * The index is APPOINTMENTS ONLY, keyed by 10-digit phone. There is no job
 * history, balance, warranty, notes or sealed-system field anywhere yet.
 *
 * Live path (not connected yet): same-origin GET /api/sd/customer?phone=<10 digits>
 * served by a small server-side proxy on the droplet that validates the agent's
 * Chatwoot session and holds a read-only credential server-side. Until then
 * the UI uses demo fixtures that follow the same shape.
 *
 * 8-12 / 12-4 are routing BUCKETS, not customer windows. Dispatch narrows them
 * to a 3-hour window the day before. Never put a bucket in customer-facing text.
 */
import type { Message } from './types';

export type SdPriority = 'critical' | 'high' | 'medium' | 'low' | 'past' | 'none';

export interface SdAppointment {
  invoice: number | string;
  customer_first_name: string;
  customer_full_name: string;
  when: string;
  date: string;
  window: string; // raw, e.g. "10/8 THU 8-12", "9/23 WED PM", "10/2 FRI !"
  window_time_known: boolean;
  tech: string;
  tech_assigned: boolean;
  appliance: string;
  city: string;
  zip: string;
  hours_until_window: number | null;
  is_past: boolean;
  in_progress: boolean;
}
export interface SdRoutingDay { day: string; date: string; techs: string; room: boolean; bookable: boolean }
export interface SdRouting {
  found: boolean; zip: string; zone: string; zone_source?: string;
  offer: { name: 'morning' | 'afternoon'; range: string }[];
  window_note?: string; days: SdRoutingDay[]; suggest?: string; note?: string;
}
export interface SdLookup {
  found: boolean;
  priority: SdPriority;
  in_progress: boolean;
  appointments: SdAppointment[];
  routing?: SdRouting;
  called_recently?: boolean;
  repeat_caller?: boolean;
  hours_until_window?: number;
  warning?: string;
  /** Added by the VIA Chat proxy: when the ServiceDesk batch last ran. */
  synced_at?: string;
  /** 'demo' = fixture data, ServiceDesk not connected. */
  source: 'servicedesk' | 'demo';
}

/** Raw appointment record (demo fixtures only). */
export interface SdRawAppointment { invoice: number | string; name: string; date: string; window: string; tech: string; machine: string; city: string; zip: string }

export const NOT_A_TECH = new Set(['OF', '']);

export function phone10(s: string): string {
  const d = (s || '').replace(/\D/g, '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 ? t : '';
}

// ---- Eastern-time helpers (VIA's day rolls over in America/New_York, not UTC) ----
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
export const dow = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
export const longDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const weekday = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
export const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const parseName = (n: string) => {
  const [last, first] = n.split(',').map((x) => x.trim());
  return { first: title(first || last || ''), full: title(n) };
};

/** What part of the day a raw window refers to. */
export function windowPart(raw: string): { part: 'morning' | 'afternoon' | null; known: boolean; exact: string | null } {
  const w = raw.trim().split(/\s+/).pop() ?? '';
  if (w === '!' || !w) return { part: null, known: false, exact: null };
  if (/^AM$/i.test(w)) return { part: 'morning', known: true, exact: null };
  if (/^PM$/i.test(w)) return { part: 'afternoon', known: true, exact: null };
  const m = w.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return { part: null, known: true, exact: null };
  const a = +m[1], b = +m[2];
  const start = a < 7 ? a + 12 : a, end = b < 7 || b <= a ? b + 12 : b;
  const part = start < 12 ? 'morning' : 'afternoon';
  // 8-12 and 12-4 are buckets. Only a dispatched window of 3 hours or less is a real customer window.
  const exact = end - start <= 3 && !(a === 8 && b === 12) && !(a === 12 && b === 4) ? w : null;
  return { part, known: true, exact };
}

/** Derive a lookup response from raw demo records. */
export function deriveLookup(raw: SdRawAppointment[], routing?: SdRouting, now = new Date()): SdLookup {
  const today = easternToday(now);
  const appts: SdAppointment[] = [...raw].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    const n = parseName(r.name);
    const diff = dayDiff(r.date, today);
    const wp = windowPart(r.window);
    const startHour = wp.part === 'afternoon' ? 12 : 8;
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hrs = diff * 24 + (startHour - (etNow.getHours() + etNow.getMinutes() / 60));
    const assigned = !NOT_A_TECH.has(r.tech.toUpperCase());
    return {
      invoice: r.invoice, customer_first_name: n.first, customer_full_name: n.full,
      when: diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : diff < 0 ? `${-diff} days ago` : diff < 7 ? weekday(r.date) : `${md(r.date)}`,
      date: r.date, window: r.window, window_time_known: wp.known, tech: r.tech, tech_assigned: assigned, appliance: r.machine,
      city: r.city, zip: r.zip, hours_until_window: Math.round(hrs * 10) / 10, is_past: diff < 0,
      in_progress: diff === 0 && assigned && hrs <= 0,
    };
  });
  const next = appts.find((a) => !a.is_past);
  const priority: SdPriority = !appts.length ? 'none' : !next ? 'past'
    : next.in_progress || next.when === 'today' ? 'critical' : next.when === 'tomorrow' ? 'high' : (next.hours_until_window ?? 999) < 24 * 4 ? 'medium' : 'low';
  return {
    found: appts.length > 0, priority, in_progress: appts.some((a) => a.in_progress), appointments: appts,
    routing, repeat_caller: appts.length > 1 || undefined, hours_until_window: next?.hours_until_window ?? undefined, source: 'demo',
  };
}

/** Deterministic demo routing block for a ZIP. */
export function demoRouting(zip: string, now = new Date()): SdRouting {
  const seed = [...zip].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rnd = (i: number) => { const x = Math.sin(seed + i * 97) * 10000; return x - Math.floor(x); };
  const techs = ['EW', 'JG', 'IR', 'KR', 'SB', 'PM', 'BD', 'SD'];
  const today = easternToday(now);
  const days: SdRoutingDay[] = [];
  for (let i = 0; days.length < 7; i++) {
    const date = addDays(today, i);
    if (dow(date) === 'Sun') continue; // Sundays are omitted entirely
    const crew = [0, 1, 2].map((k) => techs[Math.floor(rnd(i * 3 + k) * techs.length)]).filter((t, k, a) => a.indexOf(t) === k);
    const parts = crew.map((t, k) => {
      const cap = 9 + Math.floor(rnd(i + k + 50) * 3);
      const booked = i === 0 ? cap : Math.max(0, Math.round(cap * (1.15 - i * 0.16) + (rnd(i * 7 + k) * 3 - 1)));
      return { t, booked, cap };
    });
    const room = parts.some((p) => p.booked < p.cap);
    days.push({ day: `${dow(date)} ${md(date)}`, date, techs: parts.map((p) => `${p.t} ${p.booked}/${p.cap}`).join(' '), room, bookable: i !== 0 && room });
  }
  const zone = String(1 + (seed % 24));
  return {
    found: true, zip, zone, zone_source: 'demo',
    offer: [{ name: 'morning', range: '8-12' }, { name: 'afternoon', range: '12-4' }],
    window_note: 'Offer morning or afternoon only. Dispatch narrows it to a 3-hour window the day before, when routes are built. A customer never actually receives an 8-12 window.',
    days, suggest: days.find((d) => d.bookable)?.day, note: 'booked/capacity per tech. room = worth proposing, not a booking.',
  };
}

/** Last ServiceDesk batch time for demo data: the batch runs about every 15 minutes. */
export function demoSyncedAt(now = Date.now()): string {
  const q = 15 * 60_000;
  return new Date(Math.floor((now - 3 * 60_000) / q) * q + 3 * 60_000).toISOString();
}

/** Urgency strip verdict. */
export function verdict(l: SdLookup | null): { tone: 'red' | 'amber' | 'green' | 'grey'; text: string; appt?: SdAppointment } {
  const next = l?.appointments.find((a) => !a.is_past);
  const last = l ? [...l.appointments].reverse().find((a) => a.is_past) : undefined;
  if (next?.in_progress) return { tone: 'red', text: 'Technician out today', appt: next };
  if (next?.when === 'today') return { tone: 'red', text: 'Today', appt: next };
  if (next?.when === 'tomorrow') return { tone: 'amber', text: 'Tomorrow', appt: next };
  if (next) return { tone: 'green', text: 'Scheduled', appt: next };
  if (last) return { tone: 'grey', text: 'Last visit', appt: last };
  return { tone: 'grey', text: 'No appointment on file' };
}

/** Customer-facing phrase for an appointment. Never contains an 8-12 / 12-4 bucket. */
export function customerWindow(a: SdAppointment): string {
  const wp = windowPart(a.window);
  const day = a.when === 'today' || a.when === 'tomorrow' ? a.when : weekday(a.date);
  if (wp.exact) return `${day} between ${wp.exact.replace('-', ' and ')}`;
  if (wp.part) return `${day} ${wp.part === 'morning' ? 'morning' : 'afternoon'} (dispatch will text you a 3-hour arrival window the day before)`;
  return `${day} (dispatch will text you an arrival window once routes are built)`;
}

/** Template stand-in for the AI draft, grounded in the ServiceDesk lookup. Never sends by itself. */
export function sdDraft(l: SdLookup | null, msgs: Message[]): string | null {
  const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
  const last = msgs[msgs.length - 1];
  if (!lastIn || !last || last.direction === 'out') return null;
  const t = (lastIn.text || '').toLowerCase();
  const next = l?.appointments.find((a) => !a.is_past);
  const first = (next ?? l?.appointments.at(-1))?.customer_first_name;
  const hi = first ? `Hi ${first}, ` : 'Hi! ';
  if (!lastIn.text && lastIn.attachment) return `Thanks for the photo${first ? ', ' + first : ''}! That helps our technician bring the right parts.`;
  if (/resched|move|next week|change|cancel/.test(t)) return `${hi}no problem. I'll ask dispatch to move you. Would a morning or an afternoon work better, and which days are good?`;
  if (/price|cost|charge|how much/.test(t)) return `${hi}thanks for reaching out to VIA! Our diagnostic visit is a flat service fee that goes toward the repair. What's your ZIP so I can check the next opening?`;
  if (/earlier|sooner|today/.test(t) && next) return `${hi}you're scheduled ${customerWindow(next)}. I'll check for an earlier opening and add you to our cancellation list.`;
  if (next?.in_progress) return `${hi}your technician is out on the road today and will text about 30 minutes before arriving.`;
  if (next) return `${hi}your ${next.appliance.toLowerCase()} appointment is ${customerWindow(next)}. The technician texts about 30 minutes before arriving.`;
  return `${hi}thanks for your message. Let me take a look and get right back to you.`;
}
