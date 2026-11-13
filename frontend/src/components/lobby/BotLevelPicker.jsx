import { send } from "../../ws";
import { useStore } from "../../store";
import { LobbySetting, isRoomAdmin } from "./GameModePicker";

export const BOT_LEVELS = [
  { id: "easy", name: "Easy", icon: "🌱", blurb: "Forgets quickly and plays by luck. Slips often." },
  { id: "medium", name: "Medium", icon: "🧠", blurb: "Remembers a fair amount for a while and weighs the odds." },
  { id: "hard", name: "Hard", icon: "🦊", blurb: "Remembers nearly everything and works out where cards are." },
  { id: "expert", name: "Expert", icon: "👑", blurb: "Sharp memory plus strategy about who gets the turn." },
];

// How clever the bots that fill empty seats are: a room setting the admin chooses.
export default function BotLevelPicker({ state, me }) {
  const ws = useStore((s) => s.ws);
  return <LobbySetting label="Bot difficulty" options={BOT_LEVELS} current={state?.bot_level || "medium"}
    isAdmin={isRoomAdmin(state, me)} adminName={state?.players?.[state?.admin_player_id]?.name}
    onPick={(id) => send(ws, "set_bot_level", { level: id })} />;
}
