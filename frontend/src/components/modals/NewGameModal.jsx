import { useStore } from "../../store";
import { send } from "../../ws";
import GlassmorphismModal from "../ui/GlassmorphismModal";

export default function NewGameModal({ open, onClose }) {
  const { me, ws } = useStore();
  
  if (!open) return null;

  const handleRequestNewGame = () => {
    send(ws, 'request_abort', { requester_id: me.id });
    onClose();
  };

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md">
      <div className="text-center">
        <div className="mb-4">
          <svg className="w-16 h-16 mx-auto text-accent-emerald mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">
          Start New Game
        </h2>
        
        <p className="text-white/80 mb-6">
          Are you sure you want to start a new game? 
          The current game will be reset and new cards will be dealt to all players.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl text-white transition-all duration-200 hover:shadow-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleRequestNewGame}
            className="px-6 py-2 bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-cyan rounded-xl text-white transition-all duration-200 flex items-center gap-2 border border-accent-cyan/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Start New Game
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
