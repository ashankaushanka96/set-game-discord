import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { FannedCards, ColorCodedFannedCards } from '../cards';

export default function Toast() {
  const { toast, state } = useStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          useStore.getState().clearToast();
        }, 300); // Wait for animation to complete
      }, 15000); // Show for 15 seconds

      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  const getToastStyles = () => {
    switch (toast.type) {
      case 'disconnect':
        return 'bg-red-600 border-red-500';
      case 'reconnect':
        return 'bg-green-600 border-green-500';
      case 'error':
        return 'bg-red-600 border-red-500';
      case 'success':
        return 'bg-green-600 border-green-500';
      case 'vote':
        return 'bg-yellow-600 border-yellow-500';
      case 'info':
        return 'bg-blue-600 border-blue-500';
      default:
        return 'bg-zinc-700 border-zinc-600';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'disconnect':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'reconnect':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'vote':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-[100] transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className="relative max-w-sm">
        {/* Glassmorphism backdrop */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm rounded-xl" />
        
        {/* Floating liquid effect */}
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-accent-blue/10 via-accent-purple/5 to-accent-cyan/10 rounded-full blur-3xl liquid-bg-1" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-pink/10 via-accent-emerald/5 to-accent-amber/10 rounded-full blur-3xl liquid-bg-2" />
        </div>

        {/* Toast container */}
        <div 
          className={`
            relative backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4
            glassmorphism-modal
          `}
          style={{
            background: `
              linear-gradient(135deg, 
                rgba(255, 255, 255, 0.05) 0%, 
                rgba(255, 255, 255, 0.02) 50%, 
                rgba(255, 255, 255, 0.01) 100%
              ),
              radial-gradient(circle at 30% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)
            `,
            boxShadow: `
              0 25px 50px -12px rgba(0, 0, 0, 0.15),
              0 0 0 1px rgba(255, 255, 255, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
            `
          }}
        >
          {/* Inner glow effect */}
          <div 
            className="absolute inset-0 rounded-xl"
            style={{
              background: `
                radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%),
                linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%)
              `
            }}
          />
          
          <div className="relative z-10">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-white">
                {getIcon()}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white mb-1">
                  {toast.title}
                </h4>
                <p className="text-sm text-white/80">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(() => {
                    useStore.getState().clearToast();
                  }, 300);
                }}
                className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Show fanned cards if available (only for card passing, not laydown) */}
            {toast.cards && Array.isArray(toast.cards) && toast.cards.length > 0 && !toast.title.toLowerCase().includes('laydown') && (
              <div className="mt-3 p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg">
                <div className="text-xs text-white/70 mb-2">Cards passed:</div>
                <div className="flex justify-center">
                  <FannedCards 
                    cards={toast.cards} 
                    size="xs" 
                    maxCards={8}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
