import { useEffect, useState } from 'react';
import PlayerHand from './PlayerHand';
import { TEST_MODE_ENABLED } from '../../config';
import { useStore } from '../../store';
import { send } from '../../ws';

const sameCard = (a, b) => a.suit === b.suit && a.rank === b.rank;

export default function SpectatorView({ players, gamePhase }) {
  const ws = useStore(state => state.ws);
  const [selection, setSelection] = useState({ source: null, cards: [] });
  const [hovered, setHovered] = useState(null);
  const active = Object.values(players).filter(player => !player.is_spectator && player.seat != null).sort((a,b) => a.seat - b.seat);
  const visible = gamePhase === 'lobby' ? Object.values(players).filter(player => !player.is_spectator) : active;
  const canMove = player => TEST_MODE_ENABLED && gamePhase === 'playing' && ws?.readyState === 1 && /bot/i.test(player.name || '');
  const targetFor = (source, id) => {
    const target = players[id];
    return target && target.id !== source.id && target.team && target.team !== source.team && target.seat != null && !target.is_spectator && target.connected !== false ? target : null;
  };
  const pass = (source, cards, id) => {
    if (!canMove(source) || !targetFor(source,id) || !cards.length || cards.some(card => !source.hand?.some(held => sameCard(card,held)))) return;
    send(ws, 'spectator_pass_cards', { from_player_id:source.id, to_player_id:id, cards });
    setSelection({ source:null, cards:[] });
    setHovered(null);
  };
  useEffect(() => {
    setSelection(current => {
      const source = players[current.source];
      const cards = current.cards.filter(card => source?.hand?.some(held => sameCard(card,held)));
      return cards.length === current.cards.length ? current : { source:cards.length ? current.source : null, cards };
    });
  }, [players, gamePhase]);

  return <main className="spectator-room">
    <header className="spectator-heading">
      <span className="club-eyebrow">SET CLUB · GALLERY</span>
      <h1>A seat beside the action</h1>
      <p>{gamePhase === 'lobby' ? 'Watching the room come together.' : 'Every hand, together at one table.'}</p>
      <span className="spectator-live"><i className="room-live-dot" />{gamePhase === 'playing' ? 'Round in play' : gamePhase === 'lobby' ? 'Watching lobby' : 'Between rounds'}</span>
    </header>
    {TEST_MODE_ENABLED && gamePhase === 'playing' && <div className="spectator-guide" role="status">
      <span>{selection.cards.length ? `${selection.cards.length} selected from ${players[selection.source]?.name}. Drop near an opponent or use their pass button.` : 'Practice controls · Drag a bot’s card to an opponent. Select several cards to move them together.'}</span>
      {selection.cards.length > 0 && <button type="button" onClick={() => setSelection({source:null,cards:[]})}>Clear selection</button>}
    </div>}
    <div className="spectator-grid">
      {visible.map(player => {
        const selected = selection.source === player.id;
        const source = players[selection.source];
        const eligible = source && selection.cards.length > 0 && targetFor(source,player.id);
        return <section key={player.id} data-player-id={player.id} data-team={player.team}
          className={`spectator-hand-panel ${hovered === player.id ? 'spectator-hand-panel--target' : ''}`}>
          <header className="spectator-player">
            {player.avatar?.startsWith('http') ? <img src={player.avatar} alt="" referrerPolicy="no-referrer" draggable="false" /> : <span className="spectator-avatar">{player.avatar || '♠'}</span>}
            <div><h2>{player.name}</h2><span>{player.seat != null ? `Seat ${player.seat + 1}` : 'Choosing a seat'}</span></div>
            <span className="spectator-team">{player.team ? `Team ${player.team}` : 'Unassigned'}</span>
          </header>
          {gamePhase !== 'lobby' && <PlayerHand cards={player.hand || []} label="Cards" selectable={canMove(player)}
            selectedCards={selected ? selection.cards : []}
            onCardSelect={card => setSelection(current => ({source:player.id, cards:current.source !== player.id ? [card] : current.cards.some(c => sameCard(c,card)) ? current.cards.filter(c => !sameCard(c,card)) : [...current.cards,card]}))}
            resolveDropTarget={id => targetFor(player,id)}
            onDragStart={cards => setSelection({source:player.id,cards})}
            onDragHover={setHovered} onDragEnd={() => setHovered(null)}
            onCardsDrop={(cards,id) => pass(player,cards,id)} />}
          <div className="spectator-panel-footer">
            {eligible ? <button type="button" onClick={() => pass(source,selection.cards,player.id)}>Pass {selection.cards.length} here ↗</button> : <span>{canMove(player) ? 'Select cards or drag to pass' : gamePhase === 'lobby' ? 'Waiting for the deal' : 'Watching this hand'}</span>}
          </div>
        </section>;
      })}
    </div>
    {!visible.length && <p className="hand-status">Waiting for players to take their seats.</p>}
  </main>;
}
