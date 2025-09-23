import { Card } from "../cards";
import GlassmorphismModal from "../ui/GlassmorphismModal";

export default function ConfirmPassModal({
  open,
  asker,
  target,
  cards = [],
  suit,
  ranks = [],
  onConfirm,
  onClose
}) {
  if (!open) return null;

  const isNoCase = !cards || cards.length === 0;
  const askedRank = ranks?.[0];

  return (
    <GlassmorphismModal isOpen={open} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-white">
            {isNoCase ? "Reply: I don't have it" : "Confirm Pass"}
          </div>
          <button className="text-white/70 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {isNoCase ? (
          <div className="space-y-3">
            <div className="text-sm text-white/80">
              <div className="flex items-center gap-2">
                {typeof target?.avatar === "string" && target.avatar.startsWith("http") ? (
                  <img 
                    src={target.avatar} 
                    alt={target?.name || 'Player'} 
                    className="h-5 w-5 rounded-full border border-white/30" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{target?.avatar}</span>
                )}
                <strong className="text-white">{target?.name}</strong>
              </div>, you were asked for:
            </div>
            <div className="flex items-center gap-2">
              <Card suit={suit} rank={askedRank} size="sm" />
              <div className="text-sm">{askedRank} of {suit}</div>
            </div>
            <div className="text-xs text-white/70">
              If you confirm you don't have this card, the turn will pass to you.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm text-white/80 mb-2">
              <div className="flex items-center gap-2">
                {typeof target?.avatar === "string" && target.avatar.startsWith("http") ? (
                  <img 
                    src={target.avatar} 
                    alt={target?.name || 'Player'} 
                    className="h-5 w-5 rounded-full border border-white/30" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{target?.avatar}</span>
                )}
                <strong className="text-white">{target?.name}</strong>
              </div>, confirm passing these card(s) to <span className="text-white">{asker?.name}</span>:
            </div>
            <div className="flex flex-wrap gap-2">
              {cards.map((c, i) => (
                <div key={`${c.suit}-${c.rank}-${i}`} className="rounded bg-white/10 backdrop-blur-sm border border-white/20 p-1">
                  <Card suit={c.suit} rank={c.rank} size="md" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white transition-all duration-200" onClick={onClose}>Cancel</button>
          <button
            className={`px-4 py-2 rounded-xl text-white transition-all duration-200 ${isNoCase ? "bg-gradient-to-r from-accent-rose to-red-500 hover:shadow-glow-rose" : "bg-gradient-to-r from-accent-emerald to-accent-cyan hover:shadow-glow-emerald"}`}
            onClick={onConfirm}
          >
            {isNoCase ? "Confirm: I don't have it" : "Confirm Pass"}
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
