import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { connectWS, send } from '../../ws';
import { Table } from '../';

export default function GameRoom() {
  const { roomId, playerId } = useParams();
  const navigate = useNavigate();
  const { state, me, setMe, setRoom, setWS, applyServer } = useStore();
  
  
  // Set up global WebSocket update function for reconnection
  useEffect(() => {
    window.updateWS = setWS;
    return () => {
      window.updateWS = null;
    };
  }, [setWS]);

  // Listen for navigation events from the store (in case we need to navigate within the game room)
  useEffect(() => {
    const handleNavigateToGame = (event) => {
      const { roomId, playerId } = event.detail;
      if (roomId && playerId) {
        // Only navigate if we're not already at the correct route
        const currentPath = window.location.pathname;
        if (!currentPath.includes(`/room/${roomId}/${playerId}`)) {
          navigate(`/room/${roomId}/${playerId}`);
        }
      }
    };

    window.addEventListener('navigate-to-game', handleNavigateToGame);
    
    return () => {
      window.removeEventListener('navigate-to-game', handleNavigateToGame);
    };
  }, [navigate]);

  useEffect(() => {
    // If we don't have player info, we need to get it from localStorage or redirect
    if (!me || me.id !== playerId) {
      // Try to get player info from localStorage
      const savedPlayer = localStorage.getItem(`player_${playerId}`);
      if (savedPlayer) {
        try {
          const playerData = JSON.parse(savedPlayer);
          setMe(playerData);
        } catch (error) {
          console.error('Failed to parse saved player data:', error);
          // Redirect to lobby if we can't restore player data
          navigate('/');
          return;
        }
      } else {
        // Try to restore from saved profile data
        try {
          const savedProfile = localStorage.getItem('player_profile');
          if (savedProfile) {
            const profile = JSON.parse(savedProfile);
            const playerData = {
              id: playerId,
              name: profile.name || `Player ${playerId.slice(-4)}`,
              avatar: profile.avatar || "🔥"
            };
            setMe(playerData);
            // Save this player data for future use
            localStorage.setItem(`player_${playerId}`, JSON.stringify(playerData));
          } else {
            // No saved data at all, redirect to lobby
            navigate('/');
            return;
          }
        } catch (error) {
          console.error('Failed to restore profile data:', error);
          navigate('/');
          return;
        }
      }
    }

    // Set the room ID
    setRoom(roomId);

    // Connect to WebSocket if not already connected
    if (!state || state.room_id !== roomId) {
      const ws = connectWS(roomId, playerId, applyServer);
      setWS(ws);
      // Store globally for reconnection handling
      window.currentWS = ws;
      setTimeout(() => send(ws, "sync", {}), 150);
    }

    // Save player data to localStorage for persistence
    if (me) {
      localStorage.setItem(`player_${playerId}`, JSON.stringify(me));
    }
  }, [roomId, playerId, me, state, setMe, setRoom, setWS, navigate]);

  // Show loading state while connecting
  if (!state || state.room_id !== roomId) {
    return (
      <div className="min-h-screen bg-gradient-vibrant flex items-center justify-center">
        <div className="text-text-primary text-xl bg-dark-card/50 backdrop-blur-sm px-6 py-4 rounded-xl border border-accent-cyan/20 shadow-glow-cyan">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-accent-cyan border-t-transparent rounded-full"></div>
            Connecting to game...
          </div>
        </div>
      </div>
    );
  }

  // If we're in lobby phase, redirect back to lobby for team selection
  // But allow spectators to stay in the game room
  if (state.phase === 'lobby' && !me?.is_spectator) {
    navigate('/');
    return null;
  }

  // Otherwise show the game table with wake lock toggle
  return (
    <div className="relative">
      <Table />
      
      
    </div>
  );
}
