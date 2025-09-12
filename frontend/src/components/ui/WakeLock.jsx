import { useEffect, useRef } from 'react';
import NoSleep from './NoSleep';

export default function WakeLock({ isActive, children }) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      // Release wake lock when not active
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
        wakeLockRef.current = null;
      }
      return;
    }

    // Try Screen Wake Lock API first
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          const wakeLock = await navigator.wakeLock.request('screen');
          wakeLockRef.current = wakeLock;
          
          wakeLock.addEventListener('release', () => {
            console.log('Wake lock was released');
            // Try to re-acquire if still active
            if (isActive) {
              setTimeout(requestWakeLock, 1000);
            }
          });

          console.log('Wake lock acquired');
          return true;
        }
      } catch (err) {
        console.error('Failed to acquire wake lock:', err);
      }
      return false;
    };

    requestWakeLock();

    // Cleanup on unmount or when isActive changes
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
        wakeLockRef.current = null;
      }
    };
  }, [isActive]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive) {
        // Re-request wake lock when page becomes visible again
        if (!wakeLockRef.current && 'wakeLock' in navigator) {
          try {
            const wakeLock = await navigator.wakeLock.request('screen');
            wakeLockRef.current = wakeLock;
            console.log('Wake lock re-acquired after visibility change');
          } catch (err) {
            console.error('Failed to re-acquire wake lock:', err);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  return (
    <NoSleep isActive={isActive}>
      {children}
    </NoSleep>
  );
}
