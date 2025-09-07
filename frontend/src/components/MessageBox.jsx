import { useStore } from "../store";

export default function MessageBox(){
  const { gameMessage } = useStore();
  if(!gameMessage) return null;

  const lines = (gameMessage.text || "").split("\n");

  return (
    <div className="mt-4 w-full flex justify-center">
      <div className="max-w-3xl w-full bg-zinc-900/90 rounded-xl px-5 py-4 shadow card-shadow">
        <div className="text-xs uppercase tracking-wide text-zinc-300 mb-1">
          {gameMessage.title}
        </div>
        <div className="text-sm text-zinc-100 leading-6 whitespace-pre-line">
          {lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
        <div className="mt-2 text-[11px] text-zinc-500">Auto-hides in 30s</div>
      </div>
    </div>
  );
}
