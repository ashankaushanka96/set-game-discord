import { useStore } from "../../store";
import { send } from "../../ws";

export default function NewGameModal({ open, onClose }) {
  const { me, ws } = useStore();
  
  if (!open) return null;

  const handleRequestNewGame = () => {
    send(ws, 'request_abort', { requester_id: me.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">
            Start New Game
          </h2>
          
          <p className="text-zinc-300 mb-6">
            Are you sure you want to start a new game? 
            The current game will be reset and new cards will be dealt to all players.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="bg-zinc-600 hover:bg-zinc-500 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRequestNewGame}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Start New Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
