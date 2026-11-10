import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';
import ReactionTray from './ReactionTray';

const QUICK_MESSAGES = ['Good luck! 🍀', 'Nice move! 👏', 'Well played!', 'Your turn 👀'];
export default function ChatBubble({ selectedCardsToPass = [] }) {
  const { me, ws } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const panelRef = useRef(null);
  const toggleRef = useRef(null);
  const connected = ws?.readyState === 1;
  useEffect(() => {
    if (!isOpen) return;
    const outside = event => {
      if (!panelRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) setIsOpen(false);
    };
    const escape = event => { if (event.key === 'Escape') { setIsOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); };
  }, [isOpen]);
  const sendMessage = text => {
    const trimmed = text.trim().slice(0, 100);
    if (!trimmed || !connected || !me) return;
    send(ws, 'chat_message', { player_id: me.id, text: trimmed });
    setMessage('');
    setIsOpen(false);
    toggleRef.current?.focus();
  };
  if (!me) return null;
  return <>
    <div className="table-chat">
      <button ref={toggleRef} type="button" className="table-chat__toggle" aria-label="Chat and reactions" aria-expanded={isOpen} aria-controls="table-chat-panel" onClick={() => setIsOpen(open => !open)}>💬</button>
      {isOpen && <section ref={panelRef} id="table-chat-panel" className="table-chat__panel" aria-label="Table chat">
        <header><div><span className="club-eyebrow">AT THE TABLE</span><h3>Say it with a smile</h3></div><button type="button" aria-label="Close chat" onClick={() => setIsOpen(false)}>×</button></header>
        <div className="table-chat__tabs" role="group" aria-label="Chat mode">
          <button type="button" aria-pressed={!reactionsOpen} onClick={() => setReactionsOpen(false)}>💬 Messages</button>
          <button type="button" aria-pressed={reactionsOpen} onClick={() => setReactionsOpen(true)}>🍅 Reactions</button>
        </div>
        <ReactionTray inline isOpen={reactionsOpen} onClose={() => setReactionsOpen(false)}
          onSent={() => { setIsOpen(false); setReactionsOpen(false); toggleRef.current?.focus(); }}
          selectedCardsToPass={selectedCardsToPass} />
        {!reactionsOpen && <>
        <div className="table-chat__phrases">{QUICK_MESSAGES.map(text => <button key={text} type="button" disabled={!connected} onClick={() => sendMessage(text)}>{text}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); sendMessage(message); }}>
          <label htmlFor="table-chat-message">Message the table</label>
          <div className="table-chat__input"><input id="table-chat-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={100} placeholder="Type something friendly…" autoComplete="off" enterKeyHint="send" /><button type="submit" disabled={!connected || !message.trim()} aria-label="Send message">↑</button></div>
          <div className="table-chat__hint"><span>{connected ? 'Appears beside your player card' : 'Reconnecting to the table…'}</span><span>{message.length}/100</span></div>
        </form>
        </>}
      </section>}
    </div>
  </>;
}
