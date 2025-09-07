import { useStore } from "../store";

export default function MessageBox(){
  const { gameMessage } = useStore();
  if(!gameMessage) return null;
  return (
    <div className="mt-4 w-full flex justify-center">
      <div className="max-w-3xl w-full bg-zinc-900/80 rounded-xl px-4 py-3 text-sm text-zinc-200 shadow card-shadow text-center">
        {gameMessage.text}
      </div>
    </div>
  );
}
