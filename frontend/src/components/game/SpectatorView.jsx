import React, { useState } from 'react';
import { Card } from '../cards';
import { RANKS_LOWER, RANKS_UPPER, SUITS } from '../../lib/deck';
import { TEST_MODE_ENABLED } from '../../config';
import { useStore } from '../../store';
import { send } from '../../ws';

function PlayerHandDisplay({ player, isMe, onCardSelect, selectedCards, selectable, onPassCards }) {
  const cards = player?.hand || [];
  
  const isCardSelected = (card) => {
    return selectedCards?.some(c => c.suit === card.suit && c.rank === card.rank) || false;
  };

  const handleCardClick = (card) => {
    if (selectable && onCardSelect) {
      onCardSelect(card);
    }
  };
  
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
                  <span 
                    key={it.__key} 
                    className={`inline-block ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                    onClick={() => handleCardClick(it)}
                  >
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
                  <span 
                    key={it.__key} 
                    className={`inline-block ${selectable ? 'cursor-pointer' : ''} ${isCardSelected(it) ? 'ring-2 ring-yellow-400 rounded-lg' : ''}`}
                    onClick={() => handleCardClick(it)}
                  >
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
  const { ws } = useStore();
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [targetPlayerId, setTargetPlayerId] = useState(null);
  
  // Get all players with seats (active players)
  const activePlayers = Object.values(players).filter(p => p.seat !== null && p.seat !== undefined);
  
  // Sort by seat number
  activePlayers.sort((a, b) => (a.seat || 0) - (b.seat || 0));

  // Get all players (including those without seats for lobby view)
  const allPlayers = Object.values(players).filter(p => !p.is_spectator);
  
  // Get bot players (for test mode card passing)
  const botPlayers = activePlayers.filter(p => p.name && p.name.toLowerCase().includes('bot'));
  
  const handleCardSelect = (card) => {
    setSelectedCards(prev => {
      const isSelected = prev.some(c => c.suit === card.suit && c.rank === card.rank);
      if (isSelected) {
        return prev.filter(c => !(c.suit === card.suit && c.rank === card.rank));
      } else {
        return [...prev, card];
      }
    });
  };
  
  const handlePassCards = () => {
    if (selectedPlayerId && targetPlayerId && selectedCards.length > 0) {
      send(ws, 'spectator_pass_cards', {
        from_player_id: selectedPlayerId,
        to_player_id: targetPlayerId,
        cards: selectedCards
      });
      setSelectedCards([]);
      setSelectedPlayerId(null);
      setTargetPlayerId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white mb-2">Spectator View</h2>
        <p className="text-sm text-zinc-400">
          {gamePhase === 'lobby' ? 'Lobby - Players selecting teams' : 'You can see all player hands'}
        </p>
        {TEST_MODE_ENABLED && gamePhase !== 'lobby' && (
          <div className="mt-2 px-3 py-1 bg-amber-600/20 border border-amber-500/40 rounded-lg inline-block">
            <p className="text-xs text-amber-300">
              🧪 Test Mode: Select a bot player, choose cards, then select an opponent to pass to
            </p>
          </div>
        )}
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
          {activePlayers.map((player) => {
            const isBot = player.name && player.name.toLowerCase().includes('bot');
            const isSelectable = TEST_MODE_ENABLED && isBot;
            const isSelected = selectedPlayerId === player.id;
            const isTarget = targetPlayerId === player.id;
            const isOpponent = selectedPlayerId && players[selectedPlayerId] && player.team !== players[selectedPlayerId].team;
            
            return (
              <div key={player.id} className={`${isSelected ? 'ring-2 ring-blue-400 rounded-lg' : ''} ${isTarget ? 'ring-2 ring-green-400 rounded-lg' : ''}`}>
                <PlayerHandDisplay 
                  player={player} 
                  isMe={player.id === myId}
                  selectable={isSelectable && isSelected}
                  selectedCards={isSelected ? selectedCards : []}
                  onCardSelect={isSelectable && isSelected ? handleCardSelect : undefined}
                  onPassCards={undefined} // We'll handle this separately
                />
                {isSelectable && (
                  <div className="mt-2 text-center">
                    <button
                      onClick={() => {
                        setSelectedPlayerId(isSelected ? null : player.id);
                        setSelectedCards([]);
                        setTargetPlayerId(null);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-zinc-600 hover:bg-zinc-500 text-zinc-300'
                      }`}
                    >
                      {isSelected ? 'Selected for card passing' : 'Select for card passing'}
                    </button>
                  </div>
                )}
                {selectedPlayerId && isOpponent && (
                  <div className="mt-2 text-center">
                    <button
                      onClick={() => {
                        setTargetPlayerId(isTarget ? null : player.id);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        isTarget 
                          ? 'bg-green-600 text-white' 
                          : 'bg-zinc-600 hover:bg-zinc-500 text-zinc-300'
                      }`}
                    >
                      {isTarget ? 'Selected as target' : 'Select as target'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Pass Cards Button - Show when both source and target are selected */}
          {selectedPlayerId && targetPlayerId && selectedCards.length > 0 && (
            <div className="mt-4 p-4 bg-blue-600/20 border border-blue-500/40 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-blue-300 mb-3">
                  Pass {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''} from {players[selectedPlayerId]?.name} to {players[targetPlayerId]?.name}
                </p>
                <button
                  onClick={handlePassCards}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  Pass Cards
                </button>
              </div>
            </div>
          )}
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
