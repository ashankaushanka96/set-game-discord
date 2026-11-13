import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';

function Avatar({ player }) {
  return player.avatar?.startsWith('http')
    ? <img src={player.avatar} alt="" referrerPolicy="no-referrer" />
    : <span aria-hidden="true">{player.avatar || player.name?.charAt(0) || '♠'}</span>;
}

// The admin can hand admin to another player: first tap asks, second tap (within a few seconds) confirms.
function MakeAdmin({ player, me, adminId }) {
  const ws = useStore(state => state.ws);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (!asking) return; const t = setTimeout(() => setAsking(false), 4000); return () => clearTimeout(t); }, [asking]);
  if (!me || adminId !== me.id || player.id === me.id || player.connected === false || String(player.id).startsWith('ai_')) return null;
  return <button type="button" className={`make-admin ${asking ? 'make-admin--asking' : ''}`}
    title={`Make ${player.name} the admin`} aria-label={asking ? `Confirm: make ${player.name} the admin` : `Make ${player.name} the admin`}
    onClick={(e) => { e.stopPropagation(); if (asking) { send(ws, 'transfer_admin', { target_id: player.id }); setAsking(false); } else setAsking(true); }}>
    {asking ? 'Make admin?' : '👑'}
  </button>;
}

// The two teams side by side, three seats each, like a match lobby's roster.
export default function SeatSelector({ players, me, speakingUsers, adminId }) {
  const ws = useStore(state => state.ws);
  return <div className="lobby-teams">
    {['A', 'B'].map(team => <section key={team} className={`team-panel team-panel--${team.toLowerCase()}`}>
      <header><span className="team-panel__symbol" aria-hidden="true">{team === 'A' ? '♠' : '♥'}</span><h3>Team {team}</h3><span>{players.filter(p => p.team === team).length}/3</span></header>
      <div className="team-panel__seats">
        {(team === 'A' ? [0,2,4] : [1,3,5]).map(seat => {
          const player = players.find(p => p.seat === seat);
          const isMe = player?.id === me?.id;
          return player ? <div key={seat} className={`lobby-seat ${isMe ? 'lobby-seat--me' : ''} ${player.connected === false ? 'lobby-seat--away' : ''}`}>
            <div className={`club-avatar ${speakingUsers?.[player.id] ? 'club-avatar--speaking' : ''}`}><Avatar player={player} /></div>
            <div className="lobby-seat__identity">
              <strong>{player.id === adminId && <span className="lobby-seat__crown" title="Admin">👑</span>}{player.name}</strong>
              <span><i className={player.connected !== false ? 'status-dot' : 'status-dot status-dot--offline'} />{isMe ? 'You' : player.connected !== false ? 'Ready' : 'Reconnecting…'}</span>
            </div>
            {isMe && <button type="button" className="club-text-button" onClick={() => send(ws, 'leave_seat', { player_id: me.id })}>Leave</button>}
            <MakeAdmin player={player} me={me} adminId={adminId} />
          </div> : <button key={seat} type="button" className="lobby-seat lobby-seat--empty" disabled={!me}
            onClick={() => send(ws, 'select_seat', { player_id: me.id, seat, team })}>
            <span className="lobby-seat__plus" aria-hidden="true">+</span><span><strong>Join</strong><small>Seat {seat + 1}</small></span>
          </button>;
        })}
      </div>
    </section>)}
  </div>;
}

// Players in the room without a seat yet.
export function Lounge({ players, me, adminId }) {
  const waiting = players.filter(p => !p.team && !p.is_spectator);
  return <div className="lobby-lounge" aria-label="In the lounge">
    <span className="lobby-lounge__label">Lounge</span>
    {waiting.length
      ? <div className="lobby-lounge__players">{waiting.map(p => <span key={p.id} className="waiting-player" title={p.name}><span className="club-avatar"><Avatar player={p} /></span><span>{p.name}</span><MakeAdmin player={p} me={me} adminId={adminId} /></span>)}</div>
      : <span className="lobby-lounge__empty">Everyone is seated</span>}
  </div>;
}
