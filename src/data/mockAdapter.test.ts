import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter } from './mockAdapter';
import type { AdapterEvent } from './types';

const mem = () => { const s = new Map<string, string>(); return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v) }; };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('MockAdapter', () => {
  let a: MockAdapter;
  beforeEach(() => { a = new MockAdapter({ timeScale: 0, autoReplies: false, storage: mem() }); });

  it('seeds about a dozen conversations, newest first', async () => {
    const list = await a.listConversations();
    expect(list.length).toBe(12);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].lastMessage!.at).toBeGreaterThanOrEqual(list[i].lastMessage!.at);
    expect(list.some((c) => c.handoff)).toBe(true);
  });

  it('sends a message and emits delivery then read receipts', async () => {
    const events: AdapterEvent[] = [];
    a.subscribe((e) => events.push(e));
    const m = await a.sendMessage('c1', 'Hello', 'a-jamie');
    expect(m.status).toBe('sent');
    await tick(20);
    const statuses = events.filter((e) => e.type === 'message-updated').map((e) => (e as { message: { status?: string } }).message.status);
    expect(statuses).toEqual(['delivered', 'read']);
    const msgs = await a.getMessages('c1');
    expect(msgs.at(-1)!.status).toBe('read');
  });

  it('simulated inbound increments unread; markRead clears it', async () => {
    const before = (await a.listConversations()).find((c) => c.id === 'c3')!;
    await a.simulateInbound(before.phone, 'Is the part in?');
    expect((await a.listConversations()).find((c) => c.id === 'c3')!.unread).toBe(1);
    await a.markRead('c3');
    expect((await a.listConversations()).find((c) => c.id === 'c3')!.unread).toBe(0);
  });

  it('creates a new conversation for an unknown number', async () => {
    await a.simulateInbound('(410) 555-0199', 'Hi do you fix ice makers?');
    const c = (await a.listConversations()).find((x) => x.phone === '(410) 555-0199');
    expect(c).toBeTruthy();
    expect((await a.getCustomer('(410) 555-0199'))!.isNew).toBe(true);
  });

  it('keeps saved replies per agent and persists them', async () => {
    const storage = mem();
    const b = new MockAdapter({ timeScale: 0, storage });
    const r = await b.createSavedReply({ scope: 'personal', agentId: 'a-alex', title: 'T', body: 'B' });
    expect((await b.listSavedReplies('a-alex')).some((x) => x.id === r.id)).toBe(true);
    expect((await b.listSavedReplies('a-jamie')).some((x) => x.id === r.id)).toBe(false);
    const c = new MockAdapter({ timeScale: 0, storage });
    expect((await c.listSavedReplies('a-alex')).some((x) => x.id === r.id)).toBe(true);
    await c.deleteSavedReply(r.id);
    expect((await c.listSavedReplies('a-alex')).some((x) => x.id === r.id)).toBe(false);
  });

  it('drafts a context-aware reply but never sends it', async () => {
    const before = (await a.getMessages('c1')).length;
    const d = await a.draftReply('c1');
    expect(d!.text).toMatch(/Thursday morning/);
    expect((await a.getMessages('c1')).length).toBe(before);
  });

  it('stores tapbacks as metadata', async () => {
    const m = (await a.getMessages('c1'))[0];
    const u = await a.setTapback(m.id, 'heart');
    expect(u.meta?.tapbacks).toEqual(['heart']);
  });

  it('returns morning and afternoon slots for a ZIP', async () => {
    const s = await a.getAvailability('21146');
    expect(s.filter((x) => x.window === 'morning').length).toBe(4);
    expect(s.filter((x) => x.window === 'afternoon').length).toBe(4);
  });
});
