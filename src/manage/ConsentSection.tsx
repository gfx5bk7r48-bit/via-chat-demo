import { useEffect, useState } from 'react';
import { authHeaders, loadSession } from '../data/chatwootSession';
import { CHATWOOT_BASE } from '../store';
import { tip } from '../components/Tooltip';
import { fmtWhen, SOURCE_LABEL } from '../data/consent';
import { num } from './format';

export interface ConsentSummary {
  generated_at: string; numbers: number; counts: Record<'opted_in' | 'implied' | 'opted_out' | 'review' | 'unknown', number>;
  opt_outs_30d: number; opt_ins_30d: number; help_30d: number; events_total: number; by_source: Record<string, number>;
  guard_30d: { code: string; decision: string; n: number }[]; disclosures_30d: number;
  recent_opt_outs: { phone: string; at: string; keyword: string | null; source: string; name: string | null; conversation_id: number | null }[];
  open_reviews: { id: number; phone: string; excerpt: string; created_at: string; conversation_id: number | null; name: string | null }[];
  twilio: { configured: boolean };
}
export interface ConsentSettings {
  quiet_hours: { enabled: boolean; start: number; end: number; reply_window_hours: number; allow_urgent_override: boolean; use_area_code_tz: boolean };
  disclosure: { mode: 'append' | 'off'; text: string; version: string; interval_days: number };
  natural_language_optout: 'hold' | 'flag'; marketing_enabled: boolean;
}

export async function consentApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const s = loadSession();
  if (!s) throw new Error('Not signed in');
  const r = await fetch(`${CHATWOOT_BASE}/api/consent${path}`, { method: init?.method ?? 'GET', credentials: 'omit', headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(s) }, body: init?.body ? JSON.stringify(init.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || (r.status === 403 ? 'Managers only' : `Consent request failed (${r.status})`));
  return j as T;
}

const GUARD_LABEL: Record<string, string> = {
  opted_out: 'Blocked: opted out', consent_required: 'Blocked: no consent yet', quiet_hours: 'Blocked: quiet hours', review_pending: 'Held: needs review',
  marketing_disabled: 'Blocked: marketing off', marketing_consent_required: 'Blocked: no marketing opt-in', quiet_hours_reply: 'Late reply (allowed)', quiet_hours_urgent: 'Urgent after-hours (allowed)',
};

export function ConsentSection() {
  const [s, setS] = useState<ConsentSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ from: '', to: '', type: '', source: '', demo: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { consentApi<ConsentSummary>('/summary').then(setS).catch((e) => setErr(String(e.message))); }, []);

  const exportCsv = async () => {
    const sess = loadSession(); if (!sess) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      const r = await fetch(`${CHATWOOT_BASE}/api/consent/export${qs.size ? `?${qs}` : ''}`, { credentials: 'omit', headers: authHeaders(sess) });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'via-sms-consent-ledger.csv';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  const c = s?.counts;
  const blocked = (s?.guard_30d ?? []).filter((g) => g.decision === 'blocked').reduce((a, g) => a + g.n, 0);
  return (
    <section className="mg-card span3 mg-consent" aria-label="SMS consent">
      <div className="mg-card-h">
        <h2>SMS consent</h2>
        <span className="mg-info" tabIndex={0} {...tip('How this works', 'Append-only ledger of every opt-in, opt-out (STOP), re-opt-in (START) and HELP per phone number. Current status = latest event. “Implied” = the customer texted VIA first. Every outbound text is checked server-side before it reaches Chatwoot.')}>ⓘ</span>
        <span className="mg-card-tools muted small">{s ? `${num(s.numbers)} numbers · ${num(s.events_total)} events${s.twilio.configured ? ' · Twilio sync on' : ' · Twilio not connected'}` : ''}</span>
      </div>
      {err && <div className="mg-error">{err}</div>}
      {!s ? <p className="muted">Loading…</p> : (
        <>
          <div className="mg-consent-kpis">
            <div className="mg-kpi" tabIndex={0} {...tip('Opted in', 'Explicit consent on file: website/booking checkbox, Ray call, agent-recorded, or START.')}><div className="mg-kpi-l">Opted in</div><div className="mg-kpi-v">{num(c!.opted_in)}</div></div>
            <div className="mg-kpi" tabIndex={0} {...tip('Implied (texted first)', 'The customer texted VIA first. Covers conversational replies, not marketing.')}><div className="mg-kpi-l">Implied (texted first)</div><div className="mg-kpi-v">{num(c!.implied)}</div></div>
            <div className={`mg-kpi ${c!.opted_out ? 'warn' : ''}`} tabIndex={0} {...tip('Opted out', 'Replied STOP (or similar), or opted out another way. Texting is blocked until they text START.')}><div className="mg-kpi-l">Opted out</div><div className="mg-kpi-v">{num(c!.opted_out)}</div><div className="mg-kpi-d flat">{num(s.opt_outs_30d)} in the last 30 days</div></div>
            <div className={`mg-kpi ${c!.review ? 'warn' : ''}`} tabIndex={0} {...tip('Needs review', '“Stop texting me”-style messages. Sending to these numbers is held until an agent decides.')}><div className="mg-kpi-l">Needs review</div><div className="mg-kpi-v">{num(c!.review)}</div></div>
            <div className="mg-kpi" tabIndex={0} {...tip('Sends blocked · 30 days', 'Outbound texts the server refused (opted out, no consent, quiet hours).')}><div className="mg-kpi-l">Sends blocked · 30d</div><div className="mg-kpi-v">{num(blocked)}</div></div>
            <div className="mg-kpi" tabIndex={0} {...tip('Opt-out notices · 30 days', 'First-message “Reply STOP to opt out” lines VIA Chat added.')}><div className="mg-kpi-l">Opt-out notices · 30d</div><div className="mg-kpi-v">{num(s.disclosures_30d)}</div></div>
          </div>
          <div className="mg-consent-cols">
            <div>
              <div className="mg-sub">Recent opt-outs</div>
              {s.recent_opt_outs.length === 0 ? <p className="muted small">None.</p> : (
                <ul className="mg-queue">{s.recent_opt_outs.map((r) => (
                  <li key={r.phone}><b>{r.name || r.phone}</b><span className="muted small"> · {r.name ? r.phone + ' · ' : ''}{r.source === 'keyword' ? `replied ${r.keyword ?? 'STOP'}` : SOURCE_LABEL[r.source] ?? r.source}{r.conversation_id ? ` · #${r.conversation_id}` : ''}</span><span className="mg-pill warn">{fmtWhen(r.at)}</span></li>
                ))}</ul>
              )}
            </div>
            <div>
              <div className="mg-sub">Needs review</div>
              {s.open_reviews.length === 0 ? <p className="muted small">Nothing waiting.</p> : (
                <ul className="mg-queue">{s.open_reviews.map((r) => <li key={r.id}><b>{r.name || r.phone}</b><span className="muted small"> · “{r.excerpt}”{r.conversation_id ? ` · #${r.conversation_id}` : ''}</span><span className="mg-pill warn">{fmtWhen(r.created_at)}</span></li>)}</ul>
              )}
              <div className="mg-sub">Guard decisions · 30 days</div>
              {s.guard_30d.length === 0 ? <p className="muted small">No blocked or flagged sends.</p> : (
                <ul className="mg-queue">{s.guard_30d.map((g) => <li key={g.code + g.decision}>{GUARD_LABEL[g.code] ?? g.code}<span className="mg-pill">{num(g.n)}</span></li>)}</ul>
              )}
            </div>
            <div>
              <div className="mg-sub">Export the ledger (CSV)</div>
              <div className="mg-consent-export">
                <label>From <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
                <label>To <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
                <label>Event <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All</option><option value="opt_in">Opt-in</option><option value="opt_out">Opt-out</option><option value="re_opt_in">Re-opt-in</option><option value="help">HELP</option></select></label>
                <label>Source <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">All</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Demo data <select value={f.demo} onChange={(e) => setF({ ...f, demo: e.target.value })}><option value="">Include</option><option value="exclude">Exclude</option></select></label>
                <button className="mg-btn primary" disabled={busy} onClick={exportCsv} {...tip('Download CSV', 'Every matching ledger event with wording, source, actor, IP and evidence')}>{busy ? 'Exporting…' : 'Download CSV'}</button>
              </div>
              <p className="muted small">Quiet hours and the opt-out notice are in Settings.</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const hh = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fromHH = (v: string) => { const [a, b] = v.split(':').map(Number); return a + (b || 0) / 60; };
/** Consent block inside the dashboard Settings sheet. */
export function ConsentSettingsFields({ value: c, onChange }: { value: ConsentSettings; onChange: (c: ConsentSettings) => void }) {
  const q = c.quiet_hours, d = c.disclosure;
  const setQ = (p: Partial<ConsentSettings['quiet_hours']>) => onChange({ ...c, quiet_hours: { ...q, ...p } });
  const setD = (p: Partial<ConsentSettings['disclosure']>) => onChange({ ...c, disclosure: { ...d, ...p } });
  return (
    <>
      <div className="mg-sub">Texting quiet hours (customer’s local time)</div>
      <label className="mg-field row"><input type="checkbox" checked={q.enabled} onChange={(e) => setQ({ enabled: e.target.checked })} /> Don’t start texts outside
        <input type="time" value={hh(q.start)} onChange={(e) => setQ({ start: fromHH(e.target.value) })} aria-label="Quiet hours end (texting allowed from)" /> –
        <input type="time" value={hh(q.end)} onChange={(e) => setQ({ end: fromHH(e.target.value) })} aria-label="Quiet hours start (texting allowed until)" /></label>
      <label className="mg-field">Replies are OK (with a warning) if the customer texted in the last … hours
        <input type="number" min={0} max={72} value={q.reply_window_hours} onChange={(e) => setQ({ reply_window_hours: Number(e.target.value) })} /></label>
      <label className="mg-field row"><input type="checkbox" checked={q.allow_urgent_override} onChange={(e) => setQ({ allow_urgent_override: e.target.checked })} /> Agents may mark a quiet-hours text “urgent” (logged)</label>
      <label className="mg-field row"><input type="checkbox" checked={q.use_area_code_tz} onChange={(e) => setQ({ use_area_code_tz: e.target.checked })} /> Use the area code’s time zone (otherwise Eastern)</label>
      <div className="mg-sub">First-message opt-out notice</div>
      <label className="mg-field row"><input type="checkbox" checked={d.mode === 'append'} onChange={(e) => setD({ mode: e.target.checked ? 'append' : 'off' })} /> Add it to the first text to a number, once every
        <input type="number" min={1} max={730} value={d.interval_days} onChange={(e) => setD({ interval_days: Number(e.target.value) })} style={{ width: 70 }} /> days</label>
      <label className="mg-field">Notice wording (must include STOP) <textarea rows={2} maxLength={160} value={d.text} onChange={(e) => setD({ text: e.target.value })} /></label>
      <label className="mg-field">“Stop texting me”-style messages
        <select value={c.natural_language_optout} onChange={(e) => onChange({ ...c, natural_language_optout: e.target.value as 'hold' | 'flag' })}>
          <option value="hold">Hold sending until someone reviews (recommended)</option><option value="flag">Warn only</option>
        </select></label>
      <p className="muted small">Marketing texts: {c.marketing_enabled ? 'on' : 'off'} (needs written opt-in; changed by LockStep on request).</p>
    </>
  );
}
