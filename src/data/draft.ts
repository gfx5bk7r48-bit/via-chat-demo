// Template-based "AI" suggestion. Stands in for a server-side LLM draft endpoint.
import type { Customer, Message } from './types';

export function fmtDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}
// Morning/afternoon are routing buckets; dispatch texts the real 3-hour window the day before. Never quote 8-12 to a customer.
export const windowText = (w: 'morning' | 'afternoon') => `${w} (we'll text you a 3-hour arrival window the day before)`;

export function templateDraft(customer: Customer | null, msgs: Message[]): string | null {
  const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
  if (!lastIn) return null;
  const last = msgs[msgs.length - 1];
  if (last.direction === 'out') return null; // nothing awaiting a reply
  const t = (lastIn.text || '').toLowerCase();
  const first = customer?.name ? customer.name.split(' ')[0] : '';
  const hi = first ? `Hi ${first}, ` : 'Hi! ';
  const appt = customer?.nextAppointment;

  if (!lastIn.text && lastIn.attachment) return `Thanks for the photo${first ? ', ' + first : ''}! That helps our technician bring the right parts.`;
  if (/resched|move|next week|change/.test(t)) return `${hi}no problem. I can move you — would a morning or an afternoon next week work better?`;
  if (/warrant|covered/.test(t)) return `${hi}let me pull up the original repair. Our work carries a parts and labor warranty, and I’ll confirm coverage for you in just a moment.`;
  if (/price|cost|charge|how much/.test(t)) return `${hi}thanks for reaching out to VIA! Our diagnostic visit is a flat service fee that goes toward the repair. What's your ZIP so I can check the next opening?`;
  if (/earlier|sooner|today/.test(t) && appt) return `${hi}you're scheduled ${fmtDay(appt.date)} ${windowText(appt.window)}. I'll check for an earlier opening and add you to our cancellation list.`;
  if (appt) return `${hi}your technician is scheduled ${fmtDay(appt.date)} ${windowText(appt.window)}. They'll text about 30 minutes before arriving.`;
  if (customer?.urgency.includes('Leaking')) return `${hi}please turn off the water supply to the appliance if you can. Let me find the soonest opening for you.`;
  return `${hi}thanks for your message — let me take a look and get right back to you.`;
}
