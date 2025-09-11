import { useStore } from '../../store';
import { send } from '../../ws';

export default function BackToLobbyModal({ open, onClose, votingData }) {
  const { me, ws } = useStore();

  if (!open || !votingData) return null;

  const { votes, message } = votingData;
  const { yes = 0, no = 0, total = 0, required = 4 } = votes || {};

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">
            Return to Lobby?
          </h2>
          <p className="text-zinc-400 text-sm">
            {message || "Vote to return to the lobby and end the current game"}
          </p>
        </div>

        <div className="mb-6">
          <div className="bg-zinc-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-zinc-300">Votes Progress</span>
              <span className="text-sm text-zinc-400">{yes}/{required} needed</span>
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((yes / required) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-zinc-400">
              <span>Yes: {yes}</span>
              <span>No: {no}</span>
              <span>Total: {total}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleVote(true)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Yes, Return to Lobby
          </button>
          <button
            onClick={() => handleVote(false)}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            No, Continue Game
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={handleRequest}
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Start New Vote
          </button>
        </div>
      </div>
    </div>
  );
}
