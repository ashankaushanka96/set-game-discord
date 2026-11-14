"""The "Claude" bot level: Claude Haiku chooses the move, the rules engine does the counting.

For each move the rules engine (bot_ai) works out, from public play and the bot's own hand only,
where every card can be and lists the legal moves with their odds. Haiku gets that picture plus the
table's strategy notes (STRATEGY below: edit them to teach new techniques) and picks one option by
number. The pick is checked; on any problem (no API key, timeout, odd answer) the bot plays the
Expert rules move instead, so a game never stalls.

Needs ANTHROPIC_API_KEY on the server. HAIKU_BOT_MODEL overrides the model.
"""
from __future__ import annotations

import json
import os
from typing import List, Optional, Tuple

from loguru import logger

import bot_ai
from bot_ai import RANKS, Knowledge, cards_in, set_of, _card_value, _declare, _danger, _team_misses, _stuck, _at_risk, _hint_ready

MODEL = os.getenv("HAIKU_BOT_MODEL") or "claude-haiku-5-5"
TIMEOUT = 12.0

STRATEGY = """You are a strong, friendly player of Literature (also called Fish), a 6-player team card game.
Two teams of three. 48 cards in 8 sets: per suit a lower set (2-7, 6 cards, 20 points) and an upper set
(8-A, 7 cards, 30 points). On your turn you ask one opponent for card(s) of a set you hold at least one
card of. If they have them, you take them and keep the turn; if not, the turn passes to the player you
asked. You score a set by laying it down when your team holds all of it and you correctly name which
teammate holds each card; a wrong laydown gives the set to the other team. After a laydown with helpers,
the turn can pass to a helping teammate.

You choose one move from a numbered list. The rules engine has already done the counting: trust the
odds it gives. Use judgment and these techniques from our table's best players:

1. Sure cards first. A card you know an opponent holds is a free ask that keeps your turn.
2. Guard. If the opponents are 1-2 cards from finishing a set and our team holds the rest, don't hand
   the turn to an opponent who holds cards of that set. Prefer asking an opponent who holds nothing of it
   (marked SAFE), even at somewhat lower odds.
3. Save team sets. A set our team holds completely (between my hand and teammates) is a tool: rather
   than cashing it at once, lay it down when no ask is good, to pass the turn to the helping teammate who
   can take cards from opponents. A near-certain (~50%+) team laydown can be worth it when every ask is bad.
4. Golden rule for hints. If a teammate asked for a card and missed: if I HOLD that card, ask for a
   DIFFERENT card of the same set (that tells my teammate I have it); if I DON'T hold it, chase that SAME
   card from an opponent who hasn't been asked for it yet.
5. Keep building the set my team is working on; strike an opponent who keeps asking for cards I hold.
6. Once everyone can place every card of a set, stop asking around in it and finish it or move on.
7. Upper sets are worth more than lower sets.
8. Keep a team set in hand. A set our team holds completely (marked KEEP) is a rescue: don't cash it just
   because you can. Lay it down when a helping teammate is STUCK (the table knows their cards and the
   opponents are hinting their way to take them), when the set is AT RISK, or when every ask is bad.
   Laying down a set I hold alone is always safe and keeps my turn.
10. Shield my hand. Every ask tells the table I hold that set and lack that card. Prefer asks marked
   REVEALS NOTHING (the table already knows both); open a new set only when I or a teammate can really
   get the card. The aim is to collect their cards while they learn little about mine.
11. Bluff, now and then. When two teammates are already building a set I also hold, I may stay quiet in
   it so the opponents think I hold none, and strike later. Not every time: it can confuse teammates too.
12. Count hands late in the game. A player whose every card is already placed can't hold my card; ask the
   one with unplaced cards (the odds already include this).
13. Read multi-asks. A player who asks for several cards of a set at once believes they hold the rest.
14. Who gets the turn if I miss? Rank the opponents by what they could do with it (cards of ours they can
   place, sets they are close to finishing) and miss towards the weakest.
15. After a laydown with two helpers, hand the turn to the one who can take the most, or the STUCK one.
9. Starve the opponents' hints. Every missed ask hands an opponent the turn, and opponents use their turns
   to pass hints to each other. Prefer moves that keep the turn; when you must risk a miss, avoid an
   opponent marked HINTED (a teammate just left them a hint to act on).

Reply with JSON only: {"choice": <option number>, "why": "<short reason, under 15 words>"}."""

_client = None


def available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic(timeout=TIMEOUT, max_retries=1)
    return _client


def _name(c) -> str:
    return f"{c[1]}{ {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'}[c[0]] }".replace(" ", "")


def _set_name(s) -> str:
    return f"{s[0]} {s[1]}"


def options(game, bot_id: str) -> Tuple[List[dict], str]:
    """The legal moves worth considering, each {"move": ..., "text": ...}, and a picture of the table."""
    P = {**bot_ai.PROFILES["expert"], "miss": 0.0, "half_life": None, "noise": 0.0, "solve": 12}
    k = Knowledge(game, bot_id, P)
    me, my_team = bot_id, k.team[bot_id]
    seat = lambda pid: f"seat {game.state.players[pid].seat}"
    who = lambda pid: ("me" if pid == me else ("teammate " if k.team[pid] == my_team else "opponent ") + seat(pid))
    danger = _danger(k)
    misses = _team_misses(game, k)
    pub = Knowledge(game, bot_id, P, public=True)
    hinted = _hint_ready(game, k)
    opts: List[dict] = []

    rules = bot_ai.decide(game, bot_id, "expert")
    # Laydowns
    for s in k.live_sets:
        cs = cards_in(s)
        if not any(c in k.my_hand for c in cs):
            continue
        if all(c in k.my_hand for c in cs):
            opts.append({"move": _declare(k, s, {c: me for c in cs}),
                         "text": f"LAY DOWN {_set_name(s)}: I hold all of it (certain, keeps my turn)"})
        elif all(k.loc[c] and k.team[k.loc[c]] == my_team for c in cs):
            helpers = sorted({k.loc[c] for c in cs} - {me})
            tags = ["AT RISK" if _at_risk(k, pub, s) else "KEEP: safe to hold for later"]
            tags += [f"{who(h)} is STUCK" for h in helpers if _stuck(k, pub, h) > 0]
            opts.append({"move": _declare(k, s, {c: k.loc[c] for c in cs}),
                         "text": f"LAY DOWN {_set_name(s)} with {', '.join(who(h) for h in helpers)} (certain; turn can pass to a helper) [{'; '.join(tags)}]"})
    g = bot_ai._guess_laydown(k, 0.3)
    if g:
        mv, odds = g
        opts.append({"move": mv, "text": f"LAY DOWN {mv['suit']} {mv['set_type']} on a guess of who holds each card ({odds:.0%} chance right; wrong gives it to the opponents)"})

    # Asks, best first
    asks = []
    for s, c, t in bot_ai._ask_options(k):
        p = k.prob(c, t)
        if p <= 0:
            continue
        risky = [ds for ds in danger if k.in_set(t, ds) > 0.05]
        note = []
        if p >= 0.999:
            note.append("SURE")
        if danger:
            note.append("RISKY: could finish " + ", ".join(_set_name(ds) for ds in risky) if risky else "SAFE")
        if s in misses:
            wanted, asked = misses[s]
            if wanted == c and t not in asked:
                note.append(f"teammate missed this card; {seat(t)} not asked yet")
            elif wanted in k.my_hand and c != wanted:
                note.append(f"hint: I hold {_name(wanted)} a teammate missed")
        if t in k.hunters.get(s, ()):
            note.append("this opponent is hunting my cards")
        shows = []
        if not ((me, s) in pub.must_hold or any(pub.loc[x] == me for x in cards_in(s))):
            shows.append("that I hold this set")
        if me not in pub.not_have[c]:
            shows.append("that I lack this card")
        note.append("REVEALS " + " and ".join(shows) if shows else "REVEALS NOTHING")
        if p < 0.999 and t in hinted:
            note.append("HINTED: a miss lets them act on a teammate's hint")
        asks.append((p * _card_value(s), {"move": {"action": "ask", "target_id": t, "suit": s[0], "set_type": s[1], "rank": c[1], "ranks": [c[1]]},
                                         "text": f"ASK {who(t)} for {_name(c)} ({p:.0%} they have it){' [' + '; '.join(note) + ']' if note else ''}"}))
    asks.sort(key=lambda x: -x[0])
    keep, per_set = [], {}
    for _, a in asks:   # best asks, at most 4 per set so other sets get a look too
        key = (a["move"]["suit"], a["move"]["set_type"])
        special = "teammate missed" in a["text"] or "hint:" in a["text"] or "SURE" in a["text"]
        if (len(keep) < 12 and per_set.get(key, 0) < 4) or (special and len(keep) < 18):
            keep.append(a)
            per_set[key] = per_set.get(key, 0) + 1
    opts += keep

    if rules and not any(o["move"] == rules for o in opts):
        desc = (f"ASK {who(rules['target_id'])} for {', '.join(_name((rules['suit'], r)) for r in rules['ranks'])}" if rules["action"] == "ask"
                else f"LAY DOWN {rules['suit']} {rules['set_type']}")
        opts.insert(0, {"move": rules, "text": desc})
    for o in opts:
        if o["move"] == rules and "KEEP:" not in o["text"]:   # don't steer Claude into cashing a set worth keeping
            o["text"] += "  <- the rules engine's pick"

    # Table picture
    lines = [f"My hand: {' '.join(sorted(_name(c) for c in k.my_hand))}"]
    for pid in sorted(k.players, key=lambda x: game.state.players[x].seat):
        lines.append(f"{who(pid)}: {k.count[pid]} cards")
    lines.append(f"Score: my team {game.state.team_scores.get(my_team, 0)}, opponents {sum(v for t, v in game.state.team_scores.items() if t != my_team)}")
    for s in k.live_sets:
        known = [f"{_name(c)}={'me' if k.loc[c] == me else who(k.loc[c])}" for c in cards_in(s) if k.loc[c]]
        if known:
            lines.append(f"{_set_name(s)} known: {', '.join(known)}")
    for s, v in danger.items():
        lines.append(f"DANGER: opponents are close to finishing {_set_name(s)} using cards my team holds")
    recent = getattr(game, "public_log", [])[-12:]
    if recent:
        lines.append("Recent asks (oldest first):")
        for e in recent:
            if e["asker_id"] in k.team and e["target_id"] in k.team:
                lines.append(f"  {who(e['asker_id'])} asked {who(e['target_id'])} for "
                             f"{', '.join(_name((e['suit'], r)) for r in e['ranks'])}: {'YES' if e['success'] else 'no'}")
    return opts, "\n".join(lines)


async def decide(game, bot_id: str) -> Optional[dict]:
    """Haiku's move, or the Expert rules move if Haiku can't be used."""
    fallback = bot_ai.decide(game, bot_id, "expert")
    if not available() or not fallback:
        return fallback
    try:
        opts, picture = options(game, bot_id)
    except Exception as e:
        logger.warning(f"Claude bot: could not build options ({e}); using rules")
        return fallback
    if len(opts) <= 1:
        return opts[0]["move"] if opts else fallback
    numbered = "\n".join(f"{i + 1}. {o['text']}" for i, o in enumerate(opts))
    try:
        resp = await _get_client().messages.create(
            model=MODEL,
            max_tokens=4000,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": {
                "type": "object",
                "properties": {"choice": {"type": "integer"}, "why": {"type": "string"}},
                "required": ["choice", "why"], "additionalProperties": False}}},
            system=[{"type": "text", "text": STRATEGY, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": f"{picture}\n\nYour options:\n{numbered}"}],
        )
        if resp.stop_reason not in ("end_turn", "stop_sequence"):
            raise ValueError(f"stopped: {resp.stop_reason}")
        text = next(b.text for b in resp.content if b.type == "text")
        pick = json.loads(text)
        i = int(pick["choice"]) - 1
        if not 0 <= i < len(opts):
            raise ValueError(f"choice {i + 1} out of range")
        logger.info(f"Claude bot {bot_id}: {opts[i]['text']} — {pick.get('why', '')}")
        return opts[i]["move"]
    except Exception as e:
        logger.warning(f"Claude bot {bot_id}: falling back to rules ({type(e).__name__}: {e})")
        return fallback
