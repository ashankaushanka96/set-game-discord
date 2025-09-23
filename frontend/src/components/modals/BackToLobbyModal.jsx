import { useStore } from '../../store';
import { send } from '../../ws';
import GlassmorphismModal from '../ui/GlassmorphismModal';

export default function BackToLobbyModal({ open, onClose, votingData }) {
  const { me, ws } = useStore();

  if (!open || !votingData) return null;

  const { votes, message } = votingData;
  const { yes = 0, no = 0, total = 0, team_a_yes = 0, team_b_yes = 0 } = votes || {};

  const handleVote = (vote) => {
    if (ws && me) {
      send(ws, 'vote_back_to_lobby', { voter_id: me.id, vote });
    }
  };

  const handleRequest = () => {
    if (ws && me) {
      send(ws, 'request_back_to_lobby', { requester_id: me.id });
    }
  };

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">
            Return to Lobby?
          </h2>
          <p className="text-white/70 text-sm">
            {message || "Vote to return to the lobby and end the current game"}
          </p>
        </div>

        <div className="mb-6">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-white/80">Team A Progress</span>
              <span className="text-sm text-white/70">{team_a_yes}/1 needed</span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((team_a_yes / 1) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-white/80">Team B Progress</span>
              <span className="text-sm text-white/70">{team_b_yes}/1 needed</span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2">
              <div 
                className="bg-red-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((team_b_yes / 1) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/70">
              <span>Yes: {yes}</span>
              <span>No: {no}</span>
              <span>Total: {total}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleVote(true)}
            className="flex-1 bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-emerald text-white px-4 py-2 rounded-xl transition-all duration-200"
          >
            Yes, Return to Lobby
          </button>
          <button
            onClick={() => handleVote(false)}
            className="flex-1 bg-gradient-to-r from-accent-rose to-red-500 hover:shadow-glow-rose text-white px-4 py-2 rounded-xl transition-all duration-200"
          >
            No, Continue Game
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={handleRequest}
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Start New Vote
          </button>
        </div>
    </GlassmorphismModal>
  );
}
