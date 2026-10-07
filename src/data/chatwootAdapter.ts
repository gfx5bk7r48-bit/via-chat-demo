/**
 * ChatwootAdapter: the real-backend implementation of the DataAdapter seam.
 *
 * Talks to a self-hosted Chatwoot (Community edition) Application API on the
 * SAME origin as this UI, authenticated as the signed-in agent via
 * devise-token-auth session headers (see chatwootSession.ts). No API token is
 * compiled into the bundle.
 *
 * Mapping:
 *   conversations  GET  /api/v1/accounts/:id/conversations?status=all&assignee_type=all&page=N
 *   messages       GET  .../conversations/:cid/messages[?before=<id>]
 *   send / note    POST .../conversations/:cid/messages {content, message_type, private}
 *   read           POST .../conversations/:cid/update_last_seen
 *   assign         POST .../conversations/:cid/assignments {assignee_id}
 *   resolve/open   POST .../conversations/:cid/toggle_status {status}
 *   pin            POST .../conversations/:cid/labels {labels:[..., "pinned"]}
 *   tapbacks       POST .../conversations/:cid/custom_attributes  (VIA-only metadata, never sent over SMS)
 *   contacts       GET  .../contacts/search?q=
 *   ServiceDesk    GET  /api/sd/customer?phone=  (same-origin proxy, NOT built yet -> demo fixtures in the real shape)
 *   team replies   GET  .../canned_responses
 *   personal replies  stored per agent in the Chatwoot user's ui_settings (GET/PUT /api/v1/profile)
 *   realtime       ActionCable RoomChannel at wss://<host>/cable, polling fallback every 4 s
 *
 * Not Chatwoot features, still demo stand-ins until the VIA Chat API exists:
 *   routing/availability (demo per ZIP), callsheet booking (private note only,
 *   nothing reaches ServiceDesk), AI draft (template).
 */
import type { DataAdapter, SimulatorHooks, Unsubscribe } from './adapter';
import type {
  AdapterEvent, Agent, Booking, Conversation, Customer, Draft, Message, MessageStatus, SavedReply, Slot, Tapback,
} from './types';
import { demoRouting, demoSyncedAt, deriveLookup, dow, md, phone10, sdDraft, type SdLookup, type SdRawAppointment, type SdRouting } from './sd';
import { ChatwootCable } from './cable';
import { authHeaders, clearSession, type ChatwootSession } from './chatwootSession';

export interface ChatwootConfig {
  baseUrl: string; // '' = same origin
  /** Name of the API-channel inbox standing in for SMS. */
  inboxName: string;
}

type Raw = any; // Chatwoot JSON payloads

const PERSONAL_KEY = 'via_personal_replies_json';
const TAPBACK_KEY = 'via_tapbacks_json';
const PIN_LABEL = 'pinned';
const POLL_MS = 4000;

export function fmtPhone(e164?: string | null): string {
  const d = (e164 ?? '').replace(/\D/g, '');
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : (e164 ?? '');
}
export function toE164(display: string): string {
  const d = display.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d ? `+${d}` : '';
}
const looksLikePhone = (s?: string) => !!s && /^\+?[\d\s().-]{7,}$/.test(s);
const parseJSON = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
const tsMs = (v: unknown) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : typeof v === 'string' ? Date.parse(v) || Date.now() : Date.now());
const initialsOf = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

interface ConvMeta { contactId?: number; inboxId?: number; labels: string[]; customAttributes: Record<string, unknown>; tapbacks: Record<string, Tapback[]> }

export class ChatwootAdapter implements DataAdapter, SimulatorHooks {
  private session: ChatwootSession | null = null;
  private listeners = new Set<(e: AdapterEvent) => void>();
  private convs = new Map<string, Conversation>();
  private meta = new Map<string, ConvMeta>();
  private msgs = new Map<string, Message[]>();
  private msgConv = new Map<string, string>();
  private customers = new Map<string, { contact: Raw | null; customer: Customer; lookup?: SdLookup }>();
  private inboxId: number | null = null;
  private seen = new Set<string>();
  private cable: ChatwootCable | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;
  /** Called when the session is rejected (401). */
  onUnauthorized: () => void = () => {};

  constructor(private cfg: ChatwootConfig) {}

  // ---------- session / plumbing ----------
  setSession(s: ChatwootSession | null) {
    this.session = s;
    this.cable?.close(); this.cable = null;
    this.convs.clear(); this.meta.clear(); this.msgs.clear(); this.msgConv.clear(); this.customers.clear(); this.seen.clear();
    clearInterval(this.poll);
  }
  /** Idempotent: bind a session once per sign-in (safe to call on every render). */
  setSessionOnce(s: ChatwootSession, onUnauthorized: () => void) {
    this.onUnauthorized = onUnauthorized;
    if (this.session?.client === s.client && this.session.accessToken === s.accessToken) return;
    this.setSession(s);
  }
  get currentAgentId(): string | null { return this.session ? String(this.session.userId) : null; }
  get currentAgentName(): string { return this.session?.name ?? ''; }
  get realtime(): 'websocket' | 'polling' | 'off' { return this.cable?.connected ? 'websocket' : this.poll ? 'polling' : 'off'; }

  private acct(path: string) { return `${this.cfg.baseUrl}/api/v1/accounts/${this.session!.accountId}${path}`; }
  private async req<T = Raw>(method: string, url: string, body?: unknown): Promise<T> {
    if (!this.session) throw new Error('Not signed in');
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const r = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(this.session) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      credentials: 'omit',
    });
    if (r.status === 401) { clearSession(); this.onUnauthorized(); throw new Error('Session expired, please sign in again'); }
    if (!r.ok) {
      let msg = `${method} ${url.replace(this.cfg.baseUrl, '')} failed (${r.status})`;
      try { const j = await r.json(); msg = j.message ?? j.error ?? j.errors?.[0] ?? msg; } catch { /* ignore */ }
      throw new Error(String(msg));
    }
    const text = await r.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  private emit(e: AdapterEvent) { this.listeners.forEach((l) => l(e)); }

  subscribe(listener: (e: AdapterEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    this.startRealtime();
    return () => { this.listeners.delete(listener); };
  }

  // ---------- mapping ----------
  private mapMessage(m: Raw, convId?: string): Message {
    const cid = convId ?? String(m.conversation_id);
    const img = (m.attachments ?? []).find((a: Raw) => a.file_type === 'image');
    const statusMap: Record<string, MessageStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', progress: 'sending' };
    const out = m.message_type !== 0;
    const msg: Message = {
      id: String(m.id), conversationId: cid, direction: out ? 'out' : 'in', text: m.content ?? '', at: tsMs(m.created_at),
      status: out ? statusMap[m.status] ?? 'sent' : undefined,
      agentId: out && m.sender && (m.sender.type ?? m.sender_type ?? '').toLowerCase() === 'user' ? String(m.sender.id) : out && m.sender_type === 'User' ? String(m.sender_id) : undefined,
      attachment: img ? { kind: 'image', url: img.data_url, alt: img.file_name ?? 'Photo from customer' } : undefined,
      note: !!m.private,
      senderName: m.sender?.available_name ?? m.sender?.name,
    };
    if (msg.status === 'read') msg.readAt = tsMs(m.updated_at ?? m.created_at);
    const tbs = this.meta.get(cid)?.tapbacks[msg.id];
    if (tbs?.length) msg.meta = { tapbacks: tbs };
    this.msgConv.set(msg.id, cid);
    return msg;
  }

  private mapConversation(c: Raw): Conversation {
    const id = String(c.id);
    const prev = this.convs.get(id);
    const sender = c.meta?.sender ?? {};
    const custom = c.custom_attributes ?? this.meta.get(id)?.customAttributes ?? {};
    const labels: string[] = c.labels ?? this.meta.get(id)?.labels ?? [];
    this.meta.set(id, {
      contactId: sender.id ?? this.meta.get(id)?.contactId, inboxId: c.inbox_id ?? this.meta.get(id)?.inboxId,
      labels, customAttributes: custom, tapbacks: parseJSON<Record<string, Tapback[]>>(custom[TAPBACK_KEY], {}),
    });
    const lastRaw = c.last_non_activity_message ?? [...(c.messages ?? [])].reverse().find((m: Raw) => m.message_type !== 2 && !m.private);
    const last = lastRaw ? this.mapMessage(lastRaw, id) : prev?.lastMessage;
    const conv: Conversation = {
      id,
      phone: fmtPhone(sender.phone_number) || prev?.phone || `#${id}`,
      name: sender.name && !looksLikePhone(sender.name) ? sender.name : undefined,
      pinned: labels.includes(PIN_LABEL),
      unread: c.unread_count ?? prev?.unread ?? 0,
      status: c.status === 'resolved' ? 'resolved' : 'open',
      assigneeId: c.meta && 'assignee' in c.meta ? (c.meta.assignee?.id != null ? String(c.meta.assignee.id) : null) : prev?.assigneeId ?? null,
      lastMessage: last && (!prev?.lastMessage || last.at >= prev.lastMessage.at) ? last : prev?.lastMessage ?? last,
    };
    this.convs.set(id, conv);
    return conv;
  }

  private async refreshConv(id: string): Promise<Conversation> {
    const c = this.mapConversation(await this.req('GET', this.acct(`/conversations/${id}`)));
    this.emit({ type: 'conversation', conversation: c });
    return c;
  }

  // ---------- conversations / messages ----------
  async listAgents(): Promise<Agent[]> {
    const list: Raw[] = await this.req('GET', this.acct('/agents'));
    return list.map((a) => ({ id: String(a.id), name: a.available_name || a.name, initials: initialsOf(a.available_name || a.name) }));
  }

  async listConversations(): Promise<Conversation[]> {
    const out: Conversation[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await this.req('GET', this.acct(`/conversations?status=all&assignee_type=all&page=${page}`));
      const payload: Raw[] = r?.data?.payload ?? [];
      out.push(...payload.map((c) => this.mapConversation(c)));
      if (payload.length < 25) break;
    }
    return out.sort((a, b) => (b.lastMessage?.at ?? 0) - (a.lastMessage?.at ?? 0));
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    if (!this.meta.has(conversationId)) await this.refreshConv(conversationId).catch(() => undefined);
    const base = this.acct(`/conversations/${conversationId}/messages`);
    let batch: Raw[] = (await this.req('GET', base))?.payload ?? [];
    let all = [...batch];
    while (batch.length >= 20 && all.length < 200) {
      batch = (await this.req('GET', `${base}?before=${all[0].id}`))?.payload ?? [];
      all = [...batch, ...all];
    }
    const list = all.filter((m) => m.message_type !== 2).map((m) => this.mapMessage(m, conversationId));
    this.msgs.set(conversationId, list);
    return [...list];
  }

  private remember(m: Message) {
    const list = this.msgs.get(m.conversationId);
    if (!list) return true;
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) { list[i] = m; return false; }
    list.push(m);
    return true;
  }

  private async post(conversationId: string, text: string, priv: boolean): Promise<Message> {
    const raw = await this.req('POST', this.acct(`/conversations/${conversationId}/messages`), { content: text, message_type: 'outgoing', private: priv });
    const m = this.mapMessage(raw, conversationId);
    if (this.remember(m)) this.emit({ type: 'message', message: m });
    const c = this.convs.get(conversationId);
    if (c && !priv) {
      const next = { ...c, lastMessage: m, status: 'open' as const };
      this.convs.set(c.id, next);
      this.emit({ type: 'conversation', conversation: next });
    }
    return m;
  }
  sendMessage(conversationId: string, text: string, _agentId: string) { return this.post(conversationId, text, false); }
  /** Private note: visible to VIA agents only, never sent to the customer. */
  sendNote(conversationId: string, text: string) { return this.post(conversationId, text, true); }

  async markRead(conversationId: string): Promise<void> {
    const c = this.convs.get(conversationId);
    await this.req('POST', this.acct(`/conversations/${conversationId}/update_last_seen`));
    if (c?.unread) { const next = { ...c, unread: 0 }; this.convs.set(c.id, next); this.emit({ type: 'conversation', conversation: next }); }
  }

  async assign(conversationId: string, agentId: string | null): Promise<Conversation> {
    await this.req('POST', this.acct(`/conversations/${conversationId}/assignments`), { assignee_id: agentId ? Number(agentId) : null });
    return this.refreshConv(conversationId);
  }
  async setStatus(conversationId: string, status: 'open' | 'resolved'): Promise<Conversation> {
    await this.req('POST', this.acct(`/conversations/${conversationId}/toggle_status`), { status });
    return this.refreshConv(conversationId);
  }
  async togglePin(conversationId: string): Promise<Conversation> {
    const labels = this.meta.get(conversationId)?.labels ?? [];
    const next = labels.includes(PIN_LABEL) ? labels.filter((l) => l !== PIN_LABEL) : [...labels, PIN_LABEL];
    await this.req('POST', this.acct(`/conversations/${conversationId}/labels`), { labels: next });
    return this.refreshConv(conversationId);
  }
  async setTapback(messageId: string, tapback: Tapback | null): Promise<Message> {
    // VIA-only metadata stored on the conversation's custom attributes. Never sent over SMS.
    const cid = this.msgConv.get(messageId);
    if (!cid) throw new Error(`Unknown message ${messageId}`);
    const meta = this.meta.get(cid) ?? { labels: [], customAttributes: {}, tapbacks: {} };
    const tapbacks = { ...meta.tapbacks };
    if (tapback) tapbacks[messageId] = [tapback]; else delete tapbacks[messageId];
    const custom = { ...meta.customAttributes, [TAPBACK_KEY]: JSON.stringify(tapbacks) };
    await this.req('POST', this.acct(`/conversations/${cid}/custom_attributes`), { custom_attributes: custom });
    this.meta.set(cid, { ...meta, customAttributes: custom, tapbacks });
    const cur = this.msgs.get(cid)?.find((m) => m.id === messageId);
    const next: Message = { ...(cur ?? { id: messageId, conversationId: cid, direction: 'in', text: '', at: Date.now() }), meta: { tapbacks: tapback ? [tapback] : [] } };
    this.remember(next);
    this.emit({ type: 'message-updated', message: next });
    return next;
  }

  // ---------- customer context: ServiceDesk (appointments only) ----------
  // Live: same-origin GET /api/sd/customer?phone=<10 digits>, answered by a server-side proxy that
  // validates this agent's Chatwoot session and holds a read-only credential (not built yet; returns 501).
  // Until then: demo fixtures in the same shape, stored on the Chatwoot contact
  // (custom attribute sd_demo_json) and clearly labelled DEMO in the panel.
  private async findContact(phone: string): Promise<Raw | null> {
    const e164 = toE164(phone);
    if (!e164) return null;
    const r = await this.req('GET', this.acct(`/contacts/search?q=${encodeURIComponent(e164.replace('+', ''))}&include_contacts=true`));
    return (r?.payload ?? []).find((c: Raw) => (c.phone_number ?? '') === e164) ?? null;
  }
  private sdDownUntil = 0;
  private async sdProxy<T>(path: string): Promise<T | null> {
    if (!this.session || Date.now() < this.sdDownUntil) return null;
    try {
      const r = await fetch(`${this.cfg.baseUrl}/api/sd${path}`, { headers: { Accept: 'application/json', ...authHeaders(this.session) }, credentials: 'omit' });
      if (r.status === 501 || r.status === 404) { this.sdDownUntil = Date.now() + 5 * 60_000; return null; } // proxy not connected yet; re-check in 5 min
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch { return null; }
  }
  async getServiceDesk(phone: string): Promise<SdLookup> {
    const p10 = phone10(phone);
    const live = p10 ? await this.sdProxy<SdLookup>(`/customer?phone=${p10}`) : null;
    if (live) return { ...live, source: 'servicedesk' };
    const contact = await this.findContact(phone).catch(() => null);
    const fx = parseJSON<{ zip?: string; appointments?: SdRawAppointment[] }>(contact?.custom_attributes?.sd_demo_json, {});
    const zip = fx.zip ?? fx.appointments?.at(-1)?.zip;
    const lookup = deriveLookup(fx.appointments ?? [], zip ? demoRouting(zip) : undefined);
    lookup.synced_at = demoSyncedAt();
    const entry = this.customers.get(phone);
    this.customers.set(phone, { contact, customer: entry?.customer ?? this.toCustomer(phone, contact, lookup), lookup });
    return lookup;
  }
  async getRouting(zip: string): Promise<SdRouting | null> {
    if (!/^\d{5}$/.test(zip)) return null;
    return (await this.sdProxy<SdRouting>(`/availability?zip=${zip}`)) ?? demoRouting(zip);
  }
  private toCustomer(phone: string, contact: Raw | null, l: SdLookup): Customer {
    const a = l.appointments.at(-1);
    return {
      phone, name: contact?.name && !looksLikePhone(contact.name) ? contact.name : a?.customer_full_name ?? '',
      address: '', city: a?.city ?? '', zip: a?.zip ?? '', zone: l.routing?.zone ?? 'Unknown', isNew: !l.found,
      openJobs: [], pastJobs: [], sealedSystemHistory: null, urgency: [],
    };
  }
  async getCustomer(phone: string): Promise<Customer | null> {
    const l = await this.getServiceDesk(phone).catch(() => null);
    return l ? this.customers.get(phone)?.customer ?? null : null;
  }
  async getAvailability(zip: string): Promise<Slot[]> {
    // Legacy slot shape for the old panel. The SD panel uses getRouting() instead.
    const r = await this.getRouting(zip);
    return (r?.days ?? []).filter((d) => d.bookable).flatMap((d) => (['morning', 'afternoon'] as const).map((w) => ({ date: d.date, window: w, label: w, room: d.room ? 1 : 0 })));
  }
  async bookAppointment(b: Booking): Promise<{ callsheetId: string }> {
    // DEMO ONLY. Real callsheets create real jobs for dispatch and are not enabled from VIA Chat,
    // so this only records a private note + updates the demo fixture.
    const callsheetId = 'DEMO-' + Math.floor(100000 + Math.random() * 900000);
    const conv = this.convs.get(b.conversationId);
    await this.sendNote(b.conversationId, `📅 Demo callsheet ${callsheetId} (NOT sent to ServiceDesk): ${b.appliance}${b.issue ? ' — ' + b.issue : ''} · ${b.date} ${b.window} · dispatch sets the 3-hour window the day before`);
    if (conv) {
      const contact = this.customers.get(conv.phone)?.contact ?? (await this.findContact(conv.phone));
      if (contact) {
        const a = contact.custom_attributes ?? {};
        const fx = parseJSON<{ zip?: string; appointments?: SdRawAppointment[] }>(a.sd_demo_json, {});
        const prev = fx.appointments?.at(-1);
        const appt: SdRawAppointment = {
          invoice: callsheetId, name: prev?.name ?? (contact.name ? contact.name.toUpperCase().split(' ').reverse().join(', ') : 'NEW, CUSTOMER'),
          date: b.date, window: `${md(b.date)} ${dow(b.date).toUpperCase()} ${b.window === 'morning' ? 'AM' : 'PM'}`, tech: 'OF',
          machine: b.appliance.toUpperCase(), city: prev?.city ?? '', zip: fx.zip ?? prev?.zip ?? '',
        };
        const custom = { ...a, sd_demo_json: JSON.stringify({ ...fx, appointments: [...(fx.appointments ?? []), appt] }) };
        await this.req('PUT', this.acct(`/contacts/${contact.id}`), { custom_attributes: custom });
        this.customers.delete(conv.phone);
      }
    }
    return { callsheetId };
  }

  // ---------- saved replies ----------
  private async profile(): Promise<Raw> { return this.req('GET', `${this.cfg.baseUrl}/api/v1/profile`); }
  private async personal(): Promise<SavedReply[]> {
    const p = await this.profile();
    return parseJSON<SavedReply[]>(p?.ui_settings?.[PERSONAL_KEY], []);
  }
  private async savePersonal(list: SavedReply[]) {
    const p = await this.profile(); // merge into the latest ui_settings so we never clobber Chatwoot's own keys
    await this.req('PUT', `${this.cfg.baseUrl}/api/v1/profile`, { profile: { ui_settings: { ...(p?.ui_settings ?? {}), [PERSONAL_KEY]: JSON.stringify(list) } } });
  }
  async listSavedReplies(agentId: string): Promise<SavedReply[]> {
    const [mine, team] = await Promise.all([
      agentId === this.currentAgentId ? this.personal() : Promise.resolve([]),
      this.req<Raw[]>('GET', this.acct('/canned_responses')),
    ]);
    return [...mine, ...(team ?? []).map((t) => ({ id: `cr-${t.id}`, title: t.short_code, body: t.content, scope: 'team' as const }))];
  }
  async createSavedReply(r: Omit<SavedReply, 'id'>): Promise<SavedReply> {
    if (r.scope !== 'personal') {
      const t = await this.req('POST', this.acct('/canned_responses'), { short_code: r.title, content: r.body });
      return { id: `cr-${t.id}`, title: t.short_code, body: t.content, scope: 'team' };
    }
    const list = await this.personal();
    const created: SavedReply = { ...r, agentId: this.currentAgentId ?? r.agentId, id: `p-${Date.now().toString(36)}` };
    await this.savePersonal([...list, created]);
    return created;
  }
  async updateSavedReply(r: SavedReply): Promise<SavedReply> {
    if (r.id.startsWith('cr-')) {
      await this.req('PATCH', this.acct(`/canned_responses/${r.id.slice(3)}`), { short_code: r.title, content: r.body });
      return r;
    }
    const list = await this.personal();
    await this.savePersonal(list.map((x) => (x.id === r.id ? r : x)));
    return r;
  }
  async deleteSavedReply(id: string): Promise<void> {
    if (id.startsWith('cr-')) { await this.req('DELETE', this.acct(`/canned_responses/${id.slice(3)}`)); return; }
    const list = await this.personal();
    await this.savePersonal(list.filter((x) => x.id !== id));
  }

  // ---------- AI draft (template stand-in until POST /api/draft exists) ----------
  async draftReply(conversationId: string): Promise<Draft | null> {
    const c = this.convs.get(conversationId);
    const msgs = (this.msgs.get(conversationId) ?? []).filter((m) => !m.note);
    if (!msgs.length) return null;
    const text = sdDraft(c ? this.customers.get(c.phone)?.lookup ?? null : null, msgs);
    return text ? { text, source: 'ai-template' } : null;
  }

  // ---------- realtime ----------
  private startRealtime() {
    if (!this.session || this.cable) return;
    const s = this.session;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = this.cfg.baseUrl ? this.cfg.baseUrl.replace(/^http/, 'ws') + '/cable' : `${proto}//${location.host}/cable`;
    this.cable = new ChatwootCable(url, { pubsub_token: s.pubsubToken, account_id: s.accountId, user_id: s.userId },
      (event, data) => { void this.onCable(event, data); },
      (connected, reconnected) => {
        if (connected) { clearInterval(this.poll); this.poll = undefined; if (reconnected) void this.resync(); }
        else this.startPolling();
      });
    this.cable.open();
    // If the socket can't connect within a few seconds, fall back to polling.
    setTimeout(() => { if (!this.cable?.connected) this.startPolling(); }, 6000);
  }
  private startPolling() {
    if (this.poll || !this.session) return;
    this.poll = setInterval(() => { void this.resync(); }, POLL_MS);
  }
  /** Refetch conversations; pull new messages for any thread we have loaded. */
  private async resync() {
    const before = new Map([...this.convs].map(([k, v]) => [k, v.lastMessage?.id]));
    const list = await this.listConversations().catch(() => [] as Conversation[]);
    for (const c of list) {
      this.emit({ type: 'conversation', conversation: c });
      if (before.get(c.id) !== c.lastMessage?.id && this.msgs.has(c.id)) {
        const known = new Set((this.msgs.get(c.id) ?? []).map((m) => m.id));
        const fresh = await this.getMessages(c.id).catch(() => [] as Message[]);
        fresh.filter((m) => !known.has(m.id)).forEach((m) => this.emit({ type: 'message', message: m }));
      }
    }
  }
  private async onCable(event: string, data: Raw) {
    switch (event) {
      case 'message.created':
      case 'message.updated': {
        if (data.message_type === 2) { if (data.conversation_id) void this.refreshConv(String(data.conversation_id)).catch(() => undefined); return; }
        const m = this.mapMessage(data, String(data.conversation_id));
        const isNew = this.remember(m);
        this.emit({ type: isNew && event === 'message.created' ? 'message' : 'message-updated', message: m });
        const c = this.convs.get(m.conversationId);
        if (!c) { void this.refreshConv(m.conversationId).catch(() => undefined); return; }
        if (event === 'message.created' && !m.note) {
          const unread = data.conversation?.unread_count ?? (m.direction === 'in' ? c.unread + 1 : c.unread);
          const next = { ...c, lastMessage: m, unread, status: m.direction === 'in' ? 'open' as const : c.status };
          this.convs.set(c.id, next);
          this.emit({ type: 'conversation', conversation: next });
        } else if (c.lastMessage?.id === m.id) {
          const next = { ...c, lastMessage: m };
          this.convs.set(c.id, next);
          this.emit({ type: 'conversation', conversation: next });
        }
        return;
      }
      case 'conversation.created':
      case 'conversation.updated':
      case 'conversation.status_changed':
      case 'conversation.read':
      case 'conversation.contact_changed':
      case 'assignee.changed':
      case 'team.changed': {
        if (data?.id == null) return;
        const prevTb = JSON.stringify(this.meta.get(String(data.id))?.tapbacks ?? {});
        const c = this.mapConversation(data);
        this.emit({ type: 'conversation', conversation: c });
        if (JSON.stringify(this.meta.get(c.id)?.tapbacks ?? {}) !== prevTb) {
          const tb = this.meta.get(c.id)!.tapbacks;
          for (const m of this.msgs.get(c.id) ?? []) {
            const want = tb[m.id] ?? [];
            if (JSON.stringify(m.meta?.tapbacks ?? []) !== JSON.stringify(want)) {
              const next = { ...m, meta: { tapbacks: want } };
              this.remember(next);
              this.emit({ type: 'message-updated', message: next });
            }
          }
        }
        return;
      }
      case 'conversation.typing_on':
      case 'conversation.typing_off': {
        const cid = data?.conversation?.id;
        if (cid == null || (data.user?.type ?? '').toLowerCase() !== 'contact') return;
        this.emit({ type: 'typing', conversationId: String(cid), typing: event === 'conversation.typing_on' });
        return;
      }
      default:
    }
  }

  // ---------- customer-phone simulator (demo) ----------
  // Posts messages into the API inbox as the CONTACT (message_type "incoming"),
  // which is exactly what the Twilio SMS channel will do once it is connected.
  private convForPhone(phone: string): Conversation | undefined {
    const all = [...this.convs.values()].filter((c) => c.phone === phone);
    return all.find((c) => c.status === 'open') ?? all.sort((a, b) => (b.lastMessage?.at ?? 0) - (a.lastMessage?.at ?? 0))[0];
  }
  private async smsInboxId(): Promise<number> {
    if (this.inboxId) return this.inboxId;
    const r = await this.req('GET', this.acct('/inboxes'));
    const list: Raw[] = r?.payload ?? [];
    const inbox = list.find((i) => i.name === this.cfg.inboxName) ?? list.find((i) => i.channel_type === 'Channel::Api');
    if (!inbox) throw new Error(`Inbox "${this.cfg.inboxName}" not found`);
    this.inboxId = inbox.id as number;
    return this.inboxId;
  }
  private async ensureConversation(phone: string): Promise<string> {
    const existing = this.convForPhone(phone);
    if (existing) return existing.id;
    const inboxId = await this.smsInboxId();
    const e164 = toE164(phone);
    let contact = await this.findContact(phone);
    let sourceId: string | undefined;
    if (!contact) {
      const r = await this.req('POST', this.acct('/contacts'), { phone_number: e164, inbox_id: inboxId });
      contact = r?.payload?.contact ?? r?.payload ?? r;
      sourceId = r?.payload?.contact_inbox?.source_id;
    }
    if (!sourceId) {
      const ci = await this.req('POST', this.acct(`/contacts/${contact.id}/contact_inboxes`), { inbox_id: inboxId });
      sourceId = ci?.source_id;
    }
    const conv = await this.req('POST', this.acct('/conversations'), { source_id: sourceId, inbox_id: inboxId, contact_id: contact.id, status: 'open' });
    const c = this.mapConversation(conv);
    this.emit({ type: 'conversation', conversation: c });
    return c.id;
  }
  async simulateInbound(phone: string, text: string, attachment?: Message['attachment']): Promise<Message> {
    const cid = await this.ensureConversation(phone);
    let body: unknown = { content: text, message_type: 'incoming' };
    if (attachment) {
      const fd = new FormData();
      if (text) fd.append('content', text);
      fd.append('message_type', 'incoming');
      fd.append('attachments[]', await svgToPng(attachment.url), 'photo.png');
      body = fd;
    }
    const raw = await this.req('POST', this.acct(`/conversations/${cid}/messages`), body);
    const m = this.mapMessage(raw, cid);
    this.emit({ type: 'typing', conversationId: cid, typing: false });
    if (this.remember(m)) this.emit({ type: 'message', message: m });
    return m;
  }
  simulateTyping(phone: string, typing: boolean) {
    const c = this.convForPhone(phone);
    if (c) this.emit({ type: 'typing', conversationId: c.id, typing });
  }
  async getMessagesForPhone(phone: string): Promise<Message[]> {
    const c = this.convForPhone(phone);
    if (!c) return [];
    const list = this.msgs.get(c.id) ?? (await this.getMessages(c.id));
    return list.filter((m) => !m.note);
  }
  /** The pretend phone "receives" and reads our texts: mark them delivered/read (as Twilio status callbacks will). */
  async simulateSeen(phone: string): Promise<void> {
    const c = this.convForPhone(phone);
    if (!c) return;
    const pending = (this.msgs.get(c.id) ?? []).filter((m) => m.direction === 'out' && !m.note && (m.status === 'sent' || m.status === 'delivered'));
    for (const m of pending.slice(-5)) {
      if (this.seen.has(m.id)) continue;
      this.seen.add(m.id);
      await this.req('PATCH', this.acct(`/conversations/${c.id}/messages/${m.id}`), { status: 'read' }).catch(() => undefined);
    }
  }
}

async function svgToPng(url: string): Promise<Blob> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 480; canvas.height = img.naturalHeight || 360;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not render photo'))), 'image/png'));
}
