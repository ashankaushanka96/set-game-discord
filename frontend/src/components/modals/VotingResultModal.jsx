import { useStore } from "../../store";

export default function VotingResultModal({ open, onClose, result }) {
  const { state } = useStore();
  
  if (!open || !result) return null;

  const players = state?.players || {};
  const { type, message, details, requester_id } = result;
  
  const requester = players[requester_id];

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-12 h-12 mx-auto text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-12 h-12 mx-auto text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'timeout':
        return (
          <svg className="w-12 h-12 mx-auto text-yellow-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-12 h-12 mx-auto text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'success':
        return 'Vote Successful!';
      case 'failed':
        return 'Vote Failed';
      case 'timeout':
        return 'Vote Timed Out';
      default:
        return 'Vote Result';
    }
  };

  const getTitleColor = () => {
    switch (type) {
      case 'success':
        return 'text-emerald-400';
      case 'failed':
        return 'text-red-400';
      case 'timeout':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-500';
      case 'failed':
        return 'bg-red-600 hover:bg-red-500';
      case 'timeout':
        return 'bg-yellow-600 hover:bg-yellow-500';
      default:
        return 'bg-blue-600 hover:bg-blue-500';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700">
        <div className="text-center">
          <div className="mb-4">
            {getIcon()}
          </div>
          
          <h2 className={`text-2xl font-bold mb-4 ${getTitleColor()}`}>
            {getTitle()}
          </h2>
          
          <p className="text-zinc-300 mb-4">
            {message}
          </p>

          {details && (
            <div className="mb-4 p-3 bg-zinc-700 rounded-lg">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">Details:</h3>
              <div className="text-sm text-zinc-300 space-y-1">
                {details.map((detail, index) => (
                  <div key={index}>{detail}</div>
                ))}
              </div>
            </div>
          )}

          {requester && (
            <p className="text-sm text-zinc-400 mb-4">
              Requested by: <span className="font-semibold text-zinc-300">{requester.name}</span>
            </p>
          )}

          <button
            onClick={onClose}
            className={`${getButtonColor()} text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2 mx-auto`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
