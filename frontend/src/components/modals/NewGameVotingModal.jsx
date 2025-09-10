import { useStore } from "../../store";
import { send } from "../../ws";

export default function NewGameVotingModal({ open, onClose, votingData }) {
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
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">
            New Game Vote
          </h2>
          
          <p className="text-zinc-300 mb-4">
            {requester?.name || "A player"} wants to start a new game with fresh cards.
          </p>

          <div className="mb-4">
            <div className="text-lg font-semibold text-white">
              Votes: {votes_for_abort}/{votes_needed} needed
            </div>
            <div className="w-full bg-zinc-700 rounded-full h-2 mt-2">
              <div 
                className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
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
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Vote YES
              </button>
              <button
                onClick={() => handleVote(false)}
                className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
              <p className="text-xs text-zinc-500 mt-2">
                Waiting for other players to vote...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
