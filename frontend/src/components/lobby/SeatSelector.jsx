import React from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';

export default function SeatSelector({ players, state, me, speakingUsers }) {
  const { ws } = useStore();

  // Create seat slots for each team (3 per team)
  // Team A: seats 0, 2, 4 (preferred) or any available
  // Team B: seats 1, 3, 5 (preferred) or any available
  const teamASlots = [0, 2, 4]; // Preferred seats for Team A
  const teamBSlots = [1, 3, 5]; // Preferred seats for Team B

  // Get players by team and seat
  const teamAPlayers = players.filter(p => p.team === 'A');
  const teamBPlayers = players.filter(p => p.team === 'B');
  const joinedPlayers = players.filter(p => !p.team && !p.is_spectator);

  const handleSeatClick = (seatIndex, team) => {
    if (!me) return;
    
    // Check if seat is already occupied
    const occupiedPlayer = players.find(p => p.seat === seatIndex);
    if (occupiedPlayer) return;

    // Send seat selection
    send(ws, 'select_seat', { 
      player_id: me.id, 
      seat: seatIndex,
      team: team 
    });
  };

  const handleLeaveSeat = () => {
    if (!me) return;
    send(ws, 'leave_seat', { player_id: me.id });
  };

  const getPlayerInSeat = (seatIndex) => {
    return players.find(p => p.seat === seatIndex);
  };

  const isMySeat = (seatIndex) => {
    return me && players.find(p => p.seat === seatIndex)?.id === me.id;
  };

  const canSelectSeat = (seatIndex) => {
    if (!me) return false;
    const occupiedPlayer = players.find(p => p.seat === seatIndex);
    return !occupiedPlayer;
  };

  return (
    <div className="space-y-3">
      {/* Teams Row - Side by side on all screen sizes */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team A */}
        <div className="bg-gradient-to-br from-red-600/20 to-red-800/20 backdrop-blur-sm rounded-xl p-3 border border-red-500/30 shadow-lg hover:shadow-red-500/20 transition-all duration-300">
          <div className="text-center mb-3">
            <h3 className="text-base font-bold text-red-400 mb-1 tracking-wide">TEAM A</h3>
            <div className="text-xs text-red-300/80 font-medium">
              {teamAPlayers.length}/3 players
            </div>
            <div className="mt-1 h-1 bg-gradient-to-r from-red-500/30 to-red-600/30 rounded-full"></div>
          </div>
          
          <div className="space-y-1.5">
          {teamASlots.map((seatIndex) => {
            const player = getPlayerInSeat(seatIndex);
            const isEmpty = !player;
            const isMe = isMySeat(seatIndex);
            const canSelect = canSelectSeat(seatIndex);

            return (
              <div
                key={seatIndex}
                className={`relative rounded-lg border-2 transition-all duration-300 ${
                  isEmpty
                    ? canSelect
                      ? 'border-red-400/50 bg-red-500/10 hover:bg-red-500/20 cursor-pointer hover:border-red-400 hover:shadow-lg hover:shadow-red-500/20'
                      : 'border-red-400/30 bg-red-500/5 cursor-not-allowed'
                    : isMe
                    ? 'border-red-400 bg-red-500/20 shadow-lg shadow-red-500/20'
                    : 'border-red-400/60 bg-red-500/15'
                }`}
                onClick={() => isEmpty && canSelect && handleSeatClick(seatIndex, 'A')}
              >
                {isEmpty ? (
                  <div className="p-2 text-center h-14 flex flex-col justify-center">
                    <div className="text-red-400/60 text-xl mb-1 transform transition-transform duration-200 hover:scale-110">▼</div>
                    <div className="text-red-300/80 text-xs font-medium">
                      {canSelect ? 'Click to join' : 'Seat locked'}
                    </div>
                    <div className="text-red-400/50 text-xs">
                      Seat {seatIndex + 1}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 flex items-center gap-2 h-14">
                    <div className="relative">
                      {typeof player.avatar === "string" && player.avatar.startsWith("http") ? (
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="w-7 h-7 rounded-full border-2 border-red-400/50" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-red-400/50 bg-red-500/20 flex items-center justify-center text-sm">
                          {player.avatar}
                        </div>
                      )}
                      {player.connected && (
                        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-red-600"></div>
                      )}
                      {speakingUsers && speakingUsers[player.id] && (
                        <div className="absolute -inset-0.5 rounded-full ring-2 ring-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-red-100 font-medium text-xs">{player.name}</div>
                      <div className="text-red-300/80 text-xs">
                        {player.connected ? 'Ready' : 'Connecting...'}
                      </div>
                    </div>
                    {isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeaveSeat();
                        }}
                        className="text-red-300 hover:text-red-200 text-xs px-1 py-0.5 rounded border border-red-400/50 hover:bg-red-500/20 transition-colors"
                      >
                        Leave
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

        {/* Team B */}
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 backdrop-blur-sm rounded-xl p-3 border border-blue-500/30 shadow-lg hover:shadow-blue-500/20 transition-all duration-300">
          <div className="text-center mb-3">
            <h3 className="text-base font-bold text-blue-400 mb-1 tracking-wide">TEAM B</h3>
            <div className="text-xs text-blue-300/80 font-medium">
              {teamBPlayers.length}/3 players
            </div>
            <div className="mt-1 h-1 bg-gradient-to-r from-blue-500/30 to-blue-600/30 rounded-full"></div>
          </div>
          
          <div className="space-y-1.5">
          {teamBSlots.map((seatIndex) => {
            const player = getPlayerInSeat(seatIndex);
            const isEmpty = !player;
            const isMe = isMySeat(seatIndex);
            const canSelect = canSelectSeat(seatIndex);

            return (
              <div
                key={seatIndex}
                className={`relative rounded-lg border-2 transition-all duration-300 ${
                  isEmpty
                    ? canSelect
                      ? 'border-blue-400/50 bg-blue-500/10 hover:bg-blue-500/20 cursor-pointer hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20'
                      : 'border-blue-400/30 bg-blue-500/5 cursor-not-allowed'
                    : isMe
                    ? 'border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-500/20'
                    : 'border-blue-400/60 bg-blue-500/15'
                }`}
                onClick={() => isEmpty && canSelect && handleSeatClick(seatIndex, 'B')}
              >
                {isEmpty ? (
                  <div className="p-2 text-center h-14 flex flex-col justify-center">
                    <div className="text-blue-400/60 text-xl mb-1 transform transition-transform duration-200 hover:scale-110">▼</div>
                    <div className="text-blue-300/80 text-xs font-medium">
                      {canSelect ? 'Click to join' : 'Seat locked'}
                    </div>
                    <div className="text-blue-400/50 text-xs">
                      Seat {seatIndex + 1}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 flex items-center gap-2 h-14">
                    <div className="relative">
                      {typeof player.avatar === "string" && player.avatar.startsWith("http") ? (
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="w-7 h-7 rounded-full border-2 border-blue-400/50" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-blue-400/50 bg-blue-500/20 flex items-center justify-center text-sm">
                          {player.avatar}
                        </div>
                      )}
                      {player.connected && (
                        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-blue-600"></div>
                      )}
                      {speakingUsers && speakingUsers[player.id] && (
                        <div className="absolute -inset-0.5 rounded-full ring-2 ring-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-blue-100 font-medium text-xs">{player.name}</div>
                      <div className="text-blue-300/80 text-xs">
                        {player.connected ? 'Ready' : 'Connecting...'}
                      </div>
                    </div>
                    {isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeaveSeat();
                        }}
                        className="text-blue-300 hover:text-blue-200 text-xs px-1 py-0.5 rounded border border-blue-400/50 hover:bg-blue-500/20 transition-colors"
                      >
                        Leave
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Joined Players - Below teams */}
      <div className="bg-gradient-to-br from-gray-600/20 to-gray-800/20 backdrop-blur-sm rounded-xl p-3 border border-gray-500/30 shadow-lg hover:shadow-gray-500/20 transition-all duration-300">
        <div className="text-center mb-3">
          <h3 className="text-base font-bold text-gray-400 mb-1 tracking-wide">JOINED PLAYERS</h3>
          <div className="text-xs text-gray-300/80 font-medium">
            {joinedPlayers.length} waiting to select team
          </div>
          <div className="mt-1 h-1 bg-gradient-to-r from-gray-500/30 to-gray-600/30 rounded-full"></div>
        </div>
        
        <div>
          {joinedPlayers.length === 0 ? (
            <div className="text-center py-2 text-gray-400/60 text-xs">
              All players have selected teams
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {joinedPlayers.map((player) => (
                <div
                  key={player.id}
                  className="p-2 rounded-lg border border-gray-500/30 bg-gray-500/10 flex flex-col items-center gap-1"
                >
                  <div className="relative">
                    {typeof player.avatar === "string" && player.avatar.startsWith("http") ? (
                      <img 
                        src={player.avatar} 
                        alt={player.name} 
                        className="w-8 h-8 rounded-full border border-gray-400/50" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full border border-gray-400/50 bg-gray-500/20 flex items-center justify-center text-sm">
                        {player.avatar}
                      </div>
                    )}
                    {player.connected && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-gray-600"></div>
                    )}
                    {speakingUsers && speakingUsers[player.id] && (
                      <div className="absolute -inset-0.5 rounded-full ring-2 ring-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-gray-200 font-medium text-xs truncate max-w-[60px]">{player.name}</div>
                    <div className="text-gray-400/80 text-xs">
                      {player.connected ? 'Select team' : 'Connecting...'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
