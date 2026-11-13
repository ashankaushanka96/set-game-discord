import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import emojiSoundManager from '../../utils/sounds';
import { setTTSEnabled, isTTSAvailable } from '../../utils/tts';
import { getQuality, setQuality, isPhoneLike } from './table3d/graphicsQuality';
import GlassmorphismModal from '../ui/GlassmorphismModal';

async function safeForceInitAudio() {
  try {
    if (emojiSoundManager && typeof emojiSoundManager.forceInit === 'function') {
      emojiSoundManager.forceInit();
      if (typeof emojiSoundManager.markUnlocked === 'function') emojiSoundManager.markUnlocked();
      return;
    }
  } catch (_) {}
  try {
    const mod = await import('../../utils/sounds');
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
    reduceMotion: false,
    ttsEnabled: true
  });

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('emojiSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(prev => ({ ...prev, ...parsed }));
      // Apply TTS setting
      if (parsed.ttsEnabled !== undefined) {
        setTTSEnabled(parsed.ttsEnabled);
      }
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

  // Handle TTS toggle
  const handleTTSToggle = () => {
    const newTTSEnabled = !settings.ttsEnabled;
    setTTSEnabled(newTTSEnabled);
    saveSettings({ ...settings, ttsEnabled: newTTSEnabled });
  };

  // Handle reduce motion toggle
  const handleReduceMotionToggle = () => {
    const newReduceMotion = !settings.reduceMotion;
    saveSettings({ ...settings, reduceMotion: newReduceMotion });
  };

  const [quality, setQualityLocal] = useState(getQuality);

  if (!isOpen) return null;

  return (
    <GlassmorphismModal isOpen={isOpen} onClose={onClose} size="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Settings</h3>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors p-1"
        >
          ✕
        </button>
      </div>

      {/* Settings Content */}
      <div className="space-y-4">
        {/* Sound Settings */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-white/80">Sound Effects</h4>
          
          <div className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-xl">🔊</div>
                <div>
                  <div className="text-sm font-medium text-white">Enable Sounds</div>
                  <div className="text-xs text-white/70">Play sound effects for emoji animations</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSoundToggle}
                    className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${settings.soundEnabled ? 'bg-gradient-to-r from-accent-blue to-blue-500' : 'bg-white/20'}
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
                    className="text-xs px-2 py-1 bg-gradient-to-r from-accent-blue to-accent-purple hover:shadow-glow-blue text-white rounded-xl transition-all duration-200 border border-accent-blue/30"
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
          <h4 className="text-sm font-medium text-white/80">Animations</h4>
          
          <div className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-xl">✨</div>
                <div>
                  <div className="text-sm font-medium text-white">Enable Animations</div>
                  <div className="text-xs text-white/70">Show emoji flying animations</div>
                </div>
              </div>
              <button
                onClick={handleAnimationToggle}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.animationsEnabled ? 'bg-gradient-to-r from-accent-blue to-blue-500' : 'bg-white/20'}
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

          <div className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="text-xl">♿</div>
              <div>
                <div className="text-sm font-medium text-white">Reduce Motion</div>
                <div className="text-xs text-white/70">Minimize animations for accessibility</div>
              </div>
            </div>
            <button
              onClick={handleReduceMotionToggle}
              className={`
                relative w-12 h-6 rounded-full transition-colors
                ${settings.reduceMotion ? 'bg-gradient-to-r from-accent-blue to-blue-500' : 'bg-white/20'}
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

          {/* TTS Settings */}
          {isTTSAvailable() && (
            <div className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-xl">🗣️</div>
                <div>
                <div className="text-sm font-medium text-white">Voice Announcements</div>
                <div className="text-xs text-white/70">Announce game over results</div>
                </div>
              </div>
              <button
                onClick={handleTTSToggle}
                className={`
                  relative w-12 h-6 rounded-full transition-colors
                  ${settings.ttsEnabled ? 'bg-gradient-to-r from-accent-blue to-blue-500' : 'bg-white/20'}
                `}
                >
                  <div
                    className={`
                      absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                      ${settings.ttsEnabled ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
            )}
          </div>

        {/* Table sharpness (per device) */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-white/80">Table sharpness</h4>
          <div className="graphics-quality" role="radiogroup" aria-label="Table sharpness">
            {[
              { id: 'auto', name: 'Auto', blurb: isPhoneLike() ? 'Battery saver on this device' : 'Sharp on this device' },
              { id: 'saver', name: 'Battery saver', blurb: 'Less heat and battery, slightly softer' },
              { id: 'sharp', name: 'Sharp', blurb: 'Crispest picture, uses more battery' },
            ].map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={quality === o.id}
                className={`graphics-quality__option ${quality === o.id ? 'is-selected' : ''}`}
                onClick={() => { setQualityLocal(o.id); setQuality(o.id); }}>
                <strong>{o.name}</strong><small>{o.blurb}</small>
              </button>
            ))}
          </div>
          <p className="text-xs text-white/60">Saved on this device only.</p>
        </div>

        {/* Info Section */}
        <div className="p-3 bg-accent-blue/10 backdrop-blur-sm border border-accent-blue/30 rounded-xl">
          <div className="flex items-start gap-2">
            <div className="text-accent-blue text-sm">ℹ️</div>
            <div className="text-xs text-accent-blue">
              <p className="font-medium mb-1">Accessibility Note:</p>
              <p>These settings help make the game more accessible. Reduced motion settings will minimize animations while keeping the core gameplay intact.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gradient-to-r from-accent-blue to-accent-purple hover:shadow-glow-blue text-white rounded-xl transition-all duration-200 border border-accent-blue/30"
          >
            Done
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
