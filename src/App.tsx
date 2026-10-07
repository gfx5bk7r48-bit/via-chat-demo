import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adapter, chatwoot, CHATWOOT_BASE } from './store';
import { loadSession, signOut } from './data/chatwootSession';
import type { Agent, Conversation, Customer, Message } from './data/types';
import { Sidebar } from './components/Sidebar';
import { Thread } from './components/Thread';
import { CustomerPanel } from './components/CustomerPanel';
import { SdPanel } from './components/SdPanel';
import { PhoneSimulator } from './components/PhoneSimulator';
import { ding } from './util';
import { TooltipLayer } from './components/Tooltip';
import { checkManager } from './data/events';

type Theme = 'system' | 'light' | 'dark';
export interface Toast { id: number; title: string; body?: string }

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState(() => chatwoot?.currentAgentId ?? (localStorage.getItem('via-chat.agent') || 'a-jamie'));
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, Message[]>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 1100);
  const [mobileThread, setMobileThread] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('via-chat.theme') as Theme) || 'system');
  const [sound, setSound] = useState(() => localStorage.getItem('via-chat.sound') !== 'off');
  const [simOpen, setSimOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isManager, setIsManager] = useState(false);
  useEffect(() => { if (chatwoot) checkManager().then((m) => setIsManager(!!m)); }, []);
  const [composerInsert, setComposerInsert] = useState<{ text: string; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const soundRef = useRef(sound); soundRef.current = sound;

  const toast = useCallback((title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    adapter.listAgents().then(setAgents).catch((e) => toast('Could not load agents', String(e?.message ?? e)));
    adapter.listConversations().then((list) => {
      setConvs(list);
      if (window.innerWidth > 760) setSelectedId((s) => s ?? list[0]?.id ?? null);
    }).catch((e) => toast('Could not load conversations', String(e?.message ?? e)));
    return adapter.subscribe((e) => {
      if (e.type === 'conversation') {
        setConvs((cs) => {
          const i = cs.findIndex((c) => c.id === e.conversation.id);
          const next = i < 0 ? [e.conversation, ...cs] : cs.map((c) => (c.id === e.conversation.id ? e.conversation : c));
          return [...next].sort((a, b) => (b.lastMessage?.at ?? Date.now()) - (a.lastMessage?.at ?? Date.now()));
        });
      } else if (e.type === 'message') {
        setMsgs((m) => {
          const list = m[e.message.conversationId];
          if (!list) return m;
          // De-dupe: the real backend echoes our own sends back over the websocket.
          const i = list.findIndex((x) => x.id === e.message.id);
          return { ...m, [e.message.conversationId]: i >= 0 ? list.map((x) => (x.id === e.message.id ? e.message : x)) : [...list, e.message] };
        });
        if (e.message.direction === 'in' && !e.message.note) {
          if (soundRef.current) ding();
          if (selectedRef.current === e.message.conversationId && document.visibilityState === 'visible') void adapter.markRead(e.message.conversationId);
        }
      } else if (e.type === 'message-updated') {
        setMsgs((m) => {
          const list = m[e.message.conversationId];
          return list ? { ...m, [e.message.conversationId]: list.map((x) => (x.id === e.message.id ? e.message : x)) } : m;
        });
      } else if (e.type === 'typing') {
        setTyping((t) => ({ ...t, [e.conversationId]: e.typing }));
      }
    });
  }, []);

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    adapter.getMessages(selectedId).then((list) => setMsgs((m) => ({ ...m, [selectedId]: list }))).catch((e) => toast('Could not load messages', String(e?.message ?? e)));
    adapter.markRead(selectedId).catch(() => undefined);
  }, [selectedId]);

  const phone = selected?.phone;
  const lastMsgId = selectedId ? msgs[selectedId]?.at(-1)?.id : undefined;
  useEffect(() => {
    if (!phone) { setCustomer(null); return; }
    adapter.getCustomer(phone).then(setCustomer);
  }, [phone, lastMsgId]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    localStorage.setItem('via-chat.theme', theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem('via-chat.agent', agentId); }, [agentId]);
  useEffect(() => { localStorage.setItem('via-chat.sound', sound ? 'on' : 'off'); }, [sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMobileThread(false);
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); setPanelOpen((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const select = (id: string) => { setSelectedId(id); setMobileThread(true); };
  const agent = agents.find((a) => a.id === agentId);
  const cycleTheme = () => setTheme((t) => (t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'));

  return (
    <div className={`app ${panelOpen && selected ? 'panel-open' : ''} ${mobileThread ? 'show-thread' : ''}`}>
      <Sidebar
        convs={convs} selectedId={selectedId} onSelect={select} searchRef={searchRef}
        agents={agents} agentId={agentId} onAgent={setAgentId} typing={typing}
        theme={theme} onTheme={cycleTheme} sound={sound} onSound={() => setSound((s) => !s)}
        manageHref={isManager ? `${import.meta.env.BASE_URL}manage` : undefined}
        signedIn={chatwoot ? { name: chatwoot.currentAgentName, onSignOut: async () => { await signOut(CHATWOOT_BASE, loadSession()); location.reload(); } } : undefined}
      />
      <main className="thread-col" aria-label="Conversation">
        {selected ? (
          <Thread
            key={selected.id}
            conv={selected} messages={msgs[selected.id] ?? []} typing={!!typing[selected.id]}
            customer={customer} agent={agent} agents={agents}
            onBack={() => setMobileThread(false)}
            panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((p) => !p)}
            insert={composerInsert} toast={toast}
          />
        ) : (
          <div className="empty-thread"><img className="empty-logo-img" src={`${import.meta.env.BASE_URL}assets/via-logo-trim.png`} alt="" /><p>Select a conversation</p></div>
        )}
      </main>
      {selected && adapter.getServiceDesk && (
        <SdPanel open={panelOpen} conv={selected} refreshKey={lastMsgId} onClose={() => setPanelOpen(false)}
          onInsert={(text) => setComposerInsert({ text, n: Date.now() })} toast={toast} />
      )}
      {selected && !adapter.getServiceDesk && (
        <CustomerPanel
          open={panelOpen} conv={selected} customer={customer} onClose={() => setPanelOpen(false)}
          onInsert={(text) => setComposerInsert({ text, n: Date.now() })}
          toast={toast} onBooked={() => phone && adapter.getCustomer(phone).then((c) => setCustomer(c ? { ...c } : null))}
        />
      )}
      <PhoneSimulator open={simOpen} onToggle={() => setSimOpen((o) => !o)} convs={convs} />
      <TooltipLayer />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast"><strong>{t.title}</strong>{t.body && <span>{t.body}</span>}</div>
        ))}
      </div>
    </div>
  );
}
