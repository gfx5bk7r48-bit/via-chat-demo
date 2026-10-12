import { useEffect, useState } from 'react';
import type { Conversation } from '../data/types';
import {
  checkConsent, consentChanged, consentEnabled, consentHistory, fmtWhen, onConsentChange, recordConsent, resolveReview,
  SOURCE_LABEL, STATUS_HINT, STATUS_LABEL, TYPE_LABEL, type ConsentCheck, type ConsentStatus,
} from '../data/consent';
import { tip } from './Tooltip';

// Short shared memo so the header pill, the panel and the composer make one /check per change.
const memo = new Map<string, { at: number; p: Promise<ConsentCheck> }>();
function cachedCheck(convId: string, key: string) {
  const k = `${convId}:${key}`;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < 4000) return hit.p;
  const p = checkConsent(convId);
  memo.set(k, { at: Date.now(), p });
  if (memo.size > 50) memo.delete(memo.keys().next().value!);
  p.catch(() => memo.delete(k));
  return p;
}

/** Consent verdict for a conversation; re-checks when the thread changes, after recording, and every minute (quiet hours). */
export function useConsent(conv: Conversation | null, refreshKey?: string) {
  const [check, setCheck] = useState<ConsentCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => onConsentChange(() => { memo.clear(); setN((x) => x + 1); }), []);
  useEffect(() => { const t = setInterval(() => { memo.clear(); setN((x) => x + 1); }, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { setCheck(null); }, [conv?.id]);
  useEffect(() => {
    if (!consentEnabled || !conv) return;
    let live = true;
    cachedCheck(conv.id, `${refreshKey}:${n}`).then((c) => { if (live) { setCheck(c); setError(null); } }).catch((e) => live && setError(String(e.message ?? e)));
    return () => { live = false; };
  }, [conv?.id, refreshKey, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { check, error };
}

// ---------- dialog host (one per app) ----------
type Open = { conv: Conversation; tab: 'history' | 'record' | 'review' } | null;
let opener: ((o: Open) => void) | null = null;
export const openConsent = (conv: Conversation, tab: 'history' | 'record' | 'review' = 'history') => opener?.({ conv, tab });

export function ConsentPill({ status, onClick, compact }: { status: ConsentStatus | null; onClick?: () => void; compact?: boolean }) {
  if (!status) return <span className="consent-pill loading" aria-hidden="true">SMS consent…</span>;
  return (
    <button className={`consent-pill ${status}`} onClick={onClick} {...tip(`SMS Consent: ${STATUS_LABEL[status]}`, STATUS_HINT[status] + ' Click for history.')}>
      <span className="dot" aria-hidden="true" />{compact && status === 'implied' ? 'Implied' : STATUS_LABEL[status]}
    </button>
  );
}

export function ConsentDialogHost({ toast }: { toast: (t: string, b?: string) => void }) {
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => { opener = setOpen; return () => { opener = null; }; }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
      <div className="modal consent-modal" role="dialog" aria-modal="true" aria-label="SMS consent">
        <ConsentDialog key={open.conv.id + open.tab} conv={open.conv} tab={open.tab} onTab={(tab) => setOpen({ ...open, tab })} onClose={() => setOpen(null)} toast={toast} />
      </div>
    </div>
  );
}

const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

function ConsentDialog({ conv, tab, onTab, onClose, toast }: { conv: Conversation; tab: 'history' | 'record' | 'review'; onTab: (t: 'history' | 'record' | 'review') => void; onClose: () => void; toast: (t: string, b?: string) => void }) {
  const [h, setH] = useState<ConsentCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'opt_in' as 'opt_in' | 'opt_out', source: '', note: '', when: nowLocal(), ref: '' });
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const load = () => consentHistory(conv.id).then(setH).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const optedOut = h?.derived.conversational === 'opted_out';
  const review = h?.derived.open_reviews?.[0];

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const evidence: Record<string, string> = {};
      if (form.ref.trim()) evidence[form.source === 'phone_call_ray' ? 'call_id' : form.source === 'web_form' ? 'form_id' : form.source === 'booking' ? 'booking_id' : 'call_id'] = form.ref.trim();
      await recordConsent(conv.id, { type: form.type, source: form.type === 'opt_out' ? 'verbal_agent' : form.source, note: form.note, occurred_at: new Date(form.when).toISOString(), evidence });
      toast(form.type === 'opt_in' ? 'Consent recorded' : 'Opt-out recorded', conv.name || conv.phone);
      consentChanged(); await load(); onTab('history');
      setForm({ ...form, note: '', ref: '' });
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };
  const decideReview = async (resolution: 'opt_out' | 'not_opt_out') => {
    if (!review) return;
    setBusy(true); setErr(null);
    try { await resolveReview(review.id, resolution, reviewNote); toast(resolution === 'opt_out' ? 'Recorded as opt-out' : 'Marked not an opt-out'); consentChanged(); await load(); onTab('history'); }
    catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="modal-head">
        <div><h2>SMS consent</h2><div className="muted small">{conv.name ? `${conv.name} · ` : ''}{conv.phone}</div></div>
        {h && <ConsentPill status={h.status} />}
        <button className="tiny" onClick={onClose} {...tip('Close')}>Done</button>
      </div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => onTab('history')}>History</button>
        <button role="tab" aria-selected={tab === 'record'} className={tab === 'record' ? 'on' : ''} onClick={() => onTab('record')}>Record consent</button>
        {review && <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'on' : ''} onClick={() => onTab('review')}>Review ⚠</button>}
      </div>
      {err && <p className="consent-err" role="alert">{err}</p>}
      {!h && !err && <p className="muted">Loading…</p>}

      {h && tab === 'history' && (
        <div className="consent-hist">
          <p className="muted small">{STATUS_HINT[h.status]}{h.decision.needs_disclosure ? ' The next text will include the opt-out line.' : ''}</p>
          {h.events!.length === 0 && <p className="muted">No consent events yet.{h.first_inbound_at ? ` Customer first texted ${fmtWhen(h.first_inbound_at)}.` : ''}</p>}
          <ol className="timeline">
            {h.events!.map((e) => (
              <li key={e.id} className={`tl ${e.type}`}>
                <div className="tl-top"><b>{TYPE_LABEL[e.type]}{e.keyword ? ` · “${e.keyword}”` : ''}</b><span className="muted small">{fmtWhen(e.occurred_at)}</span></div>
                <div className="small">{e.type === 'opt_out' && e.source === 'inbound_text' ? 'Customer’s text, confirmed by an agent' : SOURCE_LABEL[e.source] ?? e.source}{e.scope !== 'conversational' ? ` · scope ${e.scope}` : ''}{e.actor_name ? ` · by ${e.actor_name}` : e.actor_type === 'customer' ? ' · by customer' : ''}{e.demo ? ' · demo' : ''}</div>
                {e.note && <div className="small muted">{e.note}</div>}
                {typeof e.evidence?.text === 'string' && <div className="small muted">Message: “{e.evidence.text}”</div>}
                {e.disclosure_text && <details className="small"><summary>Wording shown ({e.disclosure_version})</summary><p>{e.disclosure_text}</p></details>}
                {e.ip && <div className="small muted mono">IP {e.ip}</div>}
              </li>
            ))}
          </ol>
          {(h.reviews?.length ?? 0) > 0 && <><div className="card-h">Reviews</div>
            <ul className="timeline">{h.reviews!.map((r) => <li key={r.id} className="tl review"><div className="tl-top"><b>“{r.excerpt}”</b><span className="muted small">{fmtWhen(r.created_at)}</span></div>
              <div className="small muted">{r.resolved_at ? `${r.resolution === 'opt_out' ? 'Opt-out confirmed' : 'Not an opt-out'} by ${r.resolved_by_name}${r.note ? `: ${r.note}` : ''}` : 'Open: sending held until reviewed'}</div></li>)}</ul></>}
          {(h.disclosures?.length ?? 0) > 0 && <p className="muted small">Opt-out notice last sent {fmtWhen(h.disclosures![0].sent_at)} ({h.disclosures![0].version}).</p>}
          <p className="muted small">The ledger is append-only. To correct something, record a new event; nothing is edited or deleted.</p>
        </div>
      )}

      {h && tab === 'record' && (
        <div className="consent-form">
          <div className="seg small-seg">
            <button className={form.type === 'opt_in' ? 'on' : ''} onClick={() => setForm({ ...form, type: 'opt_in' })} disabled={optedOut} {...tip('Customer agreed to texts')}>Agreed to texts</button>
            <button className={form.type === 'opt_out' ? 'on' : ''} onClick={() => setForm({ ...form, type: 'opt_out' })} {...tip('Customer asked VIA to stop texting', 'Blocks texting until they text START')}>Asked us to stop</button>
          </div>
          {optedOut && form.type === 'opt_in' && <p className="consent-err">This customer opted out. Only they can opt back in, by texting START.</p>}
          {form.type === 'opt_in' && (
            <label>How did they agree?
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="Consent source">
                <option value="">Choose…</option>
                <option value="verbal_agent">Told me on the phone / in person</option>
                <option value="phone_call_ray">Said yes to Ray on a call</option>
                <option value="booking">Booking (checked the text box)</option>
                <option value="web_form">Website form (checked the text box)</option>
                <option value="import">Existing record / import</option>
              </select>
            </label>
          )}
          {form.type === 'opt_in' && form.source && form.source !== 'verbal_agent' && (
            <label>{form.source === 'phone_call_ray' ? 'Call ID' : form.source === 'web_form' ? 'Form / submission ID' : 'Reference'} (optional)
              <input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} maxLength={80} /></label>
          )}
          <label>When <input type="datetime-local" value={form.when} max={nowLocal()} onChange={(e) => setForm({ ...form, when: e.target.value })} /></label>
          <label>Note (required)
            <textarea rows={3} value={form.note} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={form.type === 'opt_in' ? 'e.g. Called in about the dryer, said texting this number is fine for appointment updates.' : 'e.g. Asked on the phone not to be texted anymore.'} /></label>
          <p className="muted small">{form.type === 'opt_in' ? 'Covers service texts (scheduling, ETAs, repair updates). It doesn’t cover marketing.' : 'Texting this number will be blocked until the customer texts START.'} Recorded under your name with today’s time.</p>
          <button className="primary" disabled={busy || form.note.trim().length < 3 || (form.type === 'opt_in' && (!form.source || optedOut))} onClick={submit}>
            {form.type === 'opt_in' ? 'Record consent' : 'Record opt-out'}
          </button>
        </div>
      )}

      {h && tab === 'review' && review && (
        <div className="consent-form">
          <p>The customer wrote <b>“{review.excerpt}”</b> on {fmtWhen(review.created_at)}. That may be a request to stop texting. Sending is held until someone decides.</p>
          <button className="primary danger" disabled={busy} onClick={() => decideReview('opt_out')}>Treat as opt-out (block texting)</button>
          <label>Not an opt-out? Say why <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="e.g. They meant stop the reminder for the old appointment, and asked to rebook." /></label>
          <button disabled={busy || reviewNote.trim().length < 3} onClick={() => decideReview('not_opt_out')}>Not an opt-out, allow texting</button>
        </div>
      )}
    </>
  );
}

/** Banner above the composer. Returns null when sending is plainly fine. */
export function ConsentBanner({ conv, check, urgent, onUrgent }: { conv: Conversation; check: ConsentCheck | null; urgent: boolean; onUrgent: (u: boolean) => void }) {
  if (!check || !check.enforced) return null;
  const d = check.decision;
  if (d.level === 'ok') return null;
  const tone = d.code === 'opted_out' ? 'red' : 'amber';
  return (
    <div className={`consent-banner ${tone} ${d.level}`} role={d.level === 'block' ? 'alert' : 'status'}>
      <span className="cb-icon" aria-hidden="true">{d.code === 'opted_out' ? '⛔' : d.code.startsWith('quiet') ? '🌙' : '⚠'}</span>
      <span className="cb-text">{d.message}</span>
      {d.code === 'consent_required' && <button className="primary small" onClick={() => openConsent(conv, 'record')}>Record consent</button>}
      {d.code === 'review_pending' && <button className="primary small" onClick={() => openConsent(conv, 'review')}>Review</button>}
      {d.code === 'opted_out' && <button className="tiny" onClick={() => openConsent(conv, 'history')} {...tip('View Consent History')}>History</button>}
      {d.code === 'quiet_hours' && d.can_override_urgent && (
        <label className="cb-urgent" {...tip('Urgent Send', 'Only for time-critical service messages (e.g. tech running late today). Logged.')}>
          <input type="checkbox" checked={urgent} onChange={(e) => onUrgent(e.target.checked)} /> Urgent
        </label>
      )}
    </div>
  );
}
