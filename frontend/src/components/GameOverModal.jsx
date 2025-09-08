import { useStore } from "../store";

export default function GameOverModal({ open, onClose, gameResult }) {
  const { state } = useStore();
  
  if (!open || !gameResult) return null;

  const { winner, team_a_score, team_b_score, team_a_sets, team_b_sets } = gameResult;

  const getWinnerMessage = () => {
    if (winner === "tie") {
      return {
        title: "Game Tied!",
        message: "Both teams have the same score",
        color: "text-yellow-400"
      };
    } else {
      return {
        title: `Team ${winner} Wins!`,
        message: `Team ${winner} scored ${winner === "A" ? team_a_score : team_b_score} points`,
        color: winner === "A" ? "text-blue-400" : "text-red-400"
      };
    }
  };

  const winnerInfo = getWinnerMessage();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-8 max-w-md w-full mx-4 border border-zinc-700">
        <div className="text-center">
          <h2 className={`text-3xl font-bold mb-4 ${winnerInfo.color}`}>
            {winnerInfo.title}
          </h2>
          
          <p className="text-zinc-300 mb-6">
            {winnerInfo.message}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-zinc-700 rounded-lg p-4">
              <div className="text-blue-400 font-semibold mb-2">Team A</div>
              <div className="text-2xl font-bold text-white">{team_a_score} pts</div>
              <div className="text-sm text-zinc-400">{team_a_sets} sets</div>
            </div>
            
            <div className="bg-zinc-700 rounded-lg p-4">
              <div className="text-red-400 font-semibold mb-2">Team B</div>
              <div className="text-2xl font-bold text-white">{team_b_score} pts</div>
              <div className="text-sm text-zinc-400">{team_b_sets} sets</div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="bg-zinc-600 hover:bg-zinc-500 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
