import { useMemo, useState, type RefObject } from 'react';
import type { Agent, Conversation } from '../data/types';
import { Avatar } from './Avatar';
import { listTime } from '../util';
import { tip } from './Tooltip';
import { Logo } from './Logo';

interface Props {
  convs: Conversation[]; selectedId: string | null; onSelect: (id: string) => void;
  searchRef: RefObject<HTMLInputElement>; agents: Agent[]; agentId: string; onAgent: (id: string) => void;
  typing: Record<string, boolean>; theme: string; onTheme: () => void; sound: boolean; onSound: () => void;
  /** Real backend: the agent is whoever signed in; no switcher. */
  signedIn?: { name: string; onSignOut: () => void };
  /** Shown only when the server says this user is a manager (GET /api/analytics/whoami = 200). */
  manageHref?: string;
}
type Filter = 'open' | 'mine' | 'resolved';

export function Sidebar(p: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return p.convs.filter((c) => {
      if (needle) {
        const digits = needle.replace(/\D/g, '');
        return (c.name ?? '').toLowerCase().includes(needle) || (digits && c.phone.replace(/\D/g, '').includes(digits)) || (c.lastMessage?.text ?? '').toLowerCase().includes(needle);
      }
      if (filter === 'mine') return c.assigneeId === p.agentId && c.status === 'open';
      if (filter === 'resolved') return c.status === 'resolved';
      return c.status === 'open';
    });
  }, [p.convs, q, filter, p.agentId]);
  const pinned = !q && filter === 'open' ? shown.filter((c) => c.pinned) : [];
  const rest = !q && filter === 'open' ? shown.filter((c) => !c.pinned) : shown;
  // Unread badge = open conversations only (a long resolved history shouldn't inflate it).
  const unreadTotal = p.convs.reduce((a, c) => a + (c.unread && c.status !== 'resolved' ? 1 : 0), 0);

  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="side-top">
        <div className="brand"><Logo /> <span className="brand-word">Chat</span>{unreadTotal > 0 && <span className="badge" aria-label={`${unreadTotal} unread`}>{unreadTotal}</span>}</div>
        <div className="side-tools">
          {p.manageHref && <a className="icon-btn manage-link" href={p.manageHref} {...tip('Manager Dashboard', 'Team analytics (managers only)')}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
          </a>}
          <button className="icon-btn" onClick={p.onSound} aria-pressed={p.sound} {...tip('Notifications', p.sound ? 'Sound on · click to mute' : 'Sound off · click to unmute')}>
            {p.sound ? '🔔' : '🔕'}
          </button>
          <button className="icon-btn" onClick={p.onTheme} {...tip('Light / Dark Mode', `Now: ${p.theme === 'system' ? 'match system' : p.theme}`)}>
            {p.theme === 'dark' ? '🌙' : p.theme === 'light' ? '☀️' : '◐'}
          </button>
        </div>
      </div>
      {p.signedIn ? (
        <div className="agent-switch signed-in">
          <span title="Signed in with Chatwoot">{p.signedIn.name} · Dispatch</span>
          <button className="link-btn" onClick={p.signedIn.onSignOut} {...tip('Sign Out')}>Sign out</button>
        </div>
      ) : (
        <label className="agent-switch">
          <span className="sr-only">Signed in as</span>
          <select value={p.agentId} onChange={(e) => p.onAgent(e.target.value)} aria-label="Switch dispatcher">
            {p.agents.map((a) => <option key={a.id} value={a.id}>{a.name} · Dispatch</option>)}
          </select>
        </label>
      )}
      <div className="search">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.4" fill="none" /><path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        <input ref={p.searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search conversations (Ctrl+K)"
          onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } if (e.key === 'Enter' && shown[0]) p.onSelect(shown[0].id); }} />
        <kbd {...tip('Search shortcut', 'Ctrl/⌘ + K')}>⌘K</kbd>
      </div>
      <div className="segmented" role="tablist" aria-label="Filter">
        {(['open', 'mine', 'resolved'] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : f === 'mine' ? 'Mine' : 'Resolved'}
          </button>
        ))}
      </div>
      <div className="conv-scroll">
        {pinned.length > 0 && (
          <div className="pinned" aria-label="Pinned">
            {pinned.map((c) => (
              <button key={c.id} className={`pin ${c.id === p.selectedId ? 'sel' : ''}`} onClick={() => p.onSelect(c.id)} aria-label={`Pinned: ${c.name ?? c.phone}${c.unread ? ', unread' : ''}`}>
                <div className="pin-av"><Avatar name={c.name} phone={c.phone} size={56} />{c.unread > 0 && <span className="pin-dot" />}</div>
                <span className="pin-name">{c.name?.split(' ')[0] ?? c.phone}</span>
                {c.unread > 0 && c.lastMessage && <span className="pin-peek">{c.lastMessage.text || 'Photo'}</span>}
              </button>
            ))}
          </div>
        )}
        <ul className="conv-list">
          {rest.map((c) => (
            <li key={c.id}>
              <button className={`conv ${c.id === p.selectedId ? 'sel' : ''}`} onClick={() => p.onSelect(c.id)} aria-current={c.id === p.selectedId}>
                <span className={`dot ${c.unread ? 'on' : ''}`} aria-label={c.unread ? 'Unread' : undefined} />
                <Avatar name={c.name} phone={c.phone} size={40} />
                <span className="conv-body">
                  <span className="conv-row"><span className="conv-name">{c.name || c.phone}</span><span className="conv-time">{c.lastMessage ? listTime(c.lastMessage.at) : ''} ›</span></span>
                  <span className="conv-prev">
                    {p.typing[c.id] ? <em>typing…</em> : c.lastMessage ? (c.lastMessage.direction === 'out' ? 'You: ' : '') + (c.lastMessage.text || '📷 Photo') : 'No messages'}
                  </span>
                  {(c.handoff || c.assigneeId) && (
                    <span className="conv-tags">
                      {c.handoff && <span className="mini ray">Ray handoff</span>}
                      {c.assigneeId && <span className="mini">{p.agents.find((a) => a.id === c.assigneeId)?.name}</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {rest.length === 0 && pinned.length === 0 && <li className="none">No conversations</li>}
        </ul>
      </div>
    </aside>
  );
}
