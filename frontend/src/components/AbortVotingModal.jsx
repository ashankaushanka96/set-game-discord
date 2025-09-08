import { useStore } from "../store";
import { send } from "../ws";

export default function AbortVotingModal({ open, onClose, votingData }) {
  const { state, me, ws } = useStore();
  
  if (!open || !votingData) return null;

  const players = state?.players || {};
  const { votes_for_abort, votes_needed, abort_votes, requester_id } = votingData;
  
  const requester = players[requester_id];
  const myVote = abort_votes[me.id];
  const hasVoted = myVote !== undefined;

  const handleVote = (vote) => {
    send(ws, 'vote_abort', { voter_id: me.id, vote });
  };

  const getVoteStatus = (playerId) => {
    const vote = abort_votes[playerId];
    if (vote === true) return "✅ YES";
    if (vote === false) return "❌ NO";
    return "⏳ Pending";
  };

  const getVoteColor = (playerId) => {
    const vote = abort_votes[playerId];
    if (vote === true) return "text-green-400";
    if (vote === false) return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Abort Game Vote
          </h2>
          
          <p className="text-zinc-300 mb-4">
            {requester?.name || "A player"} wants to abort the current game.
          </p>

          <div className="mb-4">
            <div className="text-lg font-semibold text-white">
              Votes: {votes_for_abort}/{votes_needed} needed
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(votes_for_abort / votes_needed) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Player votes */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">Player Votes:</h3>
            <div className="space-y-1">
              {Object.values(players).map((player) => (
                <div key={player.id} className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300">{player.name}</span>
                  <span className={`font-semibold ${getVoteColor(player.id)}`}>
                    {getVoteStatus(player.id)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Vote buttons - only show if player hasn't voted */}
          {!hasVoted && (
            <div className="flex gap-3 justify-center mb-4">
              <button
                onClick={() => handleVote(true)}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Vote YES
              </button>
              <button
                onClick={() => handleVote(false)}
                className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Vote NO
              </button>
            </div>
          )}

          {hasVoted && (
            <div className="mb-4">
              <p className="text-zinc-400">
                You voted: <span className={`font-semibold ${getVoteColor(me.id)}`}>
                  {myVote ? "YES" : "NO"}
                </span>
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="bg-zinc-600 hover:bg-zinc-500 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
