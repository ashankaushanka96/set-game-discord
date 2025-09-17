const EMOJI_TO_SOUND = {
  '\u{1F528}': 'bonk', // hammer
  '\u{1F345}': 'splat', // tomato
  '\u{1F4A3}': 'explosion', // bomb
  '\u{26A1}': 'zap', // lightning
  '\u{1F525}': 'whoosh', // fire
  '\u{1F389}': 'party', // party popper
  '\u{1F3C6}': 'victory', // trophy
  '\u{1F451}': 'royal', // crown
  '\u{1F602}': 'laugh', // laughing tears
  '\u{1F44F}': 'clap', // clapping hands
  '\u2764\uFE0F': 'heart', // red heart
  '\u{1F44D}': 'gentle' // thumbs up
};

const SOUND_FILE_MAP = {
  bonk: 'sounds/emoji/bonk.mp3',
  splat: 'sounds/emoji/splat.mp3',
  explosion: 'sounds/emoji/explosion.mp3',
  zap: 'sounds/emoji/zap.mp3',
  whoosh: 'sounds/emoji/whoosh.mp3',
  party: 'sounds/emoji/party.mp3',
  victory: 'sounds/emoji/victory.mp3',
  royal: 'sounds/emoji/royal.mp3',
  laugh: 'sounds/emoji/laugh.mp3',
  clap: 'sounds/emoji/clap.mp3',
  heart: 'sounds/emoji/heart.mp3',
  gentle: 'sounds/emoji/gentle.mp3',
  pass: 'sounds/pass/pass.mp3',
  lay_success: 'sounds/laydown/success.mp3',
  lay_unsuccess: 'sounds/laydown/unsuccess.mp3',
  game_over: 'sounds/gameover/gameover.mp3',
  shuffle: 'sounds/shuffle/shuffle.mp3',
  deal: 'sounds/deal/deal.mp3'
};

function ensureSuffix(value) {
  if (!value) return '/';
  return value.endsWith('/') ? value : `${value}/`;
}

class EmojiSoundManager {
  constructor() {
    this.isMuted = false;
    this.volume = 1;
    this.outputDeviceId = 'default';
    this._unlocked = false;
    this._pending = [];
    this._templateCache = new Map();
    this.audioContext = null;
  }

  getBasePrefix() {
    let base = '/';
    try {
      if (typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL) {
        base = import.meta.env.BASE_URL;
      }
    } catch (_) {}
    if (typeof window !== 'undefined' && window.__APP_BASE_URL__) {
      base = window.__APP_BASE_URL__;
    }
    return ensureSuffix(base);
  }

  getSoundUrl(key) {
    const relative = SOUND_FILE_MAP[key];
    if (!relative) return null;
    return `${this.getBasePrefix()}${relative}`;
  }

  forceInit() {
    if (this._unlocked) return;
    if (typeof window === 'undefined') {
      this.markUnlocked();
      return;
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        if (!this.audioContext) {
          this.audioContext = new AudioContext();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
        const buffer = this.audioContext.createBuffer(1, 1, 22050);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
      } else {
        const silent = new Audio();
        silent.volume = 0;
        silent.play().catch(() => {});
      }
    } catch (_) {}

    this.markUnlocked();
  }

  markUnlocked() {
    if (this._unlocked) return;
    this._unlocked = true;
    const queue = this._pending.splice(0);
    queue.forEach((run) => {
      try { run(); } catch (_) {}
    });
  }

  isMutedState() {
    return this.isMuted;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  setVolume(value) {
    if (Number.isFinite(value)) {
      this.volume = Math.min(1, Math.max(0, value));
    }
  }

  preferAssets() {
    // No-op retained for API compatibility.
  }

  async setOutputDevice(deviceId) {
    this.outputDeviceId = deviceId || 'default';
    return this.outputDeviceId;
  }

  playSound(emoji) {
    const soundKey = EMOJI_TO_SOUND[emoji] || 'gentle';
    this.playKey(soundKey);
  }

  playKey(key) {
    if (!key) return;
    const url = this.getSoundUrl(key);
    if (!url) return;

    const action = () => this._playUrl(url);
    if (!this._unlocked) {
      this._pending.push(action);
      return;
    }
    action();
  }

  _playUrl(url) {
    if (this.isMuted) return;

    try {
      let template = this._templateCache.get(url);
      if (!template) {
        template = new Audio(url);
        template.preload = 'auto';
        template.load();
        this._templateCache.set(url, template);
      }
      const audio = template.cloneNode();
      audio.volume = this.volume;
      if (typeof audio.setSinkId === 'function' && this.outputDeviceId && this.outputDeviceId !== 'default') {
        audio.setSinkId(this.outputDeviceId).catch(() => {});
      }
      audio.play().catch(() => {});
    } catch (_) {}
  }
}

const emojiSoundManager = new EmojiSoundManager();

export const forceInit = () => {
  try { emojiSoundManager.forceInit(); } catch (_) {}
};
export const playEmojiSound = (emoji) => {
  try { emojiSoundManager.playSound(emoji); } catch (_) {}
};
export const playKey = (key) => {
  try { emojiSoundManager.playKey(key); } catch (_) {}
};
export const setEmojiSoundVolume = (value) => {
  try { emojiSoundManager.setVolume(value); } catch (_) {}
};
export const preferEmojiAssets = (flag) => {
  try { emojiSoundManager.preferAssets(flag); } catch (_) {}
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








