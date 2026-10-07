import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, HttpError, type Live, type Meta, type Overview, type Settings, type Kpis } from './api';
import { addDays, bucketLabel, delta, downloadCsv, dur, etStamp, maskPhone, num, pct, prettyDay, rateStr, todayET, usd, DOW, hourLabel } from './format';
import { HBars, Heatmap, SplitBar, TimeChart } from './charts';
import { Logo } from '../components/Logo';
import { tip, TooltipLayer } from '../components/Tooltip';
import { loadSession, signOut } from '../data/chatwootSession';
import { CHATWOOT_BASE } from '../store';
import './manage.css';

type Preset = 'today' | '7d' | '30d' | '90d' | 'custom';
type Theme = 'system' | 'light' | 'dark';
const BASE = import.meta.env.BASE_URL;
const C = { in: '#8e8e93', out: '#0a7cff', conv: '#d32228', newc: '#34c759', ret: '#5e5ce6', auto: '#ff9f0a' };

export default function Manage({ onSignedOut }: { onSignedOut: () => void }) {
  const [who, setWho] = useState<{ id: number; name: string } | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [preset, setPreset] = useState<Preset>(() => (localStorage.getItem('via-manage.preset') as Preset) || '7d');
  const [custom, setCustom] = useState(() => ({ from: addDays(todayET(), -13), to: todayET() }));
  const [agent, setAgent] = useState('');
  const [inbox, setInbox] = useState('');
  const [label, setLabel] = useState('');
  const [clock, setClock] = useState<'business' | 'wall'>('business');
  const [heatMetric, setHeatMetric] = useState<'inbound' | 'outbound'>('inbound');
  const [data, setData] = useState<Overview | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('via-chat.theme') as Theme) || 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    localStorage.setItem('via-chat.theme', theme);
  }, [theme]);
  useEffect(() => { document.title = 'Manage · VIA Chat'; return () => { document.title = 'VIA Chat'; }; }, []);
  useEffect(() => { localStorage.setItem('via-manage.preset', preset); }, [preset]);

  const range = useMemo(() => {
    const t = todayET();
    if (preset === 'today') return { from: t, to: t };
    if (preset === '7d') return { from: addDays(t, -6), to: t };
    if (preset === '30d') return { from: addDays(t, -29), to: t };
    if (preset === '90d') return { from: addDays(t, -89), to: t };
    return custom;
  }, [preset, custom]);
  const filters = { agent: agent || undefined, inbox: inbox || undefined, label: label || undefined };

  const fail = useCallback((e: unknown) => {
    if (e instanceof HttpError && e.status === 403) setDenied('This dashboard is for VIA managers. Ask an administrator for access.');
    else if (e instanceof HttpError && e.status === 401) onSignedOut();
    else setError(e instanceof Error ? e.message : String(e));
  }, [onSignedOut]);

  useEffect(() => {
    api<{ id: number; name: string }>('/whoami').then((w) => { setWho(w); return api<Meta>('/meta'); }).then(setMeta).catch(fail);
  }, [fail]);

  const load = useCallback(() => {
    if (!who) return;
    setLoading(true); setError(null);
    api<Overview>('/overview', { params: { ...range, ...filters } }).then(setData).catch(fail).finally(() => setLoading(false));
  }, [who, range.from, range.to, agent, inbox, label]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const loadLive = useCallback(() => { if (who) api<Live>('/live', { params: filters }).then(setLive).catch(() => undefined); }, [who, agent, inbox, label]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadLive(); const t = setInterval(loadLive, 30_000); return () => clearInterval(t); }, [loadLive]);

  const agentName = useCallback((id: number | null | undefined) => (id == null ? 'Unassigned' : meta?.agents.find((a) => a.id === id)?.name ?? `User ${id}`), [meta]);
  const inboxName = (id: number) => meta?.inboxes.find((i) => i.id === id)?.name ?? `Inbox ${id}`;
  const cycleTheme = () => setTheme((t) => (t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'));
  const doSignOut = async () => { await signOut(CHATWOOT_BASE, loadSession()); onSignedOut(); location.href = BASE; };

  if (denied) {
    return (
      <div className="mg-denied">
        <Logo height={36} />
        <h1>Managers only</h1>
        <p className="muted">{denied}</p>
        <a className="mg-btn primary" href={BASE}>Back to the inbox</a>
      </div>
    );
  }

  const cur = data?.current, prev = data?.previous;
  const K = cur?.kpis, P = prev?.kpis;
  const biz = clock === 'business';
  const frtMed = K && (biz ? K.frt_median_biz : K.frt_median), frtP90 = K && (biz ? K.frt_p90_biz : K.frt_p90);
  const pick = (k: Kpis | undefined, w: keyof Kpis, b: keyof Kpis) => (k ? (k[biz ? b : w] as number | null) : null);
  const schedule = data?.business_hours;
  const isOpenCell = (d: number, h: number) => { const w = schedule?.days?.[String(d)]; return !!w && h >= w[0] && h < w[1]; };
  const bhText = schedule ? describeHours(schedule) : 'Mon–Sat 8am–5pm ET';

  return (
    <div className="mg">
      <TooltipLayer />
      <header className="mg-head">
        <div className="mg-brand"><Logo height={26} /> <span>Chat</span> <span className="mg-sep">·</span> <span className="mg-title">Manage</span></div>
        <div className="mg-head-tools">
          {data && <span className="muted small mg-updated">Updated {etStamp(Date.parse(data.generated_at))}</span>}
          <button className="icon-btn" onClick={() => { load(); loadLive(); }} {...tip('Refresh', 'Numbers are cached for up to 60 s')} disabled={loading}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={loading ? 'spin' : ''}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} {...tip('Settings', 'Business hours and message rate')}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <button className="icon-btn" onClick={cycleTheme} {...tip('Light / Dark Mode', `Now: ${theme === 'system' ? 'match system' : theme}`)}>{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '◐'}</button>
          <a className="mg-btn" href={BASE} {...tip('Back to Inbox')}>‹ Inbox</a>
          <span className="mg-who small">{who?.name}</span>
          <button className="link-btn" onClick={doSignOut} {...tip('Sign Out')}>Sign out</button>
        </div>
      </header>

      <div className="mg-filters" role="toolbar" aria-label="Filters">
        <div className="segmented mg-seg" role="tablist" aria-label="Date range">
          {(['today', '7d', '30d', '90d', 'custom'] as Preset[]).map((p) => (
            <button key={p} role="tab" aria-selected={preset === p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>
              {p === 'today' ? 'Today' : p === 'custom' ? 'Custom' : p.replace('d', ' days')}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <span className="mg-dates">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From (ET)" />
            <span className="muted">–</span>
            <input type="date" value={custom.to} min={custom.from} max={todayET()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To (ET)" />
          </span>
        )}
        <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
          <option value="">All agents</option>
          {meta?.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={inbox} onChange={(e) => setInbox(e.target.value)} aria-label="Inbox">
          <option value="">All inboxes</option>
          {meta?.inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label">
          <option value="">All labels</option>
          {meta?.labels.map((l) => <option key={l.title} value={l.title}>{l.title}</option>)}
        </select>
        <div className="segmented mg-seg mg-clock" role="tablist" aria-label="Time basis">
          <button role="tab" aria-selected={biz} className={biz ? 'on' : ''} onClick={() => setClock('business')} {...tip('Business Hours', `Only counts time while VIA is open (${bhText})`)}>Business hrs</button>
          <button role="tab" aria-selected={!biz} className={!biz ? 'on' : ''} onClick={() => setClock('wall')} {...tip('Wall Clock', 'Counts every minute, nights and Sundays included')}>Wall clock</button>
        </div>
        {data && <span className="muted small mg-range">{prettyDay(data.range.from)}{data.range.to !== data.range.from ? ` – ${prettyDay(data.range.to)}` : ''} ET · vs {prettyDay(data.range.prev_from)}{data.range.prev_to !== data.range.prev_from ? ` – ${prettyDay(data.range.prev_to)}` : ''}</span>}
      </div>

      {error && <div className="mg-error" role="alert">{error} <button className="link-btn" onClick={load}>Retry</button></div>}
      {!data && !error && <div className="mg-loading">Loading…</div>}

      {data && cur && prev && K && P && (
        <main className={`mg-grid ${loading ? 'busy' : ''}`}>
          <section className="mg-kpis" aria-label="Key numbers">
            <Kpi label="Inbound texts" value={num(K.inbound)} d={delta(K.inbound, P.inbound)} prev={num(P.inbound)} info="Customer messages received (public, non-note) in the period." />
            <Kpi label="Outbound texts" value={num(K.outbound)} d={delta(K.outbound, P.outbound)} prev={num(P.outbound)} info="Public replies sent by agents. Automated/bot messages are excluded." />
            <Kpi label="New conversations" value={num(K.new_conversations)} d={delta(K.new_conversations, P.new_conversations)} prev={num(P.new_conversations)} info="Conversations created in the period." />
            <Kpi label="Customers" value={num(K.customers)} d={delta(K.customers, P.customers)} prev={num(P.customers)} info="Distinct customers who texted or were texted in the period." />
            <Kpi label="First response · median" value={dur(frtMed)} d={delta(frtMed ?? null, pick(P, 'frt_median', 'frt_median_biz'))} prev={dur(pick(P, 'frt_median', 'frt_median_biz'))} good="down" info={`Customer's first text → first human reply, for customer-started conversations. ${biz ? 'Business hours only.' : 'Wall clock.'}`} />
            <Kpi label="First response · p90" value={dur(frtP90)} d={delta(frtP90 ?? null, pick(P, 'frt_p90', 'frt_p90_biz'))} prev={dur(pick(P, 'frt_p90', 'frt_p90_biz'))} good="down" info="90% of first replies were faster than this." />
            <Kpi label="Avg reply time" value={dur(pick(K, 'reply_mean', 'reply_mean_biz'))} d={delta(pick(K, 'reply_mean', 'reply_mean_biz'), pick(P, 'reply_mean', 'reply_mean_biz'))} prev={dur(pick(P, 'reply_mean', 'reply_mean_biz'))} good="down" info="Every time a customer writes (one or more texts in a row), the time until the next agent reply. Averaged." />
            <Kpi label="Time to resolve · median" value={dur(pick(K, 'resolution_median', 'resolution_median_biz'))} d={delta(pick(K, 'resolution_median', 'resolution_median_biz'), pick(P, 'resolution_median', 'resolution_median_biz'))} prev={dur(pick(P, 'resolution_median', 'resolution_median_biz'))} good="down" info="Conversation start → resolved, for resolutions in the period (Chatwoot's conversation_resolved events)." />
            <Kpi label="Resolutions" value={num(K.resolutions)} d={delta(K.resolutions, P.resolutions)} prev={num(P.resolutions)} good="up" info="Times a conversation was marked resolved in the period." />
            <Kpi label="Bookings (proxy)" value={num(K.booked_conversations)} sub={pct(K.booking_rate)} d={delta(K.booked_conversations, P.booked_conversations)} prev={num(P.booked_conversations)} good="up" info="Conversations with a “📅 Demo booking” private note (written by the Book button). Rate = of active conversations." />
            <Kpi label="Waiting now" value={live ? num(live.waiting.length) : '…'} sub={live?.waiting[0] ? `oldest ${dur(biz ? live.waiting[0].wait_biz_s : live.waiting[0].wait_s)}` : undefined} tone={live && live.waiting.length > 0 ? 'warn' : undefined} info="Open/pending conversations whose last public message is from the customer (no reply yet). Live, not date-filtered." />
          </section>

          <Card title="Volume" className="span2" info="Messages per bucket (ET). Inbound = customer texts, Outbound = agent replies, Automated = non-human outgoing. Conversations = created."
            csv={() => downloadCsv(`via-volume-${data.range.from}_${data.range.to}.csv`, ['bucket_et', 'inbound', 'outbound', 'automated', 'new_conversations', 'new_customers', 'returning_customers'], cur.series.map((s) => [s.b, s.inbound, s.outbound, s.automated, s.conversations, s.new_customers, s.returning_customers]))}>
            <TimeChart data={fill(cur.series, data.range)} labels={fill(cur.series, data.range).map((s) => bucketLabel(String(s.b), data.range.bucket, true))}
              series={[{ key: 'inbound', label: 'Inbound', color: C.in }, { key: 'outbound', label: 'Outbound', color: C.out }, { key: 'conversations', label: 'New conversations', color: C.conv }]} />
          </Card>

          <Card title="Busiest hours" info={`${heatMetric === 'inbound' ? 'Customer texts' : 'Agent replies'} by weekday × hour, Eastern time. Outlined cells are business hours (${bhText}).`}
            actions={<div className="segmented mini-seg"><button className={heatMetric === 'inbound' ? 'on' : ''} onClick={() => setHeatMetric('inbound')}>In</button><button className={heatMetric === 'outbound' ? 'on' : ''} onClick={() => setHeatMetric('outbound')}>Out</button></div>}
            csv={() => downloadCsv(`via-heatmap-${data.range.from}_${data.range.to}.csv`, ['weekday', 'hour_et', 'inbound', 'outbound'], cur.heatmap.map((h) => [DOW[h.dow], hourLabel(h.hour), h.inbound, h.outbound]))}>
            <Heatmap cells={cur.heatmap} metric={heatMetric} open={isOpenCell} />
          </Card>

          <Card title="New vs returning customers" info="New conversations from a number that never texted before vs. from a number with an earlier conversation.">
            <SplitBar parts={[{ label: 'New', value: K.new_customers, color: C.newc }, { label: 'Returning', value: K.returning_customers, color: C.ret }]} />
            <p className="muted small">Prior period: {num(P.new_customers)} new · {num(P.returning_customers)} returning</p>
            <TimeChart mode="stacked" height={150} data={fill(cur.series, data.range)} labels={fill(cur.series, data.range).map((s) => bucketLabel(String(s.b), data.range.bucket, true))}
              series={[{ key: 'new_customers', label: 'New', color: C.newc }, { key: 'returning_customers', label: 'Returning', color: C.ret }]} />
          </Card>

          <Card title="Responsiveness" info={`Business hours = ${bhText} (change in Settings). Both columns use the same conversations.`}
            csv={() => downloadCsv(`via-responsiveness-${data.range.from}_${data.range.to}.csv`, ['metric', 'business_hours_seconds', 'wall_clock_seconds', 'prior_business_hours_seconds', 'prior_wall_clock_seconds', 'n'], respRows(K, P).map((r) => [r[0], round(r[1]), round(r[2]), round(r[3]), round(r[4]), r[5]]))}>
            <table className="mg-table compact">
              <thead><tr><th>Metric</th><th>Business hrs</th><th>Wall clock</th><th>Prior (biz)</th></tr></thead>
              <tbody>{respRows(K, P).map((r) => <tr key={r[0]}><td>{r[0]}</td><td className={biz ? 'em' : ''}>{dur(r[1])}</td><td className={!biz ? 'em' : ''}>{dur(r[2])}</td><td className="muted">{dur(r[3])}</td></tr>)}</tbody>
            </table>
            <p className="muted small">{num(K.frt_answered)} first responses · {num(K.frt_unanswered)} customer-started conversations still without a reply · {num(K.replies)} replies timed</p>
            <div className="mg-sub">First response distribution ({biz ? 'business hours' : 'wall clock'})</div>
            <HBars rows={cur.frt_hist.map((h) => ({ label: h.label, value: biz ? h.business : h.wall }))} color={C.out} />
          </Card>

          <Card title="Outcomes" info="Status right now of conversations active in the period. Labels count conversations carrying each label."
            csv={() => downloadCsv(`via-labels-${data.range.from}_${data.range.to}.csv`, ['label', 'conversations', 'share_of_active'], cur.labels.map((l) => [l.label, l.conversations, l.share == null ? '' : l.share.toFixed(4)]))}>
            <SplitBar parts={[{ label: 'Open', value: cur.status.open ?? 0, color: C.out }, { label: 'Pending', value: cur.status.pending ?? 0, color: C.auto }, { label: 'Snoozed', value: cur.status.snoozed ?? 0, color: C.ret }, { label: 'Resolved', value: cur.status.resolved ?? 0, color: C.newc }]} />
            <div className="mg-sub">Labels</div>
            <HBars rows={cur.labels.map((l) => ({ label: l.label, value: l.conversations, sub: pct(l.share), color: meta?.labels.find((x) => x.title === l.label)?.color }))} />
            <div className="mg-stat-row">
              <Stat label="Booked (proxy)" value={num(K.booked_conversations)} sub={`${pct(K.booking_rate)} of active · prior ${num(P.booked_conversations)}`} />
              <Stat label="Resolved conversations" value={num(K.resolved_conversations)} sub={`prior ${num(P.resolved_conversations)}`} />
            </div>
          </Card>

          <Card title="Agent leaderboard" className="span2" info="Per agent in the period. Conversations = had at least one public reply from the agent. First response = conversations where they sent the first reply. Resolutions = Chatwoot resolve events attributed to the assignee."
            csv={() => downloadCsv(`via-agents-${data.range.from}_${data.range.to}.csv`, ['agent', 'conversations', 'messages_sent', 'first_responses', 'median_first_response_s_business', 'median_first_response_s_wall', 'avg_reply_s_wall', 'resolutions', 'private_notes', 'bookings', 'ai_used', 'ai_edited', 'ai_dismissed', 'eta_clicks', 'offer_day_clicks'],
              leaderboard(cur).map((a) => [agentName(a.user_id), a.conversations, a.messages, a.first_responses, round(a.frt_median_biz), round(a.frt_median), round(a.reply_mean), a.resolutions, a.notes, a.bookings, ev(cur, a.user_id, 'ai_suggestion_used'), ev(cur, a.user_id, 'ai_suggestion_edited'), ev(cur, a.user_id, 'ai_suggestion_dismissed'), ev(cur, a.user_id, 'quick_eta'), ev(cur, a.user_id, 'quick_offer_day')]))}>
            <div className="mg-scroll">
              <table className="mg-table">
                <thead><tr><th>#</th><th>Agent</th><th className="r">Conversations</th><th className="r">Messages</th><th className="r">Median 1st reply</th><th className="r">Avg reply</th><th className="r">Resolutions</th><th className="r">Notes</th><th className="r">Bookings</th><th className="r">AI used</th></tr></thead>
                <tbody>
                  {leaderboard(cur).map((a, i) => (
                    <tr key={a.user_id}>
                      <td className="muted">{i + 1}</td><td><b>{agentName(a.user_id)}</b></td><td className="r">{num(a.conversations)}</td><td className="r">{num(a.messages)}</td>
                      <td className="r">{dur(biz ? a.frt_median_biz : a.frt_median)}</td><td className="r">{dur(a.reply_mean)}</td><td className="r">{num(a.resolutions)}</td>
                      <td className="r">{num(a.notes)}</td><td className="r">{num(a.bookings)}</td><td className="r">{num(ev(cur, a.user_id, 'ai_suggestion_used') + ev(cur, a.user_id, 'ai_suggestion_edited'))}</td>
                    </tr>
                  ))}
                  {cur.agents.length === 0 && <tr><td colSpan={10} className="muted">No agent activity in this period</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="muted small">Avg reply is wall clock. Median 1st reply follows the Business hrs / Wall clock switch.</p>
          </Card>

          <Card title="AI suggestions" info="From VIA Chat usage events (logged by the inbox since this dashboard shipped; demo history is synthetic). Rates are of suggestions shown. “Ignored” = shown but the agent typed their own reply."
            csv={() => downloadCsv(`via-ai-${data.range.from}_${data.range.to}.csv`, ['metric', 'count', 'rate_of_shown', 'prior_count'], aiRows(cur.events.ai, prev.events.ai))}>
            <div className="mg-stat-row">
              <Stat label="Shown" value={num(cur.events.ai.shown)} sub={`prior ${num(prev.events.ai.shown)}`} />
              <Stat label="Used as-is" value={pct(cur.events.ai.use_rate)} sub={`${num(cur.events.ai.used)} · prior ${pct(prev.events.ai.use_rate)}`} />
              <Stat label="Edited" value={pct(cur.events.ai.edit_rate)} sub={`${num(cur.events.ai.edited)} · prior ${pct(prev.events.ai.edit_rate)}`} />
              <Stat label="Dismissed" value={pct(cur.events.ai.dismiss_rate)} sub={`${num(cur.events.ai.dismissed)} · prior ${pct(prev.events.ai.dismiss_rate)}`} />
            </div>
            <SplitBar parts={[{ label: 'Used', value: cur.events.ai.used, color: C.newc }, { label: 'Edited', value: cur.events.ai.edited, color: C.out }, { label: 'Dismissed', value: cur.events.ai.dismissed, color: C.conv }, { label: 'Ignored', value: cur.events.ai.ignored, color: C.in }]} />
            <p className="muted small">{num(cur.events.ai.sent)} sent from a suggestion · {num(cur.events.ai.sent_unmodified)} unchanged, {num(cur.events.ai.sent_modified)} reworded before sending</p>
            <div className="mg-sub">Quick actions</div>
            <div className="mg-stat-row">
              <Stat label="Send ETA" value={num(cur.events.quick.eta)} sub={`prior ${num(prev.events.quick.eta)}${cur.events.quick.eta_minutes.length ? ' · ' + cur.events.quick.eta_minutes.map((m) => `${m.minutes}m×${m.n}`).join(' ') : ''}`} />
              <Stat label="Offer a day" value={num(cur.events.quick.offer_day)} sub={`prior ${num(prev.events.quick.offer_day)}`} />
              <Stat label="Book (demo)" value={num(cur.events.quick.book)} sub={`prior ${num(prev.events.quick.book)}`} />
            </div>
          </Card>

          <Card title="Live now" className="span2" info={`Refreshes every 30 s. Online status comes from Chatwoot presence. VIA is ${live?.is_open_now ? 'open' : 'closed'} right now (${bhText}).`}
            csv={live ? () => downloadCsv(`via-live-${todayET()}.csv`, ['queue', 'conversation', 'customer', 'phone_last4', 'assignee', 'inbox', 'waiting_since_et', 'wait_business_s', 'wait_wall_s'],
              [...live.waiting.map((w) => ['waiting', w.display_id, w.name ?? '', maskPhone(w.phone_number), agentName(w.assignee_id), inboxName(w.inbox_id), etStamp(w.waiting_since), Math.round(w.wait_biz_s), Math.round(w.wait_s)]),
               ...live.unassigned.map((u) => ['unassigned', u.display_id, u.name ?? '', maskPhone(u.phone_number), 'Unassigned', inboxName(u.inbox_id), u.last_at ? etStamp(u.last_at) : '', '', ''])]) : undefined}>
            {!live ? <div className="muted">Loading…</div> : (
              <div className="mg-live">
                <div>
                  <div className="mg-sub">Team</div>
                  <ul className="mg-people">
                    {(live.agents ?? []).map((a) => {
                      const o = live.open_by_agent.find((x) => x.user_id === a.id);
                      return <li key={a.id}><span className={`presence ${a.availability}`} aria-label={a.availability} /> <b>{a.name}</b> <span className="muted small">{a.availability}</span><span className="mg-pill">{o?.open ?? 0} open{o?.pending ? ` · ${o.pending} pending` : ''}</span></li>;
                    })}
                    <li><span className="presence off" /> <b>Unassigned</b><span className="mg-pill warn">{live.open_by_agent.find((x) => x.user_id == null)?.open ?? 0} open</span></li>
                  </ul>
                </div>
                <div>
                  <div className="mg-sub">Waiting for a reply ({live.waiting.length})</div>
                  <QueueList rows={live.waiting.slice(0, 8).map((w) => ({ id: w.display_id, who: w.name || maskPhone(w.phone_number), right: dur(biz ? w.wait_biz_s : w.wait_s), sub: agentName(w.assignee_id), warn: (biz ? w.wait_biz_s : w.wait_s) > 900 }))} empty="Nobody is waiting 🎉" />
                </div>
                <div>
                  <div className="mg-sub">Unassigned queue ({live.unassigned.length})</div>
                  <QueueList rows={live.unassigned.slice(0, 8).map((u) => ({ id: u.display_id, who: u.name || maskPhone(u.phone_number), right: u.last_at ? dur((Date.now() - u.last_at) / 1000) + ' ago' : '', sub: u.status }))} empty="Queue is empty" />
                </div>
              </div>
            )}
          </Card>

          <div className="mg-stack">
          <Card title="Ray handoffs" info="Conversations with Ray's handoff note (a private note starting “📞 Escalated from Ray”). Share = of new conversations.">
            <div className="mg-stat-row">
              <Stat label="From Ray" value={num(K.ray_conversations)} sub={`${pct(K.ray_share)} of new · prior ${num(P.ray_conversations)}`} />
              <Stat label="Booked overall" value={pct(K.booking_rate)} sub="all conversations, for comparison" />
            </div>
            <p className="muted small">Ray (voice agent) isn&apos;t connected yet; the demo history includes synthetic handoff notes in the same format the inbox shows.</p>
          </Card>
          <Card title="Messaging charges" info="One message = one text received from a customer or one reply sent by an agent. Private team notes, activity lines, automated messages and anything marked Not Delivered aren't counted."
            csv={() => {
              const ch = cur.charges;
              const rows: (string | number)[][] = ch.by_bucket.map((b) => ['period', bucketLabel(b.b, data.range.bucket) + ' ET', b.b, b.messages_in, b.messages_out, b.messages, b.amount.toFixed(2)]);
              ch.by_agent.filter((a) => a.messages_out > 0).forEach((a) => rows.push(['agent (replies sent)', agentName(a.user_id), '', '', a.messages_out, a.messages_out, a.amount.toFixed(2)]));
              rows.push(['total', `${data.range.from} – ${data.range.to}`, '', ch.messages_in, ch.messages_out, ch.messages, ch.amount.toFixed(2)]);
              downloadCsv(`via-messaging-charges-${data.range.from}_${data.range.to}.csv`, ['row', 'period_or_agent', 'bucket_start_et', 'messages_in', 'messages_out', 'messages', `charge_usd_at_${ch.rate_per_message}`], rows);
            }}>
            <div className="mg-stat-row">
              <Stat label="Messages (in + out)" value={num(cur.charges.messages)} sub={`prior ${num(prev.charges.messages)}`} />
              <Stat label="Est. charge" value={usd(cur.charges.amount)} sub={`@ ${rateStr(cur.charges.rate_per_message)}/message · prior ${usd(prev.charges.amount)}`} />
            </div>
            <p className="muted small">{num(cur.charges.messages_in)} received · {num(cur.charges.messages_out)} sent</p>
            <p className="small">Includes message carriage, hosting and support.<br />Phone lines and numbers are billed separately by VIA&apos;s carrier.</p>
          </Card>
          {data.internal && (
            <Card title="LockStep cost (internal)" className="mg-internal" info="Visible to LockStep only (Chatwoot super admins and LOCKSTEP_INTERNAL_EMAILS); the server never sends these numbers to VIA users. Cost = estimated SMS segments (GSM-7 160/153, Unicode 70/67) × cost rate."
              csv={() => downloadCsv(`lockstep-internal-cost-${data.range.from}_${data.range.to}.csv`, ['bucket_start_et', 'messages', 'segments', 'revenue_usd', 'cost_usd', 'margin_usd'],
                [...data.internal!.by_bucket.map((b) => [b.b, b.messages, b.segments, b.revenue.toFixed(2), b.cost.toFixed(2), b.margin.toFixed(2)]),
                 ['total', cur.charges.messages, data.internal!.current.segments, data.internal!.current.revenue.toFixed(2), data.internal!.current.cost.toFixed(2), data.internal!.current.margin.toFixed(2)]])}>
              <div className="mg-placeholder">Internal · not shown to VIA</div>
              <div className="mg-stat-row">
                <Stat label="Segments (in + out)" value={num(data.internal.current.segments)} sub={`prior ${num(data.internal.previous.segments)}`} />
                <Stat label="Cost" value={usd(data.internal.current.cost)} sub={`@ ${rateStr(data.internal.cost_rate_per_segment)}/segment · prior ${usd(data.internal.previous.cost)}`} />
              </div>
              <div className="mg-stat-row">
                <Stat label="Revenue" value={usd(data.internal.current.revenue)} sub={`${num(cur.charges.messages)} msgs × ${rateStr(data.internal.revenue_rate_per_message)}`} />
                <Stat label="Margin" value={usd(data.internal.current.margin)} sub={`${pct(data.internal.current.margin_pct)} · prior ${usd(data.internal.previous.margin)}`} />
              </div>
            </Card>
          )}
          </div>

          <p className="mg-foot muted small span3">
            All times Eastern. Comparison = the same number of days immediately before. Data: Chatwoot (read-only) + VIA Chat usage events. Computed in {data.compute_ms} ms, cached ≤ 60 s.
          </p>
        </main>
      )}
      {settingsOpen && <SettingsSheet onClose={(changed) => { setSettingsOpen(false); if (changed) load(); }} />}
    </div>
  );
}

// ---------- helpers ----------
const round = (v: number | null) => (v == null ? '' : Math.round(v));
const ev = (cur: Overview['current'], uid: number, type: string) => cur.events.agents[String(uid)]?.[type] ?? 0;
const leaderboard = (cur: Overview['current']) => [...cur.agents].sort((a, b) => b.conversations - a.conversations || b.messages - a.messages);
function respRows(K: Kpis, P: Kpis): [string, number | null, number | null, number | null, number | null, number][] {
  return [
    ['First response · median', K.frt_median_biz, K.frt_median, P.frt_median_biz, P.frt_median, K.frt_answered],
    ['First response · p90', K.frt_p90_biz, K.frt_p90, P.frt_p90_biz, P.frt_p90, K.frt_answered],
    ['Reply time · average', K.reply_mean_biz, K.reply_mean, P.reply_mean_biz, P.reply_mean, K.replies],
    ['Reply time · median', K.reply_median_biz, K.reply_median, P.reply_median_biz, P.reply_median, K.replies],
    ['Time to resolve · median', K.resolution_median_biz, K.resolution_median, P.resolution_median_biz, P.resolution_median, K.resolutions],
    ['Time to resolve · p90', K.resolution_p90_biz, K.resolution_p90, P.resolution_p90_biz, P.resolution_p90, K.resolutions],
  ];
}
function aiRows(a: Overview['current']['events']['ai'], p: Overview['current']['events']['ai']) {
  return [['shown', a.shown, '', p.shown], ['used', a.used, a.use_rate ?? '', p.used], ['edited', a.edited, a.edit_rate ?? '', p.edited], ['dismissed', a.dismissed, a.dismiss_rate ?? '', p.dismissed], ['ignored', a.ignored, a.ignore_rate ?? '', p.ignored], ['sent_from_suggestion', a.sent, a.sent_rate ?? '', p.sent], ['sent_unchanged', a.sent_unmodified, '', p.sent_unmodified]];
}
/** Fill missing buckets so the x-axis is continuous. */
function fill(series: Overview['current']['series'], r: Overview['range']) {
  const map = new Map(series.map((s) => [s.b, s]));
  const keys: string[] = [];
  if (r.bucket === 'hour') for (let h = 0; h < 24; h++) keys.push(`${r.from}T${String(h).padStart(2, '0')}:00`);
  else if (r.bucket === 'day') for (let d = r.from; d <= r.to; d = addDays(d, 1)) keys.push(`${d}T00:00`);
  else return series;
  return keys.map((k) => map.get(k) ?? { b: k, inbound: 0, outbound: 0, automated: 0, conversations: 0, new_customers: 0, returning_customers: 0 });
}
function describeHours(s: Overview['business_hours']) {
  const fmt = (h: number) => { const hh = Math.floor(h), mm = Math.round((h % 1) * 60); return `${hh % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${hh < 12 ? 'am' : 'pm'}`; };
  const groups: string[] = [];
  const order = [1, 2, 3, 4, 5, 6, 0];
  let i = 0;
  while (i < 7) {
    const w = s.days[String(order[i])];
    if (!w) { i++; continue; }
    let j = i;
    while (j + 1 < 7 && JSON.stringify(s.days[String(order[j + 1])]) === JSON.stringify(w)) j++;
    groups.push(`${DOW[order[i]]}${j > i ? '–' + DOW[order[j]] : ''} ${fmt(w[0])}–${fmt(w[1])}`);
    i = j + 1;
  }
  return (groups.join(', ') || 'closed') + ' ET';
}

function Card({ title, info, children, className = '', csv, actions }: { title: string; info?: string; children: ReactNode; className?: string; csv?: () => void; actions?: ReactNode }) {
  return (
    <section className={`mg-card ${className}`} aria-label={title}>
      <div className="mg-card-h">
        <h2>{title}</h2>
        {info && <span className="mg-info" tabIndex={0} {...tip('How this is computed', info)}>ⓘ</span>}
        <span className="mg-card-tools">
          {actions}
          {csv && <button className="icon-btn" onClick={csv} {...tip('Download CSV', `Export “${title}” for this date range`)}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>}
        </span>
      </div>
      {children}
    </section>
  );
}
function Kpi({ label, value, sub, d, prev, good = 'neutral', info, tone }: { label: string; value: string; sub?: string; d?: number | null; prev?: string; good?: 'up' | 'down' | 'neutral'; info: string; tone?: 'warn' }) {
  const dir = d == null || Math.abs(d) < 0.005 ? 0 : d > 0 ? 1 : -1;
  const cls = good === 'neutral' || dir === 0 ? 'flat' : (dir > 0) === (good === 'up') ? 'good' : 'bad';
  return (
    <div className={`mg-kpi ${tone ?? ''}`} tabIndex={0} {...tip(label, info)}>
      <div className="mg-kpi-l">{label}</div>
      <div className="mg-kpi-v">{value}{sub && <small> {sub}</small>}</div>
      {d !== undefined && <div className={`mg-kpi-d ${cls}`}>{d == null ? '—' : `${dir > 0 ? '▲' : dir < 0 ? '▼' : '•'} ${Math.abs(d * 100).toFixed(0)}%`}<span className="muted"> vs {prev}</span></div>}
    </div>
  );
}
const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="mg-stat"><div className="mg-kpi-l">{label}</div><div className="mg-stat-v">{value}</div>{sub && <div className="muted small">{sub}</div>}</div>
);
function QueueList({ rows, empty }: { rows: { id: number; who: string; right: string; sub?: string; warn?: boolean }[]; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="mg-queue">
      {rows.map((r) => (
        <li key={r.id}><span className="mono muted">#{r.id}</span> <b>{r.who}</b>{r.sub && <span className="muted small"> · {r.sub}</span>}<span className={`mg-pill ${r.warn ? 'warn' : ''}`}>{r.right}</span></li>
      ))}
    </ul>
  );
}

function SettingsSheet({ onClose }: { onClose: (changed: boolean) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [holidays, setHolidays] = useState('');
  useEffect(() => { api<Settings>('/settings').then((x) => { setS(x); setHolidays((x.business_hours.holidays ?? []).join(', ')); }).catch((e) => setErr(String(e.message))); }, []);
  const save = async () => {
    if (!s) return;
    try {
      const h = holidays.split(/[\s,]+/).filter(Boolean);
      await api('/settings', { method: 'PUT', body: { business_hours: { ...s.business_hours, holidays: h }, ...(s.can_edit_rates ? { billing: { rate_per_message: s.billing.rate_per_message }, ...(s.internal_cost ? { internal_cost: { rate_per_segment: s.internal_cost.rate_per_segment } } : {}) } : {}) } });
      onClose(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const setDay = (d: number, w: [number, number] | null) => s && setS({ ...s, business_hours: { ...s.business_hours, days: { ...s.business_hours.days, [d]: w } } });
  const toTime = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const fromTime = (v: string) => { const [a, b] = v.split(':').map(Number); return a + (b || 0) / 60; };
  return (
    <div className="mg-sheet-bg" onClick={() => onClose(false)}>
      <div className="mg-sheet" role="dialog" aria-label="Dashboard settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        {err && <div className="mg-error">{err}</div>}
        {!s ? <p className="muted">Loading…</p> : (
          <>
            <div className="mg-sub">Business hours (Eastern)</div>
            <table className="mg-table compact"><tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const w = s.business_hours.days[String(d)] ?? null;
                return (
                  <tr key={d}>
                    <td><label><input type="checkbox" checked={!!w} onChange={(e) => setDay(d, e.target.checked ? [8, 17] : null)} /> {DOW[d]}</label></td>
                    <td>{w ? <><input type="time" value={toTime(w[0])} onChange={(e) => setDay(d, [fromTime(e.target.value), w[1]])} aria-label={`${DOW[d]} opens`} /> – <input type="time" value={toTime(w[1])} onChange={(e) => setDay(d, [w[0], fromTime(e.target.value)])} aria-label={`${DOW[d]} closes`} /></> : <span className="muted">Closed</span>}</td>
                  </tr>
                );
              })}
            </tbody></table>
            <label className="mg-field">Holidays (closed all day), YYYY-MM-DD, comma separated
              <input value={holidays} onChange={(e) => setHolidays(e.target.value)} placeholder="2026-11-26, 2026-12-25" />
            </label>
            <div className="mg-sub">Messaging charge</div>
            <label className="mg-field">Rate per message (USD){!s.can_edit_rates && ' · set by LockStep'}
              <input type="number" step="0.001" min="0" value={s.billing.rate_per_message} disabled={!s.can_edit_rates} onChange={(e) => setS({ ...s, billing: { ...s.billing, rate_per_message: Number(e.target.value) } })} />
            </label>
            {s.internal_cost && (
              <label className="mg-field">LockStep cost per segment (USD, internal)
                <input type="number" step="0.0001" min="0" value={s.internal_cost.rate_per_segment} onChange={(e) => setS({ ...s, internal_cost: { ...s.internal_cost!, rate_per_segment: Number(e.target.value) } })} />
              </label>
            )}
            <div className="row-btns"><button className="mg-btn" onClick={() => onClose(false)}>Cancel</button><button className="mg-btn primary" onClick={save}>Save</button></div>
          </>
        )}
      </div>
    </div>
  );
}
