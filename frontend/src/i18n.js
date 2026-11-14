import { useStore } from "./store";
import SINHALA from "./i18n_si";

// Table language, chosen by the room admin in the lobby and shared by everyone in the room.
// Strings are looked up by their English text; anything without a translation stays English.
// {name}-style placeholders are filled from the second argument.
export const LANGUAGES = [
  { id: "en", name: "English", icon: "🇬🇧", blurb: "Everything on the table in English." },
  { id: "si", name: "සිංහල", icon: "🇱🇰", blurb: "මේසයේ සියල්ල සිංහලෙන්." },
];

const SI = { ...SINHALA };
export function addSinhala(map) { Object.assign(SI, map); }

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s);

// A translation can be a list of ways to say it: one is picked per seed (e.g. a message id), so the
// same bubble always reads the same but different ones vary.
const pick = (v, seed) => {
  if (!Array.isArray(v)) return v;
  const n = [...String(seed ?? Math.random())].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return v[n % v.length];
};

export function translate(lang, text, vars) {
  return fill(pick(lang === "si" ? SI[text] ?? text : text, vars?.seed), vars);
}

// Outside React (store messages, toasts): the room's current language.
export function t(text, vars) {
  return translate(useStore.getState().state?.language, text, vars);
}

// In components: re-renders when the room's language changes.
export function useT() {
  const lang = useStore((s) => s.state?.language || "en");
  return (text, vars) => translate(lang, text, vars);
}
