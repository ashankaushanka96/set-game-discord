import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import emojiSoundManager, { forceInit as forceInitEmojiAudio, markEmojiAudioUnlocked } from './utils/emojiSounds'

// Global one-time audio unlock for iOS/macOS/Discord webviews
function installGlobalAudioUnlock() {
  let unlocked = false;
  const tryUnlock = () => {
    if (unlocked) return;
    unlocked = true;
    try { if (forceInitEmojiAudio) forceInitEmojiAudio(); } catch (_) {}
    try { if (markEmojiAudioUnlocked) markEmojiAudioUnlocked(); else if (emojiSoundManager && emojiSoundManager.markUnlocked) emojiSoundManager.markUnlocked(); } catch(_) {}
    window.removeEventListener('pointerdown', tryUnlock);
    window.removeEventListener('keydown', tryUnlock);
    window.removeEventListener('touchstart', tryUnlock);
    window.removeEventListener('click', tryUnlock, true);
  };
  window.addEventListener('pointerdown', tryUnlock, { once: true, passive: true });
  window.addEventListener('keydown', tryUnlock, { once: true });
  window.addEventListener('touchstart', tryUnlock, { once: true, passive: true });
  window.addEventListener('click', tryUnlock, { once: true, capture: true });
}

installGlobalAudioUnlock();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
