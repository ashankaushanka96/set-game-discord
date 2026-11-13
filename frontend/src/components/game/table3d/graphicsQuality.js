// The 3D table's sharpness, chosen per device in Settings and remembered in this browser
// (a phone and a laptop want different things, so it isn't stored on the server).
//   auto:  battery saver on phones and tablets, sharp elsewhere
//   saver: 1.5x pixels, no antialiasing, simpler shadows (less battery and heat)
//   sharp: up to 2x pixels, antialiasing, soft shadows
const KEY = 'graphicsQuality';
export const QUALITIES = ['auto', 'saver', 'sharp'];

export function getQuality() {
  try { const q = localStorage.getItem(KEY); return QUALITIES.includes(q) ? q : 'auto'; } catch { return 'auto'; }
}

export function setQuality(q) {
  try { localStorage.setItem(KEY, q); } catch {}
  window.dispatchEvent(new CustomEvent('graphics_quality', { detail: q }));
}

export function isPhoneLike() {
  return !!(window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600);
}

// Battery-saving drawing for this quality on this device?
export function isLightGraphics(q = getQuality()) {
  return q === 'saver' || (q === 'auto' && isPhoneLike());
}
