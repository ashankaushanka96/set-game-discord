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
    this._active = new Map();
    this._stopped = new WeakSet();
    this._cardSources = new Set();
    this._generations = new Map();
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
    // Legacy callers must never restart the old full-length recordings.
    if (key === 'lay_success' || key === 'lay_unsuccess') {
      this.playLaydownCue(key === 'lay_success');
      return;
    }
    if (key === 'pass') {        // there's no recording for this one: use the synthesized slide
      this.playCue('card');
      return;
    }
    if (key === 'deal' || key === 'shuffle') {
      this.playCardFoley(key === 'shuffle' ? 'riffle' : 'slide');
      return;
    }
    const url = this.getSoundUrl(key);
    if (!url) return;

    const generation = this._generations.get(key) || 0;
    const action = () => {
      if ((this._generations.get(key) || 0) === generation) this._playUrl(url, key);
    };
    if (!this._unlocked) {
      this._pending.push(action);
      return;
    }
    action();
  }

  // Synthesized laydown cue, timed to the animation: card swishes as the cards gather (0–0.6s),
  // then a bright chime arpeggio with sparkles (success) or a thud and a soft "wah-wah" (fail).
  playLaydownCue(success) {
    if (this.isMuted || !this._unlocked) return;
    try {
      const Context = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
      if (!this.audioContext && Context) this.audioContext = new Context();
      const ctx = this.audioContext;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t0 = ctx.currentTime + .03;
      const master = ctx.createGain();
      master.gain.value = this.volume * .55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      const noise = (at, dur, freq, q, peak) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); f.frequency.exponentialRampToValueAtTime(freq * 1.8, at + dur); f.Q.value = q;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + dur * .25); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
        src.connect(f); f.connect(g); g.connect(master); src.start(at); src.stop(at + dur + .02);
      };
      const tone = (at, dur, freq, type, peak, opts = {}) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
        if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, at + dur);
        if (opts.detune) o.detune.value = opts.detune;
        let out = o;
        if (opts.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(opts.lowpass, at); if (opts.wah) { f.frequency.linearRampToValueAtTime(opts.lowpass * 2.2, at + dur * .35); f.frequency.linearRampToValueAtTime(opts.lowpass * .8, at + dur); } f.Q.value = opts.wah ? 6 : 1; o.connect(f); out = f; }
        if (opts.vibrato) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = opts.vibrato; l.connect(lg); lg.connect(o.frequency); l.start(at); l.stop(at + dur + .05); }
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + (opts.attack || .012)); g.gain.setValueAtTime(peak, at + dur * (opts.hold || .2)); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
        out.connect(g); g.connect(master); o.start(at); o.stop(at + dur + .05);
      };
      // Cards sweeping into the middle of the table.
      [0, .09, .17, .24, .3].forEach((dt, i) => noise(t0 + dt, .12, 1800 + i * 220, .8, .22));
      noise(t0 + .52, .09, 520, 1.2, .5); // cards landing
      const hit = t0 + .66;
      if (success) {
        tone(hit, .5, 130.81, 'sine', .45, { glideTo: 65 }); // soft low thump
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        notes.forEach((f, i) => {
          tone(hit + i * .075, 1.1, f, 'triangle', .22, { hold: .05 });
          tone(hit + i * .075, 1.1, f * 2, 'sine', .06, { hold: .05, detune: 6 });
        });
        [523.25, 659.25, 783.99].forEach(f => tone(hit + .42, 1.5, f, 'sine', .1, { attack: .08, hold: .3 })); // warm chord
        for (let i = 0; i < 14; i++) tone(hit + .3 + Math.random() * .9, .22, 2600 + Math.random() * 2600, 'sine', .05 + Math.random() * .04); // sparkles
      } else {
        tone(hit, .35, 90, 'sine', .55, { glideTo: 45 }); // dull thud
        noise(hit, .18, 300, .7, .35);
        const sad = [[392, .32], [369.99, .32], [349.23, .32], [329.63, .95]];
        let at = hit + .38;
        sad.forEach(([f, d], i) => {
          const last = i === sad.length - 1;
          tone(at, d, f, 'sawtooth', .16, { lowpass: 700, wah: true, attack: .03, hold: .5, vibrato: last ? 9 : 0, glideTo: last ? f * .94 : undefined });
          tone(at, d, f / 2, 'triangle', .1, { attack: .03, hold: .5 });
          at += d * .92;
        });
      }
      setTimeout(() => { try { master.disconnect(); comp.disconnect(); } catch (_) {} }, 4000);
    } catch (_) {}
  }

  // Short synthesized table cues (no files): bubbles popping in, the turn spotlight moving, your
  // turn, being asked. Kept quiet and soft so they sit under voice chat.
  playCue(name) {
    if (this.isMuted || !this._unlocked) return;
    try {
      const Context = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
      if (!this.audioContext && Context) this.audioContext = new Context();
      const ctx = this.audioContext;
      if (!ctx || ctx.state !== 'running') return;   // never queue stale cues for later
      const now = this._cueAt?.[name];
      const t = ctx.currentTime;
      if (now && t - now < .12) return;               // the same cue twice at once: play it once
      (this._cueAt ||= {})[name] = t;
      const out = ctx.createGain(); out.gain.value = this.volume * .5; out.connect(ctx.destination);
      const tone = (at, dur, f, type = 'sine', peak = .2, glide) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t + at);
        if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + at + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(peak, t + at + .008); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
        o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + .03);
      };
      const air = (at, dur, f, peak = .12) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .9;
        bp.frequency.setValueAtTime(f, t + at); bp.frequency.exponentialRampToValueAtTime(f * 2.4, t + at + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(peak, t + at + dur * .4); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
        src.connect(bp); bp.connect(g); g.connect(out); src.start(t + at); src.stop(t + at + dur + .02);
      };
      switch (name) {
        case 'bubble': tone(0, .09, 620, 'sine', .16, 980); break;                              // soft pop
        case 'ask': tone(0, .1, 540, 'triangle', .16, 760); tone(.09, .14, 820, 'sine', .1); break; // "hm?"
        case 'yes': tone(0, .12, 660, 'triangle', .16); tone(.08, .2, 990, 'triangle', .14); break; // up
        case 'no': tone(0, .14, 440, 'triangle', .14); tone(.1, .2, 330, 'triangle', .12); break;   // down
        case 'chat': tone(0, .07, 900, 'sine', .1, 1200); break;                                   // tick
        case 'turn': air(0, .32, 700, .1); tone(.18, .3, 880, 'sine', .07); break;                // spotlight glides
        case 'my_turn': [523.25, 659.25, 783.99].forEach((f, i) => tone(i * .07, .45, f, 'triangle', .15)); break;
        case 'asked_me': tone(0, .16, 988, 'sine', .16); tone(.16, .26, 1318.5, 'sine', .14); break; // ding-ding
        case 'card': air(0, .12, 1400, .2); air(.06, .1, 1800, .14); break;                     // card slides over
        case 'pause': tone(0, .22, 523.25, 'sine', .14, 392); break;
        case 'resume': tone(0, .22, 392, 'sine', .14, 587.33); break;
        case 'round_end':   // a warm rising chime that settles on a chord
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(i * .11, .5, f, 'triangle', .13));
          [523.25, 659.25, 783.99].forEach((f) => tone(.5, 1.4, f, 'sine', .08));
          air(.45, .7, 2400, .05);
          break;
        default: break;
      }
      setTimeout(() => { try { out.disconnect(); } catch (_) {} }, 2500);
    } catch (_) {}
  }

  playCardFoley(kind = 'slide') {
    if (this.isMuted || !this._unlocked) return;
    try {
      const Context = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
      if (!this.audioContext && Context) this.audioContext = new Context();
      const ctx = this.audioContext;
      // Never queue old card sounds for a later browser audio unlock.
      if (!ctx || ctx.state !== 'running') return;
      const duration = kind === 'riffle' ? .055 : kind === 'square' ? .10 : .075;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = kind === 'square' ? 650 : kind === 'riffle' ? 2200 : 1400;
      filter.Q.value = .65;
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.volume * (kind === 'square' ? .24 : .12), now + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      this._cardSources.add(source);
      source.onended = () => { this._cardSources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(now);
    } catch (_) {}
  }

  stopCardFoley() {
    for (const source of this._cardSources) {
      try { source.stop(); source.disconnect(); } catch (_) {}
    }
    this._cardSources.clear();
    this.stopKey('deal');
    this.stopKey('shuffle');
  }

  stopKey(key) {
    // Invalidate queued playback as well as stopping already playing clones.
    this._generations.set(key, (this._generations.get(key) || 0) + 1);
    for (const audio of this._active.get(key) || []) {
      this._stopped.add(audio);
      audio.pause();
      try { audio.currentTime = 0; audio.removeAttribute?.("src"); audio.load?.(); } catch (_) {}
    }
    this._active.delete(key);
  }

  _playUrl(url, key) {
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
      const active = this._active.get(key) || new Set();
      this._active.set(key, active);
      active.add(audio);
      const release = () => {
        active.delete(audio);
        if (!active.size && this._active.get(key) === active) this._active.delete(key);
      };
      audio.addEventListener('ended', release, { once: true });
      audio.addEventListener('error', release, { once: true });
      audio.play().then(() => {
        if (this._stopped.has(audio)) audio.pause();
      }).catch(release);
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
export const playCue = (name) => {
  try { emojiSoundManager.playCue(name); } catch (_) {}
};
export const playCardFoley = kind => emojiSoundManager.playCardFoley(kind);
export const stopCardFoley = () => emojiSoundManager.stopCardFoley();
export const stopKey = (key) => {
  try { emojiSoundManager.stopKey(key); } catch (_) {}
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








