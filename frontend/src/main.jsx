import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Global one-time audio unlock for iOS/macOS/Discord webviews
function installGlobalAudioUnlock() {
  let unlocked = false;
  const tryUnlock = async () => {
    if (unlocked) return;
    unlocked = true;
    try {
      const m = await import('./utils/sounds');
      try { if (typeof m.forceInit === 'function') m.forceInit(); else if (m.default && typeof m.default.forceInit === 'function') m.default.forceInit(); } catch (_) {}
      try { if (typeof m.markEmojiAudioUnlocked === 'function') m.markEmojiAudioUnlocked(); else if (m.default && typeof m.default.markUnlocked === 'function') m.default.markUnlocked(); } catch (_) {}
    } catch (_) {}
    window.removeEventListener('pointerdown', tryUnlock);
    window.removeEventListener('keydown', tryUnlock);
    window.removeEventListener('touchstart', tryUnlock);
    window.removeEventListener('click', tryUnlock, true);
  };
  window.addEventListener('pointerdown', tryUnlock, { once: true, passive: true });
  window.addEventListener('keydown', tryUnlock, { once: true });
  window.addEventListener('touchstart', tryUnlock, { once: true, passive: true });
  window.addEventListener('touchend', tryUnlock, { once: true, passive: true });
  window.addEventListener('click', tryUnlock, { once: true, capture: true });
}

installGlobalAudioUnlock();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
