import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import emojiSoundManager from '../../utils/sounds';
import { setTTSEnabled } from '../../utils/tts';
import { getQuality, setQuality, isPhoneLike, getView, setView } from './table3d/graphicsQuality';
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
  const [view, setViewLocal] = useState(getView);

  if (!isOpen) return null;

  return (
    <GlassmorphismModal isOpen={isOpen} onClose={onClose} size="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white">Settings</h3>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors p-1"
        >
          ✕
        </button>
      </div>

      {/* Settings Content */}
      <div className="space-y-3">
        {/* Table view (per device) */}
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-white/80">Table view</h4>
          <div className="graphics-quality graphics-quality--two" role="radiogroup" aria-label="Table view">
            {[
              { id: '3d', name: '3D table', blurb: 'The full room, cards flying across the table' },
              { id: '2d', name: 'Flat (2D)', blurb: 'Lightest on battery and heat' },
            ].map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={view === o.id}
                className={`graphics-quality__option ${view === o.id ? 'is-selected' : ''}`}
                onClick={() => { setViewLocal(o.id); setView(o.id); }}>
                <strong>{o.name}</strong><small>{o.blurb}</small>
              </button>
            ))}
          </div>
        </div>

        {/* Table sharpness (per device, 3D only) */}
        {view === '3d' && 
        <div className="space-y-1.5">
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
        </div>}

        {/* Sound Settings */}
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium text-white/80">Sound Effects</h4>
          
          <div className="flex items-center justify-between px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-xl">🔊</div>
                <div>
                  <div className="text-sm font-medium text-white">Enable Sounds</div>
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
              </div>
            </div>
          </div>


      </div>
    </GlassmorphismModal>
  );
}
