import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tip } from './Tooltip';
import { adapter } from '../store';
import type { Agent, Conversation, Customer, Message, Tapback } from '../data/types';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { clock, dividerTime } from '../util';

export const TAPBACKS: { k: Tapback; icon: string; label: string }[] = [
  { k: 'heart', icon: '❤️', label: 'Heart' },
  { k: 'thumbsup', icon: '👍', label: 'Like' },
  { k: 'ha', icon: 'HA', label: 'Laugh' },
  { k: 'emphasis', icon: '‼️', label: 'Emphasize' },
  { k: 'question', icon: '❓', label: 'Question' },
];

interface Props {
  conv: Conversation; messages: Message[]; typing: boolean; customer: Customer | null;
  agent?: Agent; agents: Agent[]; onBack: () => void; panelOpen: boolean; onTogglePanel: () => void;
  insert: { text: string; n: number } | null; toast: (t: string, b?: string) => void;
}

const GAP = 45 * 60_000;
const GROUP = 3 * 60_000;

export function Thread(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; out: boolean } | null>(null);
  const [lightbox, setLightbox] = useState<Message | null>(null);
  const press = useRef<ReturnType<typeof setTimeout>>();

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: p.messages.length && el.scrollTop > 0 ? 'smooth' : 'auto' });
  }, [p.messages.length, p.typing]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.tapback-menu')) setMenu(null); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);

  const openMenu = (m: Message, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const host = scroller.current!.getBoundingClientRect();
    setMenu({ id: m.id, x: m.direction === 'out' ? r.right - host.left : r.left - host.left, y: r.top - host.top + scroller.current!.scrollTop, out: m.direction === 'out' });
  };
  const react = async (k: Tapback) => {
    if (!menu) return;
    const m = p.messages.find((x) => x.id === menu.id);
    const has = m?.meta?.tapbacks?.includes(k);
    await adapter.setTapback(menu.id, has ? null : k);
    setMenu(null);
  };

  const lastOut = [...p.messages].reverse().find((m) => m.direction === 'out' && !m.note);
  const assignee = p.agents.find((a) => a.id === p.conv.assigneeId);
  const mine = p.agent && p.conv.assigneeId === p.agent.id;

  return (
    <div className="thread">
      <header className="thread-head">
        <button className="back" onClick={p.onBack} {...tip('Back to Conversations')}>‹<span>Chats</span></button>
        <div className="who">
          <Avatar name={p.conv.name} phone={p.conv.phone} size={30} />
          <div><div className="who-name">{p.conv.name || p.conv.phone}</div>
            <div className="who-sub">{p.conv.name ? p.conv.phone + ' · ' : ''}SMS{assignee ? ` · ${assignee.name}` : ' · Unassigned'}</div></div>
        </div>
        <div className="head-actions">
          {!mine && p.agent && (
            <button className="pill" onClick={async () => { await adapter.assign(p.conv.id, p.agent!.id); p.toast('Assigned to you'); }}>Assign to me</button>
          )}
          {p.conv.status === 'open' ? (
            <button className="pill" onClick={async () => { await adapter.setStatus(p.conv.id, 'resolved'); p.toast('Marked resolved', p.conv.name || p.conv.phone); }}>✓ Resolve</button>
          ) : (
            <button className="pill" onClick={() => adapter.setStatus(p.conv.id, 'open')}>Reopen</button>
          )}
          <button className="icon-btn pin-btn" onClick={() => adapter.togglePin(p.conv.id)} {...tip(p.conv.pinned ? 'Unpin Conversation' : 'Pin Conversation', p.conv.pinned ? undefined : 'Keeps it at the top of the list')}>📌</button>
          <button className={`icon-btn info ${p.panelOpen ? 'on' : ''}`} onClick={p.onTogglePanel} aria-pressed={p.panelOpen} {...tip('Customer Details', 'Ctrl/⌘+I')}>ⓘ</button>
        </div>
      </header>

      <div className="messages" ref={scroller} aria-live="polite" aria-label="Messages">
        {p.conv.handoff && (
          <div className="handoff">
            <div className="sys-banner">Escalated from {p.conv.handoff.source} at {clock(p.conv.handoff.at)}</div>
            <div className="call-card">
              <div className="call-top"><span className="ray-dot">R</span><div><strong>Call summary</strong><small>Ray · {Math.floor(p.conv.handoff.durationSec / 60)}m {p.conv.handoff.durationSec % 60}s · {p.conv.handoff.reason}</small></div></div>
              <p>{p.conv.handoff.summary}</p>
              <ul>{p.conv.handoff.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          </div>
        )}
        {p.conv.status === 'resolved' && <div className="sys-banner subtle">This conversation is resolved</div>}
        {p.messages.map((m, i) => {
          const prev = p.messages[i - 1], next = p.messages[i + 1];
          const showTime = !prev || m.at - prev.at > GAP;
          const groupedWithNext = next && next.direction === m.direction && next.at - m.at < GROUP && !(next.at - m.at > GAP);
          const groupedWithPrev = prev && prev.direction === m.direction && m.at - prev.at < GROUP && !showTime;
          const dt = dividerTime(m.at);
          const tbs = m.meta?.tapbacks ?? [];
          if (m.note) {
            return (
              <Fragment key={m.id}>
                {showTime && <div className="divider"><b>{dt.day}</b> {dt.t}</div>}
                <div className="note-row" role="note" aria-label={`Private note${m.senderName ? ' from ' + m.senderName : ''}: ${m.text}`}>
                  <div className="note"><span className="note-tag">Team note{m.senderName ? ` · ${m.senderName}` : ''} · {clock(m.at)} · not sent to customer</span>{m.text}</div>
                </div>
              </Fragment>
            );
          }
          return (
            <Fragment key={m.id}>
              {showTime && <div className="divider"><b>{dt.day}</b> {dt.t}</div>}
              <div className={`row ${m.direction} ${groupedWithPrev ? 'gp' : ''} ${tbs.length ? 'has-tb' : ''}`}>
                <div
                  className={`bubble ${m.attachment && !m.text ? 'media' : ''} ${!groupedWithNext ? 'tail' : ''}`}
                  tabIndex={0}
                  aria-label={`${m.direction === 'in' ? 'Customer' : 'You'}: ${m.text || m.attachment?.alt}. ${clock(m.at)}. Press Shift+F10 for tapbacks.`}
                  title={clock(m.at)}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(m, e.currentTarget); }}
                  onKeyDown={(e) => { if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') { e.preventDefault(); openMenu(m, e.currentTarget); } }}
                  onPointerDown={(e) => { if (e.pointerType !== 'mouse') { const el = e.currentTarget; press.current = setTimeout(() => openMenu(m, el), 450); } }}
                  onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)}
                >
                  {m.attachment && (
                    <button className="img-btn" onClick={() => setLightbox(m)} {...tip('Open Photo')} aria-label={`Open photo: ${m.attachment.alt}`}>
                      <img src={m.attachment.url} alt={m.attachment.alt} draggable={false} />
                    </button>
                  )}
                  {m.text && <span className="txt">{m.text}</span>}
                  {tbs.length > 0 && (
                    <span className="tapback" title="VIA-only — not sent to the customer">
                      {tbs.map((t) => <span key={t} className={t === 'ha' ? 'ha' : ''}>{TAPBACKS.find((x) => x.k === t)?.icon}</span>)}
                    </span>
                  )}
                </div>
              </div>
              {lastOut && m.id === lastOut.id && (
                <div className="receipt">
                  {m.status === 'read' && m.readAt ? <><b>Read</b> {clock(m.readAt)}</> : m.status === 'delivered' ? 'Delivered' : m.status === 'failed' ? 'Not Delivered' : m.status === 'sent' ? 'Sent' : 'Sending…'}
                </div>
              )}
            </Fragment>
          );
        })}
        {p.typing && (
          <div className="row in"><div className="bubble tail typing" aria-label="Customer is typing"><i /><i /><i /></div></div>
        )}
        {menu && (
          <div className={`tapback-menu ${menu.out ? 'out' : 'in'}`} style={{ top: Math.max(4, menu.y - 52), [menu.out ? 'right' : 'left']: menu.out ? `calc(100% - ${menu.x}px)` : menu.x }} role="menu" aria-label="Tapback">
            {TAPBACKS.map((t) => {
              const on = p.messages.find((x) => x.id === menu.id)?.meta?.tapbacks?.includes(t.k);
              return <button key={t.k} role="menuitem" className={`${on ? 'on' : ''} ${t.k === 'ha' ? 'ha' : ''}`} onClick={() => react(t.k)} {...tip(`Tapback: ${t.label}`, 'Only VIA sees tapbacks')} autoFocus={t.k === 'heart'}>{t.icon}</button>;
            })}
            <span className="tb-note">Team-only · not sent via SMS</span>
          </div>
        )}
      </div>

      <Composer conv={p.conv} agent={p.agent} customer={p.customer} messages={p.messages} insert={p.insert} />

      {lightbox?.attachment && (
        <div className="lightbox" role="dialog" aria-label="Photo" onClick={() => setLightbox(null)}>
          <img src={lightbox.attachment.url} alt={lightbox.attachment.alt} />
          <p>{lightbox.attachment.alt} · {clock(lightbox.at)}</p>
        </div>
      )}
    </div>
  );
}
