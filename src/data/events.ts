/**
 * Lightweight UI usage events (AI suggestion shown/used/edited/dismissed/sent, Send ETA, Offer a day,
 * Book) for the manager dashboard. Real backend only: POST /api/via-events (same origin, the agent's
 * Chatwoot session headers). Metadata is limited to enums/numbers: never message text or phone numbers.
 * Fire-and-forget, batched; failures are ignored so the inbox never depends on analytics.
 */
import { authHeaders, loadSession } from './chatwootSession';
import { BACKEND, CHATWOOT_BASE } from '../store';

export type UiEventType =
  | 'ai_suggestion_shown' | 'ai_suggestion_used' | 'ai_suggestion_edited' | 'ai_suggestion_dismissed' | 'ai_suggestion_sent'
  | 'quick_eta' | 'quick_offer_day' | 'quick_book';

let queue: { type: UiEventType; conversation_id?: number; meta?: Record<string, unknown> }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function track(type: UiEventType, conversationId?: string, meta?: Record<string, string | number | boolean>) {
  if (BACKEND !== 'chatwoot') return;
  const cid = Number(conversationId);
  queue.push({ type, conversation_id: Number.isInteger(cid) ? cid : undefined, meta });
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

function flush() {
  const s = loadSession();
  const events = queue.splice(0, 20);
  if (!s || !events.length) return;
  fetch(`${CHATWOOT_BASE}/api/via-events`, {
    method: 'POST', credentials: 'omit', keepalive: true,
    headers: { 'Content-Type': 'application/json', ...authHeaders(s) },
    body: JSON.stringify({ events }),
  }).catch(() => undefined);
  if (queue.length) timer = setTimeout(flush, 500);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

/** Is the signed-in user allowed into /via/manage? Server decides (403 for agents). */
export async function checkManager(): Promise<{ id: number; name: string } | null> {
  if (BACKEND !== 'chatwoot') return null;
  const s = loadSession();
  if (!s) return null;
  try {
    const r = await fetch(`${CHATWOOT_BASE}/api/analytics/whoami`, { headers: { Accept: 'application/json', ...authHeaders(s) }, credentials: 'omit' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
