import { useCallback, useEffect, useRef, useState } from "react";
import NoSleep from "nosleep.js";

function isIOS() {
  // Simple UA check for iPhone/iPad/iPod to decide NoSleep fallback
  if (typeof navigator === "undefined") return false;
  return /iP(ad|hone|od)/.test(navigator.userAgent);
}

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState(null);
  const hasNative = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [isSupported] = useState(hasNative);

  const sentinelRef = useRef(null);   // WakeLockSentinel
  const noSleepRef = useRef(null);    // NoSleep instance
  const wantedRef = useRef(false);    // remember if user wanted it on

  const requestNative = useCallback(async () => {
    try {
      const anyNav = navigator;
      const sentinel = await anyNav.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      sentinel.addEventListener?.("release", () => setIsLocked(false));
      setIsLocked(true);
      setError(null);
    } catch (e) {
      setError(e);
      setIsLocked(false);
    }
  }, []);

  const releaseNative = useCallback(async () => {
    try {
      if (sentinelRef.current?.release) {
        await sentinelRef.current.release();
      }
    } catch (_e) {
      // ignore
    }
    sentinelRef.current = null;
    setIsLocked(false);
  }, []);

  const requestNoSleep = useCallback(async () => {
    if (!noSleepRef.current) noSleepRef.current = new NoSleep();
    // Must be called from a user gesture (click/tap) to work on iOS
    await noSleepRef.current.enable();
    setIsLocked(true);
    setError(null);
  }, []);

  const releaseNoSleep = useCallback(async () => {
    try {
      if (noSleepRef.current?.disable) {
        await noSleepRef.current.disable();
      }
    } catch (_e) {
      // ignore
    }
    setIsLocked(false);
  }, []);

  const request = useCallback(async () => {
    wantedRef.current = true;
    if (isSupported && !isIOS()) {
      return requestNative();
    }
    return requestNoSleep();
  }, [isSupported, requestNative, requestNoSleep]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    if (isSupported && !isIOS()) {
      return releaseNative();
    }
    return releaseNoSleep();
  }, [isSupported, releaseNative, releaseNoSleep]);

  // Re-acquire when returning to foreground if the user intended it
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === "visible" && wantedRef.current) {
        if (isSupported && !isIOS()) {
          await requestNative();
        } else {
          // NoSleep generally stays active, but ensure state reflects it
          setIsLocked(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isSupported, requestNative]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void release();
    };
  }, [release]);

  const toggle = useCallback(async () => {
    if (isLocked) return release();
    return request();
  }, [isLocked, request, release]);

  return { isLocked, isSupported, error, request, release, toggle };
}
