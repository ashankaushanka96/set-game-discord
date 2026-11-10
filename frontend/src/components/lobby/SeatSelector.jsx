import { useStore } from '../../store';
import { send } from '../../ws';

function Avatar({ player }) {
  return player.avatar?.startsWith('http')
    ? <img src={player.avatar} alt="" referrerPolicy="no-referrer" />
    : <span aria-hidden="true">{player.avatar || player.name?.charAt(0) || '♠'}</span>;
}

export default function SeatSelector({ players, me, speakingUsers }) {
  const ws = useStore(state => state.ws);
  const waiting = players.filter(p => !p.team && !p.is_spectator);
  return <div className="seat-selector">
    <div className="lobby-section-heading"><div><span className="club-eyebrow">TAKE YOUR PLACE</span><h2>Choose your team</h2></div><span>3 players per team</span></div>
    <div className="lobby-teams">
      {['A', 'B'].map(team => <section key={team} className={`team-panel team-panel--${team.toLowerCase()}`}>
        <header><div className="team-panel__symbol" aria-hidden="true">{team === 'A' ? '♠' : '♥'}</div><div><h3>Team {team}</h3><span>{players.filter(p => p.team === team).length} of 3 seated</span></div></header>
        <div className="team-panel__seats">
          {(team === 'A' ? [0,2,4] : [1,3,5]).map(seat => {
            const player = players.find(p => p.seat === seat);
            const isMe = player?.id === me?.id;
            return player ? <div key={seat} className={`lobby-seat ${isMe ? 'lobby-seat--me' : ''}`}>
              <div className={`club-avatar ${speakingUsers?.[player.id] ? 'club-avatar--speaking' : ''}`}><Avatar player={player} /></div>
              <div className="lobby-seat__identity"><strong>{player.name}{isMe && <small>YOU</small>}</strong><span><i className={player.connected !== false ? 'status-dot' : 'status-dot status-dot--offline'} />{player.connected !== false ? 'Ready to play' : 'Reconnecting…'}</span></div>
              {isMe && <button type="button" className="club-text-button" onClick={() => send(ws, 'leave_seat', { player_id: me.id })}>Leave</button>}
            </div> : <button key={seat} type="button" className="lobby-seat lobby-seat--empty" disabled={!me}
              onClick={() => send(ws, 'select_seat', { player_id: me.id, seat, team })}>
              <span className="lobby-seat__plus" aria-hidden="true">+</span><span><strong>Join Team {team}</strong><small>Seat {seat + 1} · Open seat</small></span><span className="lobby-seat__arrow" aria-hidden="true">↗</span>
            </button>;
          })}
        </div>
      </section>)}
    </div>
    <section className="waiting-bench"><div><h3>In the lounge</h3><p>{waiting.length ? 'Choose an open seat above to join the table.' : 'Everyone has a seat. Your table is coming together.'}</p></div>
      <div className="waiting-bench__players">{waiting.map(player => <div key={player.id} className="waiting-player"><div className="club-avatar"><Avatar player={player} /></div><span>{player.name}</span></div>)}</div>
    </section>
  </div>;
}
