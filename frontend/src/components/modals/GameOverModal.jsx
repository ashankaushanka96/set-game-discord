import { useStore } from "../../store";
import { send } from "../../ws";
import GlassmorphismModal from "../ui/GlassmorphismModal";

export default function GameOverModal({ open, onClose, gameResult }) {
  const { state, me, ws } = useStore();
  
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

  const handleStartNewRound = () => {
    // Send request to start new round
    send(ws, "start_new_round", {
      player_id: me.id
    });
    onClose?.();
  };

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="md">
      <div className="text-center">
        <h2 className={`text-3xl font-bold mb-4 ${winnerInfo.color}`}>
          {winnerInfo.title}
        </h2>
        
        <p className="text-white/80 mb-6">
          {winnerInfo.message}
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="text-blue-400 font-semibold mb-2">Team A</div>
            <div className="text-2xl font-bold text-white">{team_a_score} pts</div>
            <div className="text-sm text-white/70">{team_a_sets} sets</div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="text-red-400 font-semibold mb-2">Team B</div>
            <div className="text-2xl font-bold text-white">{team_b_score} pts</div>
            <div className="text-sm text-white/70">{team_b_sets} sets</div>
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl text-white transition-all duration-200 hover:shadow-lg"
          >
            Close
          </button>
          <button
            onClick={handleStartNewRound}
            className="px-6 py-2 bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-emerald rounded-xl text-white transition-all duration-200"
          >
            Start New Round
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
