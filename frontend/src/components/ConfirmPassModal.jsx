import Card from './Card';

export default function ConfirmPassModal({ open, asker, target, cards, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-5 w-[560px] max-w-[95vw]">
        <div className="text-lg font-bold mb-2">Pass Cards?</div>
        <div className="text-sm opacity-80 mb-3">
          {asker?.avatar} <b>{asker?.name}</b> asked you for:
        </div>
        <div className="flex gap-2 flex-wrap mb-4">
          {(cards||[]).map((c,i)=>(
            <div key={`${c.suit}-${c.rank}-${i}`}><Card suit={c.suit} rank={c.rank} size="sm" /></div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1 rounded bg-zinc-700" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 rounded bg-emerald-600" onClick={onConfirm}>Pass</button>
        </div>
      </div>
    </div>
  );
}
