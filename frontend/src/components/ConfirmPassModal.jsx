import Card from "./Card";

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
    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">
            {isNoCase ? "Reply: I don't have it" : "Confirm Pass"}
          </div>
          <button className="text-zinc-300 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {isNoCase ? (
          <div className="space-y-3">
            <div className="text-sm opacity-80">
              {target?.avatar} <strong>{target?.name}</strong>, you were asked for:
            </div>
            <div className="flex items-center gap-2">
              <Card suit={suit} rank={askedRank} size="sm" />
              <div className="text-sm">{askedRank} of {suit}</div>
            </div>
            <div className="text-xs opacity-70">
              If you confirm you don’t have this card, the turn will pass to you.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm opacity-80 mb-2">
              {target?.avatar} <strong>{target?.name}</strong>, confirm passing these card(s) to {asker?.name}:
            </div>
            <div className="flex flex-wrap gap-2">
              {cards.map((c, i) => (
                <div key={`${c.suit}-${c.rank}-${i}`} className="rounded bg-zinc-800 p-1">
                  <Card suit={c.suit} rank={c.rank} size="md" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700" onClick={onClose}>Cancel</button>
          <button
            className={`px-4 py-2 rounded ${isNoCase ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
            onClick={onConfirm}
          >
            {isNoCase ? "Confirm: I don't have it" : "Confirm Pass"}
          </button>
        </div>
      </div>
    </div>
  );
}
