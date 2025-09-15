from __future__ import annotations
import random
from typing import Dict, List, Tuple, Optional
from loguru import logger
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
            current_dealer=None,
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

    def deal_all(self, start_from_seat: int = 0):
        """Deal cards starting from the specified seat (clockwise)"""
        # Create dealing order starting from the specified seat
        order = [(start_from_seat + i) % 6 for i in range(6)]
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
        # First, remove player from their current seat if they have one
        self.remove_from_seat(player_id)
        
        preferred = [0, 2, 4] if team == "A" else [1, 3, 5]
        for s in preferred:
            if self.state.seats[s] is None:
                self.state.seats[s] = player_id
                p = self.state.players[player_id]
                p.team = team
                p.seat = s
                return s
        
        # If no preferred seats available, try any available seat
        for s in range(6):
            if self.state.seats[s] is None:
                self.state.seats[s] = player_id
                p = self.state.players[player_id]
                p.team = team
                p.seat = s
                logger.info(f"Assigned player {player_id} to non-preferred seat {s} for team {team}")
                return s
        
        return None

    def remove_from_seat(self, player_id: str) -> bool:
        """
        Remove a player from their current seat.
        Only works in lobby phase to prevent disrupting active games.
        Returns True if player was removed from seat, False otherwise.
        """
        if self.state.phase != "lobby":
            logger.warning(f"Cannot remove player {player_id} from seat during {self.state.phase} phase")
            return False
            
        if player_id not in self.state.players:
            logger.warning(f"Player {player_id} not found in room {self.state.room_id}")
            return False
            
        player = self.state.players[player_id]
        if player.seat is not None:
            seat_number = player.seat
            # Clear the seat
            self.state.seats[seat_number] = None
            # Clear player's seat and team
            player.seat = None
            player.team = None
            logger.info(f"Removed player {player_id} from seat {seat_number} in room {self.state.room_id}")
            return True
        return False

    def cleanup_disconnected_seats(self) -> int:
        """
        Clean up seats for all disconnected players in lobby phase.
        Returns the number of seats cleaned up.
        """
        if self.state.phase != "lobby":
            logger.warning(f"Cannot cleanup disconnected seats during {self.state.phase} phase")
            return 0
            
        cleaned_count = 0
        for player_id, player in self.state.players.items():
            if not player.connected and player.seat is not None:
                seat_number = player.seat
                # Clear the seat
                self.state.seats[seat_number] = None
                # Clear player's seat and team
                player.seat = None
                player.team = None
                logger.info(f"Cleaned up seat {seat_number} for disconnected player {player_id}")
                cleaned_count += 1
                
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} seats for disconnected players in room {self.state.room_id}")
            
        return cleaned_count

    def remove_disconnected_players(self) -> int:
        """
        Remove disconnected players from the room entirely (lobby phase only).
        Returns the number of players removed.
        """
        if self.state.phase != "lobby":
            logger.warning(f"Cannot remove disconnected players during {self.state.phase} phase")
            return 0
            
        removed_count = 0
        disconnected_players = []
        
        for player_id, player in self.state.players.items():
            if not player.connected:
                disconnected_players.append(player_id)
                
        for player_id in disconnected_players:
            # Remove from players dict
            del self.state.players[player_id]
            # Remove from any seat they might have
            for seat_num, seat_player_id in self.state.seats.items():
                if seat_player_id == player_id:
                    self.state.seats[seat_num] = None
            logger.info(f"Removed disconnected player {player_id} from room {self.state.room_id}")
            removed_count += 1
                
        if removed_count > 0:
            logger.info(f"Removed {removed_count} disconnected players from room {self.state.room_id}")
            
        return removed_count

    def start(self):
        self.state.phase = "ready"
        # Start with seat 0 as the first dealer (displays as "Seat 1")
        dealer = self.state.seats.get(0)
        self.state.current_dealer = dealer
        
        # No turn player set yet - will be set after shuffle & deal
        self.state.turn_player = None
        
        # Lock the lobby to prevent new players from joining
        self.state.lobby_locked = True
        
        logger.info(f"Game started in room {self.state.room_id}, dealer: {dealer}, lobby locked")

    def request_back_to_lobby(self, requester_id: str) -> dict:
        """
        Request to return to lobby from game. Requires majority vote.
        Returns voting status and result.
        """
        if self.state.phase not in ["playing", "ready"]:
            return {"success": False, "reason": "not_in_game", "message": "Can only request back to lobby during active game"}
        
        if requester_id not in self.state.players:
            return {"success": False, "reason": "unknown_player", "message": "Unknown player"}
        
        # Initialize voting if not already started
        if not self.state.back_to_lobby_votes:
            self.state.back_to_lobby_votes = {}
            logger.info(f"Back to lobby voting started by {requester_id} in room {self.state.room_id}")
        
        # Add/update vote
        self.state.back_to_lobby_votes[requester_id] = True
        
        # Count votes
        total_players = len(self.state.players)
        yes_votes = sum(1 for vote in self.state.back_to_lobby_votes.values() if vote)
        
        # Check if majority reached (4/6 players)
        required_votes = 4
        if yes_votes >= required_votes:
            # Return to lobby
            self.state.phase = "lobby"
            self.state.lobby_locked = False
            self.state.back_to_lobby_votes = {}
            self.state.abort_votes = {}
            
            # Reset game state
            self.state.turn_player = None
            self.state.ask_chain_from = None
            self.state.deck_count = 0
            self.state.current_dealer = None
            self.state.table_sets = []
            
            # Clear all players' hands
            for player in self.state.players.values():
                player.hand = []
            
            logger.info(f"Returned to lobby by majority vote in room {self.state.room_id}")
            return {
                "success": True, 
                "reason": "majority_reached", 
                "message": "Returning to lobby by majority vote",
                "votes": {"yes": yes_votes, "total": total_players, "required": required_votes}
            }
        
        return {
            "success": False, 
            "reason": "voting_in_progress", 
            "message": f"Voting in progress: {yes_votes}/{required_votes} votes",
            "votes": {"yes": yes_votes, "total": total_players, "required": required_votes}
        }

    def vote_back_to_lobby(self, voter_id: str, vote: bool) -> dict:
        """
        Cast a vote for returning to lobby.
        """
        if self.state.phase not in ["playing", "ready"]:
            return {"success": False, "reason": "not_in_game", "message": "Can only vote during active game"}
        
        if voter_id not in self.state.players:
            return {"success": False, "reason": "unknown_player", "message": "Unknown player"}
        
        if not self.state.back_to_lobby_votes:
            return {"success": False, "reason": "no_voting", "message": "No back to lobby voting in progress"}
        
        # Cast vote
        self.state.back_to_lobby_votes[voter_id] = vote
        
        # Count votes
        total_players = len(self.state.players)
        yes_votes = sum(1 for v in self.state.back_to_lobby_votes.values() if v)
        no_votes = sum(1 for v in self.state.back_to_lobby_votes.values() if not v)
        
        # Check if majority reached (4/6 players)
        required_votes = 4
        if yes_votes >= required_votes:
            # Return to lobby
            self.state.phase = "lobby"
            self.state.lobby_locked = False
            self.state.back_to_lobby_votes = {}
            self.state.abort_votes = {}
            
            # Reset game state
            self.state.turn_player = None
            self.state.ask_chain_from = None
            self.state.deck_count = 0
            self.state.current_dealer = None
            self.state.table_sets = []
            
            # Clear all players' hands
            for player in self.state.players.values():
                player.hand = []
            
            logger.info(f"Returned to lobby by majority vote in room {self.state.room_id}")
            return {
                "success": True, 
                "reason": "majority_reached", 
                "message": "Returning to lobby by majority vote",
                "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "required": required_votes}
            }
        
        # Check if voting failed (too many no votes)
        if no_votes > total_players - required_votes:
            self.state.back_to_lobby_votes = {}
            logger.info(f"Back to lobby voting failed in room {self.state.room_id}")
            return {
                "success": False, 
                "reason": "voting_failed", 
                "message": "Back to lobby voting failed",
                "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "required": required_votes}
            }
        
        return {
            "success": False, 
            "reason": "voting_in_progress", 
            "message": f"Voting in progress: {yes_votes}/{required_votes} yes votes",
            "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "required": required_votes}
        }

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
                if isinstance(item, dict) and "player_id" in item:
                    # Frontend sends: {'player_id': '...', 'ranks': [...]}
                    coll_map[item["player_id"]] = list(item.get("ranks", []))
                elif isinstance(item, dict) and "pid" in item:
                    # Legacy format: {'pid': '...', 'ranks': [...]}
                    coll_map[item["pid"]] = list(item.get("ranks", []))
                else:
                    # Fallback: treat as key-value pairs
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
            # Cannot contribute from empty-handed teammates
            if not p.hand:
                raise ValueError(f"Cannot contribute from {p.name} - they have no cards")
            
            # Check if teammate actually has the assigned cards
            teammate_hand_ranks = {c.rank for c in p.hand if c.suit == suit and c.rank in needed_ranks}
            
            for r in ranks:
                if r in needed_ranks:
                    # Only add to declared if teammate actually has this card
                    if r in teammate_hand_ranks:
                        declared.add(r)
                    else:
                        # Teammate doesn't have this card - this will cause the laydown to fail
                        pass

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

            # Check if game has ended
            game_end_result = self.check_game_end()

            return {
                "success": False,
                "who_id": who_id,
                "owner_team": winner_team,
                "suit": suit,
                "set_type": set_type,
                "contributors": contributors,
                "scores": self.state.team_scores,
                "game_end": game_end_result,
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

        handoff_eligible = [
            c["player_id"]
            for c in contributors
            if c["player_id"] != who_id and self.state.players[c["player_id"]].team == owner_team
        ]

        # Check if game has ended
        game_end_result = self.check_game_end()

        return {
            "success": True,
            "who_id": who_id,
            "owner_team": owner_team,
            "suit": suit,
            "set_type": set_type,
            "contributors": contributors,
            "handoff_eligible": handoff_eligible,
            "scores": self.state.team_scores,
            "game_end": game_end_result,
        }

    # ---------------- Pass Cards ----------------
    def pass_cards(self, from_player_id: str, to_player_id: str, cards: List[Card]):
        """Pass cards from one player to another (opponent only)"""
        if from_player_id not in self.state.players or to_player_id not in self.state.players:
            raise ValueError("Unknown player")
        
        from_player = self.state.players[from_player_id]
        to_player = self.state.players[to_player_id]
        
        # Can only pass to opponent team
        if from_player.team == to_player.team:
            raise ValueError("Can only pass cards to opponent team")
        
        # Check if from_player has all the cards
        from_hand = {(c.suit, c.rank) for c in from_player.hand}
        cards_to_pass = {(c.suit, c.rank) for c in cards}
        
        if not cards_to_pass.issubset(from_hand):
            raise ValueError("Player doesn't have all the specified cards")
        
        # Remove cards from from_player's hand
        from_player.hand = [c for c in from_player.hand if (c.suit, c.rank) not in cards_to_pass]
        
        # Add cards to to_player's hand
        to_player.hand.extend(cards)
        
        # Check if game should end after card transfer
        game_end_result = self.check_game_end()
        
        return {
            "success": True,
            "from_player": from_player_id,
            "to_player": to_player_id,
            "cards": [c.model_dump() for c in cards],
            "from_hand_count": len(from_player.hand),
            "to_hand_count": len(to_player.hand),
            "game_end": game_end_result
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

    # ---------------- Game End Logic ----------------
    def check_game_end(self):
        """Check if game should end and return game result if so"""
        # Game ends when all 8 sets are collected OR all players have empty hands
        all_hands_empty = all(not player.hand for player in self.state.players.values())
        sets_collected = len(self.state.table_sets) >= 8
        
        if sets_collected or all_hands_empty:
            self.state.phase = "ended"
            
            # Determine winner based on scores
            team_a_score = self.state.team_scores.get("A", 0)
            team_b_score = self.state.team_scores.get("B", 0)
            
            if team_a_score > team_b_score:
                winner = "A"
            elif team_b_score > team_a_score:
                winner = "B"
            else:
                winner = "tie"
            
            result = {
                "game_ended": True,
                "winner": winner,
                "team_a_score": team_a_score,
                "team_b_score": team_b_score,
                "team_a_sets": len([s for s in self.state.table_sets if s.owner_team == "A"]),
                "team_b_sets": len([s for s in self.state.table_sets if s.owner_team == "B"])
            }
            
            logger.info(f"Game ended in room {self.state.room_id}: Winner={winner}, A={team_a_score}, B={team_b_score}, Sets={len(self.state.table_sets)}")
            return result
        return {"game_ended": False}

    def request_abort(self, requester_id: str):
        """Request to abort the current game - requires 4/6 players to accept"""
        if self.state.phase != "playing":
            return {"success": False, "reason": "not_playing"}
        
        # Clear any previous abort votes
        self.state.abort_votes = {}
        
        # Add the requester's vote
        self.state.abort_votes[requester_id] = True
        
        # Count votes
        total_players = len(self.state.players)
        votes_for_abort = len(self.state.abort_votes)
        
        return {
            "success": True, 
            "requester_id": requester_id,
            "votes_for_abort": votes_for_abort,
            "total_players": total_players,
            "votes_needed": 4,
            "abort_votes": self.state.abort_votes
        }

    def check_voting_timeout(self):
        """Check if voting has timed out and handle it"""
        if not hasattr(self.state, 'abort_votes') or not self.state.abort_votes:
            return None
        
        # For now, we'll implement a simple timeout check
        # In a real implementation, you'd want to track when voting started
        # and check against a timeout duration (e.g., 60 seconds)
        
        # This is a placeholder - in practice you'd want to:
        # 1. Store the voting start time when request_abort is called
        # 2. Check if current time - start time > timeout duration
        # 3. If so, call _handle_voting_failure("timeout")
        
        return None

    def vote_abort(self, voter_id: str, vote: bool):
        """Vote on abort request"""
        if self.state.phase != "playing":
            return {"success": False, "reason": "not_playing"}
        
        if not self.state.abort_votes:
            return {"success": False, "reason": "no_abort_request"}
        
        # Add/update vote
        self.state.abort_votes[voter_id] = vote
        
        # Count votes
        total_players = len(self.state.players)
        votes_for_abort = sum(1 for v in self.state.abort_votes.values() if v)
        votes_against = sum(1 for v in self.state.abort_votes.values() if v is False)
        
        # Check if we have enough votes to abort
        if votes_for_abort >= 4:
            return self._execute_abort()
        
        # Check if voting has failed (enough NO votes to make it impossible to reach 4 YES votes)
        remaining_players = total_players - len(self.state.abort_votes)
        max_possible_yes = votes_for_abort + remaining_players
        if max_possible_yes < 4:
            return self._handle_voting_failure("insufficient_support")
        
        return {
            "success": True,
            "voter_id": voter_id,
            "vote": vote,
            "votes_for_abort": votes_for_abort,
            "total_players": total_players,
            "votes_needed": 4,
            "abort_votes": self.state.abort_votes,
            "abort_executed": False
        }

    def _handle_voting_failure(self, reason: str):
        """Handle voting failure scenarios"""
        # Clear abort votes
        if hasattr(self.state, 'abort_votes'):
            delattr(self.state, 'abort_votes')
        
        if reason == "insufficient_support":
            return {
                "success": False,
                "voting_failed": True,
                "reason": reason,
                "message": "Vote failed - insufficient support to abort the game.",
                "details": ["Not enough players voted YES to abort the game.", "The game will continue."]
            }
        elif reason == "timeout":
            return {
                "success": False,
                "voting_failed": True,
                "reason": reason,
                "message": "Vote timed out - no decision reached.",
                "details": ["The voting period has expired.", "The game will continue."]
            }
        else:
            return {
                "success": False,
                "voting_failed": True,
                "reason": reason,
                "message": "Vote failed.",
                "details": ["The voting process encountered an error.", "The game will continue."]
            }

    def _execute_abort(self):
        """Execute the abort - reset game but stay in room"""
        # Reset game state but keep players and teams
        self.state.phase = "ended"  # Set to ended so shuffle/deal can be used
        self.state.turn_player = None
        self.state.ask_chain_from = None
        self.state.deck_count = 0
        self.state.team_scores = {"A": 0, "B": 0}
        self.state.table_sets = []
        # Keep current_dealer so shuffle/deal button shows for the right player
        
        # Clear abort votes
        if hasattr(self.state, 'abort_votes'):
            delattr(self.state, 'abort_votes')
        
        # Clear all player hands
        for player in self.state.players.values():
            player.hand = []
        
        return {
            "success": True,
            "abort_executed": True,
            "message": "Game aborted. Ready for new game."
        }

    def shuffle_deal_new_game(self, dealer_id: str):
        """Start a new game with shuffle and deal, rotating dealer and turn"""
        if self.state.phase not in ["ended", "lobby", "ready"]:
            return {"success": False, "reason": "game_in_progress"}
        
        # Find current dealer seat (the one who clicked the button)
        current_dealer_seat = None
        if self.state.current_dealer:
            for seat, pid in self.state.seats.items():
                if pid == self.state.current_dealer:
                    current_dealer_seat = seat
                    break
        
        # If no current dealer found, start with seat 0
        if current_dealer_seat is None:
            current_dealer_seat = 0
        
        # Store the original dealer (who clicked) for animation purposes
        original_dealer_id = self.state.current_dealer
        original_dealer_seat = current_dealer_seat
        
        # For the first game (ready phase), use current dealer (seat 0)
        # For subsequent games (ended phase), rotate to next dealer (seat 1, then 2, etc.)
        if self.state.phase == "ready":
            next_dealer_seat = current_dealer_seat  # Should be seat 0 for first game
        else:
            # Next dealer is clockwise (seat + 1, wrapping 0-5)
            next_dealer_seat = (current_dealer_seat + 1) % 6
        
        next_dealer_id = self.state.seats.get(next_dealer_seat)
        
        if not next_dealer_id:
            return {"success": False, "reason": "no_dealer"}
        
        # Turn starts from the next player after dealer (dealer + 1)
        next_turn_seat = (next_dealer_seat + 1) % 6
        next_turn_id = self.state.seats.get(next_turn_seat)
        
        if not next_turn_id:
            return {"success": False, "reason": "no_turn_player"}
        
        # Reset game state
        self.state.phase = "playing"
        self.state.team_scores = {"A": 0, "B": 0}
        self.state.table_sets = []
        self.state.current_dealer = next_dealer_id
        self.state.turn_player = next_turn_id
        
        # Build deck and deal starting from the dealer
        self.build_deck()
        
        # Create dealing sequence for animation
        # Note: Cards are dealt starting from next_dealer_seat, but animation shows from original_dealer_seat
        dealing_sequence = []
        temp_deck = self._deck.copy()  # Copy for animation purposes
        order = [(next_dealer_seat + i) % 6 for i in range(6)]
        
        # Generate dealing sequence (8 rounds, 6 players = 48 cards)
        for round_num in range(8):
            for seat in order:
                if temp_deck:
                    card = temp_deck.pop(0)
                    player_id = self.state.seats.get(seat)
                    if player_id:
                        dealing_sequence.append({
                            "seat": seat,
                            "player_id": player_id,
                            "round": round_num,
                            "card": {"suit": card.suit, "rank": card.rank},
                            "from_seat": original_dealer_seat  # Animation shows cards coming from original dealer
                        })
        
        # Now actually deal the cards
        self.deal_all(start_from_seat=next_dealer_seat)
        
        return {
            "success": True,
            "dealer_id": next_dealer_id,
            "dealer_seat": next_dealer_seat,
            "turn_id": next_turn_id,
            "turn_seat": next_turn_seat,
            "original_dealer_id": original_dealer_id,
            "original_dealer_seat": original_dealer_seat,
            "dealing_sequence": dealing_sequence
        }

    def start_new_round(self, requester_id: str):
        """Start a new round after game over, rotating dealer clockwise"""
        if self.state.phase != "ended":
            return {"success": False, "reason": "game_not_ended"}
        
        # Find current dealer seat
        current_dealer_seat = None
        if self.state.current_dealer:
            for seat, pid in self.state.seats.items():
                if pid == self.state.current_dealer:
                    current_dealer_seat = seat
                    break
        
        # If no current dealer found, start with seat 0
        if current_dealer_seat is None:
            current_dealer_seat = 0
        
        # Next dealer is clockwise (seat + 1, wrapping 0-5)
        next_dealer_seat = (current_dealer_seat + 1) % 6
        next_dealer_id = self.state.seats.get(next_dealer_seat)
        
        if not next_dealer_id:
            return {"success": False, "reason": "no_dealer"}
        
        # Turn starts from the next player after dealer (dealer + 1)
        next_turn_seat = (next_dealer_seat + 1) % 6
        next_turn_id = self.state.seats.get(next_turn_seat)
        
        if not next_turn_id:
            return {"success": False, "reason": "no_turn_player"}
        
        # Reset game state for new round
        self.state.phase = "ready"  # Ready for shuffle & deal
        self.state.team_scores = {"A": 0, "B": 0}
        self.state.table_sets = []
        self.state.current_dealer = next_dealer_id
        self.state.turn_player = None  # Will be set after shuffle & deal
        self.state.ask_chain_from = None
        self.state.deck_count = 0
        
        return {
            "success": True,
            "dealer_id": next_dealer_id,
            "turn_player_id": next_turn_id,
            "message": f"New round started! Dealer: {self.state.players[next_dealer_id].name}"
        }