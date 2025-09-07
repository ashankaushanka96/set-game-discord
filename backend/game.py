from __future__ import annotations
import random
from typing import Dict, List, Tuple, Optional, Iterable, Any
from models import Card, RoomState, Player, TableSet, Suit

RANKS_LOWER = ["2","3","4","5","6","7"]
RANKS_UPPER = ["8","9","10","J","Q","K","A"]
SUITS: List[Suit] = ["hearts","diamonds","clubs","spades"]

POINTS = {"lower": 20, "upper": 30}

class Game:
    def __init__(self, room_id: str):
        self.state = RoomState(
            room_id=room_id,
            players={},
            seats={i: None for i in range(6)},
            team_scores={"A":0, "B":0},
            table_sets=[],
            phase="lobby",
        )
        self._deck: List[Card] = []

    # --- Deck ---
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

    # --- Seating & Teams ---
    def assign_seat(self, player_id: str, team: str) -> Optional[int]:
        preferred = [0,2,4] if team == "A" else [1,3,5]
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

    # --- Helpers ---
    @staticmethod
    def card_set_type(card: Card) -> str:
        return "lower" if card.rank in RANKS_LOWER else "upper"

    @staticmethod
    def all_cards_of_set(suit: str, set_type: str) -> List[Card]:
        ranks = RANKS_LOWER if set_type=="lower" else RANKS_UPPER
        return [Card(suit=suit, rank=r) for r in ranks]

    def has_at_least_one_in_set(self, player: Player, suit: str, set_type: str) -> bool:
        ranks = RANKS_LOWER if set_type=="lower" else RANKS_UPPER
        return any(c.suit==suit and c.rank in ranks for c in player.hand)

    # --- Ask (two-stage: prepare -> confirm pass) ---
    def prepare_ask(self, asker_id: str, target_id: str, suit: str, set_type: str, ranks: List[str]):
        """Validate the ask and compute which cards the target must pass if they have them.
        Returns dict with: success(False if none), pending_cards(list), next_turn."""
        if self.state.turn_player != asker_id:
            raise ValueError("Not your turn")
        asker = self.state.players[asker_id]
        target = self.state.players[target_id]
        if not asker or not target:
            raise ValueError("Unknown player")
        if asker.team == target.team:
            raise ValueError("Must ask an opponent")
        if not self.has_at_least_one_in_set(asker, suit, set_type):
            raise ValueError("You must hold at least one card from that set")

        wanted = set(ranks)
        # cannot ask a card you already hold
        owned = {(c.suit, c.rank) for c in asker.hand}
        wanted = {r for r in wanted if (suit, r) not in owned}

        pending_cards: List[Card] = []
        for c in target.hand:
            if c.suit==suit and c.rank in wanted:
                pending_cards.append(c)

        if not pending_cards:
            # turn passes to target if not found
            self.state.turn_player = target_id
            return {
                "success": False,
                "pending_cards": [],
                "next_turn": self.state.turn_player,
            }

        # Keep turn with asker until confirmation happens
        return {
            "success": True,
            "pending_cards": [c.model_dump() for c in pending_cards],
            "next_turn": asker_id,
        }

    def confirm_pass(self, asker_id: str, target_id: str, cards: List[Card]):
        """Target confirms passing these cards to asker. Verify and transfer."""
        target = self.state.players[target_id]
        asker = self.state.players[asker_id]
        to_pass: List[Card] = []

        # Verify target still owns each card
        for card in cards:
            found = None
            for c in target.hand:
                if c.suit==card.suit and c.rank==card.rank:
                    found = c
                    break
            if found:
                to_pass.append(found)

        # Transfer cards
        if to_pass:
            # remove from target
            remain = [c for c in target.hand if all(not (c.suit==x.suit and c.rank==x.rank) for x in to_pass)]
            target.hand = remain
            # add to asker
            exist = {(c.suit, c.rank) for c in asker.hand}
            for c in to_pass:
                if (c.suit, c.rank) not in exist:
                    asker.hand.append(c)

            # success keeps the turn with asker
            self.state.turn_player = asker_id
            return {"success": True, "transferred": [c.model_dump() for c in to_pass], "next_turn": asker_id}

        # If nothing passed, pass turn to target
        self.state.turn_player = target_id
        return {"success": False, "transferred": [], "next_turn": target_id}

    # --- Laydown (accepts list OR dict collaborators) ---
    def laydown(self, who_id: str, suit: str, set_type: str, collaborators: Any = None):
        """
        Accepts collaborators as:
          - dict: { "<player_id>": ["2","3",... ranks], ... }
          - list: [{ "player_id": "<id>", "cards":[{"suit", "rank"}] } ...]
                  or [{ "player_id": "<id>", "ranks":[...]} ...]
          - None
        Returns (for frontend):
          {
            "success": bool,
            "owner_team": "A"|"B",
            "suit": suit, "set_type": set_type,
            "contributors": [{ "player_id":..., "cards":[{suit,rank}, ...] }],
            "next_turn": player_id
          }
        """
        if self.state.turn_player != who_id:
            raise ValueError("Not your turn")

        need_ranks = RANKS_LOWER if set_type == "lower" else RANKS_UPPER
        need_set = set(need_ranks)

        def normalize_collabs(collabs) -> List[dict]:
            if not collabs:
                return []
            from collections.abc import Iterable as _Iterable
            out: List[dict] = []
            if isinstance(collabs, dict):
                for pid, ranks in collabs.items():
                    ranks_list = list(ranks) if isinstance(ranks, _Iterable) else []
                    out.append({"player_id": pid, "cards": [{"suit": suit, "rank": r} for r in ranks_list]})
                return out
            # list
            for item in collabs:
                pid = item.get("player_id")
                if not pid:
                    continue
                if "cards" in item and isinstance(item["cards"], list):
                    cs = [{"suit": c["suit"], "rank": c["rank"]} for c in item["cards"] if c.get("rank") in need_set and (c.get("suit") == suit)]
                elif "ranks" in item and isinstance(item["ranks"], list):
                    cs = [{"suit": suit, "rank": r} for r in item["ranks"] if r in need_set]
                else:
                    cs = []
                out.append({"player_id": pid, "cards": cs})
            return out

        who = self.state.players.get(who_id)
        if not who:
            return {"success": False, "owner_team": None, "suit": suit, "set_type": set_type, "contributors": [], "next_turn": self.state.turn_player}

        # collect cards that each contributor *actually* has
        contributors: List[dict] = []

        # who player's cards in set
        who_cards = [{"suit": c.suit, "rank": c.rank} for c in who.hand if c.suit == suit and c.rank in need_set]
        contributors.append({"player_id": who_id, "cards": who_cards})

        collab_list = normalize_collabs(collaborators)
        for item in collab_list:
            pid = item["player_id"]
            p = self.state.players.get(pid)
            if not p:
                continue
            if p.team != who.team:
                # only teammates can collaborate
                continue
            want = {(c["suit"], c["rank"]) for c in item["cards"] if c.get("rank") in need_set and c.get("suit") == suit}
            if not want:
                continue
            have = {(c.suit, c.rank) for c in p.hand}
            real = [{"suit": s, "rank": r} for (s, r) in want if (s, r) in have]
            if real:
                contributors.append({"player_id": pid, "cards": real})

        # union of contributed ranks
        contributed = set()
        for con in contributors:
            for c in con["cards"]:
                contributed.add(c["rank"])

        ok = contributed == need_set
        points = POINTS[set_type]

        if ok:
            owner_team = who.team
            # remove cards from each contributor
            def remove_cards(pid: str, cards: List[dict]):
                p = self.state.players.get(pid)
                if not p:
                    return
                rem = {(c["suit"], c["rank"]) for c in cards}
                p.hand = [c for c in p.hand if (c.suit, c.rank) not in rem]

            for con in contributors:
                remove_cards(con["player_id"], con["cards"])

            # add full, ordered set to table
            all_cards = [Card(suit=suit, rank=r) for r in need_ranks]
            self.state.table_sets.append(TableSet(suit=suit, set_type=set_type, cards=all_cards, owner_team=owner_team))

            # score
            self.state.team_scores[owner_team] = self.state.team_scores.get(owner_team, 0) + points

            # same player gets immediate ask chance (per your rule 10)
            self.state.turn_player = who_id

            return {
                "success": True,
                "owner_team": owner_team,
                "suit": suit,
                "set_type": set_type,
                "contributors": contributors,
                "next_turn": self.state.turn_player,
            }

        # failure → award points to opposite team and pass turn CCW (anti-clockwise)
        loser_team = who.team
        winner_team = "A" if loser_team == "B" else "B"
        self.state.team_scores[winner_team] = self.state.team_scores.get(winner_team, 0) + points

        # CCW: seat - 1 mod 6
        seat = who.seat or 0
        self.state.turn_player = self.state.seats[(seat - 1) % 6]

        return {
            "success": False,
            "owner_team": winner_team,
            "suit": suit,
            "set_type": set_type,
            "contributors": contributors,
            "next_turn": self.state.turn_player,
        }
