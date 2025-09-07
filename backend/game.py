from __future__ import annotations
import random
from typing import Dict, List, Tuple, Optional
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
        # The rule: cannot ask a card you already hold
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

        # Keep turn with asker until confirmation happens; UI will show pending to target
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
            # add to asker (avoid duplicates just in case)
            exist = {(c.suit, c.rank) for c in asker.hand}
            for c in to_pass:
                if (c.suit, c.rank) not in exist:
                    asker.hand.append(c)

            # success keeps the turn with asker
            self.state.turn_player = asker_id
            return {"success": True, "transferred": [c.model_dump() for c in to_pass], "next_turn": asker_id}

        # If nothing passed (card somehow disappeared), pass turn to target per rule
        self.state.turn_player = target_id
        return {"success": False, "transferred": [], "next_turn": target_id}

    # --- Laydown (unchanged) ---
    def laydown(self, who_id: str, suit: str, set_type: str, collaborators: Dict[str, List[str]] | None = None):
        if self.state.turn_player != who_id:
            raise ValueError("Not your turn")
        needed = {c.rank for c in self.all_cards_of_set(suit, set_type)}

        def remove_from(pid: str, ranks_set: set[str]):
            p = self.state.players[pid]
            keep, give = [], []
            for c in p.hand:
                if c.suit==suit and c.rank in ranks_set:
                    give.append(c)
                else:
                    keep.append(c)
            p.hand = keep
            return give

        my = self.state.players[who_id]
        declared = set([c.rank for c in my.hand if c.suit==suit and c.rank in needed])
        if collaborators:
            for pid, ranks in collaborators.items():
                if self.state.players[pid].team != my.team:
                    raise ValueError("Collaborators must be teammates")
                for r in ranks:
                    declared.add(r)
        if declared != needed:
            loser_team = my.team
            winner_team = "A" if loser_team == "B" else "B"
            self.state.team_scores[winner_team] += POINTS[set_type]
            # move turn CCW from the one who failed (seat - 1 mod 6)
            seat = self.state.players[who_id].seat or 0
            self.state.turn_player = self.state.seats[(seat - 1) % 6]
            return {"ok": False, "awarded_to": winner_team, "scores": self.state.team_scores}

        all_cards: List[Card] = []
        mine_set = {c.rank for c in self.state.players[who_id].hand if c.suit==suit and c.rank in needed}
        all_cards.extend(remove_from(who_id, mine_set))
        if collaborators:
            for pid, ranks in collaborators.items():
                all_cards.extend(remove_from(pid, set(ranks)))
        owner_team = my.team
        self.state.table_sets.append(TableSet(suit=suit, set_type=set_type, cards=all_cards, owner_team=owner_team))
        self.state.team_scores[owner_team] += POINTS[set_type]
        # same player keeps turn
        self.state.turn_player = who_id
        return {"ok": True, "owner": owner_team, "scores": self.state.team_scores}
