from __future__ import annotations
import random
from typing import Dict, List, Tuple, Optional
from models import Card, RoomState, Player, TableSet, Suit

RANKS_LOWER = ["2", "3", "4", "5", "6", "7"]
RANKS_UPPER = ["8", "9", "10", "J", "Q", "K", "A"]
SUITS: List[Suit] = ["hearts", "diamonds", "clubs", "spades"]

POINTS = {"lower": 20, "upper": 30}


def card_tuple(c: Card) -> Tuple[str, str]:
    return (c.suit, c.rank)


class Game:
    def __init__(self, room_id: str):
        self.state = RoomState(
            room_id=room_id,
            players={},
            seats={i: None for i in range(6)},
            team_scores={"A": 0, "B": 0},
            table_sets=[],
            phase="lobby",
        )
        self._deck: List[Card] = []

    # ---------------- Deck ----------------
    def build_deck(self):
        self._deck = []
        for s in SUITS:
            for r in RANKS_LOWER + RANKS_UPPER:
                self._deck.append(Card(suit=s, rank=r))
        random.shuffle(self._deck)
        self.state.deck_count = len(self._deck)

    def deal_all(self):
        order = [i for i in range(6)]
        hands_by_pid = {pid: [] for pid in self.state.players}
        while self._deck:
            for seat in order:
                if not self._deck:
                    break
                pid = self.state.seats.get(seat)
                if pid:
                    hands_by_pid[pid].append(self._deck.pop())
        for pid, cards in hands_by_pid.items():
            self.state.players[pid].hand = cards
        self.state.deck_count = 0

    # ---------------- Seating & Teams ----------------
    def assign_seat(self, player_id: str, team: str) -> Optional[int]:
        preferred = [0, 2, 4] if team == "A" else [1, 3, 5]
        for s in preferred:
            if self.state.seats[s] is None:
                self.state.seats[s] = player_id
                p = self.state.players[player_id]
                p.team = team
                p.seat = s
                return s
        return None

    def start(self):
        self.state.phase = "playing"
        first = self.state.seats.get(0)
        self.state.turn_player = first

    # ---------------- Helpers ----------------
    @staticmethod
    def card_set_type(card: Card) -> str:
        return "lower" if card.rank in RANKS_LOWER else "upper"

    @staticmethod
    def ranks_for(set_type: str) -> List[str]:
        return RANKS_LOWER if set_type == "lower" else RANKS_UPPER

    @staticmethod
    def all_cards_of_set(suit: str, set_type: str) -> List[Card]:
        ranks = Game.ranks_for(set_type)
        return [Card(suit=suit, rank=r) for r in ranks]

    def has_at_least_one_in_set(self, player: Player, suit: str, set_type: str) -> bool:
        ranks = self.ranks_for(set_type)
        return any(c.suit == suit and c.rank in ranks for c in player.hand)

    def _has_cards(self, pid: Optional[str]) -> bool:
        if not pid:
            return False
        p = self.state.players.get(pid)
        return bool(p and p.hand)

    def _ccw_from(self, seat_idx: int) -> Optional[str]:
        return self.state.seats.get((seat_idx - 1) % 6)

    def _table_has_set(self, suit: str, set_type: str) -> bool:
        return any(ts.suit == suit and ts.set_type == set_type for ts in self.state.table_sets)

    def _next_ccw_matching(self, start_seat: int, predicate) -> Optional[str]:
        """
        Walk CCW starting after start_seat, return first player_id that matches predicate.
        """
        for step in range(1, 7):
            pid = self.state.seats.get((start_seat - step) % 6)
            if pid and predicate(pid):
                return pid
        return None

    # ---------------- ASK (prepare -> confirm) ----------------
    def prepare_ask(self, asker_id: str, target_id: str, suit: str, set_type: str, ranks: List[str]):
        if self.state.turn_player != asker_id:
            raise ValueError("Not your turn")

        asker = self.state.players.get(asker_id)
        target = self.state.players.get(target_id)
        if not asker or not target:
            raise ValueError("Unknown player")
        if asker.team == target.team:
            raise ValueError("Must ask an opponent")

        # NEW: cannot ask an empty-handed player
        if not target.hand:
            return {
                "success": False,
                "reason": "target_empty",
                "asker_id": asker_id,
                "target_id": target_id,
                "suit": suit,
                "set_type": set_type,
                "ranks": list(ranks or []),
                "needs_no_confirm": False,
            }

        if not self.has_at_least_one_in_set(asker, suit, set_type):
            raise ValueError("You must hold at least one card from that set")

        wanted = set(ranks or [])
        owned = {(c.suit, c.rank) for c in asker.hand}
        wanted = {r for r in wanted if (suit, r) not in owned}

        pending_cards: List[Card] = []
        for c in target.hand:
            if c.suit == suit and c.rank in wanted:
                pending_cards.append(c)

        if not pending_cards:
            # explicit NO confirmation flow (UI shows target confirm NO)
            return {
                "success": False,
                "pending_cards": [],
                "asker_id": asker_id,
                "target_id": target_id,
                "suit": suit,
                "set_type": set_type,
                "ranks": list(wanted),
                "needs_no_confirm": True,
            }

        return {
            "success": True,
            "pending_cards": [c.model_dump() for c in pending_cards],
            "asker_id": asker_id,
            "target_id": target_id,
            "suit": suit,
            "set_type": set_type,
            "ranks": list(wanted),
            "needs_no_confirm": False,
        }

    def confirm_pass(self, asker_id: str, target_id: str, cards: List[Card]):
        target = self.state.players[target_id]
        asker = self.state.players[asker_id]

        if not cards:
            # explicit NO; pass turn to target UNLESS target is empty,
            # in which case skip to next CCW teammate with cards
            if target.hand:
                self.state.turn_player = target_id
                return {"success": False, "reason": "no_card", "next_turn": target_id}
            # skip empty-handed
            start_seat = target.seat or 0
            next_pid = self._next_ccw_matching(
                start_seat, lambda pid: self.state.players[pid].team == target.team and self._has_cards(pid)
            ) or self._next_ccw_matching(start_seat, lambda pid: self._has_cards(pid))
            self.state.turn_player = next_pid
            return {"success": False, "reason": "no_card", "next_turn": next_pid}

        to_pass: List[Card] = []
        for card in cards:
            found = None
            for c in target.hand:
                if c.suit == card.suit and c.rank == card.rank:
                    found = c
                    break
            if found:
                to_pass.append(found)

        if to_pass:
            tset = {(c.suit, c.rank) for c in to_pass}
            target.hand = [c for c in target.hand if (c.suit, c.rank) not in tset]
            aexist = {(c.suit, c.rank) for c in asker.hand}
            for c in to_pass:
                if (c.suit, c.rank) not in aexist:
                    asker.hand.append(c)

            self.state.turn_player = asker_id
            return {
                "success": True,
                "transferred": [c.model_dump() for c in to_pass],
                "next_turn": asker_id,
            }

        # nothing passed -> same logic as NO
        if target.hand:
            self.state.turn_player = target_id
            return {"success": False, "reason": "no_card", "next_turn": target_id}

        start_seat = target.seat or 0
        next_pid = self._next_ccw_matching(
            start_seat, lambda pid: self.state.players[pid].team == target.team and self._has_cards(pid)
        ) or self._next_ccw_matching(start_seat, lambda pid: self._has_cards(pid))
        self.state.turn_player = next_pid
        return {"success": False, "reason": "no_card", "next_turn": next_pid}

    # ---------------- Laydown ----------------
    def laydown(
        self,
        who_id: str,
        suit: str,
        set_type: str,
        collaborators: Dict[str, List[str]] | List[Dict[str, List[str]]] | None = None,
    ):
        if self.state.turn_player != who_id:
            raise ValueError("Not your turn")

        my = self.state.players[who_id]
        needed_ranks = set(self.ranks_for(set_type))

        # normalize collaborators
        coll_map: Dict[str, List[str]] = {}
        if isinstance(collaborators, dict):
            coll_map = {k: list(v) for k, v in collaborators.items()}
        elif isinstance(collaborators, list):
            for item in collaborators:
                if not item:
                    continue
                if isinstance(item, dict) and "pid" in item:
                    coll_map[item["pid"]] = list(item.get("ranks", []))
                else:
                    for k, v in item.items():
                        if isinstance(v, list):
                            coll_map[k] = list(v)

        declared = {c.rank for c in my.hand if c.suit == suit and c.rank in needed_ranks}
        contributors: List[Dict] = []

        for pid, ranks in coll_map.items():
            if pid not in self.state.players:
                continue
            p = self.state.players[pid]
            if p.team != my.team:
                raise ValueError("Collaborators must be teammates")
            for r in ranks:
                if r in needed_ranks:
                    declared.add(r)

        # --- Failure: opponent wins, capture full set to table; choose next turn smartly
        if declared != needed_ranks:
            loser_team = my.team
            winner_team = "A" if loser_team == "B" else "B"

            def pull_from(pid: str) -> List[Card]:
                p = self.state.players[pid]
                keep, take = [], []
                for c in p.hand:
                    if c.suit == suit and c.rank in needed_ranks:
                        take.append(c)
                    else:
                        keep.append(c)
                p.hand = keep
                return take

            collected: List[Card] = []
            for pid in list(self.state.players.keys()):
                got = pull_from(pid)
                if got:
                    contributors.append({"player_id": pid, "cards": [g.model_dump() for g in got]})
                    collected.extend(got)

            if not self._table_has_set(suit, set_type):
                self.state.table_sets.append(
                    TableSet(suit=suit, set_type=set_type, cards=collected, owner_team=winner_team)
                )

            self.state.team_scores[winner_team] += POINTS[set_type]

            # NEW: turn goes CCW to the NEXT player who (a) has cards and (b) is on the WINNER team.
            # If none found on winner team, fall back to first CCW player with cards (any team).
            start_seat = my.seat or 0
            next_pid = self._next_ccw_matching(
                start_seat, lambda pid: self.state.players[pid].team == winner_team and self._has_cards(pid)
            ) or self._next_ccw_matching(start_seat, lambda pid: self._has_cards(pid))
            self.state.turn_player = next_pid

            return {
                "success": False,
                "who_id": who_id,
                "owner_team": winner_team,
                "suit": suit,
                "set_type": set_type,
                "contributors": contributors,
                "scores": self.state.team_scores,
            }

        # --- Success: remove only declarers' cards and score for my team
        def remove_from(pid: str, ranks_set: set[str]) -> List[Card]:
            p = self.state.players[pid]
            keep, give = [], []
            for c in p.hand:
                if c.suit == suit and c.rank in ranks_set:
                    give.append(c)
                else:
                    keep.append(c)
            p.hand = keep
            return give

        all_cards: List[Card] = []
        mine_set = {c.rank for c in self.state.players[who_id].hand if c.suit == suit and c.rank in needed_ranks}
        got_mine = remove_from(who_id, mine_set)
        if got_mine:
            contributors.append({"player_id": who_id, "cards": [c.model_dump() for c in got_mine]})
            all_cards.extend(got_mine)
        for pid, ranks in coll_map.items():
            rs = set(r for r in ranks if r in needed_ranks)
            if not rs:
                continue
            got = remove_from(pid, rs)
            if got:
                contributors.append({"player_id": pid, "cards": [c.model_dump() for c in got]})
                all_cards.extend(got)

        owner_team = my.team
        if not self._table_has_set(suit, set_type):
            self.state.table_sets.append(
                TableSet(suit=suit, set_type=set_type, cards=all_cards, owner_team=owner_team)
            )
        self.state.team_scores[owner_team] += POINTS[set_type]
        self.state.turn_player = who_id

        handoff_eligible = [
            c["player_id"]
            for c in contributors
            if c["player_id"] != who_id and self.state.players[c["player_id"]].team == owner_team
        ]

        return {
            "success": True,
            "who_id": who_id,
            "owner_team": owner_team,
            "suit": suit,
            "set_type": set_type,
            "contributors": contributors,
            "handoff_eligible": handoff_eligible,
            "scores": self.state.team_scores,
        }

    # ---------------- Handoff after successful laydown ----------------
    def handoff_after_laydown(self, who_id: str, to_id: str):
        if who_id not in self.state.players or to_id not in self.state.players:
            return {"ok": False, "reason": "unknown_player", "turn_player": self.state.turn_player}

        a = self.state.players[who_id]
        b = self.state.players[to_id]
        if a.team != b.team or who_id == to_id:
            return {"ok": False, "reason": "not_teammate", "turn_player": self.state.turn_player}

        # NEW: cannot hand off to an empty-handed teammate
        if not b.hand:
            return {"ok": False, "reason": "empty_hand", "turn_player": self.state.turn_player}

        self.state.turn_player = to_id
        return {"ok": True, "turn_player": to_id}
