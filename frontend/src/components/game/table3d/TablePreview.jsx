import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import GameTable3D from './GameTable3D';
import './table-preview.css';

const players = [ ['You', '🦊'], ['Kachal', '🐯'], ['Aana', '🐙'], ['Latta', '🦉'], ['Suwada', '🐼'], ['Benja', '🦁'] ];
const ids = players.map((_, i) => `preview-${i}`);
const teams = ['A', 'B', 'A', 'B', 'A', 'B'];
const initialHand = [ ['7', 'hearts'], ['9', 'hearts'], ['9', 'diamonds'], ['4', 'clubs'], ['9', 'spades'], ['J', 'spades'], ['5', 'diamonds'] ].map(([rank, suit]) => ({ rank, suit }));
const setCards = ['2', '3', '4', '5', '6', '7'].map(rank => ({ rank, suit: 'clubs' }));
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

export default function TablePreview() {
  const arena = useRef(null);
  const timer = useRef(null);
  const [layout, setLayout] = useState(null);
  const [hand, setHand] = useState(initialHand);
  const [selected, setSelected] = useState([]);
  const [ask, setAsk] = useState(null);
  const [turn, setTurn] = useState(ids[0]);
  const [counts, setCounts] = useState([7, 8, 8, 8, 8, 8]);
  const [sets, setSets] = useState([]);
  const [dealing, setDealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [speaking, setSpeaking] = useState([ids[2]]);
  const [message, setMessage] = useState('Your seat is ready. Make yourself at home.');
  useEffect(() => () => clearTimeout(timer.current), []);
  const finish = (ms, action) => { timer.current = setTimeout(() => { action?.(); setBusy(false); }, ms); };
  const deal = () => {
    setBusy(true); setTurn(ids[0]); setHand(initialHand); setSelected([]); setSets([]); setCounts([7, 8, 8, 8, 8, 8]);
    emit('dismiss_passed_cards'); setDealing(true); setMessage('Dealing around the table · cards arrive one by one');
    finish(31000, () => { setDealing(false); setMessage('All dealt. Your turn.'); });
  };
  const pass = () => {
    // You ask Suwada: the queen of hearts floats over to Suwada while they decide, then they pass the card.
    setBusy(true); setMessage('You ask Suwada for the queen, king and ace of hearts');
    setAsk({ asker_id: ids[0], target_id: ids[4], suit: 'hearts', ranks: ['Q', 'K', 'A'] });
    finish(2600, () => {
      setAsk(null); setBusy(true); setMessage('Suwada passes you the queen of hearts');
      const card = { rank: 'Q', suit: 'hearts' };
      emit('pass_anim', { from_player: ids[4], to_player: ids[0], cards: [card] });
      setHand(h => h.some(c => c.rank === 'Q' && c.suit === 'hearts') ? h : [...h, card]);
      setCounts(c => c.map((n, i) => i === 4 ? Math.max(0, n - 1) : i === 0 ? n + 1 : n));
      finish(1800, () => setMessage('Card received · tap a card to lift it from your hand'));
    });
  };
  const lay = () => {
    setBusy(true); setMessage('Team A lays down the low clubs');
    setSets([{ suit: 'clubs', set_type: 'low', owner_team: 'A', cards: setCards }]);
    emit('lay_anim', { suit: 'clubs', set_type: 'low', contributors: [
      { player_id: ids[0], cards: [setCards[2]] },
      { player_id: ids[2], cards: setCards.slice(0, 2) },
      { player_id: ids[4], cards: setCards.slice(3) },
    ] });
    setHand(h => h.filter(c => !(c.suit === 'clubs' && c.rank === '4')));
    setSelected([]);
    finish(6500, () => { setTurn(ids[1]); setMessage("Set collected for Team A · Kachal's turn · shuffle to start again"); });
  };
  return <main className="card-room table-preview">
    <GameTable3D arenaRef={arena} ids={ids} counts={counts} teams={teams} sets={sets} ask={ask} turnId={turn}
      speakingIds={speaking}
      dealing={dealing} dealerRel={3} hand={hand} selectedKeys={selected} handTappable={!busy}
      onCardTap={c => { const k = `${c.suit}-${c.rank}`; setSelected(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]); }}
      dragPass={!busy} resolveDropTarget={id => id !== ids[0] && ids.includes(id)}
      onCardsDrop={(cards, id) => {
        emit('pass_anim', { from_player: ids[0], to_player: id, cards });
        setHand(h => h.filter(c => !cards.some(x => x.suit === c.suit && x.rank === c.rank)));
        setSelected([]); setMessage(`Passed ${cards.length} card${cards.length > 1 ? 's' : ''} to ${players[ids.indexOf(id)][0]}`);
      }}
      onLayout={setLayout} onFail={() => setFailed(true)} />
    <header className="preview-header"><Link to="/">← Lobby</Link><div><span className="preview-eyebrow">THE EVENING TABLE</span><h1>Set Club</h1></div><span className="preview-mode"><i /> 3D preview</span></header>
    <div className="preview-announcement" role="status">{message}</div>
    <div ref={arena} className="preview-arena">
      {layout && players.map(([name, avatar], i) => <div key={name} data-seat={i} data-player-id={ids[i]} className={`table-seat-position preview-seat preview-seat--${teams[i]} ${i === 0 ? 'preview-seat--you' : ''}`} style={{ left: layout.seats[i].x, top: layout.seats[i].y }}>
        <span className="preview-avatar">{avatar}</span><strong>{name}</strong><small>TEAM {teams[i]}</small>
      </div>)}
    </div>
    <aside className="preview-voice" aria-label="Voice effects">
      <strong>Talking</strong>
      <div>{players.map(([name], i) => <button key={name} aria-pressed={speaking.includes(ids[i])}
        onClick={() => setSpeaking(s => s.includes(ids[i]) ? s.filter(x => x !== ids[i]) : [...s, ids[i]])}>{name}</button>)}</div>
    </aside>
    {failed && <div className="preview-error" role="alert">This preview needs WebGL. Open it in a browser with hardware acceleration enabled.</div>}
    <footer className="preview-footer"><p>Six friends. One table. A good hand.</p><div className="preview-actions">
      <button disabled={busy || failed} onClick={deal}><span>↻</span> Shuffle & deal</button>
      <button disabled={busy || failed || hand.some(c => c.rank === 'Q' && c.suit === 'hearts')} onClick={pass}><span>↗</span> Ask for a card</button>
      <button disabled={busy || failed || sets.length > 0} onClick={lay}><span>♣</span> Lay down a set</button>
    </div><small>Drag the table to look around · scroll to zoom · tap your cards to select</small></footer>
  </main>;
}
