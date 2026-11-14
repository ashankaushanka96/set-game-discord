import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';

// Turn Play with bots: a bot thinks over its move for up to 10s (answers in up to 5s) so people can follow the game.
// Any seated player can tap Continue to let it go straight away.
export default function BotWaitPill({ canContinue }) {
  const wait = useStore((s) => s.botWait);
  const ws = useStore((s) => s.ws);
  const name = useStore((s) => s.state?.players?.[wait?.bot_id]?.name) || 'Bot';
  const [left, setLeft] = useState(0);

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

  if (!wait) return null;
  return <div className="bot-wait" role="status">
    <span className="bot-wait__bar" style={{ animationDuration: `${wait.seconds}s` }} aria-hidden="true" />
    <span className="bot-wait__text">{wait.kind === 'answer' ? `${name} is checking their cards… ${left}s` : `${name} is thinking… ${left}s`}</span>
    {canContinue && <button type="button" onClick={() => send(ws, 'bot_continue', {})}>Continue</button>}
  </div>;
}
