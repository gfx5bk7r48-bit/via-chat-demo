import { useEffect, useState } from 'react';
import { adapter } from '../store';
import type { Conversation } from '../data/types';
import { customerWindow, dow as dowShort, longDay, md, namesOn, verdict, weekday, windowPart, type SdAppointment, type SdLookup, type SdRouting } from '../data/sd';
import { Avatar } from './Avatar';
import { tip } from './Tooltip';
import { track } from '../data/events';

interface Props {
  open: boolean; conv: Conversation; refreshKey?: string; onClose: () => void;
  onInsert: (t: string) => void; toast: (t: string, b?: string) => void;
}
type Action = null | 'eta' | 'offer' | 'book';

const fullDay = (iso: string) => `${weekday(iso)} ${md(iso)}`;
const minsAgo = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : null);

const titleCase = (s?: string) => (s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function ApptRow({ a, showName }: { a: SdAppointment; showName: boolean }) {
  return (
    <li className={`sd-appt ${a.is_past ? 'past' : ''}`}>
      {showName && <div className="sd-appt-name">{a.customer_full_name}</div>}
      <div className="sd-appt-top"><b>{a.appliance || 'Appliance n/a'}</b><span className="mono chip-mono">{a.window}</span></div>
      {a.problem && <div className="sd-appt-sub sd-problem">{a.problem}</div>}
      <div className="sd-appt-sub">
        {a.when} · {a.tech_assigned ? <>tech <span className="mono">{a.tech}</span></> : <span className="muted">unassigned</span>} · inv <span className="mono">{a.invoice}</span>
      </div>
    </li>
  );
}

/** Customer panel backed by the ServiceDesk appointment lookup. */
export function SdPanel({ open, conv, refreshKey, onClose, onInsert, toast }: Props) {
  const [sd, setSd] = useState<SdLookup | null>(null);
  const [routing, setRouting] = useState<SdRouting | null>(null);
  const [zip, setZip] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [book, setBook] = useState({ date: '', window: '' as '' | 'morning' | 'afternoon', appliance: '', issue: '' });
  const [, tick] = useState(0);

  useEffect(() => { setAction(null); setSd(null); }, [conv.id]);
  useEffect(() => {
    let live = true;
    adapter.getServiceDesk?.(conv.phone).then((l) => {
      if (!live) return;
      setSd(l); setRouting(l.routing ?? null); setZip(l.routing?.zip ?? l.appointments.at(-1)?.zip ?? '');
    }).catch(() => live && setSd(null));
    return () => { live = false; };
  }, [conv.phone, refreshKey]);
  useEffect(() => {
    if (/^\d{5}$/.test(zip) && zip !== routing?.zip) adapter.getRouting?.(zip, sd?.source === 'demo').then(setRouting);
  }, [zip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const v = verdict(sd);
  const names = namesOn(sd);
  const live = sd?.source === 'servicedesk';
  const checked = minsAgo(sd?.fetched_at);
  const head = sd?.appointments.at(-1);
  const first = (v.appt ?? head)?.customer_first_name;
  const synced = minsAgo(sd?.synced_at);
  const stale = !!sd?.warning || (!live && synced != null && synced > 45);

  const eta = (m: number) => { track('quick_eta', conv.id, { minutes: m }); onInsert(`${first ? `Hi ${first}, ` : 'Hi! '}your VIA technician is on the way and should arrive in about ${m} minutes.`); setAction(null); };
  // Customer-facing offers never quote the 8-12 / 12-4 buckets.
  const offer = (day: string, part: 'morning' | 'afternoon') => {
    track('quick_offer_day', conv.id, { part });
    onInsert(`We have an opening ${day} in the ${part}. Dispatch will text you a 3-hour arrival window the day before. Would that work for you?`);
    setAction(null);
  };
  const doBook = async () => {
    if (!book.date || !book.window || !book.appliance) return;
    const { callsheetId } = await adapter.bookAppointment({ conversationId: conv.id, date: book.date, window: book.window, appliance: book.appliance, issue: book.issue });
    track('quick_book', conv.id);
    toast(`Demo booking ${callsheetId} noted`, 'Private note added. Nothing was sent to ServiceDesk.');
    setAction(null); setBook({ date: '', window: '', appliance: '', issue: '' });
    adapter.getServiceDesk?.(conv.phone).then(setSd);
  };

  return (
    <aside className={`panel ${open ? 'open' : ''}`} aria-label="Customer details" aria-hidden={!open}>
      <div className="panel-inner">
        <button className="panel-close" onClick={onClose} {...tip('Close Customer Details')}>Done</button>
        <div className="panel-hero">
          <Avatar name={conv.name || head?.customer_full_name} phone={conv.phone} size={64} />
          <h2>{conv.name || (names.length === 1 ? head?.customer_full_name : '') || (names.length > 1 ? 'Shared number' : 'Unknown customer')}</h2>
          <div className="muted">{conv.phone}</div>
          {head && <div className="muted small">{head.city ? titleCase(head.city) + ' · ' : ''}<span className="mono">{head.zip}</span></div>}
        </div>

        <div className={`sd-strip ${v.tone}`} role="status">
          <b>{v.text}</b>
          {v.appt && <span>{dowShort(v.appt.date)} {md(v.appt.date)}{v.appt.tech_assigned ? ` · tech ${v.appt.tech}` : ' · tech unassigned'}</span>}
          {sd?.called_recently && <span className="chip">Called recently</span>}
        </div>
        {names.length > 1 && (
          <div className="sd-warn"><b>{names.length} names on this number.</b> Confirm who you&apos;re texting.
            <ul className="sd-names">{names.map((n) => <li key={n}>{n}</li>)}</ul></div>
        )}
        {sd?.warning && <p className="sd-warn stale">⚠ {sd.warning}</p>}
        {sd?.error && <p className="sd-warn stale">{sd.error}</p>}

        <div className="actions">
          <button className={action === 'eta' ? 'on' : ''} onClick={() => setAction(action === 'eta' ? null : 'eta')} {...tip('Send ETA', 'Inserts “your tech arrives in about N minutes” into the message box')}><span>⏱</span>Send ETA</button>
          <button className={action === 'offer' ? 'on' : ''} onClick={() => setAction(action === 'offer' ? null : 'offer')} {...tip('Offer a Day', 'Pick an open morning or afternoon and insert the offer text')}><span>📅</span>Offer a day</button>
          <button className={action === 'book' ? 'on' : ''} onClick={() => setAction(action === 'book' ? null : 'book')} {...tip('Book (demo)', 'Records a private booking note. Nothing is sent to ServiceDesk')}><span>＋</span>Book (demo)</button>
        </div>

        {action === 'eta' && (
          <div className="card act-card"><div className="card-h">Insert ETA text</div>
            <div className="seg3">{[15, 30, 45].map((m) => <button key={m} onClick={() => eta(m)} {...tip(`Insert ${m}-minute ETA`)}>{m} min</button>)}</div></div>
        )}
        {(action === 'offer' || action === 'book') && (
          <div className="card act-card">
            <div className="card-h">{action === 'book' ? 'Book (demo only)' : 'Offer a day'}</div>
            <label className="zip">ZIP <input className="mono" value={zip} inputMode="numeric" maxLength={5} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} aria-label="ZIP code" /></label>
            {routing ? (
              <div className="sd-offer">
                {routing.days.filter((d) => d.bookable).map((d) => (
                  <div key={d.date} className="sd-offer-row">
                    <span className="mono">{d.day}</span>
                    {(['morning', 'afternoon'] as const).map((p) => (
                      <button key={p} className={`slot ${action === 'book' && book.date === d.date && book.window === p ? 'sel' : ''}`}
                        onClick={() => (action === 'book' ? setBook({ ...book, date: d.date, window: p }) : offer(fullDay(d.date), p))}>
                        {p === 'morning' ? 'Morning' : 'Afternoon'}
                      </button>
                    ))}
                  </div>
                ))}
                <p className="muted small">Morning / afternoon only. Dispatch sets the real 3-hour window the day before. Today is never bookable.</p>
              </div>
            ) : <p className="muted small">Enter a 5-digit ZIP</p>}
            {action === 'book' && (
              <div className="book-form">
                <input placeholder="Appliance" value={book.appliance} onChange={(e) => setBook({ ...book, appliance: e.target.value })} aria-label="Appliance" />
                <input placeholder="Problem" value={book.issue} onChange={(e) => setBook({ ...book, issue: e.target.value })} aria-label="Problem" />
                <button className="primary" disabled={!book.date || !book.window || !book.appliance} onClick={doBook}>Add demo booking note</button>
                <p className="muted small">Demo: writes a private note only. Nothing is sent to ServiceDesk; real callsheets aren&apos;t enabled from VIA Chat yet.</p>
              </div>
            )}
          </div>
        )}

        <section className="card">
          <div className="card-h">{v.text === 'Last visit' ? 'Last visit' : 'Next appointment'}</div>
          {v.appt ? (
            <div className="sd-next">
              <div className="appt-day">{longDay(v.appt.date)}</div>
              <div><span className="mono chip-mono">{v.appt.window}</span>{!v.appt.window_time_known && <span className="muted small"> routes not built yet</span>}</div>
              {names.length > 1 && <div className="sd-next-sub"><b>{v.appt.customer_full_name}</b></div>}
              {v.appt.street && <div className="sd-next-sub">{titleCase(v.appt.street)}{v.appt.city ? `, ${titleCase(v.appt.city)}` : ''} <span className="mono">{v.appt.zip}</span></div>}
              <div className="sd-next-sub">{v.appt.appliance}</div>
              {v.appt.problem && <div className="sd-next-sub sd-problem">“{v.appt.problem}”</div>}
              <div className="sd-next-sub">{v.appt.tech_assigned ? <>Tech <span className="mono">{v.appt.tech}</span></> : 'Tech unassigned'} · Invoice <span className="mono">{v.appt.invoice}</span></div>
              {!v.appt.is_past && <div className="muted small">Tell the customer: “{customerWindow(v.appt)}”{windowPart(v.appt.window).exact ? '' : ' (the 8-12 / 12-4 code is a routing bucket, not their window)'}</div>}
            </div>
          ) : <p className="muted">{!sd ? 'Looking up…' : sd.error ? 'Lookup unavailable' : 'No appointment on file'}</p>}
        </section>

        {(sd?.appointments.length ?? 0) > 0 && (
          <section className="card">
            <div className="card-h">Appointments on this number <span className="count">{sd!.appointments.length}</span></div>
            <ul className="jobs">{[...sd!.appointments].reverse().map((a) => <ApptRow key={`${a.invoice}-${a.date}`} a={a} showName={names.length > 1} />)}</ul>
          </section>
        )}

        <section className="card">
          <div className="card-h">Routing{routing?.source === 'demo' ? ' (demo)' : ''}{routing ? <span>Zone <span className="mono">{routing.zone}</span> · <span className="mono">{routing.zip}</span></span> : null}</div>
          {routing ? (
            <ul className="sd-routing">
              {routing.days.map((d) => (
                <li key={d.date} className={d.bookable ? '' : 'nb'}>
                  <span className={`sd-dot ${d.room ? 'room' : ''}`} aria-label={d.room ? 'room' : 'full'} />
                  <span className="mono sd-day">{d.day}</span>
                  <span className="mono sd-techs">{d.techs}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{zip.length === 5 ? 'Checking ZIP…' : 'No ZIP on file'}</p>}
          {action !== 'offer' && action !== 'book' && (
            <label className="zip">ZIP <input className="mono" value={zip} inputMode="numeric" maxLength={5} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} aria-label="Routing ZIP" /></label>
          )}
          {routing && <p className="muted small">booked/capacity per tech · dot = room (worth proposing, not a booking){routing.source === 'servicedesk' ? ' · live' : ''}</p>}
        </section>

        <section className="card sd-stub">
          <div className="card-h">Jobs · history · notes</div>
          <p className="muted small">Not available. The ServiceDesk index is appointments only; job history, balances, warranty and prior sealed-system work have no data source yet.</p>
        </section>

        <p className={`sd-foot ${stale ? 'stale' : ''}`}>
          {live ? (
            <>ServiceDesk · live · {sd?.warning ? 'index is stale (see warning)' : 'synced within the last 45 min'}{checked != null ? ` · checked ${checked ? `${checked} min ago` : 'just now'}` : ''}</>
          ) : sd ? (
            <>ServiceDesk · {synced == null ? 'sync time unknown' : `synced ${synced} min ago`}<br /><b className="demo-badge">DEMO DATA</b> · fictional 555-01xx customer{routing?.source === 'servicedesk' ? ' · routing is live' : ''}</>
          ) : 'ServiceDesk · looking up…'}
        </p>
      </div>
    </aside>
  );
}
