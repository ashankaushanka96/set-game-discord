import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import emojiSoundManager from '../../utils/emojiSounds';

async function safeForceInitAudio() {
  try {
    if (emojiSoundManager && typeof emojiSoundManager.forceInit === 'function') {
      emojiSoundManager.forceInit();
      if (typeof emojiSoundManager.markUnlocked === 'function') emojiSoundManager.markUnlocked();
      return;
    }
  } catch (_) {}
  try {
    const mod = await import('../../utils/emojiSounds');
    if (mod && typeof mod.forceInit === 'function') {
      mod.forceInit();
      if (typeof mod.markEmojiAudioUnlocked === 'function') mod.markEmojiAudioUnlocked();
      return;
    }
    if (mod && mod.default && typeof mod.default.forceInit === 'function') {
      mod.default.forceInit();
      if (mod.default && typeof mod.default.markUnlocked === 'function') mod.default.markUnlocked();
      return;
    }
  } catch (_) {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.01);
    }
  } catch (_) {}
}

export default function EmojiSettings({ isOpen, onClose }) {
  const { me } = useStore();
  const [settings, setSettings] = useState({
    soundEnabled: !emojiSoundManager.isMutedState(),
    animationsEnabled: true,
    reduceMotion: false
  });

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('emojiSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(prev => ({ ...prev, ...parsed }));
    }

    // Check for system reduce motion preference
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setSettings(prev => ({ ...prev, reduceMotion: true }));
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('emojiSettings', JSON.stringify(newSettings));
  };

  // Handle sound toggle
  const handleSoundToggle = () => {
    const newSoundEnabled = !settings.soundEnabled;
    
    // Initialize audio context on first sound enable
    if (newSoundEnabled) {
      safeForceInitAudio();
    }
    
    emojiSoundManager.toggleMute();
    saveSettings({ ...settings, soundEnabled: newSoundEnabled });
  };

  // Handle animation toggle
  const handleAnimationToggle = () => {
    const newAnimationsEnabled = !settings.animationsEnabled;
    saveSettings({ ...settings, animationsEnabled: newAnimationsEnabled });
  };

  // Handle reduce motion toggle
  const handleReduceMotionToggle = () => {
    const newReduceMotion = !settings.reduceMotion;
    saveSettings({ ...settings, reduceMotion: newReduceMotion });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-700/50 max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
          <h3 className="text-lg font-semibold text-white">Emoji Settings</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Settings Content */}
        <div className="p-4 space-y-4">
          {/* Sound Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-300">Sound Effects</h4>
            
            <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="text-xl">🔊</div>
                <div>
                  <div className="text-sm font-medium text-white">Enable Sounds</div>
                  <div className="text-xs text-zinc-400">Play sound effects for emoji animations</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSoundToggle}
                  className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${settings.soundEnabled ? 'bg-blue-600' : 'bg-zinc-600'}
                  `}
                >
                  <div
                    className={`
                      absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                      ${settings.soundEnabled ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
                {settings.soundEnabled && (
                  <button
                    onClick={() => emojiSoundManager.playSound('🔨')}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                    title="Test sound"
                  >
                    🔊 Test
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Animation Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-300">Animations</h4>
            
            <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="text-xl">✨</div>
                <div>
                  <div className="text-sm font-medium text-white">Enable Animations</div>
                  <div className="text-xs text-zinc-400">Show emoji flying animations</div>
                </div>
              </div>
              <button
                onClick={handleAnimationToggle}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.animationsEnabled ? 'bg-blue-600' : 'bg-zinc-600'}
                `}
              >
                <div
                  className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${settings.animationsEnabled ? 'translate-x-7' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="text-xl">♿</div>
                <div>
                  <div className="text-sm font-medium text-white">Reduce Motion</div>
                  <div className="text-xs text-zinc-400">Minimize animations for accessibility</div>
                </div>
              </div>
              <button
                onClick={handleReduceMotionToggle}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.reduceMotion ? 'bg-blue-600' : 'bg-zinc-600'}
                `}
              >
                <div
                  className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${settings.reduceMotion ? 'translate-x-7' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-blue-400 text-sm">ℹ️</div>
              <div className="text-xs text-blue-200">
                <p className="font-medium mb-1">Accessibility Note:</p>
                <p>These settings help make the game more accessible. Reduced motion settings will minimize animations while keeping the core gameplay intact.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-700/50">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
