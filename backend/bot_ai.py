"""Bot players for Turn Play.

A bot never looks at another player's hand. Everything it knows comes from what any
person at the table can see or remember:

  * its own hand
  * how many cards each player holds, and which sets are already on the table
  * the public history of asks: who asked whom for which card, and the answer

Every level plays the way friends at a table do:

  * support   keep collecting the set a teammate (or the bot itself) is already asking in,
              when it holds a card of that set; otherwise work on another set
  * fear      when an opponent has been asking its teammates for a card the bot holds, the
              bot is next. Given the turn, it goes after that collector's cards in the set
  * sure asks a card it saw handed over is asked for first, several at once if one player
              holds several

What separates the levels is the person behind them, from forgetful and lucky to sharp:

  easy    forgets most of what was said within a few asks, plays by feel, often slips
  medium  remembers a fair amount for a while, weighs the odds roughly
  hard    remembers nearly everything, works out where cards must be, reads hints
  expert  adds strategy about the turn (what a failed ask hands the opponent, laying a
          shared set down to pass the turn to a teammate)

Nobody is perfect: every level can miss or forget an ask, and so can believe a card is
still where it used to be. Mistakes get rarer with level but never disappear.
"""
from __future__ import annotations

import random
import zlib
from typing import Dict, List, Optional, Set, Tuple

RANKS = {"lower": ["2", "3", "4", "5", "6", "7"], "upper": ["8", "9", "10", "J", "Q", "K", "A"]}
SUITS = ["hearts", "diamonds", "clubs", "spades"]
LEVELS = ("easy", "medium", "hard", "expert")

# miss       chance an ask simply isn't taken in
# half_life  asks after which half of what was taken in has faded (None = never fades)
# noise      chance of picking a move on a whim instead of the best one
# deduce     works out certainties from card counts and "must hold one of the set"
# hints      reads "asked for a different card of the partner's set" as holding the wanted card
# passed_up  reads "left a known card untaken" as holding nothing in that set
# sure_lay   lays down a set shared with teammates once it believes it knows every card
# turn       how much it minds handing the turn to an opponent (points)
# progress   pull toward sets the team already holds much of
# support    pull toward the set a teammate or the bot itself has been asking in
# fear       pull toward attacking a collector who is hunting a card it holds
# threat     weight of what the asked opponent could take if the ask fails
# handoff    lays down a shared set to pass the turn to the teammate with better chances
# guard      when an opponent team is 1-2 cards from finishing a set with our cards, prefer asking
#            an opponent who holds nothing of it (a failed ask then hands the turn to a safe player)
# golden     hint rule: a teammate asked for a card and missed - holding it, ask another card of
#            that set (a hint); not holding it, chase that same card from opponents not yet asked
# lay_odds   lays down a team set without being sure who holds each card (when no ask is good),
#            if the guess is at least this likely (0 = never)
# save       points a team set is worth kept in hand as a rescue: it is laid down only when
#            handing the turn to a stuck teammate beats the best ask by this much, when it is at
#            risk (opponents can see one of its cards), or when no ask is worth making
# deny       weight against handing the turn (by a missed ask) to an opponent whose teammate just
#            left them a hint to act on
# shield     points it minds giving away its hand: an ask tells the table it holds the set and
#            lacks the card, so it prefers asks the table could already read off past play
# bluff      chance (per set, per deal) of staying quiet in a set teammates are already building,
#            so the opponents think it holds none of it; it still takes sure cards there
# solve      endgame: with at most this many unplaced cards, work out exact odds from every
#            consistent spread of them (0 = off)
# passed_w   how much "left a known card untaken" lowers the odds they hold that set (0.35 = to a third)
# hint_w     how strongly "asked a different card of the partner's set" points at the wanted card
# multi      reads an ask for several cards at once as holding the rest of the set (weight, 0 = off)
# pass_turn  when every ask is bad, may ask for a card it knows the target lacks, to hand the turn
#            to the opponent who can do least with it
# chase      (optional) separate weight for the "chase the same card" half of golden
# golden and lay_odds are off by default: in bot-vs-bot games (400 each) they didn't win more,
# likely because bot teammates read hints only weakly. guard and the hard handoff did help.
PROFILES: Dict[str, dict] = {
    "easy":   dict(miss=0.35, half_life=6, noise=0.30, deduce=False, hints=False, passed_up=False, sure_lay=False,
                   turn=0.0, progress=0.3, support=1.0, fear=1.5, threat=0.0, handoff=False,
                   guard=0.0, golden=0.0, lay_odds=0.0),
    "medium": dict(miss=0.15, half_life=25, noise=0.15, deduce=False, hints=False, passed_up=False, sure_lay=True,
                   turn=4.0, progress=1.0, support=1.0, fear=1.5, threat=0.0, handoff=False,
                   guard=0.0, golden=0.0, lay_odds=0.0),
    "hard":   dict(miss=0.05, half_life=120, noise=0.07, deduce=True, hints=True, passed_up=False, sure_lay=True,
                   turn=10.0, progress=2.0, support=1.0, fear=1.5, threat=0.0, handoff=True,
                   guard=6.0, golden=0.0, lay_odds=0.0, save=8.0, deny=0.0, shield=0.0, bluff=0.0),
    "expert": dict(miss=0.015, half_life=600, noise=0.03, deduce=True, hints=True, passed_up=True, sure_lay=True,
                   turn=10.0, progress=2.0, support=1.0, fear=1.5, threat=0.3, handoff=True,
                   guard=8.0, golden=0.0, lay_odds=0.0, save=8.0, deny=0.0, shield=0.0, bluff=0.0),
}

STALEMATE = 12   # failed asks in a row before the table starts keeping careful track

CardKey = Tuple[str, str]          # (suit, rank)
SetKey = Tuple[str, str]           # (suit, set_type)


def set_of(card: CardKey) -> SetKey:
    return (card[0], "lower" if card[1] in RANKS["lower"] else "upper")


def cards_in(s: SetKey) -> List[CardKey]:
    return [(s[0], r) for r in RANKS[s[1]]]


def profile_for(game, bot_id: str, level: str) -> dict:
    base = PROFILES.get(level, PROFILES["medium"])
    return {**base, **(getattr(game, "bot_params", {}).get(bot_id) or {})}


class Knowledge:
    """What one bot believes right now, built only from public play and its own hand.

    public=True builds what a table with perfect memory would know (no private hand):
    an expert uses it to judge which of its team's cards the opponents can place."""

    def __init__(self, game, bot_id: str, profile: dict, public: bool = False):
        st = game.state
        self.P = profile
        self.me = bot_id
        self.public = public
        self.seed = f"{getattr(game, 'deal_seed', 0)}|{bot_id}"
        self.players = {pid: p for pid, p in st.players.items() if p.team and not p.is_spectator}
        self.team = {pid: p.team for pid, p in self.players.items()}
        self.count = {pid: len(p.hand) for pid, p in self.players.items()}   # hand sizes are public
        self.my_hand: Set[CardKey] = set() if public else {(c.suit, c.rank) for c in self.players[bot_id].hand}
        self.laid: Set[SetKey] = {(t.suit, t.set_type) for t in st.table_sets}
        self.live_sets: List[SetKey] = [(s, t) for s in SUITS for t in ("lower", "upper") if (s, t) not in self.laid]
        self.live_cards: List[CardKey] = [c for s in self.live_sets for c in cards_in(s)]

        self.loc: Dict[CardKey, Optional[str]] = {c: None for c in self.live_cards}
        self.not_have: Dict[CardKey, Set[str]] = {c: set() for c in self.live_cards}
        self.must_hold: Set[Tuple[str, SetKey]] = set()      # (player, set): holds at least one card of it
        self.interest: Dict[SetKey, Set[str]] = {}           # who has been asking in a set
        self.hunters: Dict[SetKey, Set[str]] = {}            # opponents asking around for a card this bot holds
        self.hint: Dict[CardKey, Dict[str, float]] = {}      # soft "probably holds it" weights
        self.passed_up: Set[Tuple[str, SetKey]] = set()      # had the turn, left a known card untaken
        self._known: Optional[Dict[str, int]] = None
        self._prob: Dict[Tuple[CardKey, str], float] = {}

        # A long run of "no" answers is a stalemate the whole table feels: everyone starts
        # paying attention, so the asks inside it are all kept in mind.
        log = getattr(game, "public_log", [])
        streak = 0
        for ev in reversed(log):
            if ev["success"]:
                break
            streak += 1
        self.focus_from = len(log) - streak if streak >= STALEMATE else len(log)

        self._replay(log)
        if not public:
            for c in self.live_cards:                        # own hand: always certain
                if c in self.my_hand:
                    self._place(c, bot_id)
                else:
                    if self.loc[c] == bot_id:                # misremembered: it isn't here any more
                        self.loc[c] = None
                        self.not_have[c] = set()
                    self.not_have[c].add(bot_id)
        for pid, n in self.count.items():                    # an empty hand holds nothing
            if n == 0:
                for c in self.live_cards:
                    if self.loc[c] == pid:
                        self.loc[c] = None
                        self.not_have[c] = set()
                    self.not_have[c].add(pid)
        if public or self.P["deduce"]:
            self._deduce()
        self._exact: Optional[Dict[Tuple[CardKey, str], float]] = None
        if not public and self.P.get("solve"):
            self._solve(int(self.P["solve"]))

    # ---- memory -------------------------------------------------------------
    def _recalls(self, index: int, total: int, ev: dict) -> bool:
        """Whether this bot still has this ask in mind. Fixed per bot and ask, so what is
        forgotten stays forgotten and what was never noticed never comes back."""
        if self.public or index >= self.focus_from:
            return True
        miss, half = self.P["miss"], self.P["half_life"]
        if self.me in (ev["asker_id"], ev["target_id"]):     # you remember your own asks better
            miss *= 0.3
            half = half * 3 if half else half
        elif ev["success"]:                                  # a card changing hands is hard to miss
            miss *= 0.5
        keep = 1.0 - miss
        if half:
            keep *= 0.5 ** ((total - 1 - index) / half)
        u = zlib.crc32(f"{self.seed}|{index}".encode()) / 4294967296.0
        return u < keep

    # ---- building knowledge -------------------------------------------------
    def _place(self, card: CardKey, pid: str):
        self.loc[card] = pid
        self.not_have[card] = set(self.players) - {pid}

    def _replay(self, log: List[dict]):
        wanted: Dict[SetKey, Dict[CardKey, str]] = {}        # set -> card -> last player who wanted it
        total = len(log)
        for index, ev in enumerate(log):
            s: SetKey = (ev["suit"], ev["set_type"])
            if s in self.laid:
                continue
            asker, target = ev["asker_id"], ev["target_id"]
            if asker not in self.players or target not in self.players:
                continue
            if not self._recalls(index, total, ev):
                continue
            cards = [(ev["suit"], r) for r in ev["ranks"]]
            if self.P["passed_up"] or self.public:
                # Someone who leaves a card everyone can place sitting in an opponent's hand and
                # asks elsewhere most likely holds nothing in that set.
                for s2 in self.live_sets:
                    if s2 != s and (asker, s2) not in self.must_hold:
                        if any(self.loc[c2] and self.team[self.loc[c2]] != self.team[asker] for c2 in cards_in(s2)):
                            self.passed_up.add((asker, s2))
                self.passed_up.discard((asker, s))
            self.must_hold.add((asker, s))
            self.interest.setdefault(s, set()).add(asker)
            if any(c in self.my_hand for c in cards) and self.team[asker] != self.team.get(self.me):
                self.hunters.setdefault(s, set()).add(asker)  # they are looking for a card I hold
            for c in cards:
                if self.loc.get(c) != asker:
                    self.not_have[c].add(asker)
            if self.P["hints"]:
                # Asking for a different card of a set your partner was chasing suggests you
                # already hold the card they were after.
                for c, who in wanted.get(s, {}).items():
                    if c not in cards and who != asker and self.team[who] == self.team[asker] and self.loc.get(c) is None:
                        self.hint.setdefault(c, {})[asker] = self.P.get("hint_w", 3.0)
            if self.P.get("multi") and len(cards) >= 2:
                # Asking for several at once: they believe they hold the rest of the set.
                for c2 in cards_in(s):
                    if c2 not in cards and self.loc.get(c2) is None:
                        h = self.hint.setdefault(c2, {})
                        h[asker] = max(h.get(asker, 1.0), 1.0 + self.P["multi"])
            for c in cards:
                wanted.setdefault(s, {})[c] = asker
            if ev["success"]:
                self.passed_up.discard((target, s))
                for c in cards:
                    self._place(c, asker)
                    wanted[s].pop(c, None)
                    self.hint.pop(c, None)
                self.must_hold.discard((target, s))          # they gave some away; may hold none now
            elif len(cards) == 1:
                if self.loc[cards[0]] == target:             # belief was out of date
                    self.loc[cards[0]] = None
                    self.not_have[cards[0]] = set()
                    self.not_have[cards[0]].add(asker)
                self.not_have[cards[0]].add(target)

    def _deduce(self):
        """Squeeze certainties out of counts and 'must hold one' facts."""
        for _ in range(8):
            changed = False
            for c in self.live_cards:                        # only one possible holder left
                if self.loc[c] is None:
                    left = [p for p in self.players if p not in self.not_have[c]]
                    if len(left) == 1:
                        self._place(c, left[0]); changed = True
            known = {p: 0 for p in self.players}
            for c, p in self.loc.items():
                if p:
                    known[p] += 1
            for p in self.players:                           # every card in this hand is accounted for
                if known[p] >= self.count[p]:
                    for c in self.live_cards:
                        if self.loc[c] is None and p not in self.not_have[c]:
                            self.not_have[c].add(p); changed = True
            for p, s in list(self.must_hold):                # holds one of the set, and only one card fits
                cs = cards_in(s)
                if any(self.loc[c] == p for c in cs):
                    continue
                fits = [c for c in cs if self.loc[c] is None and p not in self.not_have[c]]
                if len(fits) == 1:
                    self._place(fits[0], p); changed = True
            if not changed:
                break

    def _solve(self, limit: int, max_nodes: int = 200000):
        """Endgame: with few unplaced cards, go through every way they could be spread over the
        hands that fits the card counts, the "doesn't have" facts and the "holds one of the set"
        facts, and take exact odds from that. Gives up quietly if it would take too long."""
        unknown = [c for c in self.live_cards if self.loc[c] is None]
        if not unknown or len(unknown) > limit:
            return
        known = {p: 0 for p in self.players}
        for c, p in self.loc.items():
            if p:
                known[p] += 1
        room = {p: max(0, self.count[p] - known[p]) for p in self.players}
        if sum(room.values()) != len(unknown):
            return                                           # beliefs don't add up (forgotten asks): keep the estimate
        needs = [(p, s) for p, s in self.must_hold if not any(self.loc[c] == p for c in cards_in(s))]
        tally: Dict[Tuple[CardKey, str], int] = {}
        total, nodes = 0, 0
        assign: Dict[CardKey, str] = {}

        def ok_needs() -> bool:
            return all(any(assign.get(c) == p for c in cards_in(s)) for p, s in needs)

        def go(i: int) -> bool:
            nonlocal total, nodes
            nodes += 1
            if nodes > max_nodes:
                return False
            if i == len(unknown):
                if ok_needs():
                    total += 1
                    for c, p in assign.items():
                        tally[(c, p)] = tally.get((c, p), 0) + 1
                return True
            c = unknown[i]
            for p in self.players:
                if room[p] > 0 and p not in self.not_have[c]:
                    room[p] -= 1; assign[c] = p
                    if not go(i + 1):
                        return False
                    room[p] += 1; del assign[c]
            return True

        if go(0) and total:
            self._exact = {k: v / total for k, v in tally.items()}
            for c in unknown:                                # a card with only one possible holder is placed
                holders = [p for p in self.players if self._exact.get((c, p), 0) > 0]
                if len(holders) == 1:
                    self._place(c, holders[0])

    # ---- questions ----------------------------------------------------------
    def prob(self, card: CardKey, pid: str) -> float:
        """Chance that pid holds the card, as this bot sees it."""
        holder = self.loc[card]
        if holder:
            return 1.0 if holder == pid else 0.0
        if pid in self.not_have[card]:
            return 0.0
        if self._exact is not None:
            return self._exact.get((card, pid), 0.0)
        key = (card, pid)
        if key in self._prob:
            return self._prob[key]
        if self._known is None:
            self._known = {p: 0 for p in self.players}
            for p in self.loc.values():
                if p:
                    self._known[p] += 1
        known = self._known
        s = set_of(card)

        def weight(p: str) -> float:
            if p in self.not_have[card]:
                return 0.0
            w = max(0.0, self.count[p] - known[p])           # unexplained cards in that hand
            placed = any(self.loc[c] == p for c in cards_in(s))
            if (p, s) in self.must_hold and not placed:
                w *= 2.0                                     # they hold something here we haven't placed
            w *= self.hint.get(card, {}).get(p, 1.0)
            if (p, s) in self.passed_up and not placed:
                w *= self.P.get("passed_w", 0.35)
            return w

        total = sum(weight(p) for p in self.players)
        for p in self.players:
            self._prob[(card, p)] = weight(p) / total if total > 0 else 0.0
        return self._prob[key]

    def in_set(self, pid: str, s: SetKey) -> float:
        """Chance that pid holds at least one card of the set (so may ask in it)."""
        cs = cards_in(s)
        if any(self.loc[c] == pid for c in cs) or (pid, s) in self.must_hold:
            return 1.0
        miss = 1.0
        for c in cs:
            if self.loc[c] is None:
                miss *= 1.0 - self.prob(c, pid)
        return 1.0 - miss

    def team_holds(self, s: SetKey, team: str) -> int:
        return sum(1 for c in cards_in(s) if self.loc[c] and self.team[self.loc[c]] == team)


# ---- helpers ----------------------------------------------------------------
def _card_value(s: SetKey) -> float:
    return (30.0 if s[1] == "upper" else 20.0) / len(RANKS[s[1]])


def _declare(k: Knowledge, s: SetKey, holders: Dict[CardKey, str]) -> dict:
    helpers: Dict[str, List[str]] = {}
    for c, pid in holders.items():
        if pid != k.me:
            helpers.setdefault(pid, []).append(c[1])
    return {"action": "laydown", "suit": s[0], "set_type": s[1],
            "collaborators": [{"player_id": pid, "ranks": ranks} for pid, ranks in helpers.items()]}


def _forced_laydown(k: Knowledge) -> Optional[dict]:
    """No opponent can be asked: declare the best guess rather than stall the game."""
    my_team = k.team[k.me]
    mates = [p for p in k.players if k.team[p] == my_team and p != k.me and k.count[p] > 0]
    best, best_score = None, -1.0
    for s in k.live_sets:
        cs = cards_in(s)
        if not any(c in k.my_hand for c in cs):
            continue
        holders, score = {}, 1.0
        for c in cs:
            if c in k.my_hand:
                holders[c] = k.me
                continue
            if not mates:
                score = 0.0
                break
            pick = max(mates, key=lambda p: (k.prob(c, p), random.random()))
            holders[c] = pick
            score *= max(k.prob(c, pick), 0.01)
        if len(holders) == len(cs) and score > best_score:
            best, best_score = _declare(k, s, holders), score
    return best


def _ask_options(k: Knowledge) -> List[Tuple[SetKey, CardKey, str]]:
    my_team = k.team[k.me]
    opponents = [p for p in k.players if k.team[p] != my_team and k.count[p] > 0]
    out = []
    for s in k.live_sets:
        cs = cards_in(s)
        if not any(c in k.my_hand for c in cs):
            continue                                         # may only ask in a set you hold
        for c in cs:
            if c not in k.my_hand:                           # never ask for your own card
                out.extend((s, c, t) for t in opponents)
    return out


def _threat(k: Knowledge, pub: Knowledge, opp: str) -> float:
    """Points this opponent could take straight away if handed the turn: our cards that the
    whole table can place, in sets the opponent may hold a card of."""
    my_team = k.team[k.me]
    total = 0.0
    for s in k.live_sets:
        exposed = [c for c in cards_in(s) if pub.loc[c] and k.team[pub.loc[c]] == my_team]
        if not exposed:
            continue
        chance = k.in_set(opp, s)
        if chance <= 0:
            continue
        theirs = sum(1 for c in cards_in(s) if k.loc[c] and k.team[k.loc[c]] != my_team)
        finish = 1.6 if theirs + len(exposed) == len(RANKS[s[1]]) else 1.0
        total += chance * len(exposed) * _card_value(s) * finish
    return total


def _opportunity(k: Knowledge, pub: Knowledge, mate: str) -> float:
    """What a teammate could take straight away if handed the turn."""
    my_team = k.team[k.me]
    total = 0.0
    for s in k.live_sets:
        there = [c for c in cards_in(s) if pub.loc[c] and k.team[pub.loc[c]] != my_team]
        if there:
            total += k.in_set(mate, s) * len(there) * _card_value(s)
    return total


def _danger(k: Knowledge) -> Dict[SetKey, float]:
    """Sets the opponents are 1-2 cards from finishing, with the missing cards in our team's
    hands: handing them the turn there loses the set. Weight grows the closer they are."""
    my_team = k.team[k.me]
    out = {}
    for s in k.live_sets:
        cs = cards_in(s)
        theirs = sum(1 for c in cs if k.loc[c] and k.team[k.loc[c]] != my_team)
        ours = [c for c in cs if k.loc[c] and k.team[k.loc[c]] == my_team]
        need = len(cs) - theirs
        if theirs >= 3 and 1 <= need <= 2 and ours:
            out[s] = _card_value(s) * len(cs) * (1.5 if need == 1 else 1.0)
    return out


def _team_misses(game, k: Knowledge) -> Dict[SetKey, Tuple[CardKey, Set[str]]]:
    """Per set: the card a teammate most recently asked for and didn't get, and the opponents
    already asked for it since (they don't have it)."""
    my_team = k.team[k.me]
    out: Dict[SetKey, Tuple[CardKey, Set[str]]] = {}
    for ev in getattr(game, "public_log", []):
        s = (ev["suit"], ev["set_type"])
        if s in k.laid or ev["asker_id"] not in k.team:
            continue
        cards = [(ev["suit"], r) for r in ev["ranks"]]
        if ev["success"]:
            if s in out and out[s][0] in cards:
                out.pop(s)
            continue
        if len(cards) == 1 and k.team[ev["asker_id"]] == my_team:
            if ev["asker_id"] != k.me:
                prev = out.get(s)
                asked = prev[1] if prev and prev[0] == cards[0] else set()
                out[s] = (cards[0], asked | {ev["target_id"]})
            elif s in out and out[s][0] == cards[0]:
                out[s][1].add(ev["target_id"])
    return out


def _stuck(k: Knowledge, pub: Knowledge, mate: str) -> float:
    """How exposed a teammate is: their cards the whole table can place, in sets an opponent
    may hold a card of (the opponents are hinting their way towards taking these)."""
    total = 0.0
    for s in k.live_sets:
        known = [c for c in cards_in(s) if pub.loc[c] == mate]
        if known:
            chance = max((k.in_set(o, s) for o in k.players if k.team[o] != k.team[k.me]), default=0.0)
            total += chance * len(known) * _card_value(s)
    return total


def _at_risk(k: Knowledge, pub: Knowledge, s: SetKey) -> bool:
    """A team set the opponents could break up: one of its cards is public and an opponent
    may hold a card of the set to ask with."""
    if not any(pub.loc[c] for c in cards_in(s)):
        return False
    return any(k.in_set(o, s) > 0.05 for o in k.players if k.team[o] != k.team[k.me] and k.count[o] > 0)


def _hint_ready(game, k: Knowledge) -> Dict[str, float]:
    """Opponents with a fresh hint from a teammate: a teammate of theirs asked for a single
    card in the last few asks and missed. Handing them the turn lets them act on it."""
    my_team = k.team[k.me]
    out: Dict[str, float] = {}
    for age, ev in enumerate(reversed(getattr(game, "public_log", [])[-6:])):
        a = ev["asker_id"]
        if ev["success"] or a not in k.team or k.team[a] == my_team or (ev["suit"], ev["set_type"]) in k.laid:
            continue
        for o in k.players:
            if o != a and k.team[o] == k.team[a] and k.count[o] > 0:
                out[o] = out.get(o, 0.0) + 1.0 / (1 + age)
    return out


def _guess_laydown(k: Knowledge, min_odds: float) -> Optional[Tuple[dict, float]]:
    """A set the team may hold whole: own cards plus the likeliest teammate for each other card,
    when no opponent can hold any of it. Returns (laydown, chance it is right)."""
    my_team = k.team[k.me]
    mates = [p for p in k.players if k.team[p] == my_team and p != k.me and k.count[p] > 0]
    best = None
    for s in k.live_sets:
        cs = cards_in(s)
        if not any(c in k.my_hand for c in cs) or not mates:
            continue
        holders, odds = {}, 1.0
        for c in cs:
            if c in k.my_hand:
                holders[c] = k.me
                continue
            if any(k.prob(c, p) > 0 for p in k.players if k.team[p] != my_team):
                odds = 0.0
                break
            pick = max(mates, key=lambda p: k.prob(c, p))
            holders[c] = pick
            odds *= k.prob(c, pick)
        if odds >= min_odds and odds < 0.999 and (best is None or odds > best[1]):
            best = (_declare(k, s, holders), odds)
    return best


# ---- decisions --------------------------------------------------------------
def decide(game, bot_id: str, level: str = "medium") -> Optional[dict]:
    """Choose this bot's move: {"action": "ask", ...}, {"action": "laydown", ...} or None."""
    level = "expert" if level == "claude" else level
    P = profile_for(game, bot_id, level)
    k = Knowledge(game, bot_id, P)
    if not k.my_hand:
        return None
    me, my_team = bot_id, k.team[bot_id]

    def ask(s: SetKey, cards: List[CardKey], t: str) -> dict:
        return {"action": "ask", "target_id": t, "suit": s[0], "set_type": s[1],
                "rank": cards[0][1], "ranks": [c[1] for c in cards]}

    # 1. A set held entirely in this hand: bank it. The turn stays here.
    for s in k.live_sets:
        if all(c in k.my_hand for c in cards_in(s)):
            return _declare(k, s, {c: me for c in cards_in(s)})

    options = _ask_options(k)
    scored = [(k.prob(c, t), s, c, t) for s, c, t in options]
    supported = {s for s in k.live_sets if any(k.team[x] == my_team for x in k.interest.get(s, ()))}

    # 2. Take every card it believes it can place: each one keeps the turn. A collector who
    #    is hunting one of its cards comes first, then sets that can be closed out.
    certain = [o for o in scored if o[0] >= 0.999]
    if certain:
        def worth(o):
            _, s, c, t = o
            left = sum(1 for x in cards_in(s) if not (k.loc[x] and k.team[k.loc[x]] == my_team))
            sure = sum(1 for x in cards_in(s) if k.loc[x] and k.team[k.loc[x]] != my_team)
            return (1 if t in k.hunters.get(s, ()) else 0, 1 if left == sure else 0,
                    1 if s in supported else 0, k.team_holds(s, my_team), _card_value(s), random.random())
        _, s, c, t = max(certain, key=worth)
        # Several cards of the set sitting with the same player are asked for together.
        together = [c] + [c2 for _, s2, c2, t2 in certain if s2 == s and t2 == t and c2 != c]
        return ask(s, together, t)

    # Sets the team holds completely, as far as it knows. Opponents cannot touch these.
    shared = []
    if P["sure_lay"]:
        for s in k.live_sets:
            cs = cards_in(s)
            if any(c in k.my_hand for c in cs) and all(k.loc[c] and k.team[k.loc[c]] == my_team for c in cs):
                shared.append(s)
    if shared and not P["handoff"]:
        s = shared[0]
        return _declare(k, s, {c: k.loc[c] for c in cards_in(s)})

    # 3. Nothing certain is left: choose what to try for.
    pub = Knowledge(game, me, P, public=True) if (P["threat"] or P["handoff"] or P.get("shield") or P.get("bluff")) else None

    def revealed(s: SetKey) -> bool:                         # does the table already know I hold this set?
        return (me, s) in pub.must_hold or any(pub.loc[c] == me for c in cards_in(s))

    quiet = set()
    if P.get("bluff"):
        for s in k.live_sets:
            mates_in = any(k.team[x] == my_team and x != me for x in k.interest.get(s, ()))
            u = zlib.crc32(f"{k.seed}|bluff|{s}".encode()) / 4294967296.0
            if mates_in and not revealed(s) and u < P["bluff"]:
                quiet.add(s)

    danger = _danger(k) if P.get("guard") else {}
    misses = _team_misses(game, k) if P.get("golden") else {}
    hinted = _hint_ready(game, k) if P.get("deny") else {}

    def gamble(o) -> float:
        p, s, c, t = o
        progress = k.team_holds(s, my_team) / len(RANKS[s[1]])
        pull = 1.0 + P["progress"] * progress
        if s in supported:
            pull += P["support"]                             # keep building the team's set
        if t in k.hunters.get(s, ()):
            pull += P["fear"]                                # strike the collector before they reach me
        if s in misses:                                      # golden rule
            wanted, asked = misses[s]
            if wanted in k.my_hand:
                pull += P["golden"] if c != wanted else 0.0  # I hold it: ask another card (a hint)
            elif c == wanted and t not in asked:
                pull += P.get("chase", P["golden"])          # chase the same card from someone new
        risk = P["turn"] + (P["threat"] * _threat(k, pub, t) if P["threat"] else 0.0)
        if danger:                                           # a miss hands the turn to t
            risk += P["guard"] * sum(v * k.in_set(t, ds) for ds, v in danger.items()) / 10.0
        risk += P.get("deny", 0.0) * hinted.get(t, 0.0)      # don't feed the opponents' hint chain
        cost = 0.0
        if P.get("shield"):                                  # what this ask tells the table about my hand
            cost += P["shield"] * ((0 if revealed(s) else 1.0) + (0 if me in pub.not_have[c] else 0.4))
        if s in quiet:
            cost += 50.0                                     # bluffing: act as if I hold none of it
        return p * _card_value(s) * pull - (1.0 - p) * risk - cost + random.random() * 0.01

    live = [o for o in scored if o[0] > 0]
    best = max(live, key=gamble) if live else None
    if P.get("pass_turn") and (best is None or gamble(best) < 0):
        # Every real ask is bad: maybe hand the turn on deliberately, to the opponent who can do
        # least with it, rather than to whoever a long-shot ask lands on.
        blanks = [o for o in scored if o[0] <= 0]
        blank = max(blanks, key=gamble) if blanks else None
        if blank and (best is None or gamble(blank) > gamble(best) + P["pass_turn"]):
            best = blank

    if shared:                                               # expert: lay down to hand the turn on?
        def route(s: SetKey) -> float:
            helpers = sorted({k.loc[c] for c in cards_in(s)} - {me})
            alive = [h for h in helpers if k.count[h] > sum(1 for c in cards_in(s) if k.loc[c] == h)]
            return max((_opportunity(k, pub, h) + (0.5 * _stuck(k, pub, h) if P.get("save") else 0.0) for h in alive), default=0.0)
        s = max(shared, key=lambda x: (_at_risk(k, pub, x) if P.get("save") else 0, route(x), random.random()))
        keep = 0.0 if (not P.get("save") or _at_risk(k, pub, s)) else P["save"]
        if best is None or gamble(best) < 0 or route(s) >= gamble(best) + keep:
            return _declare(k, s, {c: k.loc[c] for c in cards_in(s)})

    if P.get("lay_odds") and (best is None or gamble(best) < 0):
        # No good ask: lay down a team set on a good guess, passing the turn to a teammate.
        g = _guess_laydown(k, P["lay_odds"])
        if g:
            return g[0]

    if best is None:
        # Every card it could ask for is, as far as it knows, out of the opponents' hands, so
        # its own team holds the rest. Asking would only give the turn away: declare a guess.
        return _forced_laydown(k) or (ask(options[0][0], [options[0][1]], options[0][2]) if options else None)

    if random.random() < P["noise"] and best[0] > 0:
        # A whim: any plausible ask, still inside the sets the team cares about when there are some.
        focus = [o for o in live if (o[1] in supported or o[3] in k.hunters.get(o[1], ())) and o[1] not in quiet]
        best = random.choice(focus or live)
    _, s, c, t = best
    return ask(s, [c], t)


def choose_handoff(game, bot_id: str, options: List[str]) -> Optional[str]:
    """After a laydown where two teammates helped, give the turn to the one holding more cards
    (an expert: to the one with the most to gain from it)."""
    live = [pid for pid in options if game.state.players.get(pid) and game.state.players[pid].hand]
    if not live:
        return None
    level = getattr(game, "bot_levels", {}).get(bot_id, "medium")
    level = "expert" if level == "claude" else level
    P = profile_for(game, bot_id, level)
    if P["handoff"] and game.state.players[bot_id].hand:
        k = Knowledge(game, bot_id, P)
        pub = Knowledge(game, bot_id, P, public=True)
        stuck = (lambda pid: 0.5 * _stuck(k, pub, pid)) if P.get("save") else (lambda pid: 0.0)
        return max(live, key=lambda pid: (_opportunity(k, pub, pid) + stuck(pid), len(game.state.players[pid].hand), random.random()))
    return max(live, key=lambda pid: (len(game.state.players[pid].hand), random.random()))
