import { useEffect, useState } from 'react';
import { adapter } from '../store';
import type { Conversation, Customer, Job, Slot } from '../data/types';
import { Avatar } from './Avatar';
import { prettyDate } from '../util';

interface Props {
  open: boolean; conv: Conversation; customer: Customer | null; onClose: () => void;
  onInsert: (t: string) => void; toast: (t: string, b?: string) => void; onBooked: () => void;
}
type Action = null | 'eta' | 'avail' | 'book';

const chipClass = (u: string) => (/cool|heat|leak/i.test(u) ? 'urgent' : /warrant/i.test(u) ? 'warranty' : /new/i.test(u) ? 'new' : 'neutral');

function JobRow({ j }: { j: Job }) {
  return (
    <li className="job">
      <div className="job-top"><b>{j.appliance}</b><span className={`status s-${j.status.replace(' ', '-')}`}>{j.status}</span></div>
      <div className="job-sub">{j.brand}{j.model ? ` · ${j.model}` : ''}</div>
      <div className="job-sub">{j.issue}</div>
      <div className="job-meta">{j.id} · {prettyDate(j.date)}{j.warranty ? ' · Warranty' : ''}</div>
    </li>
  );
}

export function CustomerPanel({ open, conv, customer: c, onClose, onInsert, toast, onBooked }: Props) {
  const [action, setAction] = useState<Action>(null);
  const [zip, setZip] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [form, setForm] = useState({ slot: '', appliance: '', issue: '' });

  useEffect(() => { setAction(null); setZip(c?.zip ?? ''); }, [conv.id, c?.zip]);
  useEffect(() => {
    if ((action === 'avail' || action === 'book') && /^\d{5}$/.test(zip)) adapter.getAvailability(zip).then(setSlots);
  }, [action, zip]);
  useEffect(() => {
    if (action === 'book') setForm({ slot: '', appliance: c?.openJobs[0]?.appliance ?? '', issue: c?.openJobs[0]?.issue ?? '' });
  }, [action, c]);

  const first = c?.name?.split(' ')[0];
  const eta = (m: number) => { onInsert(`${first ? `Hi ${first}, ` : 'Hi! '}your VIA technician is on the way and should arrive in about ${m} minutes.`); setAction(null); };
  const days = [...new Set(slots.map((s) => s.date))];

  const book = async () => {
    const s = slots.find((x) => x.date + x.window === form.slot);
    if (!s || !form.appliance) return;
    const { callsheetId } = await adapter.bookAppointment({ conversationId: conv.id, date: s.date, window: s.window, appliance: form.appliance, issue: form.issue });
    toast(`Callsheet ${callsheetId} created`, `${form.appliance} · ${prettyDate(s.date)} ${s.window} (${s.label}) — demo only`);
    setAction(null); onBooked();
  };

  return (
    <aside className={`panel ${open ? 'open' : ''}`} aria-label="Customer details" aria-hidden={!open}>
      <div className="panel-inner">
        <button className="panel-close" onClick={onClose} aria-label="Close customer panel">Done</button>
        <div className="panel-hero">
          <Avatar name={c?.name || conv.name} phone={conv.phone} size={72} />
          <h2>{c?.name || 'Unknown customer'}</h2>
          <div className="muted">{conv.phone}</div>
          <div className="chips">
            <span className={`chip ${c?.isNew ? 'new' : 'repeat'}`}>{c?.isNew ? 'New customer' : `Repeat · since ${c?.since ?? '—'}`}</span>
            {c?.urgency.filter((u) => u !== 'New customer').map((u) => <span key={u} className={`chip ${chipClass(u)}`}>{u}</span>)}
          </div>
        </div>

        <div className="actions">
          <button className={action === 'eta' ? 'on' : ''} onClick={() => setAction(action === 'eta' ? null : 'eta')}><span>⏱</span>Send ETA</button>
          <button className={action === 'avail' ? 'on' : ''} onClick={() => setAction(action === 'avail' ? null : 'avail')}><span>📅</span>Availability</button>
          <button className={action === 'book' ? 'on' : ''} onClick={() => setAction(action === 'book' ? null : 'book')}><span>＋</span>Book</button>
        </div>

        {action === 'eta' && (
          <div className="card act-card"><div className="card-h">Insert ETA text</div>
            <div className="seg3">{[15, 30, 45].map((m) => <button key={m} onClick={() => eta(m)}>{m} min</button>)}</div></div>
        )}
        {(action === 'avail' || action === 'book') && (
          <div className="card act-card">
            <div className="card-h">{action === 'book' ? 'Book appointment' : 'Availability'}</div>
            <label className="zip">ZIP <input value={zip} inputMode="numeric" maxLength={5} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} aria-label="ZIP code" /></label>
            {/^\d{5}$/.test(zip) ? (
              <div className="slots" role="grid" aria-label="Available windows">
                <div className="slot-h" /><div className="slot-h">AM 8–12</div><div className="slot-h">PM 12–5</div>
                {days.map((d) => (
                  <div className="slot-row" key={d} role="row">
                    <div className="slot-d">{prettyDate(d)}</div>
                    {(['morning', 'afternoon'] as const).map((w) => {
                      const s = slots.find((x) => x.date === d && x.window === w)!;
                      const sel = form.slot === d + w;
                      return (
                        <button key={w} disabled={!s.room} className={`slot ${s.room ? '' : 'full'} ${sel ? 'sel' : ''}`}
                          onClick={() => action === 'book' ? setForm({ ...form, slot: d + w }) : onInsert(`We have an opening ${prettyDate(d)} in the ${w}. We'll text you a 3-hour arrival window the day before. Would that work for you?`)}
                          aria-label={`${prettyDate(d)} ${w}: ${s.room ? s.room + ' open' : 'full'}`}>
                          {s.room ? `${s.room} open` : 'Full'}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : <p className="muted small">Enter a 5-digit ZIP</p>}
            {action === 'avail' && <p className="muted small">Tap a window to insert an offer into the message.</p>}
            {action === 'book' && (
              <div className="book-form">
                <input placeholder="Appliance" value={form.appliance} onChange={(e) => setForm({ ...form, appliance: e.target.value })} aria-label="Appliance" />
                <input placeholder="Issue" value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} aria-label="Issue" />
                <button className="primary" disabled={!form.slot || !form.appliance} onClick={book}>Create callsheet</button>
              </div>
            )}
          </div>
        )}

        <section className="card">
          <div className="card-h">Address</div>
          {c?.address ? <p>{c.address}<br />{c.city}, MD {c.zip}</p> : <p className="muted">{c?.city ? `${c.city} area · ` : ''}No address on file</p>}
          <div className="kv"><span>Service zone</span><b>{c?.zone ?? '—'}</b></div>
        </section>

        <section className="card">
          <div className="card-h">Next appointment</div>
          {c?.nextAppointment ? (
            <div className="appt"><div className="appt-day">{prettyDate(c.nextAppointment.date)}</div>
              <div className="appt-win">{c.nextAppointment.window === 'morning' ? 'Morning · 8–12' : 'Afternoon · 12–5'}</div></div>
          ) : <p className="muted">None scheduled</p>}
        </section>

        <section className="card">
          <div className="card-h">Open jobs <span className="count">{c?.openJobs.length ?? 0}</span></div>
          {c?.openJobs.length ? <ul className="jobs">{c.openJobs.map((j) => <JobRow key={j.id} j={j} />)}</ul> : <p className="muted">No open jobs</p>}
        </section>

        <section className="card">
          <div className="card-h">Past jobs <span className="count">{c?.pastJobs.length ?? 0}</span></div>
          {c?.pastJobs.length ? <ul className="jobs">{c.pastJobs.map((j) => <JobRow key={j.id} j={j} />)}</ul> : <p className="muted">No history</p>}
        </section>

        <section className="card sealed">
          <div className="card-h">Prior sealed-system work</div>
          {c?.sealedSystemHistory ? <p>{c.sealedSystemHistory}</p> : <p className="muted">None found</p>}
          <p className="muted small">Placeholder — data source to be connected.</p>
        </section>
        <p className="demo-note">Demo data only · fictional customers</p>
      </div>
    </aside>
  );
}
