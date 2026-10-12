/**
 * SMS consent (TCPA / CTIA / 10DLC-style opt-in tracking). Real backend only: same-origin /api/consent/*
 * (infra/consent), authenticated with the agent's own Chatwoot session headers. The server is the source of
 * truth and ALSO enforces the verdict on every send (Caddy routes Chatwoot's message-create through it), so
 * the UI here only explains and helps; it can't be used to get around a block.
 */
import { authHeaders, loadSession } from './chatwootSession';
import { BACKEND, CHATWOOT_BASE } from '../store';

export type ConsentStatus = 'opted_in' | 'implied' | 'opted_out' | 'unknown' | 'review';
export type ConsentSource = 'inbound_text' | 'web_form' | 'phone_call_ray' | 'verbal_agent' | 'booking' | 'import' | 'keyword' | 'twilio' | 'manager_correction';
export interface Decision {
  allowed: boolean; level: 'ok' | 'warn' | 'block'; code: string; message: string | null; scope: string;
  needs_disclosure: boolean; disclosure_mode?: 'append' | 'off'; disclosure_text?: string | null; can_override_urgent?: boolean;
  quiet: { tz: string; quiet: boolean; local_time: string; window: string };
}
export interface ConsentEvent {
  id: number; type: 'opt_in' | 'opt_out' | 're_opt_in' | 'help'; scope: string; source: ConsentSource; keyword: string | null;
  occurred_at: string; recorded_at: string; actor_type: string; actor_name: string | null; note: string | null;
  evidence: Record<string, unknown>; disclosure_version: string | null; disclosure_text: string | null; ip: string | null; demo: boolean;
}
export interface ConsentCheck {
  phone: string; enforced: boolean; status: ConsentStatus; decision: Decision; first_inbound_at: string | null; last_inbound_at: string | null;
  derived: { conversational: string; marketing: string; since: string | null; basis: { source: string; type: string; keyword?: string; occurred_at: string } | null;
    last_opt_out: { occurred_at: string; source: string; keyword: string | null } | null; open_reviews: { id: number; excerpt: string; created_at: string }[] };
  events?: ConsentEvent[];
  reviews?: { id: number; excerpt: string; created_at: string; resolved_at: string | null; resolution: string | null; resolved_by_name: string | null; note: string | null }[];
  disclosures?: { sent_at: string; version: string; conversation_display_id: number | null }[];
  disclosure_current?: { text: string; version: string };
}

export const consentEnabled = BACKEND === 'chatwoot';

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const s = loadSession();
  if (!s) throw new Error('Not signed in');
  const r = await fetch(`${CHATWOOT_BASE}/api/consent${path}`, {
    method, credentials: 'omit',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(s) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `Consent service error (${r.status})`), { status: r.status, code: j.error });
  return j as T;
}

export const checkConsent = (conversationId: string, opts: { urgent?: boolean } = {}) => call<ConsentCheck>('/check', { conversation_id: Number(conversationId), ...opts });
export const consentHistory = (conversationId: string) => call<ConsentCheck>('/history', { conversation_id: Number(conversationId) });
export const recordConsent = (conversationId: string, input: { type: 'opt_in' | 'opt_out'; source: string; note: string; occurred_at?: string; scope?: 'conversational' | 'marketing'; evidence?: Record<string, string> }) =>
  call<{ id: number; status: ConsentStatus }>('/record', { conversation_id: Number(conversationId), ...input });
export const resolveReview = (reviewId: number, resolution: 'opt_out' | 'not_opt_out', note: string) => call('/review', { review_id: reviewId, resolution, note });

/** Tiny bus so the header pill, panel and composer refresh together after a change. */
const subs = new Set<() => void>();
export const onConsentChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const consentChanged = () => subs.forEach((f) => f());

export const STATUS_LABEL: Record<ConsentStatus, string> = {
  opted_in: 'Opted in', implied: 'Implied (texted first)', opted_out: 'Opted out', unknown: 'Unknown', review: 'Needs review',
};
export const STATUS_HINT: Record<ConsentStatus, string> = {
  opted_in: 'Consent to text is on file. See history for how and when.',
  implied: 'The customer texted VIA first, which covers conversational replies (not marketing).',
  opted_out: 'The customer opted out. Texting is blocked until they text START.',
  unknown: 'No consent on file and the customer hasn’t texted VIA. Record consent before the first text.',
  review: 'The customer wrote something that may mean “stop texting”. Review it before sending.',
};
export const SOURCE_LABEL: Record<string, string> = {
  inbound_text: 'Customer texted first', web_form: 'Website form', phone_call_ray: 'Phone call (Ray)', verbal_agent: 'Verbal, to an agent',
  booking: 'Booking form', import: 'Import', keyword: 'Text keyword', twilio: 'Twilio (carrier)', manager_correction: 'Manager correction',
};
export const TYPE_LABEL: Record<string, string> = { opt_in: 'Opted in', opt_out: 'Opted out', re_opt_in: 'Opted back in', help: 'Asked for HELP' };
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
