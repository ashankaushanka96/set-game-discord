import { useStore } from '../../store';
import { send } from '../../ws';
import GlassmorphismModal from '../ui/GlassmorphismModal';

export default function GameOverModal({ open, onClose, gameResult }) {
  const { state, me, ws } = useStore();
  if (!open || !gameResult) return null;
  const { winner, team_a_score, team_b_score, team_a_sets, team_b_sets } = gameResult;
  const wins = gameResult.round_wins || state?.round_wins || { A:0, B:0 };
  const finished = gameResult.match_finished || state?.match_finished;
  const leader = wins.A > wins.B ? 'A' : wins.B > wins.A ? 'B' : 'tie';
  const round = gameResult.round_number || state?.completed_rounds || 1;
  const ties = gameResult.tied_rounds ?? state?.tied_rounds ?? 0;
  const canAct = ws?.readyState === 1 && !state?.players?.[me?.id]?.is_spectator;
  return <GlassmorphismModal isOpen={open} onClose={onClose} size="md">
    <div className="text-center">
      <span className="club-eyebrow">{finished ? 'FINAL MATCH RESULT' : `ROUND ${round} COMPLETE`}</span>
      <h2 className="text-2xl font-semibold text-text-primary mt-3 mb-3">{finished ? leader === 'tie' ? 'Match tied' : `Team ${leader} wins the match!` : winner === 'tie' ? 'Round tied' : `Team ${winner} wins this round!`}</h2>
      <p className="text-sm text-text-secondary mb-5">{finished ? 'The overall result is decided by rounds won.' : 'Round points decide this round. Rounds won decide the match.'}</p>
      <div className="match-result-scores">
        {['A','B'].map(team=><div key={team}><span>Team {team}</span><strong>{wins[team]}</strong><small>rounds won</small><p>{team === 'A' ? team_a_score : team_b_score} points · {team === 'A' ? team_a_sets : team_b_sets} sets this round</p></div>)}
      </div>
      <p className="text-xs text-text-secondary mt-3 mb-5">{round} completed {round === 1 ? 'round' : 'rounds'}{ties ? ` · ${ties} tied` : ''}{!finished && ` · ${leader === 'tie' ? 'Match is tied' : `Team ${leader} leads overall`}`}</p>
      <div className="flex flex-wrap gap-3 justify-center">
        {finished ? <button className="club-primary px-5 py-3 rounded-lg" disabled={!canAct} onClick={()=>send(ws,'request_back_to_lobby',{requester_id:me.id})}>Back to lobby</button> : <>
          <button className="px-4 py-3 rounded-lg border border-white/20" disabled={!canAct} onClick={()=>send(ws,'finish_match',{})}>Finish match</button>
          <button className="club-primary px-4 py-3 rounded-lg" disabled={!canAct} onClick={()=>send(ws,'start_new_round',{player_id:me.id})}>Next round</button>
        </>}
      </div>
    </div>
  </GlassmorphismModal>;
}
