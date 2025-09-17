// Emoji sound effects system
class EmojiSoundManager {
  constructor() {
    this.sounds = new Map();
    this.isMuted = false;
    this.volume = 1.0;
    this.audioContext = null;
    this.isInitialized = false;
    // Optional: file-based assets override synthesized sounds
    this.assetAudios = new Map();
    this.useAssetsIfAvailable = true;
    // Preferred output sink: 'default', 'communications', or a specific deviceId (when supported)
    this.outputDeviceId = 'default';
    try {
      const ua = (navigator && navigator.userAgent) || '';
      const isDiscord = /Discord/i.test(ua);
      const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(ua);
      const canSetSink = typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && typeof HTMLMediaElement.prototype.setSinkId === 'function';
      if (isDiscord && !isMobile && canSetSink) {
        // On desktop Discord (Chromium), 'communications' typically matches the voice output device
        this.outputDeviceId = 'communications';
      }
    } catch (_) {}
    this.loadSounds();
    this.preloadAssetSounds();
    // Autoplay gating for iOS/Safari: queue sounds until first user gesture
    this._unlocked = false;
    this._pending = [];
  }

  // Load sound files (using Web Audio API for better performance)
  loadSounds() {
    const soundData = {
      'bonk': this.createHammerSound(), // Hammer impact with metallic ring
      'splat': this.createSplatSound(), // Tomato/egg splat with wet effect
      'crack': this.createCrackSound(), // Egg crack with shell breaking
      'explosion': this.createExplosionSound(), // Bomb explosion with rumble
      'zap': this.createLightningSound(), // Lightning zap with electric crackle
      'whoosh': this.createWhooshSound(), // Fire/wind whoosh with movement
      'freeze': this.createFreezeSound(), // Ice freeze with crystalline chime
      'party': this.createPartySound(), // Party sound with celebration
      'confetti': this.createConfettiSound(), // Confetti burst with sparkles
      'victory': this.createVictorySound(), // Trophy victory with fanfare
      'medal': this.createMedalSound(), // Medal sound with metallic ping
      'royal': this.createRoyalSound(), // Crown royal with regal chime
      'sparkle': this.createSparkleSound(), // Sparkle sound with magical twinkle
      'laugh': this.createLaughSound(), // Laugh sound with cheerful bounce
      'clap': this.createClapSound(), // Clap sound with applause
      'heart': this.createHeartSound(), // Heart sound with warm pulse
      'gentle': this.createGentleSound(), // Gentle sound with soft chime
      'default': this.createDefaultSound() // Default sound
    };

    // Convert to Map
    this.sounds = new Map(Object.entries(soundData));
  }

  // Resolve public base prefix (Vite) safely
  getBasePrefix() {
    let base = '/';
    try {
      // Using Vite's import.meta; guarded in try/catch to avoid syntax errors in other bundlers
      base = import.meta && import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/';
    } catch (_) { /* ignore */ }
    return base && base.endsWith('/') ? base : `${base}/`;
  }

  // Map sound keys to asset file paths in /public (supports emoji + UI events)
  getAssetMap() {
    const prefix = this.getBasePrefix();

    // Emoji keys (stored under sounds/emoji/<key>.mp3)
    const emojiKeys = [
      'bonk','splat','crack','explosion','zap','whoosh','freeze','party','confetti',
      'victory','medal','royal','sparkle','laugh','clap','heart','gentle','default'
    ];

    // UI event keys
    const uiMap = {
      'pass': `${prefix}sounds/pass/pass.mp3`,
      'lay_success': `${prefix}sounds/laydown/success.mp3`,
      'lay_unsuccess': `${prefix}sounds/laydown/unsuccess.mp3`,
      'game_over': `${prefix}sounds/gameover/gameover.mp3`,
      'shuffle': `${prefix}sounds/shuffle/shuffle.mp3`,
      'deal': `${prefix}sounds/deal/deal.mp3`,
    };

    const map = { ...uiMap };
    emojiKeys.forEach(k => { map[k] = `${prefix}sounds/emoji/${k}.mp3`; });
    return map;
  }

  // Build candidate URLs for a key, supporting numbered variants and alternate filenames
  getAssetCandidates(key) {
    const base = this.getBasePrefix();
    const urls = [];
    const push = (u) => urls.push(u);
    const isEmoji = !['pass','lay_success','lay_unsuccess','game_over'].includes(key);
    if (isEmoji) {
      push(`${base}sounds/emoji/${key}.mp3`);
      for (let i = 2; i <= 5; i++) push(`${base}sounds/emoji/${key}-${i}.mp3`);
    } else if (key === 'pass') {
      push(`${base}sounds/pass/pass.mp3`);
      push(`${base}sounds/pass/card-sounds-35956.mp3`);
    } else if (key === 'lay_success') {
      push(`${base}sounds/laydown/success.mp3`);
    } else if (key === 'lay_unsuccess') {
      push(`${base}sounds/laydown/unsuccess.mp3`);
    } else if (key === 'game_over') {
      push(`${base}sounds/gameover/gameover.mp3`);
    } else if (key === 'shuffle') {
      push(`${base}sounds/shuffle/shuffle.mp3`);
      push(`${base}sounds/shuffle/shuffle-2.mp3`);
    } else if (key === 'deal') {
      push(`${base}sounds/deal/deal.mp3`);
      push(`${base}sounds/deal/deal-2.mp3`);
    }
    return urls;
  }

  // Preload asset sounds (non-blocking); try candidates and cache first that can play
  preloadAssetSounds() {
    const keys = Object.keys(this.getAssetMap());
    keys.forEach((key) => {
      const candidates = this.getAssetCandidates(key);
      const tryIdx = (i) => {
        if (i >= candidates.length) return;
        try {
          const audio = new Audio();
          audio.src = candidates[i];
          audio.preload = 'auto';
          audio.volume = this.volume;
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          try {
            if (typeof audio.setSinkId === 'function' && this.outputDeviceId) {
              audio.setSinkId(this.outputDeviceId).catch(() => {});
            }
          } catch (_) {}
          audio.addEventListener('canplaythrough', () => {
            this.assetAudios.set(key, audio);
          }, { once: true });
          audio.addEventListener('error', () => tryIdx(i + 1), { once: true });
        } catch (_) { tryIdx(i + 1); }
      };
      tryIdx(0);
    });
  }

  // Attempt to play an asset by sound key. Returns true if playback initiated.
  playAssetByKey(key) {
    if (!this.useAssetsIfAvailable) return false;
    const base = this.assetAudios.get(key);
    if (!base) return false;
    try {
      const node = base.cloneNode(true);
      node.volume = this.volume;
      // Route to selected output sink if supported
      try {
        if (typeof node.setSinkId === 'function' && this.outputDeviceId) {
          node.setSinkId(this.outputDeviceId).catch(() => {});
        }
      } catch (_) {}
      
      // Force main speaker on mobile devices
      this.forceMainSpeakerForAudio(node);
      
      const playPromise = node.play();
      if (playPromise && typeof playPromise.then === 'function') {
        // Let caller decide fallback on rejection; we just signal initiation
        playPromise.catch(() => {});
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Force audio element to play through main speaker
  forceMainSpeakerForAudio(audioElement) {
    try {
      // Set audio element properties for mobile speaker routing
      audioElement.setAttribute('playsinline', 'true');
      audioElement.setAttribute('webkit-playsinline', 'true');
      
      // setSinkId is only available on HTMLMediaElement; AudioContext does not support it broadly.
    } catch (error) {
      console.debug('Failed to force main speaker for audio element:', error);
    }
  }

  // Initialize audio context (requires user interaction)
  initAudioContext() {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.isInitialized = true;
      console.log('Audio context initialized');
      
      // Force audio to play through main speaker on mobile
      this.forceMainSpeaker();
    } catch (error) {
      console.debug('Audio context initialization failed:', error);
    }
  }

  // Force audio to play through main speaker on mobile devices
  forceMainSpeaker() {
    if (!this.audioContext) return;
    
    try {
      // Create a silent audio buffer to force main speaker routing
      const buffer = this.audioContext.createBuffer(1, 1, 22050);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      // Note: Routing to a specific hardware sink is only supported on HTMLMediaElement via setSinkId
    } catch (error) {
      console.debug('Failed to force main speaker:', error);
    }
  }

  // Helper method to create basic tone
  createBasicTone(frequency, duration, waveType = 'sine', volume = 0.3) {
    return () => {
      if (this.isMuted) return;

      // Initialize audio context on first use
      if (!this.isInitialized) {
        this.initAudioContext();
      }

      if (!this.audioContext) {
        console.debug('Audio context not available');
        return;
      }

      try {
        // Resume audio context if suspended (required by some browsers)
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = waveType;

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * volume, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
      } catch (error) {
        console.debug('Audio playback failed:', error);
      }
    };
  }

  // Hammer sound - metallic bonk with ring
  createHammerSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Main impact (low frequency)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(120, now);
        osc1.type = 'square';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.8, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.start(now);
        osc1.stop(now + 0.15);

        // Metallic ring (high frequency)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(800, now);
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.3);
      } catch (error) {
        console.debug('Hammer sound failed:', error);
      }
    };
  }

  // Splat sound - wet impact with squish
  createSplatSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Wet splat (noise-like)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(80, now);
        osc1.type = 'sawtooth';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc1.start(now);
        osc1.stop(now + 0.25);

        // Squish effect
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(200, now);
        osc2.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        osc2.type = 'triangle';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.2);
      } catch (error) {
        console.debug('Splat sound failed:', error);
      }
    };
  }

  // Crack sound - sharp break with echo
  createCrackSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Sharp crack
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(400, now);
        osc1.type = 'square';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.6, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc1.start(now);
        osc1.stop(now + 0.08);

        // Echo
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(300, now + 0.05);
        osc2.type = 'triangle';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.15);
      } catch (error) {
        console.debug('Crack sound failed:', error);
      }
    };
  }

  // Explosion sound - deep rumble with crackle
  createExplosionSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Deep rumble
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(60, now);
        osc1.type = 'square';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 1.0, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc1.start(now);
        osc1.stop(now + 0.6);

        // Crackle
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(1200, now);
        osc2.type = 'sawtooth';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.6, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.3);
      } catch (error) {
        console.debug('Explosion sound failed:', error);
      }
    };
  }

  // Lightning sound - electric zap with crackle
  createLightningSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Electric zap
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(1000, now);
        osc1.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        osc1.type = 'sawtooth';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 1.0, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc1.start(now);
        osc1.stop(now + 0.1);

        // Electric crackle
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(2000, now + 0.05);
        osc2.type = 'square';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.7, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.15);
      } catch (error) {
        console.debug('Lightning sound failed:', error);
      }
    };
  }

  // Whoosh sound - air movement with fire crackle
  createWhooshSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Air movement
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Fire crackle
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(600, now);
        osc2.type = 'sawtooth';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.25);
      } catch (error) {
        console.debug('Whoosh sound failed:', error);
      }
    };
  }

  // Freeze sound - crystalline chime with ice crackle
  createFreezeSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Crystalline chime
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(800, now);
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Ice crackle
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(1200, now + 0.1);
        osc2.type = 'triangle';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.25);
      } catch (error) {
        console.debug('Freeze sound failed:', error);
      }
    };
  }

  // Party sound - celebration with multiple tones
  createPartySound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Main celebration tone
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(523, now); // C5
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.start(now);
        osc1.stop(now + 0.3);

        // Harmony
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(659, now + 0.05); // E5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.25);

        // High sparkle
        const osc3 = this.audioContext.createOscillator();
        const gain3 = this.audioContext.createGain();
        osc3.connect(gain3);
        gain3.connect(this.audioContext.destination);
        osc3.frequency.setValueAtTime(1047, now + 0.1); // C6
        osc3.type = 'sine';
        gain3.gain.setValueAtTime(0, now + 0.1);
        gain3.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.11);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc3.start(now + 0.1);
        osc3.stop(now + 0.2);
      } catch (error) {
        console.debug('Party sound failed:', error);
      }
    };
  }

  // Confetti sound - burst with sparkles
  createConfettiSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Burst
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(400, now);
        osc1.type = 'square';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc1.start(now);
        osc1.stop(now + 0.1);

        // Sparkles
        for (let i = 0; i < 3; i++) {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          osc.frequency.setValueAtTime(800 + i * 200, now + 0.05 + i * 0.05);
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, now + 0.05 + i * 0.05);
          gain.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.06 + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.05);
          osc.start(now + 0.05 + i * 0.05);
          osc.stop(now + 0.15 + i * 0.05);
        }
      } catch (error) {
        console.debug('Confetti sound failed:', error);
      }
    };
  }

  // Victory sound - fanfare with triumph
  createVictorySound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Triumphant fanfare
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(523, now); // C5
        osc1.frequency.linearRampToValueAtTime(659, now + 0.2); // E5
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Harmony
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(392, now + 0.1); // G4
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.3);
      } catch (error) {
        console.debug('Victory sound failed:', error);
      }
    };
  }

  // Medal sound - metallic ping with resonance
  createMedalSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Metallic ping
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(800, now);
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.6, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.start(now);
        osc1.stop(now + 0.3);

        // Resonance
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(1200, now + 0.05);
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.25);
      } catch (error) {
        console.debug('Medal sound failed:', error);
      }
    };
  }

  // Royal sound - regal chime with majesty
  createRoyalSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Regal chime
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(392, now); // G4
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.start(now);
        osc1.stop(now + 0.5);

        // Majesty harmony
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(523, now + 0.1); // C5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.4);
      } catch (error) {
        console.debug('Royal sound failed:', error);
      }
    };
  }

  // Sparkle sound - magical twinkle
  createSparkleSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Magical twinkle
        for (let i = 0; i < 4; i++) {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          osc.frequency.setValueAtTime(1047 + i * 100, now + i * 0.05);
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, now + i * 0.05);
          gain.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.01 + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + i * 0.05);
          osc.start(now + i * 0.05);
          osc.stop(now + 0.15 + i * 0.05);
        }
      } catch (error) {
        console.debug('Sparkle sound failed:', error);
      }
    };
  }

  // Laugh sound - cheerful bounce
  createLaughSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Cheerful bounce
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(330, now);
        osc1.frequency.linearRampToValueAtTime(440, now + 0.1);
        osc1.frequency.linearRampToValueAtTime(330, now + 0.2);
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.start(now);
        osc1.stop(now + 0.3);
      } catch (error) {
        console.debug('Laugh sound failed:', error);
      }
    };
  }

  // Clap sound - applause with echo
  createClapSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Applause
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(200, now);
        osc1.type = 'square';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.5, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.start(now);
        osc1.stop(now + 0.15);

        // Echo
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(150, now + 0.05);
        osc2.type = 'square';
        gain2.gain.setValueAtTime(0, now + 0.05);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.06);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.1);
      } catch (error) {
        console.debug('Clap sound failed:', error);
      }
    };
  }

  // Heart sound - warm pulse with love
  createHeartSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Warm pulse
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(261, now); // C4
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.4, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Love harmony
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(349, now + 0.1); // F4
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.3);
      } catch (error) {
        console.debug('Heart sound failed:', error);
      }
    };
  }

  // Gentle sound - soft chime with warmth
  createGentleSound() {
    return () => {
      if (this.isMuted) return;
      this.initAudioContext();
      if (!this.audioContext) return;

      try {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const now = this.audioContext.currentTime;
        
        // Soft chime
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.frequency.setValueAtTime(349, now); // F4
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.start(now);
        osc1.stop(now + 0.5);

        // Warmth
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.frequency.setValueAtTime(261, now + 0.1); // C4
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(this.volume * 0.2, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.4);
      } catch (error) {
        console.debug('Gentle sound failed:', error);
      }
    };
  }

  // Default sound - simple pleasant tone
  createDefaultSound() {
    return this.createBasicTone(440, 0.2, 'sine', 0.8);
  }

  // Play sound for emoji
  playSound(emoji) {
    if (!this._unlocked) { this._pending.push(() => this.playSound(emoji)); return; }
    const soundKey = this.getSoundKey(emoji);
    // Try asset first; if not preloaded, try candidates immediately
    if (this.useAssetsIfAvailable) {
      const base = this.assetAudios.get(soundKey);
      if (base) {
        try {
          const node = base.cloneNode(true);
          node.setAttribute('playsinline', 'true');
          node.setAttribute('webkit-playsinline', 'true');
          node.volume = Math.max(0, Math.min(1, this.volume));
          const p = node.play();
          if (p && typeof p.then === 'function') {
            p.catch(() => {
              const s = this.sounds.get(soundKey) || this.sounds.get('default');
              if (s) s();
            });
          }
          return;
        } catch (_) { /* fall through */ }
      } else {
        // Attempt dynamic candidate playback once (and cache on success)
        const candidates = this.getAssetCandidates(soundKey);
        for (let i = 0; i < candidates.length; i++) {
          try {
            const a = new Audio();
            a.src = candidates[i];
            a.setAttribute('playsinline', 'true');
            a.setAttribute('webkit-playsinline', 'true');
            a.preload = 'auto';
            a.volume = Math.max(0, Math.min(1, this.volume));
            a.play().then(() => {
              this.assetAudios.set(soundKey, a);
            }).catch(() => {});
            return;
          } catch (_) { /* try next */ }
        }
      }
    }

    // Fallback to synthesized sound
    const sound = this.sounds.get(soundKey) || this.sounds.get('default');
    if (sound) sound();
  }

  // Play by explicit key (emoji key or UI key like 'pass', 'lay_success', 'game_over')
  playKey(key) {
    if (!this._unlocked) { this._pending.push(() => this.playKey(key)); return; }
    // Attempt cached asset first
    const base = this.assetAudios.get(key);
    if (base) {
      try {
        const node = base.cloneNode(true);
        node.setAttribute('playsinline', 'true');
        node.setAttribute('webkit-playsinline', 'true');
        node.volume = Math.max(0, Math.min(1, this.volume));
        node.play().catch(() => {});
        return;
      } catch (_) { /* fall through */ }
    } else {
      // Try candidates immediately and cache first that works
      const candidates = this.getAssetCandidates(key);
      for (let i = 0; i < candidates.length; i++) {
        try {
          const a = new Audio();
          a.src = candidates[i];
          a.setAttribute('playsinline', 'true');
          a.setAttribute('webkit-playsinline', 'true');
          a.preload = 'auto';
          a.volume = Math.max(0, Math.min(1, this.volume));
          a.play().then(() => {
            this.assetAudios.set(key, a);
          }).catch(() => {});
          return;
        } catch (_) { /* continue */ }
      }
    }
    // Fallback to any synth default
    const sound = this.sounds.get(key) || this.sounds.get('default');
    if (sound) sound();
  }

  // Mark audio unlocked by a user gesture and drain queued sounds
  markUnlocked() {
    this._unlocked = true;
    try { if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume(); } catch (_) {}
    const q = this._pending.splice(0);
    q.forEach(fn => { try { fn(); } catch (_) {} });
  }

  // Get sound key for emoji
  getSoundKey(emoji) {
    const soundMap = {
      '🔨': 'bonk',
      '🍅': 'splat',
      '🥚': 'crack',
      '💣': 'explosion',
      '⚡': 'zap',
      '🔥': 'whoosh',
      '❄️': 'freeze',
      '💨': 'whoosh',
      '🎉': 'party',
      '🎊': 'confetti',
      '🏆': 'victory',
      '🥇': 'medal',
      '👑': 'royal',
      '💎': 'sparkle',
      '🌟': 'sparkle',
      '✨': 'sparkle',
      '😂': 'laugh',
      '👏': 'clap',
      '❤️': 'heart',
      '🌹': 'gentle'
    };

    return soundMap[emoji] || 'default';
  }

  // Toggle mute
  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // Set volume (0-1)
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Prefer assets (mp3) when available
  preferAssets(useAssets) {
    this.useAssetsIfAvailable = !!useAssets;
  }

  // Get current mute state
  isMutedState() {
    return this.isMuted;
  }

  // Force initialize audio context (call on user interaction)
  forceInit() {
    this.initAudioContext();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    // Additional mobile-specific initialization
    this.initializeMobileAudio();
  }

  // Explicitly set output device sink id (if browser supports setSinkId on media elements)
  async setOutputDevice(deviceId) {
    this.outputDeviceId = deviceId || 'default';
    // Update preloaded audio elements best-effort
    try {
      this.assetAudios.forEach((audio) => {
        try { if (typeof audio.setSinkId === 'function') audio.setSinkId(this.outputDeviceId).catch(() => {}); } catch (_) {}
      });
    } catch (_) {}
    return this.outputDeviceId;
  }

  // Initialize mobile-specific audio settings
  initializeMobileAudio() {
    try {
      // Detect mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile && this.audioContext) {
        // Force audio context to use main speaker
        this.forceMainSpeaker();
        
        // Create a silent audio element to establish audio routing
        const silentAudio = new Audio();
        silentAudio.setAttribute('playsinline', 'true');
        silentAudio.setAttribute('webkit-playsinline', 'true');
        silentAudio.volume = 0;
        silentAudio.play().catch(() => {
          // Ignore errors for silent audio
        });
      }
    } catch (error) {
      console.debug('Mobile audio initialization failed:', error);
    }
  }
}

// Create singleton instance
const emojiSoundManager = new EmojiSoundManager();

// Convenience named exports for robustness across bundlers
export const forceInit = () => {
  try { emojiSoundManager.forceInit(); } catch (_) { /* no-op */ }
};
export const playEmojiSound = (emoji) => {
  try { emojiSoundManager.playSound(emoji); } catch (_) { /* no-op */ }
};
export const setEmojiSoundVolume = (v) => {
  try { emojiSoundManager.setVolume(v); } catch (_) { /* no-op */ }
};
export const preferEmojiAssets = (b) => {
  try { emojiSoundManager.preferAssets(b); } catch (_) { /* no-op */ }
};
export const toggleEmojiMute = () => {
  try { return emojiSoundManager.toggleMute(); } catch (_) { return true; }
};
export const markEmojiAudioUnlocked = () => {
  try { return emojiSoundManager.markUnlocked(); } catch (_) { return undefined; }
};
export const setEmojiOutputDevice = async (deviceId) => {
  try { return await emojiSoundManager.setOutputDevice(deviceId); } catch (_) { return 'default'; }
};

export default emojiSoundManager;
