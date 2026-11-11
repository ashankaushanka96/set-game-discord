import { send } from "../../ws";
import { useStore } from "../../store";

export const GAME_MODES = [
  {
    id: "voice",
    name: "Voice Play",
    icon: "🎙️",
    blurb: "Ask out loud in voice chat. Whoever has the card drags it to you.",
  },
  {
    id: "turns",
    name: "Turn Play",
    icon: "🎯",
    blurb: "Tap an opponent to ask for a card. They hand it over with a button, and the turn is shown on the table.",
  },
];

// Lobby choice of how cards are asked for. Only the room admin can change it.
export default function GameModePicker({ state, me }) {
  const ws = useStore((s) => s.ws);
  const current = state?.game_mode || "voice";
  const isAdmin = !state?.admin_player_id || state.admin_player_id === me?.id;
  const adminName = state?.players?.[state?.admin_player_id]?.name;

  return (
    <div className="game-mode-picker" role="radiogroup" aria-label="Game mode">
      <div className="game-mode-picker__label">
        Game mode{!isAdmin && adminName ? <span> · chosen by {adminName}</span> : null}
      </div>
      <div className="game-mode-picker__options">
        {GAME_MODES.map((m) => {
          const selected = current === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!isAdmin}
              className={`game-mode-option ${selected ? "game-mode-option--selected" : ""}`}
              onClick={() => isAdmin && !selected && send(ws, "set_game_mode", { mode: m.id })}
            >
              <span className="game-mode-option__title"><span aria-hidden="true">{m.icon}</span> {m.name}</span>
              <span className="game-mode-option__blurb">{m.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
