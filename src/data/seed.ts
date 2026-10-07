// 100% fictional demo data. Names, addresses and 555-01xx numbers are made up.
import type { Agent, Conversation, Customer, Message, SavedReply } from './types';
import { errorCodePhoto, valvePhoto } from './svg';

export const AGENTS: Agent[] = [
  { id: 'a-jamie', name: 'Jamie', initials: 'J' },
  { id: 'a-morgan', name: 'Morgan', initials: 'M' },
  { id: 'a-alex', name: 'Alex', initials: 'A' },
];

const MIN = 60_000;
const HOUR = 60 * MIN;

export function isoDay(offset: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  // skip Sunday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function nextWeekday(weekday: number, from = new Date()): string {
  const d = new Date(from);
  const diff = ((weekday - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface SeedConvo {
  customer: Customer;
  convo: Omit<Conversation, 'id' | 'phone' | 'lastMessage'>;
  msgs: Array<[dir: 'in' | 'out', minsAgo: number, text: string, extra?: Partial<Message>]>;
}

export function buildSeed(now = Date.now()) {
  const thu = nextWeekday(4, new Date(now));
  const fri = nextWeekday(5, new Date(now));
  const tue = nextWeekday(2, new Date(now));
  const job = (id: string, appliance: string, brand: string, model: string, issue: string, date: string, status: Customer['openJobs'][0]['status'], warranty = false) =>
    ({ id, appliance, brand, model, issue, date, status, warranty });

  const seeds: SeedConvo[] = [
    {
      customer: { phone: '(410) 555-0142', name: 'Denise Harrow', address: '1187 Old Annapolis Rd', city: 'Severna Park', zip: '21146', zone: 'Anne Arundel North', isNew: false, since: '2021',
        nextAppointment: { date: thu, window: 'morning' },
        openJobs: [job('J-48211', 'Refrigerator', 'Samsung', 'RF28R7351SR', 'Not cooling, fresh-food side warm', thu, 'scheduled')],
        pastJobs: [job('J-31007', 'Dishwasher', 'Bosch', 'SHPM88Z75N', 'Replaced drain pump', '2024-03-12', 'completed')],
        sealedSystemHistory: null, urgency: ['No cooling'] },
      convo: { pinned: true, unread: 2, status: 'open', assigneeId: null },
      msgs: [
        ['in', 52, 'Hi, our fridge stopped cooling overnight. Freezer still cold but the fridge side is 55 degrees.'],
        ['out', 48, 'Sorry to hear that Denise! Let me pull up your account.', { agentId: 'a-jamie', status: 'read', readAt: now - 47 * MIN }],
        ['out', 47, 'We have you on the schedule Thursday morning. Is anything leaking?', { agentId: 'a-jamie', status: 'read', readAt: now - 46 * MIN }],
        ['in', 6, 'No leaking. Should I move food to coolers?'],
        ['in', 5, 'And can the tech come earlier than Thursday??'],
      ],
    },
    {
      customer: { phone: '(443) 555-0117', name: 'Marcus Bell', address: '4410 Harford Rd', city: 'Baltimore', zip: '21214', zone: 'Baltimore NE', isNew: false, since: '2019',
        openJobs: [job('J-48302', 'Washer', 'LG', 'WM4000HWA', 'Leaking from bottom, F21 code', isoDay(1, new Date(now)), 'scheduled')],
        nextAppointment: { date: isoDay(1, new Date(now)), window: 'afternoon' },
        pastJobs: [job('J-22914', 'Dryer', 'LG', 'DLEX4000W', 'Thermal fuse', '2023-01-20', 'completed')],
        sealedSystemHistory: null, urgency: ['Leaking'] },
      convo: { pinned: true, unread: 1, status: 'open', assigneeId: 'a-morgan' },
      msgs: [
        ['in', 95, 'Washer is leaking all over the laundry room floor'],
        ['out', 92, 'Hi Marcus — please turn off the water valves behind the washer if you can. Can you send a photo of the display?', { agentId: 'a-morgan', status: 'read', readAt: now - 90 * MIN }],
        ['in', 88, '', { attachment: { kind: 'image', url: errorCodePhoto, alt: 'Washer display showing error code F21' } }],
        ['in', 87, 'Also water under here'],
        ['in', 86, '', { attachment: { kind: 'image', url: valvePhoto, alt: 'Water leaking under the washer near the inlet valve' } }],
        ['out', 80, 'Thanks! F21 is a drain/fill error. Tech is set for tomorrow afternoon, 12 to 5.', { agentId: 'a-morgan', status: 'read', readAt: now - 70 * MIN }],
        ['in', 3, 'Ok. Does the tech need me to empty the drum first?'],
      ],
    },
    {
      customer: { phone: '(301) 555-0163', name: 'Priya Natarajan', address: '22 Quince Orchard Ct', city: 'Gaithersburg', zip: '20878', zone: 'Montgomery West', isNew: false, since: '2022',
        openJobs: [job('J-48190', 'Dryer', 'Whirlpool', 'WED5620HW', 'No heat', thu, 'parts ordered')],
        nextAppointment: { date: thu, window: 'afternoon' },
        pastJobs: [], sealedSystemHistory: null, urgency: ['No heat'] },
      convo: { pinned: false, unread: 0, status: 'open', assigneeId: 'a-jamie' },
      msgs: [
        ['in', 26 * 60, 'Dryer runs but no heat at all'],
        ['out', 26 * 60 - 3, 'Got it. Likely a heating element or thermal fuse — we’ll diagnose on-site.', { agentId: 'a-jamie', status: 'read', readAt: now - 25 * HOUR }],
        ['out', 40, 'Update: your heating element came in. Tech returns Thursday afternoon, 12–5.', { agentId: 'a-jamie', status: 'delivered' }],
      ],
    },
    {
      customer: { phone: '(410) 555-0188', name: 'Tom Kowalski', address: '903 Light St', city: 'Baltimore', zip: '21230', zone: 'Baltimore Central', isNew: false, since: '2018',
        openJobs: [job('J-48077', 'Range', 'GE', 'JGB735SPSS', 'Burner won’t ignite', fri, 'scheduled')],
        nextAppointment: { date: fri, window: 'morning' },
        pastJobs: [job('J-12001', 'Refrigerator', 'GE', 'GNE27JSMSS', 'Compressor replaced', '2022-07-08', 'completed')],
        sealedSystemHistory: 'Placeholder — 2022 compressor replacement (source field TBD)', urgency: [] },
      convo: { pinned: false, unread: 1, status: 'open', assigneeId: null },
      msgs: [
        ['in', 18, 'Hey, I need to reschedule Friday. Something came up at work. Anything next week?'],
      ],
    },
    {
      customer: { phone: '(443) 555-0124', name: 'Angela Reyes', address: '7 Bayberry Ln', city: 'Columbia', zip: '21044', zone: 'Howard', isNew: false, since: '2025',
        openJobs: [], nextAppointment: undefined,
        pastJobs: [job('J-45512', 'Dishwasher', 'KitchenAid', 'KDTM404KPS', 'Replaced control board', '2026-08-21', 'completed', true)],
        sealedSystemHistory: null, urgency: ['Warranty'] },
      convo: { pinned: false, unread: 1, status: 'open', assigneeId: null },
      msgs: [
        ['in', 34, 'Hi, you replaced my dishwasher board in August and now it’s showing the same error. Is that covered under the warranty?'],
      ],
    },
    {
      customer: { phone: '(410) 555-0156', name: 'Gerald Okafor', address: '311 Ridgely Rd', city: 'Timonium', zip: '21093', zone: 'Baltimore County North', isNew: false, since: '2020',
        openJobs: [job('J-48333', 'Refrigerator', 'Whirlpool', 'WRF555SDFZ', 'Ice maker leaking, freezer frosting', isoDay(2, new Date(now)), 'scheduled')],
        nextAppointment: { date: isoDay(2, new Date(now)), window: 'morning' },
        pastJobs: [job('J-29800', 'Refrigerator', 'Whirlpool', 'WRF555SDFZ', 'Sealed system leak repair', '2023-11-02', 'completed')],
        sealedSystemHistory: 'Placeholder — 2023 sealed-system leak repair (source field TBD)', urgency: ['Leaking', 'Repeat issue'] },
      convo: { pinned: false, unread: 1, status: 'open', assigneeId: null,
        handoff: { at: now - 30 * MIN, source: 'Ray (voice)', reason: 'Caller asked for a person', durationSec: 214,
          summary: 'Fridge ice maker leaking and freezer frosting over. Customer had sealed-system work on this unit in 2023 and is worried it failed again.',
          bullets: ['Verified address & ZIP 21093', 'Offered Friday morning — customer wants sooner', 'Asked whether 2023 repair is still under warranty'] } },
      msgs: [
        ['in', 29, 'Hi this is Gerald, I was just on the phone with your assistant. Can someone tell me if the 2023 repair is still covered?'],
      ],
    },
    {
      customer: { phone: '(240) 555-0109', name: '', address: '', city: 'Bowie', zip: '20715', zone: 'Prince George’s', isNew: true,
        openJobs: [], pastJobs: [], sealedSystemHistory: null, urgency: ['New customer'] },
      convo: { pinned: false, unread: 1, status: 'open', assigneeId: null },
      msgs: [
        ['in', 12, 'Hi! How much do you charge to come look at a dishwasher that won’t drain? I’m in Bowie.'],
      ],
    },
    {
      customer: { phone: '(410) 555-0131', name: 'Linda Pruitt', address: '58 Main St', city: 'Ellicott City', zip: '21043', zone: 'Howard', isNew: false, since: '2017',
        openJobs: [], pastJobs: [job('J-47001', 'Oven', 'Frigidaire', 'FGEW3065PF', 'Bake element replaced', isoDay(-2, new Date(now)), 'completed')],
        sealedSystemHistory: null, urgency: [] },
      convo: { pinned: false, unread: 0, status: 'resolved', assigneeId: 'a-alex' },
      msgs: [
        ['in', 50 * 60, 'Oven is baking perfectly again, thank you!'],
        ['out', 50 * 60 - 5, 'So glad to hear it Linda! Thanks for choosing VIA.', { agentId: 'a-alex', status: 'read', readAt: now - 49 * HOUR, meta: { tapbacks: ['heart'] } }],
      ],
    },
    {
      customer: { phone: '(443) 555-0172', name: 'Kevin Tran', address: '1450 Crain Hwy', city: 'Glen Burnie', zip: '21061', zone: 'Anne Arundel North', isNew: false, since: '2024',
        openJobs: [job('J-48402', 'Freezer', 'Frigidaire', 'FFFU20F2VW', 'Not freezing', tue, 'scheduled')],
        nextAppointment: { date: tue, window: 'afternoon' }, pastJobs: [], sealedSystemHistory: null, urgency: ['No cooling'] },
      convo: { pinned: false, unread: 0, status: 'open', assigneeId: 'a-morgan' },
      msgs: [
        ['out', 3 * 60, 'Hi Kevin, confirming your freezer appointment Tuesday afternoon, 12 to 5.', { agentId: 'a-morgan', status: 'read', readAt: now - 2.9 * HOUR }],
        ['in', 2.8 * 60, 'Confirmed 👍'],
      ],
    },
    {
      customer: { phone: '(301) 555-0195', name: 'Shirley Abbott', address: '9 Cedar Ln', city: 'Frederick', zip: '21701', zone: 'Frederick', isNew: false, since: '2016',
        openJobs: [], pastJobs: [job('J-40221', 'Washer', 'Maytag', 'MVW6230HW', 'Lid switch', '2026-05-14', 'completed')],
        sealedSystemHistory: null, urgency: [] },
      convo: { pinned: false, unread: 0, status: 'resolved', assigneeId: 'a-jamie' },
      msgs: [
        ['in', 4 * 24 * 60, 'Do you service Frederick on Saturdays?'],
        ['out', 4 * 24 * 60 - 10, 'We do, Saturday mornings 8–12 in Frederick. Want me to check openings?', { agentId: 'a-jamie', status: 'read', readAt: now - 95 * HOUR }],
        ['in', 4 * 24 * 60 - 20, 'Not yet, just checking. Thanks!'],
      ],
    },
    {
      customer: { phone: '(410) 555-0110', name: 'Rob Delgado', address: '210 Severn Ave', city: 'Annapolis', zip: '21403', zone: 'Anne Arundel South', isNew: false, since: '2023',
        openJobs: [job('J-48120', 'Dishwasher', 'Bosch', 'SHX878ZD5N', 'Not cleaning, E24', thu, 'scheduled')],
        nextAppointment: { date: thu, window: 'morning' }, pastJobs: [], sealedSystemHistory: null, urgency: [] },
      convo: { pinned: false, unread: 0, status: 'open', assigneeId: 'a-alex' },
      msgs: [
        ['in', 6 * 60, 'Will the tech call before coming?'],
        ['out', 6 * 60 - 4, 'Yes — they’ll text you about 30 minutes out.', { agentId: 'a-alex', status: 'read', readAt: now - 5.9 * HOUR }],
        ['in', 6 * 60 - 6, 'Perfect', {}],
      ],
    },
    {
      customer: { phone: '(443) 555-0148', name: 'Monique Carter', address: '66 Edmondson Ave', city: 'Catonsville', zip: '21228', zone: 'Baltimore County West', isNew: false, since: '2020',
        openJobs: [], pastJobs: [job('J-46610', 'Microwave', 'GE', 'JVM6175SKSS', 'Door switch', '2026-09-03', 'completed')],
        sealedSystemHistory: null, urgency: [] },
      convo: { pinned: false, unread: 0, status: 'resolved', assigneeId: 'a-morgan' },
      msgs: [
        ['in', 9 * 24 * 60, 'Got the invoice, all paid. Thanks again'],
      ],
    },
  ];

  const customers = new Map<string, Customer>();
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message[]>();
  seeds.forEach((s, i) => {
    const id = `c${i + 1}`;
    customers.set(s.customer.phone, s.customer);
    const list: Message[] = s.msgs.map(([direction, minsAgo, text, extra], j) => ({
      id: `${id}-m${j + 1}`, conversationId: id, direction, text, at: now - minsAgo * MIN,
      ...(direction === 'out' ? { status: 'delivered' as const } : {}), ...extra,
    }));
    messages.set(id, list);
    conversations.set(id, { id, phone: s.customer.phone, name: s.customer.name || undefined, ...s.convo, lastMessage: list[list.length - 1] });
  });
  return { customers, conversations, messages };
}

export const TEAM_REPLIES: SavedReply[] = [
  { id: 't1', scope: 'team', title: 'Service fee', body: 'Our diagnostic visit is a flat service fee, which is applied toward the repair if you go ahead. Want me to check the next opening in your area?' },
  { id: 't2', scope: 'team', title: 'Arrival windows', body: 'We schedule in two windows: morning (8–12) and afternoon (12–5). Your technician will text about 30 minutes before arriving.' },
  { id: 't3', scope: 'team', title: 'Water shutoff', body: 'If it’s still leaking, please turn off the water supply valves behind the appliance and place towels down. We’ll get someone out as soon as possible.' },
  { id: 't4', scope: 'team', title: 'Warranty', body: 'Our repairs carry a parts and labor warranty. Let me look up the original job and confirm coverage for you.' },
];

export const DEFAULT_PERSONAL: Record<string, SavedReply[]> = {
  'a-jamie': [{ id: 'p-j1', scope: 'personal', agentId: 'a-jamie', title: 'Quick hello', body: 'Hi! This is Jamie with VIA Appliance Repair — happy to help.' }],
  'a-morgan': [{ id: 'p-m1', scope: 'personal', agentId: 'a-morgan', title: 'Photo request', body: 'Could you send a photo of the model/serial tag? It’s usually inside the door or on the back.' }],
  'a-alex': [{ id: 'p-a1', scope: 'personal', agentId: 'a-alex', title: 'Sign-off', body: 'Thanks for choosing VIA! — Alex' }],
};
