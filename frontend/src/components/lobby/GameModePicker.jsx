import { send } from "../../ws";
import { useStore } from "../../store";
import { t, LANGUAGES } from "../../i18n";

export const GAME_MODES = [
  { id: "voice", name: "Voice Play", icon: "🎙️", blurb: "Ask out loud in voice chat; whoever has the card drags it to you." },
  { id: "turns", name: "Turn Play", icon: "🎯", blurb: "Tap an opponent to ask; turns are shown on the table." },
];

export const isRoomAdmin = (state, me) => !state?.admin_player_id || state.admin_player_id === me?.id;

// A lobby setting: a row of choices. Only the room admin can change it; everyone else sees it locked.
export function LobbySetting({ label, options, current, isAdmin, adminName, onPick }) {
  const sel = options.find((o) => o.id === current) || options[0];
  return (
    <div className={`lobby-setting ${isAdmin ? "" : "lobby-setting--locked"}`} role="radiogroup" aria-label={label}>
      <div className="lobby-setting__label">
        <span>{t(label)}</span>
        {!isAdmin && <small title={adminName ? t("Only {name} can change this", { name: adminName }) : t("Only the admin can change this")}>🔒 {adminName ? t("Set by {name}", { name: adminName }) : t("Admin only")}</small>}
      </div>
      <div className="lobby-setting__options">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={current === o.id} disabled={!isAdmin}
            className={`lobby-setting__option ${current === o.id ? "is-selected" : ""}`}
            onClick={() => isAdmin && current !== o.id && onPick(o.id)} title={o.raw ? o.blurb : t(o.blurb)}>
            <span aria-hidden="true">{o.icon}</span> {o.raw ? o.name : t(o.name)}
          </button>
        ))}
      </div>
      <p className="lobby-setting__blurb">{sel.raw ? sel.blurb : t(sel.blurb)}</p>
    </div>
  );
}

export const VOICE_TURNS = [
  { id: "off", name: "Free", icon: "🗣️", blurb: "Anyone can ask any time; cards are passed freely." },
  { id: "on", name: "Track turns", icon: "🔦", blurb: "Purple spotlight on whose turn it is. They tap who they're asking (gold spotlight); only that player can send cards." },
];

export default function GameModePicker({ state, me }) {
  const ws = useStore((s) => s.ws);
  const isAdmin = isRoomAdmin(state, me), adminName = state?.players?.[state?.admin_player_id]?.name;
  return <>
    <LobbySetting label="Language" options={LANGUAGES.map((l) => ({ ...l, raw: true }))} current={state?.language || "en"}
      isAdmin={isAdmin} adminName={adminName}
      onPick={(id) => send(ws, "set_language", { lang: id })} />
    <LobbySetting label="Game mode" options={GAME_MODES} current={state?.game_mode || "voice"}
      isAdmin={isAdmin} adminName={adminName}
      onPick={(id) => send(ws, "set_game_mode", { mode: id })} />
    {(state?.game_mode || "voice") === "voice" && (
      <LobbySetting label="Turns" options={VOICE_TURNS} current={state?.voice_turns ? "on" : "off"}
        isAdmin={isAdmin} adminName={adminName}
        onPick={(id) => send(ws, "set_voice_turns", { on: id === "on" })} />
    )}
  </>;
}
