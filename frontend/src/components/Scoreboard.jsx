export default function Scoreboard({ state }) {
    const a = state?.team_scores?.A ?? 0;
    const b = state?.team_scores?.B ?? 0;
    const sets = state?.table_sets || [];
    const aSets = sets.filter(s=>s.owner_team==='A').length;
    const bSets = sets.filter(s=>s.owner_team==='B').length;
  
    return (
      <div className="px-4 py-2 rounded-2xl bg-zinc-900/50 card-shadow flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400"></span>
          <span className="font-semibold">Team A</span>
          <span className="opacity-80">— {a} pts</span>
          <span className="opacity-60 text-xs">({aSets} sets)</span>
        </div>
        <div className="opacity-40">|</div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-400"></span>
          <span className="font-semibold">Team B</span>
          <span className="opacity-80">— {b} pts</span>
          <span className="opacity-60 text-xs">({bSets} sets)</span>
        </div>
      </div>
    );
  }
  