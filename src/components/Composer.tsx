import { useEffect, useRef, useState } from 'react';
import { adapter } from '../store';
import type { Agent, Conversation, Customer, Message, SavedReply } from '../data/types';
import { track } from '../data/events';
import { tip } from './Tooltip';

interface Props { conv: Conversation; agent?: Agent; customer: Customer | null; messages: Message[]; insert: { text: string; n: number } | null }

export function Composer({ conv, agent, customer, messages, insert }: Props) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<Partial<SavedReply> | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const canNote = typeof adapter.sendNote === 'function';
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastId = messages.at(-1)?.id;
  // AI suggestion usage tracking (enums only; never the text itself)
  const shownKey = useRef<string | null>(null);
  const fromSuggestion = useRef<{ via: 'use' | 'edit'; text: string } | null>(null);

  // AI suggestion: refreshed whenever the thread changes. Never sends by itself.
  useEffect(() => {
    let live = true;
    adapter.draftReply(conv.id).then((d) => live && setDraft(d?.text ?? null));
    return () => { live = false; };
  }, [conv.id, lastId, customer]);

  const loadReplies = () => agent && adapter.listSavedReplies(agent.id).then(setReplies);
  useEffect(() => { void loadReplies(); }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!insert) return;
    setText((t) => (t ? t.trimEnd() + ' ' : '') + insert.text);
    requestAnimationFrame(() => ta.current?.focus());
  }, [insert]);

  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [text]);

  const send = async () => {
    const body = text.trim();
    if (!body || !agent) return;
    setText('');
    if (noteMode && adapter.sendNote) { await adapter.sendNote(conv.id, body); setNoteMode(false); return; }
    const s = fromSuggestion.current; fromSuggestion.current = null;
    await adapter.sendMessage(conv.id, body, agent.id);
    if (s) track('ai_suggestion_sent', conv.id, { modified: body !== s.text.trim(), via: s.via });
  };

  const shown = replies.filter((r) => (r.title + ' ' + r.body).toLowerCase().includes(filter.toLowerCase()));
  const pick = (r: SavedReply) => {
    setText((t) => (t.startsWith('/') ? '' : t ? t.trimEnd() + ' ' : '') + r.body);
    setMenuOpen(false); setFilter('');
    requestAnimationFrame(() => ta.current?.focus());
  };

  const onChange = (v: string) => {
    setText(v);
    if (v.startsWith('/')) { setMenuOpen(true); setFilter(v.slice(1)); setActive(0); }
    else if (menuOpen && filter) { setMenuOpen(false); setFilter(''); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && !editing) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
      if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); return; }
      if (e.key === 'Escape') { setMenuOpen(false); if (text.startsWith('/')) setText(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const saveEdit = async () => {
    if (!editing?.title?.trim() || !editing.body?.trim() || !agent) return;
    if (editing.id) await adapter.updateSavedReply(editing as SavedReply);
    else await adapter.createSavedReply({ scope: 'personal', agentId: agent.id, title: editing.title.trim(), body: editing.body.trim() });
    setEditing(null); void loadReplies();
  };

  const showDraft = draft && dismissedFor !== lastId + draft && !text && !noteMode;
  useEffect(() => {
    const key = showDraft ? `${conv.id}:${lastId}:${draft}` : null;
    if (key && shownKey.current !== key) { shownKey.current = key; track('ai_suggestion_shown', conv.id, { source: 'ai-template' }); }
  }, [showDraft, conv.id, lastId, draft]);
  useEffect(() => { fromSuggestion.current = null; }, [conv.id]);
  const mineR = shown.filter((r) => r.scope === 'personal');
  const teamR = shown.filter((r) => r.scope === 'team');

  return (
    <div className="composer-wrap">
      {showDraft && (
        <div className="suggest" role="region" aria-label="AI suggested reply">
          <span className="ai-tag" {...tip('AI Suggestion', 'Generated draft. Review before sending')} tabIndex={0}>✦ AI</span>
          <span className="suggest-text"><b>Suggested:</b> {draft}</span>
          <span className="suggest-actions">
            <button {...tip('Use Suggestion', 'Puts it in the message box. Nothing sends until you press Send')} onClick={() => { setText(draft!); fromSuggestion.current = { via: 'use', text: draft! }; track('ai_suggestion_used', conv.id, { source: 'ai-template' }); requestAnimationFrame(() => ta.current?.focus()); }}>Use</button>
            <button {...tip('Edit Suggestion', 'Puts it in the box with the text selected so you can rewrite it')} onClick={() => { setText(draft!); fromSuggestion.current = { via: 'edit', text: draft! }; track('ai_suggestion_edited', conv.id, { source: 'ai-template' }); requestAnimationFrame(() => { ta.current?.focus(); ta.current?.select(); }); }}>Edit</button>
            <button {...tip('Dismiss Suggestion', 'Hide it until the customer writes again')} onClick={() => { setDismissedFor(lastId + draft!); track('ai_suggestion_dismissed', conv.id, { source: 'ai-template' }); }}>Dismiss</button>
          </span>
        </div>
      )}

      {menuOpen && (
        <div className="replies" role="dialog" aria-label="Saved replies">
          {editing ? (
            <div className="reply-edit">
              <strong>{editing.id ? 'Edit reply' : 'New personal reply'}</strong>
              <input autoFocus placeholder="Title" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label="Reply title" />
              <textarea placeholder="Message text" rows={3} value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} aria-label="Reply text" />
              <div className="row-btns"><button onClick={() => setEditing(null)}>Cancel</button><button className="primary" onClick={saveEdit}>Save</button></div>
            </div>
          ) : (
            <>
              <div className="replies-head">
                <input value={filter} onChange={(e) => { setFilter(e.target.value); setActive(0); }} placeholder="Filter replies…" aria-label="Filter saved replies"
                  onKeyDown={(e) => { if (e.key === 'Escape') setMenuOpen(false); if (e.key === 'Enter' && shown[active]) pick(shown[active]); }} />
                <button className="primary small" onClick={() => setEditing({})}>+ New</button>
              </div>
              <div className="replies-list">
                <div className="replies-sec">My replies · {agent?.name}</div>
                {mineR.length === 0 && <div className="replies-empty">No personal replies yet</div>}
                {mineR.map((r) => (
                  <div key={r.id} className={`reply ${shown.indexOf(r) === active ? 'act' : ''}`}>
                    <button className="reply-main" onClick={() => pick(r)}><b>{r.title}</b><span>{r.body}</span></button>
                    <button className="tiny" onClick={() => setEditing(r)} {...tip(`Edit “${r.title}”`)}>Edit</button>
                    <button className="tiny danger" onClick={async () => { await adapter.deleteSavedReply(r.id); void loadReplies(); }} {...tip(`Delete “${r.title}”`)}>Delete</button>
                  </div>
                ))}
                <div className="replies-sec">Team</div>
                {teamR.map((r) => (
                  <div key={r.id} className={`reply ${shown.indexOf(r) === active ? 'act' : ''}`}>
                    <button className="reply-main" onClick={() => pick(r)}><b>{r.title}</b><span>{r.body}</span></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className={`composer ${noteMode ? 'note-mode' : ''}`}>
        <button className={`icon-btn plus ${menuOpen ? 'on' : ''}`} onClick={() => { setMenuOpen((o) => !o); setEditing(null); }} {...tip('Preset Messages', 'Saved replies · or type / in the message box')} aria-expanded={menuOpen}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg>
        </button>
        {canNote && (
          <button className={`icon-btn note-btn ${noteMode ? 'on' : ''}`} onClick={() => { setNoteMode((n) => !n); requestAnimationFrame(() => ta.current?.focus()); }}
            aria-pressed={noteMode} {...tip(noteMode ? 'Back to Text Message' : 'Private Team Note', 'Only VIA sees notes. They are never texted to the customer')}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 3h10l4 4v14H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M8 11h8M8 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
        <div className="field">
          <textarea ref={ta} rows={1} value={text} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
            placeholder={noteMode ? 'Private note · only VIA sees this' : conv.status === 'resolved' ? 'Text Message · reopens conversation' : 'Text Message'} aria-label="Message. Enter to send, Shift+Enter for a new line, / for saved replies" />
          <button className="send" onClick={send} disabled={!text.trim()} {...tip(noteMode ? 'Add Note' : 'Send', 'Enter')}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke="currentColor" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
