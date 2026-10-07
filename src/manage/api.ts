import { authHeaders, loadSession } from '../data/chatwootSession';
import { CHATWOOT_BASE } from '../store';

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T>(path: string, init?: { method?: string; body?: unknown; params?: Record<string, string | number | undefined> }): Promise<T> {
  const s = loadSession();
  if (!s) throw new HttpError(401, 'Not signed in');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.params ?? {})) if (v !== undefined && v !== '') qs.set(k, String(v));
  const r = await fetch(`${CHATWOOT_BASE}/api/analytics${path}${qs.size ? `?${qs}` : ''}`, {
    method: init?.method ?? 'GET', credentials: 'omit',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(s) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok) throw new HttpError(r.status, r.status === 403 ? 'Managers only' : r.status === 401 ? 'Session expired' : r.status === 429 ? 'Too many refreshes. Wait a few seconds and try again.' : `Request failed (${r.status})`);
  return r.json() as Promise<T>;
}

export interface Kpis {
  inbound: number; outbound: number; automated: number; notes: number; new_conversations: number; active_conversations: number; customers: number;
  new_customers: number; returning_customers: number; segments_in: number; segments_out: number;
  frt_median: number | null; frt_p90: number | null; frt_median_biz: number | null; frt_p90_biz: number | null; frt_answered: number; frt_unanswered: number;
  reply_mean: number | null; reply_median: number | null; reply_mean_biz: number | null; reply_median_biz: number | null; replies: number;
  resolution_median: number | null; resolution_p90: number | null; resolution_median_biz: number | null; resolution_p90_biz: number | null;
  resolutions: number; resolved_conversations: number; booked_conversations: number; booking_rate: number | null; ray_conversations: number; ray_share: number | null;
}
export interface EventsBlock {
  ai: { shown: number; used: number; edited: number; dismissed: number; ignored: number; sent: number; sent_unmodified: number; sent_modified: number; use_rate: number | null; edit_rate: number | null; dismiss_rate: number | null; ignore_rate: number | null; sent_rate: number | null };
  quick: { eta: number; offer_day: number; book: number; eta_minutes: { minutes: string; n: number }[] };
  agents: Record<string, Record<string, number>>;
}
export interface AgentRow { user_id: number; conversations: number; messages: number; notes: number; resolutions: number; bookings: number; first_responses: number; frt_median: number | null; frt_median_biz: number | null; reply_mean: number | null }
export interface Overview {
  generated_at: string; compute_ms: number; tz: string;
  range: { from: string; to: string; bucket: 'hour' | 'day' | 'week'; days: number; prev_from: string; prev_to: string };
  business_hours: Schedule;
  current: {
    kpis: Kpis; status: Record<string, number>; status_total: number; events: EventsBlock; sms_cost: { segments: number; estimate: number; rate: number; placeholder: boolean };
    series: { b: string; inbound: number; outbound: number; automated: number; conversations: number; new_customers: number; returning_customers: number }[];
    heatmap: { dow: number; hour: number; inbound: number; outbound: number }[];
    labels: { label: string; conversations: number; share: number | null }[];
    frt_hist: { label: string; wall: number; business: number }[];
    agents: AgentRow[]; booked: number[];
  };
  previous: { kpis: Kpis; status: Record<string, number>; events: EventsBlock; sms_cost: { segments: number; estimate: number } };
}
export interface Meta { agents: { id: number; name: string; role: string }[]; inboxes: { id: number; name: string; channel_type: string }[]; labels: { title: string; color: string }[]; account_id: number }
export interface Live {
  generated_at: string; is_open_now: boolean;
  agents: { id: number; name: string; availability: string; role: string }[] | null;
  open_by_agent: { user_id: number | null; open: number; pending: number; snoozed: number }[];
  waiting: { display_id: number; assignee_id: number | null; inbox_id: number; name: string | null; phone_number: string | null; waiting_since: number; wait_s: number; wait_biz_s: number }[];
  unassigned: { display_id: number; inbox_id: number; status: string; name: string | null; phone_number: string | null; created_at: number; last_at: number | null }[];
}
export interface Schedule { tz: string; days: Record<string, [number, number] | null>; holidays: string[] }
export interface Settings { business_hours: Schedule; sms: { rate_per_segment: number; currency: string; note: string } }
