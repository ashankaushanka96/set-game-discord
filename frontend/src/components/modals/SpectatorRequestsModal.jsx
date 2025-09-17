import React from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';

export default function SpectatorRequestsModal({ open, onClose }) {
  const { state, me, ws } = useStore();
  
  if (!open || !state) return null;
  
  const spectatorRequests = state.spectator_requests || {};
  const isAdmin = state.admin_player_id === me.id;
  
  const handleApproveSpectator = (spectatorId, approved) => {
    send(ws, 'approve_spectator', {
      spectator_id: spectatorId,
      approved: approved
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-800 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Spectator Requests</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {Object.keys(spectatorRequests).length === 0 ? (
          <div className="text-center text-zinc-400 py-8">
            <div className="text-4xl mb-2">👁️</div>
            <p>No spectator requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(spectatorRequests).map(([spectatorId, spectatorName]) => {
              const spectator = state.players[spectatorId];
              return (
                <div key={spectatorId} className="bg-zinc-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {typeof spectator?.avatar === "string" && spectator.avatar.startsWith("http") ? (
                      <img 
                        src={spectator.avatar} 
                        alt={spectatorName} 
                        className="h-10 w-10 rounded-full border border-white/30" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-zinc-600 flex items-center justify-center text-lg">
                        {spectator?.avatar || '🔥'}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-white">{spectatorName}</div>
                      <div className="text-sm text-zinc-400">Wants to spectate</div>
                    </div>
                  </div>
                  
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveSpectator(spectatorId, true)}
                        className="flex-1 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApproveSpectator(spectatorId, false)}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-400">
                      Waiting for admin approval...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="w-full bg-zinc-600 hover:bg-zinc-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
