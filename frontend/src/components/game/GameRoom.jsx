import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { connectWS, send } from '../../ws';
import { Table } from '../';
import { useWakeLock } from '../../hooks/useWakeLock';

export default function GameRoom() {
  const { roomId, playerId } = useParams();
  const navigate = useNavigate();
  const { state, me, setMe, setRoom, setWS, applyServer } = useStore();
  const { isLocked, isSupported, error, toggle, request } = useWakeLock();
  const [autoEnableAttempted, setAutoEnableAttempted] = useState(false);
  
  // Auto-enable wake lock when entering game room
  useEffect(() => {
    if (state && state.room_id === roomId && state.phase !== 'lobby') {
      // Small delay to ensure the component is fully mounted
      const timer = setTimeout(() => {
        void request();
        setAutoEnableAttempted(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, roomId, request]);
  
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
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-xl">Connecting to game...</div>
      </div>
    );
  }

  // If we're in lobby phase, redirect back to lobby for team selection
  if (state.phase === 'lobby') {
    navigate('/');
    return null;
  }

  // Otherwise show the game table with wake lock toggle
  return (
    <div className="relative">
      <Table />
      
      {/* Wake Lock Toggle Button - Floating in bottom right */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => void toggle()}
          className={`
            px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${!autoEnableAttempted 
              ? 'bg-blue-500 hover:bg-blue-600 text-white' // Loading state
              : isLocked 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }
            shadow-lg border border-gray-500
          `}
          title={
            !autoEnableAttempted 
              ? "Enabling wake lock..." 
              : isLocked 
                ? "Screen awake (click to disable)" 
                : "Screen will sleep (click to keep awake)"
          }
        >
          {!autoEnableAttempted ? "⏳" : isLocked ? "🔒" : "🔓"}
        </button>
        
        {/* Error message if wake lock fails */}
        {error && (
          <div className="absolute bottom-12 right-0 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg max-w-48">
            Wake lock failed: {String(error?.message || error)}
          </div>
        )}
        
        {/* Platform info tooltip */}
        <div className="absolute bottom-12 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 hover:opacity-100 transition-opacity">
          {isSupported ? "Native Wake Lock" : "iOS Fallback"}
        </div>
      </div>
    </div>
  );
}
