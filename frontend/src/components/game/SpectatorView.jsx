import React from 'react';
import { Card } from '../cards';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';

function PlayerHandDisplay({ player, isMe }) {
  const cards = player?.hand || [];
  
  // Build ordered arrays with suit separators for lower/upper
  const { lowerItems, upperItems } = React.useMemo(() => {
    const lowerGroups = {};
    const upperGroups = {};
    for (const s of SUITS) {
      lowerGroups[s] = [];
      upperGroups[s] = [];
    }

    for (const c of cards) {
      if (RANKS_LOWER.includes(c.rank)) lowerGroups[c.suit].push(c);
      else if (RANKS_UPPER.includes(c.rank)) upperGroups[c.suit].push(c);
    }

    // sort within each suit
    const idxLower = (r) => {
      const i = RANKS_LOWER.indexOf(r);
      return i === -1 ? 999 : i;
    };
    const idxUpper = (r) => {
      const i = RANKS_UPPER.indexOf(r);
      return i === -1 ? 999 : i;
    };

    for (const s of SUITS) {
      lowerGroups[s].sort((a, b) => idxLower(a.rank) - idxLower(b.rank));
      upperGroups[s].sort((a, b) => idxUpper(a.rank) - idxUpper(b.rank));
    }

    // flatten with suit separators
    const toItems = (groups, prefix) => {
      const items = [];
      SUITS.forEach((suit, si) => {
        const arr = groups[suit];
        if (!arr.length) return;
        if (items.length) items.push({ __sep: `${prefix}-sep-${si}` }); // gap between suits
        arr.forEach((c, i) =>
          items.push({ ...c, __key: `${prefix}-${suit}-${c.rank}-${i}` })
        );
      });
      return items;
    };

    return {
      lowerItems: toItems(lowerGroups, "low"),
      upperItems: toItems(upperGroups, "up"),
    };
  }, [cards]);

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
      {/* Player Header */}
      <div className="flex items-center gap-2 mb-2">
        {typeof player?.avatar === "string" && player.avatar.startsWith("http") ? (
          <img 
            src={player.avatar} 
            alt={player?.name || 'Player'} 
            className="h-6 w-6 rounded-full border border-white/30" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-lg">{player?.avatar || '🔥'}</span>
        )}
        <span className="font-medium text-sm">{player?.name || 'Unknown'}</span>
        <span className={`text-xs px-2 py-1 rounded ${
          player?.team === 'A' ? 'bg-blue-600/20 text-blue-300' : 
          player?.team === 'B' ? 'bg-rose-600/20 text-rose-300' : 
          'bg-zinc-600/20 text-zinc-300'
        }`}>
          {player?.team || 'No Team'}
        </span>
        {isMe && (
          <span className="text-xs bg-cyan-600/20 text-cyan-300 px-2 py-1 rounded">
            You
          </span>
        )}
        <span className="text-xs text-zinc-400 ml-auto">
          {cards.length} cards
        </span>
      </div>

      {/* Cards Display */}
      {cards.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No cards</div>
      ) : (
        <div className="space-y-2">
          {/* Lower Cards */}
          {lowerItems.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-zinc-400 mr-2">Lower:</span>
              {lowerItems.map((it) =>
                it.__sep ? (
                  <span key={it.__sep} className="inline-block w-2" />
                ) : (
                  <span key={it.__key} className="inline-block">
                    <Card suit={it.suit} rank={it.rank} size="xs" />
                  </span>
                )
              )}
            </div>
          )}

          {/* Upper Cards */}
          {upperItems.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-zinc-400 mr-2">Upper:</span>
              {upperItems.map((it) =>
                it.__sep ? (
                  <span key={it.__sep} className="inline-block w-2" />
                ) : (
                  <span key={it.__key} className="inline-block">
                    <Card suit={it.suit} rank={it.rank} size="xs" />
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpectatorView({ players, myId, gamePhase }) {
  // Get all players with seats (active players)
  const activePlayers = Object.values(players).filter(p => p.seat !== null && p.seat !== undefined);
  
  // Sort by seat number
  activePlayers.sort((a, b) => (a.seat || 0) - (b.seat || 0));

  // Get all players (including those without seats for lobby view)
  const allPlayers = Object.values(players).filter(p => !p.is_spectator);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-2">Spectator View</h2>
        <p className="text-sm text-zinc-400">
          {gamePhase === 'lobby' ? 'Lobby - Players selecting teams' : 'You can see all player hands'}
        </p>
      </div>
      
      {gamePhase === 'lobby' ? (
        // Show lobby view with all players
        <div className="space-y-3">
          {allPlayers.map((player) => (
            <div key={player.id} className="bg-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                {typeof player?.avatar === "string" && player.avatar.startsWith("http") ? (
                  <img 
                    src={player.avatar} 
                    alt={player?.name || 'Player'} 
                    className="h-10 w-10 rounded-full border border-white/30" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-zinc-600 flex items-center justify-center text-lg">
                    {player?.avatar || '🔥'}
                  </div>
                )}
                <div>
                  <div className="font-medium text-white">{player?.name || 'Unknown'}</div>
                  <div className="text-sm text-zinc-400">
                    {player?.team ? `Team ${player.team}` : 'No team selected'}
                    {player?.seat !== null && player?.seat !== undefined && ` • Seat ${player.seat + 1}`}
                  </div>
                </div>
                {player.id === myId && (
                  <span className="text-xs bg-cyan-600/20 text-cyan-300 px-2 py-1 rounded ml-auto">
                    You
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Show game view with player hands
        <div className="space-y-3">
          {activePlayers.map((player) => (
            <PlayerHandDisplay 
              key={player.id} 
              player={player} 
              isMe={player.id === myId}
            />
          ))}
        </div>
      )}
      
      {gamePhase !== 'lobby' && activePlayers.length === 0 && (
        <div className="text-center text-zinc-500 py-8">
          No active players in the game
        </div>
      )}
      
      {gamePhase === 'lobby' && allPlayers.length === 0 && (
        <div className="text-center text-zinc-500 py-8">
          No players in the lobby
        </div>
      )}
    </div>
  );
}
