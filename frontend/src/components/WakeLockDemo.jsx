import { useWakeLock } from "../hooks/useWakeLock";

export default function WakeLockDemo() {
  const { isLocked, isSupported, error, toggle } = useWakeLock();

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 380 }}>
      <button
        onClick={() => void toggle()}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ddd",
          cursor: "pointer"
        }}
      >
        {isLocked ? "Release Wake Lock" : "Keep Screen Awake"}
      </button>

      <small>
        {isSupported
          ? "Native Wake Lock available on this device."
          : "Using iOS fallback (NoSleep)."}
      </small>

      {error && (
        <small style={{ color: "crimson" }}>
          Couldn't acquire wake lock: {String(error?.message || error)}
        </small>
      )}
    </div>
  );
}
