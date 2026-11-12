import { useState } from "react";

export const BOT_LEVELS = [
  { id: "easy", name: "Easy", icon: "🌱", blurb: "Forgets quickly and plays by luck. Slips often." },
  { id: "medium", name: "Medium", icon: "🧠", blurb: "Remembers a fair amount for a while and weighs the odds." },
  { id: "hard", name: "Hard", icon: "🦊", blurb: "Remembers nearly everything, works out where cards are, reads hints." },
  { id: "expert", name: "Expert", icon: "👑", blurb: "Sharp memory plus strategy about who gets the turn. Rarely slips." },
];

const KEY = "set-game-bot-level";

export function getBotLevel() {
  try {
    const v = localStorage.getItem(KEY);
    if (BOT_LEVELS.some((l) => l.id === v)) return v;
  } catch { /* storage unavailable */ }
  return "medium";
}

// Lobby choice of how clever the bots that fill empty seats are. At every level they back a
// teammate's set, defend a card being hunted, and use only what a player could see or remember.
export default function BotLevelPicker() {
  const [level, setLevel] = useState(getBotLevel);
  const pick = (id) => {
    setLevel(id);
    try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
  };
  return (
    <div className="game-mode-picker bot-level-picker" role="radiogroup" aria-label="Bot difficulty">
      <div className="game-mode-picker__label">Bot difficulty<span> · for empty seats</span></div>
      <div className="game-mode-picker__options">
        {BOT_LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={level === l.id}
            className={`game-mode-option ${level === l.id ? "game-mode-option--selected" : ""}`}
            onClick={() => pick(l.id)}>
            <span className="game-mode-option__title"><span aria-hidden="true">{l.icon}</span> {l.name}</span>
            <span className="game-mode-option__blurb">{l.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
