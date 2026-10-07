import { useEffect, useRef, useState } from 'react';
import { adapter, simulator } from '../store';
import type { Conversation, Message } from '../data/types';
import { errorCodePhoto } from '../data/svg';
import { clock } from '../util';

const NEW_NUMBER = '(410) 555-0199';

export function PhoneSimulator({ open, onToggle, convs }: { open: boolean; onToggle: () => void; convs: Conversation[] }) {
  const [phone, setPhone] = useState(convs[0]?.phone ?? NEW_NUMBER);
  const [list, setList] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const typingT = useRef<ReturnType<typeof setTimeout>>();
  const end = useRef<HTMLDivElement>(null);
  const convId = convs.find((c) => c.phone === phone)?.id;

  useEffect(() => { if (!convs.some((c) => c.phone === phone) && phone !== NEW_NUMBER && convs[0]) setPhone(convs[0].phone); }, [convs, phone]);
  useEffect(() => {
    if (!open) return;
    // Real backend: the pretend phone "reads" our texts a moment after they land (like a Twilio read receipt).
    let seenT: ReturnType<typeof setTimeout> | undefined;
    const load = () => simulator.getMessagesForPhone(phone).then((l) => {
      setList(l);
      if (simulator.simulateSeen && l.some((m) => m.direction === 'out' && m.status !== 'read')) {
        clearTimeout(seenT); seenT = setTimeout(() => void simulator.simulateSeen!(phone), 1500);
      }
    });
    void load();
    const unsub = adapter.subscribe((e) => {
      if ((e.type === 'message' || e.type === 'message-updated') && e.message.conversationId === convId) void load();
      if (e.type === 'conversation' && e.conversation.phone === phone) void load();
    });
    return () => { unsub(); clearTimeout(seenT); };
  }, [open, phone, convId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, open]);

  const send = async (attach = false) => {
    const t = text.trim();
    if (!t && !attach) return;
    setText(''); clearTimeout(typingT.current);
    await simulator.simulateInbound(phone, attach ? t : t, attach ? { kind: 'image', url: errorCodePhoto, alt: 'Photo of appliance display with error code' } : undefined);
  };
  const onType = (v: string) => {
    setText(v);
    simulator.simulateTyping(phone, !!v);
    clearTimeout(typingT.current);
    typingT.current = setTimeout(() => simulator.simulateTyping(phone, false), 3000);
  };
  const known = convs.find((c) => c.phone === phone);

  return (
    <>
      <button className={`sim-fab ${open ? 'on' : ''}`} onClick={onToggle} aria-expanded={open} aria-label="Customer phone simulator">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="2" fill="none" /><circle cx="12" cy="18" r="1" fill="currentColor" /></svg>
        Customer phone
      </button>
      {open && (
        <div className="sim" role="dialog" aria-label="Customer phone simulator">
          <div className="sim-bar">
            <label>Text as
              <select value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Customer number">
                {convs.map((c) => <option key={c.id} value={c.phone}>{c.name ? `${c.name} — ${c.phone}` : c.phone}</option>)}
                {!convs.some((c) => c.phone === NEW_NUMBER) && <option value={NEW_NUMBER}>New number — {NEW_NUMBER}</option>}
              </select>
            </label>
            <button className="icon-btn" onClick={onToggle} aria-label="Close simulator">✕</button>
          </div>
          <div className="iphone">
            <div className="island" />
            <div className="ios-status"><span>9:41</span><span>●●● ▮</span></div>
            <div className="ios-head"><div className="ios-av">VIA</div><div className="ios-name">VIA Appliance Repair ›</div></div>
            <div className="ios-msgs">
              <div className="ios-note">Text Message · SMS</div>
              {list.map((m) => (
                <div key={m.id} className={`ios-row ${m.direction === 'in' ? 'me' : 'them'}`}>
                  <div className={`ios-b ${m.attachment && !m.text ? 'media' : ''}`} title={clock(m.at)}>
                    {m.attachment && <img src={m.attachment.url} alt={m.attachment.alt} />}
                    {m.text}
                  </div>
                </div>
              ))}
              {known === undefined && list.length === 0 && <div className="ios-note">New conversation — say hi</div>}
              <div ref={end} />
            </div>
            <div className="ios-compose">
              <button className="ios-cam" onClick={() => send(true)} aria-label="Send a photo of an error code" title="Send photo">📷</button>
              <input value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Text Message • SMS" aria-label="Type as the customer" />
              <button className="ios-send" onClick={() => send()} disabled={!text.trim()} aria-label="Send as customer">↑</button>
            </div>
          </div>
          <p className="sim-hint">Messages you send here arrive live in the dashboard. Tapbacks never show on the customer’s phone.</p>
        </div>
      )}
    </>
  );
}
