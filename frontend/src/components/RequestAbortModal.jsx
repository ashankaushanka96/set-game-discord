import { useStore } from "../store";
import { send } from "../ws";

export default function RequestAbortModal({ open, onClose }) {
  const { me, ws } = useStore();
  
  if (!open) return null;

  const handleRequestAbort = () => {
    send(ws, 'request_abort', { requester_id: me.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Request Game Abort
          </h2>
          
          <p className="text-zinc-300 mb-6">
            Are you sure you want to request aborting the current game? 
            All players will need to confirm this action.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="bg-zinc-600 hover:bg-zinc-500 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRequestAbort}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Request Abort
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
