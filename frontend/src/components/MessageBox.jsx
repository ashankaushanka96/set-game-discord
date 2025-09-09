import { useStore } from "../store";

export default function MessageBox(){
  const { gameMessage } = useStore();
  if(!gameMessage) return null;

  const lines = (gameMessage.text || "").split("\n");

  const getMessageStyles = () => {
    const title = gameMessage.title?.toLowerCase() || "";
    
    if (title.includes('disconnect')) {
      return {
        bg: 'bg-red-600/90 border-red-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      };
    } else if (title.includes('reconnect')) {
      return {
        bg: 'bg-green-600/90 border-green-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
      };
    } else if (title.includes('error') || title.includes('failed')) {
      return {
        bg: 'bg-red-600/90 border-red-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    } else if (title.includes('started') || title.includes('success')) {
      return {
        bg: 'bg-green-600/90 border-green-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      };
    } else if (title.includes('vote') || title.includes('abort')) {
      return {
        bg: 'bg-yellow-600/90 border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    } else {
      return {
        bg: 'bg-blue-600/90 border-blue-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      };
    }
  };

  const styles = getMessageStyles();

  return (
    <div className="mt-4 w-full flex justify-center">
      <div className={`max-w-3xl w-full ${styles.bg} border rounded-xl px-5 py-4 shadow-lg`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-white">
            {styles.icon}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white mb-2">
              {gameMessage.title}
            </div>
            <div className="text-sm text-white/90 leading-6 whitespace-pre-line">
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div className="mt-2 text-[11px] text-white/70">Auto-hides in 30s</div>
          </div>
        </div>
      </div>
    </div>
  );
}
