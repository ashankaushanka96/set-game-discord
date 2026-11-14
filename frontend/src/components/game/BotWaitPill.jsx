import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';
import { useT } from '../../i18n';

// Turn Play with bots: a bot thinks over its move for up to 10s (answers in up to 5s) so people can follow the game.
// Any seated player can tap Continue to let it go straight away.
export default function BotWaitPill({ canContinue }) {
  const wait = useStore((s) => s.botWait);
  const ws = useStore((s) => s.ws);
  const name = useStore((s) => s.state?.players?.[wait?.bot_id]?.name) || 'Bot';
  const [left, setLeft] = useState(0);
  const t = useT();

  useEffect(() => {
    if (!wait) return;
    const tick = () => {
      const ms = wait.until - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= -1500) useStore.setState((s) => (s.botWait === wait ? { botWait: null } : {})); // safety net
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [wait]);

  // Desktop: Space does the same as Continue (not while typing in a field).
  useEffect(() => {
    if (!wait || !canContinue) return;
    const key = (e) => {
      if (e.code !== 'Space' || e.repeat || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      send(ws, 'bot_continue', {});
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [wait, canContinue, ws]);

  if (!wait) return null;
  return <div className="bot-wait" role="status">
    <span className="bot-wait__bar" style={{ animationDuration: `${wait.seconds}s` }} aria-hidden="true" />
    <span className="bot-wait__text">
      <span className="bot-wait__name">{name}</span>
      <span className="bot-wait__what">{t(wait.kind === 'answer' ? 'checking cards' : 'thinking')}</span>
      <span className="bot-wait__dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="bot-wait__left">{left}s</span>
    </span>
    {canContinue && <button type="button" onClick={() => send(ws, 'bot_continue', {})} title={t('Space')}>{t('Continue')}</button>}
  </div>;
}
