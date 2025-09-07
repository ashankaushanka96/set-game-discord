import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { send } from '../ws';
import Seat from './Seat';
import PlayerHand from './PlayerHand';
import AskModal from './AskModal';
import LaydownModal from './LaydownModal';
import TurnBanner from './TurnBanner';

export default function Table() {
  const { state, me, ws } = useStore();
  const [askOpen, setAskOpen] = useState(false);
  const [layOpen, setLayOpen] = useState(false);

  if (!state) return null;

  const players = state.players || {};
  const seats = state.seats || {};
  const my = players[me.id];
  const isMyTurn = state.turn_player === me.id;

  // --- layout constants
  const AREA_W = 700;  // px, outer container width
  const AREA_H = 520;  // px, outer container height
  const TABLE_SIZE = 320; // px, circle diameter
  const RADIUS = 210;  // seat orbit radius from center

  // Precompute absolute positions for seats (6 around a circle)
  // Seat indices 0..5 equally spaced; start at -90deg (top center)
  const seatPositions = useMemo(() => {
    const cx = AREA_W / 2;
    const cy = AREA_H / 2;
    const pos = {};
    for (let i = 0; i < 6; i++) {
      const angle = (-90 + i * 60) * (Math.PI / 180); // radians
      const x = cx + RADIUS * Math.cos(angle);
      const y = cy + RADIUS * Math.sin(angle);
      // center each 112px seat (w-28 h-28)
      pos[i] = {
        left: `${x - 56}px`,
        top: `${y - 56}px`,
      };
    }
    return pos;
  }, []);

  // helper: count for any player's hand (hide ranks for others)
  const handCount = (pid) => (players[pid]?.hand?.length ?? 0);

  return (
    <div className="p-6 relative min-h-screen flex flex-col">
      <TurnBanner state={state} />

      {/* Table area (fixed size so inner circle is truly round) */}
      <div
        className="relative mx-auto bg-zinc-900/30 rounded-3xl card-shadow"
        style={{ width: `${AREA_W}px`, height: `${AREA_H}px` }}
      >
        {/* true round "table" */}
        <div
          className="absolute rounded-full border-4 border-zinc-700 bg-zinc-800/40"
          style={{
            width: `${TABLE_SIZE}px`,
            height: `${TABLE_SIZE}px`,
            left: `calc(50% - ${TABLE_SIZE / 2}px)`,
            top: `calc(50% - ${TABLE_SIZE / 2}px)`,
          }}
        />

        {/* Seats around the circle */}
        {Object.keys(seats).map((k) => {
          const i = Number(k);
          const pid = seats[i];
          const p = pid ? players[pid] : null;
          return (
            <div
              key={`seatwrap-${i}-${pid || 'empty'}`}
              className="absolute"
              style={seatPositions[i]}
            >
              <Seat
                seatIndex={i}
                player={p}
                highlight={p?.id === state.turn_player}
              />
              {/* show card count for other players */}
              {p && p.id !== me.id && (
                <div className="mt-1 text-center text-xs opacity-70">
                  {handCount(p.id)} cards
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* My hand */}
      <div className="mt-6">
        <h3 className="font-bold mb-2">Your Hand</h3>
        <PlayerHand cards={my?.hand || []} />
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        {/* Seat 1 (index 0) deals at any time during 'playing' */}
        {my?.seat === 0 && state.phase === 'playing' && (
          <button
            className="bg-amber-600 px-4 py-2 rounded"
            onClick={() => send(ws, 'shuffle_deal', {})}
          >
            Shuffle & Deal
          </button>
        )}
        <button
          disabled={!isMyTurn}
          className="bg-indigo-600 px-4 py-2 rounded disabled:opacity-40"
          onClick={() => setAskOpen(true)}
        >
          Ask
        </button>
        <button
          disabled={!isMyTurn}
          className="bg-emerald-600 px-4 py-2 rounded disabled:opacity-40"
          onClick={() => setLayOpen(true)}
        >
          Laydown
        </button>
      </div>

      {/* Table sets */}
      <div className="mt-6">
        <h3 className="font-bold mb-2">Table Sets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(state.table_sets || []).map((ts, idx) => (
            <div
              key={`tableset-${ts?.suit ?? 's'}-${ts?.set_type ?? 't'}-${idx}`}
              className="bg-zinc-800 rounded-xl p-2"
            >
              <div className="text-sm mb-1 capitalize">
                {ts.suit} {ts.set_type} — Owner: Team {ts.owner_team}
              </div>
              <div className="flex gap-1 flex-wrap">
                {ts.cards.map((c, i) => (
                  <div
                    key={`tablecard-${c?.suit ?? 's'}-${c?.rank ?? 'r'}-${i}`}
                    className="text-xs px-2 py-1 rounded bg-zinc-700"
                  >
                    {c.rank}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="mt-6 text-lg">
        Scores: <b>Team A {state?.team_scores?.A || 0}</b> —{' '}
        <b>Team B {state?.team_scores?.B || 0}</b>
      </div>

      {/* Modals */}
      {askOpen && <AskModal onClose={() => setAskOpen(false)} />}
      {layOpen && <LaydownModal onClose={() => setLayOpen(false)} />}
    </div>
  );
}
