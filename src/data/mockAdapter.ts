import type { DataAdapter, SimulatorHooks, Unsubscribe } from './adapter';
import type {
  AdapterEvent, Agent, Booking, Conversation, Customer, Draft, Message, SavedReply, Slot, Tapback,
} from './types';
import { AGENTS, DEFAULT_PERSONAL, TEAM_REPLIES, buildSeed, isoDay } from './seed';
import { templateDraft } from './draft';

export interface MockOptions {
  /** Multiplier for all simulated delays (0 = instant, useful in tests). */
  timeScale?: number;
  /** Customers occasionally text back after reading. */
  autoReplies?: boolean;
  /** Where saved replies persist. Pass null for in-memory only. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: number;
}

const STORAGE_KEY = 'via-chat.saved-replies.v1';
const AUTO_REPLIES = ['Ok thank you!', 'Sounds good 👍', 'Great, appreciate it.', 'Perfect, thanks!'];

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export class MockAdapter implements DataAdapter, SimulatorHooks {
  private listeners = new Set<(e: AdapterEvent) => void>();
  private customers: Map<string, Customer>;
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message[]>;
  private personal: Record<string, SavedReply[]>;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private opts: Required<Omit<MockOptions, 'storage' | 'now'>> & { storage: MockOptions['storage'] };

  constructor(opts: MockOptions = {}) {
    this.opts = {
      timeScale: opts.timeScale ?? 1,
      autoReplies: opts.autoReplies ?? true,
      storage: opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage,
    };
    const seed = buildSeed(opts.now);
    this.customers = seed.customers;
    this.conversations = seed.conversations;
    this.messages = seed.messages;
    this.personal = this.loadPersonal();
  }

  // ---------- plumbing ----------
  private emit(e: AdapterEvent) { this.listeners.forEach((l) => l(e)); }
  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms * this.opts.timeScale);
    this.timers.add(t);
  }
  dispose() { this.timers.forEach(clearTimeout); this.timers.clear(); this.listeners.clear(); }
  subscribe(listener: (e: AdapterEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private conv(id: string) {
    const c = this.conversations.get(id);
    if (!c) throw new Error(`Unknown conversation ${id}`);
    return c;
  }
  private patchConv(id: string, patch: Partial<Conversation>) {
    const c = { ...this.conv(id), ...patch };
    this.conversations.set(id, c);
    this.emit({ type: 'conversation', conversation: c });
    return c;
  }
  private updateMsg(m: Message, patch: Partial<Message>) {
    const list = this.messages.get(m.conversationId)!;
    const i = list.findIndex((x) => x.id === m.id);
    const next = { ...list[i], ...patch };
    list[i] = next;
    this.emit({ type: 'message-updated', message: next });
    const c = this.conv(m.conversationId);
    if (c.lastMessage?.id === m.id) this.patchConv(c.id, { lastMessage: next });
    return next;
  }

  // ---------- conversations / messages ----------
  async listAgents(): Promise<Agent[]> { return AGENTS; }
  async listConversations(): Promise<Conversation[]> {
    return [...this.conversations.values()].sort((a, b) => (b.lastMessage?.at ?? 0) - (a.lastMessage?.at ?? 0));
  }
  async getMessages(conversationId: string): Promise<Message[]> {
    return [...(this.messages.get(conversationId) ?? [])];
  }
  async sendMessage(conversationId: string, text: string, agentId: string): Promise<Message> {
    const c = this.conv(conversationId);
    const m: Message = { id: uid('m'), conversationId, direction: 'out', text, at: Date.now(), status: 'sent', agentId };
    this.messages.get(conversationId)!.push(m);
    this.emit({ type: 'message', message: m });
    this.patchConv(conversationId, { lastMessage: m, status: 'open', assigneeId: c.assigneeId ?? agentId });
    // simulated delivery receipt -> read receipt -> maybe a reply
    this.later(700, () => {
      this.updateMsg(m, { status: 'delivered' });
      this.later(1800 + Math.random() * 1500, () => {
        this.updateMsg(m, { status: 'read', readAt: Date.now() });
        if (this.opts.autoReplies && Math.random() < 0.35) {
          this.later(800, () => {
            this.emit({ type: 'typing', conversationId, typing: true });
            this.later(2200, () => {
              this.emit({ type: 'typing', conversationId, typing: false });
              void this.inbound(conversationId, AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)]);
            });
          });
        }
      });
    });
    return m;
  }
  async markRead(conversationId: string): Promise<void> {
    if (this.conv(conversationId).unread) this.patchConv(conversationId, { unread: 0 });
  }
  async assign(conversationId: string, agentId: string | null) { return this.patchConv(conversationId, { assigneeId: agentId }); }
  async setStatus(conversationId: string, status: 'open' | 'resolved') { return this.patchConv(conversationId, { status }); }
  async togglePin(conversationId: string) { return this.patchConv(conversationId, { pinned: !this.conv(conversationId).pinned }); }
  async setTapback(messageId: string, tapback: Tapback | null): Promise<Message> {
    // VIA-only metadata. NOT sent over SMS — the customer never sees tapbacks.
    for (const list of this.messages.values()) {
      const m = list.find((x) => x.id === messageId);
      if (m) return this.updateMsg(m, { meta: { ...m.meta, tapbacks: tapback ? [tapback] : [] } });
    }
    throw new Error(`Unknown message ${messageId}`);
  }

  private async inbound(conversationId: string, text: string, attachment?: Message['attachment']) {
    const c = this.conv(conversationId);
    const m: Message = { id: uid('m'), conversationId, direction: 'in', text, at: Date.now(), attachment };
    this.messages.get(conversationId)!.push(m);
    this.emit({ type: 'message', message: m });
    this.patchConv(conversationId, { lastMessage: m, unread: c.unread + 1, status: 'open' });
    return m;
  }

  // ---------- simulator hooks ----------
  private convForPhone(phone: string): Conversation {
    const found = [...this.conversations.values()].find((c) => c.phone === phone);
    if (found) return found;
    const id = uid('c');
    const c: Conversation = { id, phone, pinned: false, unread: 0, status: 'open', assigneeId: null };
    this.conversations.set(id, c);
    this.messages.set(id, []);
    if (!this.customers.has(phone)) {
      this.customers.set(phone, { phone, name: '', address: '', city: '', zip: '', zone: 'Unknown', isNew: true, openJobs: [], pastJobs: [], sealedSystemHistory: null, urgency: ['New customer'] });
    }
    this.emit({ type: 'conversation', conversation: c });
    return c;
  }
  async simulateInbound(phone: string, text: string, attachment?: Message['attachment']) {
    const c = this.convForPhone(phone);
    this.emit({ type: 'typing', conversationId: c.id, typing: false });
    return this.inbound(c.id, text, attachment);
  }
  simulateTyping(phone: string, typing: boolean) {
    const c = [...this.conversations.values()].find((x) => x.phone === phone);
    if (c) this.emit({ type: 'typing', conversationId: c.id, typing });
  }
  /** For the simulator: the thread as seen from the customer's phone. */
  async getMessagesForPhone(phone: string): Promise<Message[]> {
    const c = [...this.conversations.values()].find((x) => x.phone === phone);
    return c ? this.getMessages(c.id) : [];
  }

  // ---------- customer context ----------
  async getCustomer(phone: string) { return this.customers.get(phone) ?? null; }
  async getAvailability(zip: string): Promise<Slot[]> {
    // deterministic pseudo-availability per ZIP
    const n = [...zip].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const slots: Slot[] = [];
    for (let d = 1; slots.length < 8; d++) {
      const date = isoDay(d);
      if (new Date(date + 'T12:00:00').getDay() === 0 || slots.some((s) => s.date === date)) continue;
      slots.push({ date, window: 'morning', label: '8–12', room: (n + d * 3) % 5 });
      slots.push({ date, window: 'afternoon', label: '12–5', room: (n + d * 7) % 4 });
    }
    return slots;
  }
  async bookAppointment(b: Booking) {
    const c = this.conv(b.conversationId);
    const cust = this.customers.get(c.phone);
    const callsheetId = 'CS-' + Math.floor(100000 + Math.random() * 900000);
    if (cust) {
      const job = { id: callsheetId, appliance: b.appliance, brand: 'Brand/model TBD', model: '', issue: b.issue, date: b.date, status: 'scheduled' as const };
      this.customers.set(c.phone, { ...cust, openJobs: [...cust.openJobs, job], nextAppointment: { date: b.date, window: b.window } });
    }
    return { callsheetId };
  }

  // ---------- saved replies ----------
  private loadPersonal(): Record<string, SavedReply[]> {
    try {
      const raw = this.opts.storage?.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt storage */ }
    return structuredClone(DEFAULT_PERSONAL);
  }
  private savePersonal() { this.opts.storage?.setItem(STORAGE_KEY, JSON.stringify(this.personal)); }
  async listSavedReplies(agentId: string): Promise<SavedReply[]> {
    return [...(this.personal[agentId] ?? []), ...TEAM_REPLIES];
  }
  async createSavedReply(r: Omit<SavedReply, 'id'>): Promise<SavedReply> {
    if (r.scope !== 'personal' || !r.agentId) throw new Error('Only personal replies are editable in the demo');
    const created = { ...r, id: uid('p') };
    (this.personal[r.agentId] ??= []).push(created);
    this.savePersonal();
    return created;
  }
  async updateSavedReply(r: SavedReply): Promise<SavedReply> {
    const list = this.personal[r.agentId ?? ''] ?? [];
    const i = list.findIndex((x) => x.id === r.id);
    if (i < 0) throw new Error('Not found');
    list[i] = r;
    this.savePersonal();
    return r;
  }
  async deleteSavedReply(id: string): Promise<void> {
    for (const k of Object.keys(this.personal)) this.personal[k] = this.personal[k].filter((x) => x.id !== id);
    this.savePersonal();
  }

  // ---------- AI draft (template stand-in) ----------
  async draftReply(conversationId: string): Promise<Draft | null> {
    const c = this.conv(conversationId);
    const text = templateDraft(this.customers.get(c.phone) ?? null, this.messages.get(conversationId) ?? []);
    return text ? { text, source: 'ai-template' } : null;
  }
}
