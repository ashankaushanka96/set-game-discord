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
        # Turn Play: the asks everyone at the table has seen this round. Bots reason from this
        # (and their own hand) only; they never read another player's cards.
        self.public_log: List[dict] = []
        self.bot_levels: Dict[str, str] = {}   # bot id -> "easy" | "medium" | "hard" | "expert"

    def log_all_player_hands(self, context: str = ""):
        """Log all player hands for debugging purposes"""
        if not self.state.players:
            logger.info(f"[HANDS LOG] {context} - No players in room")
            return
            
        logger.info(f"[HANDS LOG] {context} - Room: {self.state.room_id}")
        logger.info(f"[HANDS LOG] {context} - Phase: {self.state.phase}")
        
        for player_id, player in self.state.players.items():
            hand_str = ", ".join([f"{card.rank} of {card.suit}" for card in player.hand]) if player.hand else "No cards"
            logger.info(f"[HANDS LOG] {context} - {player.name} (Seat {player.seat}, Team {player.team}): {len(player.hand)} cards - [{hand_str}]")
        
        logger.info(f"[HANDS LOG] {context} - Deck count: {self.state.deck_count}")
        logger.info(f"[HANDS LOG] {context} - " + "="*50)

    # ---------------- Deck ----------------
    def build_deck(self):
        self._deck = []
        for s in SUITS:
            for r in RANKS_LOWER + RANKS_UPPER:
                self._deck.append(Card(suit=s, rank=r))
        random.shuffle(self._deck)
        self.state.deck_count = len(self._deck)

    def deal_all(self, start_from_seat: int = 0):
        self.state.paused_by = None   # a new deal starts unpaused
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
                    card = self._deck.pop()
                    hands_by_pid[pid].append(card)
        for pid, cards in hands_by_pid.items():
            self.state.players[pid].hand = cards
        self.state.deck_count = 0
        self.public_log = []  # new deal: nothing has been asked yet
        self.deal_seed = random.random()  # fixes what each bot notices and forgets this round

        # Log all player hands after dealing
        self.log_all_player_hands("AFTER DEALING")

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

    def select_seat(self, player_id: str, seat: int, team: str) -> bool:
        """
        Assign a player to a specific seat and team.
        Returns True if successful, False if seat is occupied or invalid.
        """
        if self.state.phase != "lobby":
            logger.warning(f"Cannot assign seat during {self.state.phase} phase")
            return False
            
        if player_id not in self.state.players:
            logger.warning(f"Player {player_id} not found in room {self.state.room_id}")
            return False
            
        if seat < 0 or seat >= 6:
            logger.warning(f"Invalid seat number {seat}")
            return False
            
        if self.state.seats[seat] is not None:
            logger.warning(f"Seat {seat} is already occupied by player {self.state.seats[seat]}")
            return False
            
        # Remove player from current seat if they have one
        self.remove_from_seat(player_id)
        
        # Assign to new seat
        self.state.seats[seat] = player_id
        player = self.state.players[player_id]
        player.seat = seat
        player.team = team
        
        logger.info(f"Player {player_id} assigned to seat {seat} on team {team}")
        return True

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

    def unassign_player(self, admin_player_id: str, target_player_id: str) -> dict:
        """
        Admin function to unassign a player from their team and seat.
        Only works in lobby phase and only the admin can do this.
        """
        # Check if the requester is the admin
        if self.state.admin_player_id != admin_player_id:
            return {
                "success": False, 
                "reason": "not_admin", 
                "message": "Only the admin can unassign players"
            }
        
        # Only allow in lobby phase
        if self.state.phase != "lobby":
            return {
                "success": False, 
                "reason": "not_lobby", 
                "message": "Can only unassign players in lobby phase"
            }
        
        # Check if target player exists
        if target_player_id not in self.state.players:
            return {
                "success": False, 
                "reason": "player_not_found", 
                "message": "Player not found"
            }
        
        # Check if target player is the admin (admin cannot unassign themselves)
        if target_player_id == admin_player_id:
            return {
                "success": False, 
                "reason": "cannot_unassign_self", 
                "message": "Admin cannot unassign themselves"
            }
        
        # Remove player from seat and team
        success = self.remove_from_seat(target_player_id)
        
        if success:
            logger.info(f"Admin {admin_player_id} unassigned player {target_player_id} from team in room {self.state.room_id}")
            return {
                "success": True, 
                "message": f"Player {self.state.players[target_player_id].name} has been unassigned from their team"
            }
        else:
            return {
                "success": False, 
                "reason": "unassign_failed", 
                "message": "Failed to unassign player"
            }

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
        self.state.round_wins = {"A": 0, "B": 0}
        self.state.completed_rounds = 0
        self.state.tied_rounds = 0
        self.state.round_result = None
        self.state.match_finished = False
        # Start with seat 0 as the first dealer (displays as "Seat 1")
        dealer = self.state.seats.get(0)
        self.state.current_dealer = dealer
        
        # No turn player set yet - will be set after shuffle & deal
        self.state.turn_player = None
        self.state.voice_spot = None
        
        # Lock the lobby to prevent new players from joining
        self.state.lobby_locked = True

        # Players who never took a seat watch instead of playing (otherwise their
        # client would render the table from an empty seat).
        for p in self.state.players.values():
            if p.seat is None and not p.is_spectator:
                p.is_spectator = True
                p.spectator_request_pending = False
                p.team = None
                p.hand = []
                logger.info(f"Player {p.id} had no seat at game start; joined as spectator")
        
        logger.info(f"Game started in room {self.state.room_id}, dealer: {dealer}, lobby locked")

    def _release_spectators_to_lobby(self):
        """The lobby is open again, so spectators can pick a seat like everyone else."""
        for p in self.state.players.values():
            p.is_spectator = False
            p.spectator_request_pending = False
        self.state.spectator_requests = {}

    @staticmethod
    def is_bot(player_id: str) -> bool:
        """Test-mode bots are added by the lobby with ids starting with "ai_"."""
        return player_id.startswith("ai_")

    def _human_voters(self, team: str) -> list:
        # A disconnected player can't vote, so votes (e.g. back to lobby while the game is paused for
        # them) are decided by the players still here.
        return [pid for pid, p in self.state.players.items()
                if p.team == team and not p.is_spectator and not self.is_bot(pid) and p.connected]

    def _team_yes_votes(self, votes: dict, team: str) -> int:
        voters = set(self._human_voters(team))
        return sum(1 for pid, v in (votes or {}).items() if v and pid in voters)

    def _vote_passed(self, votes: dict) -> bool:
        """One yes from each team that has human players; bots never vote."""
        teams = [t for t in ("A", "B") if self._human_voters(t)]
        return bool(teams) and all(self._team_yes_votes(votes, t) >= 1 for t in teams)

    def _return_to_lobby(self):
        self.state.phase = "lobby"
        self.state.lobby_locked = False
        self._release_spectators_to_lobby()
        self.state.back_to_lobby_votes = {}
        self.state.abort_votes = {}

        # Reset game state
        self.state.turn_player = None
        self.state.voice_spot = None
        self.state.ask_chain_from = None
        self.state.deck_count = 0
        self.state.current_dealer = None
        self.state.table_sets = []

        self.state.pending_ask = None
        self.state.pending_handoff = None
        self.state.awaiting_start = False
        # The finished match's result must not follow the players into the next game.
        self.state.round_result = None
        self.state.match_finished = False

        # Bots only fill seats for one game; the lobby starts with humans only.
        for pid in [pid for pid in self.state.players if self.is_bot(pid)]:
            for seat, occupant in self.state.seats.items():
                if occupant == pid:
                    self.state.seats[seat] = None
            del self.state.players[pid]

        # Clear all players' hands
        for player in self.state.players.values():
            player.hand = []

    def request_back_to_lobby(self, requester_id: str) -> dict:
        """
        Request to return to lobby from game. Requires majority vote.
        Returns voting status and result.
        """
        # Allow back to lobby request at any time
        
        if requester_id not in self.state.players:
            return {"success": False, "reason": "unknown_player", "message": "Unknown player"}
        
        # Initialize voting if not already started
        if not self.state.back_to_lobby_votes:
            self.state.back_to_lobby_votes = {}
            logger.info(f"Back to lobby voting started by {requester_id} in room {self.state.room_id}")
        
        # Add/update vote
        self.state.back_to_lobby_votes[requester_id] = True
        
        # Count votes by team
        total_players = len(self.state.players)
        yes_votes = sum(1 for vote in self.state.back_to_lobby_votes.values() if vote)
        team_a_yes = self._team_yes_votes(self.state.back_to_lobby_votes, "A")
        team_b_yes = self._team_yes_votes(self.state.back_to_lobby_votes, "B")
        
        # Check if we have one vote from each team
        if self._vote_passed(self.state.back_to_lobby_votes):
            # Return to lobby
            self._return_to_lobby()
            
            logger.info(f"Returned to lobby by team vote in room {self.state.room_id}")
            return {
                "success": True, 
                "reason": "team_vote_reached", 
                "message": "Returning to lobby by team vote (one from each team)",
                "votes": {"yes": yes_votes, "total": total_players, "team_a_yes": team_a_yes, "team_b_yes": team_b_yes}
            }
        
        return {
            "success": False, 
            "reason": "voting_in_progress", 
            "message": f"Voting in progress: Team A: {team_a_yes}/1, Team B: {team_b_yes}/1",
            "votes": {"yes": yes_votes, "total": total_players, "team_a_yes": team_a_yes, "team_b_yes": team_b_yes}
        }

    def vote_back_to_lobby(self, voter_id: str, vote: bool) -> dict:
        """
        Cast a vote for returning to lobby.
        """
        # Allow back to lobby voting at any time
        
        if voter_id not in self.state.players:
            return {"success": False, "reason": "unknown_player", "message": "Unknown player"}
        
        if not self.state.back_to_lobby_votes:
            return {"success": False, "reason": "no_voting", "message": "No back to lobby voting in progress"}
        
        # Cast vote
        self.state.back_to_lobby_votes[voter_id] = vote
        
        # If anyone votes NO, immediately fail the voting
        if vote is False:
            self.state.back_to_lobby_votes = {}
            logger.info(f"Back to lobby voting failed - {voter_id} voted NO in room {self.state.room_id}")
            return {
                "success": False, 
                "reason": "voting_failed", 
                "message": "Back to lobby voting failed - someone voted NO",
                "voter_id": voter_id,
                "vote": vote,
                "voting_failed": True
            }
        
        # Count votes
        total_players = len(self.state.players)
        yes_votes = sum(1 for v in self.state.back_to_lobby_votes.values() if v)
        no_votes = sum(1 for v in self.state.back_to_lobby_votes.values() if not v)
        
        # Check if we have one vote from each team
        team_a_yes = self._team_yes_votes(self.state.back_to_lobby_votes, "A")
        team_b_yes = self._team_yes_votes(self.state.back_to_lobby_votes, "B")
        
        if self._vote_passed(self.state.back_to_lobby_votes):
            # Return to lobby
            self._return_to_lobby()
            
            logger.info(f"Returned to lobby by team vote in room {self.state.room_id}")
            return {
                "success": True, 
                "reason": "team_vote_reached", 
                "message": "Returning to lobby by team vote (one from each team)",
                "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "team_a_yes": team_a_yes, "team_b_yes": team_b_yes}
            }
        
        # Check if voting failed (impossible to get one from each team)
        # Count total players per team
        team_a_players = len(self._human_voters("A"))
        team_b_players = len(self._human_voters("B"))
        
        # Check if it's impossible to get one vote from each team
        team_a_remaining = team_a_players - sum(1 for pid, vote in self.state.back_to_lobby_votes.items() 
                                               if self.state.players[pid].team == "A")
        team_b_remaining = team_b_players - sum(1 for pid, vote in self.state.back_to_lobby_votes.items() 
                                               if self.state.players[pid].team == "B")
        
        if (team_a_players and team_a_yes == 0 and team_a_remaining == 0) or (team_b_players and team_b_yes == 0 and team_b_remaining == 0):
            self.state.back_to_lobby_votes = {}
            logger.info(f"Back to lobby voting failed in room {self.state.room_id}")
            return {
                "success": False, 
                "reason": "voting_failed", 
                "message": "Back to lobby voting failed - need one vote from each team",
                "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "team_a_yes": team_a_yes, "team_b_yes": team_b_yes}
            }
        
        return {
            "success": False, 
            "reason": "voting_in_progress", 
            "message": f"Voting in progress: Team A: {team_a_yes}/1, Team B: {team_b_yes}/1",
            "votes": {"yes": yes_votes, "no": no_votes, "total": total_players, "team_a_yes": team_a_yes, "team_b_yes": team_b_yes}
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

        if self.state.game_mode == "turns":
            if self.state.awaiting_start:
                raise ValueError("Press Start when everyone has looked at their cards")
            if self.state.turn_player != who_id:
                raise ValueError("You can only lay down on your turn")
            if self.state.pending_ask or self.state.pending_handoff:
                raise ValueError("Finish the current ask or turn handoff first")
        if self._voice_tracked():
            if self.state.turn_player != who_id:
                raise ValueError("You can only lay down on your turn")
            if self.state.voice_spot:
                raise ValueError("Finish the current ask first")
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
        
        # Track all claimed cards (what players said they had)
        all_claimed_ranks = set(needed_ranks)

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
            # Snapshot the declaration and ownership BEFORE collecting the set.
            # The updated hands no longer contain these cards after a failure.
            selected_by_rank = {rank: set() for rank in self.ranks_for(set_type)}
            for c in my.hand:
                if c.suit == suit and c.rank in needed_ranks:
                    selected_by_rank[c.rank].add(who_id)
            for pid, ranks in coll_map.items():
                if pid not in self.state.players:
                    continue
                for rank in ranks:
                    if rank in needed_ranks:
                        selected_by_rank[rank].add(pid)
            declaration_comparison = []
            for rank in self.ranks_for(set_type):
                selected_ids = sorted(selected_by_rank[rank])
                actual_ids = sorted(
                    pid for pid, player in self.state.players.items()
                    if any(c.suit == suit and c.rank == rank for c in player.hand)
                )
                declaration_comparison.append({
                    "card": {"suit": suit, "rank": rank},
                    "selected_player_ids": selected_ids,
                    "actual_player_ids": actual_ids,
                    "correct": len(selected_ids) == 1 and selected_ids == actual_ids,
                })
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
            self.state.pending_handoff = None

            # Check if game has ended
            game_end_result = self.check_game_end()

            # Calculate claimed vs actual cards for display
            claimed_cards = []
            actual_cards = []
            
            # Get all claimed cards (what players said they had - the full set needed)
            for rank in needed_ranks:
                claimed_cards.append({"suit": suit, "rank": rank})
            
            # For failed laydowns, actual_cards should only contain what was actually declared
            # (not what was collected from everyone)
            actual_declared_cards = []
            for rank in declared:
                actual_declared_cards.append({"suit": suit, "rank": rank})
            
            actual_cards = actual_declared_cards
            
            return {
                "success": False,
                "who_id": who_id,
                "declaration_comparison": declaration_comparison,
                "owner_team": winner_team,
                "suit": suit,
                "set_type": set_type,
                "contributors": contributors,
                "claimed_cards": claimed_cards,
                "actual_cards": actual_cards,
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
        if self.state.game_mode == "turns" or self._voice_tracked():
            handoff_eligible = self._turn_after_laydown(who_id, handoff_eligible)

        # Check if game has ended
        game_end_result = self.check_game_end()

        # Log all player hands after laydown
        self.log_all_player_hands(f"AFTER LAYDOWN - {my.name} ({suit} {set_type})")

        # For successful laydowns, all claimed cards were actually held
        claimed_cards = []
        actual_cards = []
        
        # Get all claimed cards (what players said they had - the full set needed)
        for rank in needed_ranks:
            claimed_cards.append({"suit": suit, "rank": rank})
        
        # Get all actual cards (what players actually had and laid down)
        for contributor in contributors:
            actual_cards.extend(contributor["cards"])

        return {
            "success": True,
            "who_id": who_id,
            "owner_team": owner_team,
            "suit": suit,
            "set_type": set_type,
            "contributors": contributors,
            "claimed_cards": claimed_cards,
            "actual_cards": actual_cards,
            "handoff_eligible": handoff_eligible,
            "scores": self.state.team_scores,
            "game_end": game_end_result,
        }

    # ---------------- Turns mode: ask / answer through the game ----------------
    def ensure_admin(self) -> bool:
        """The admin left: hand the room to the longest-present human still here. Returns True if it changed."""
        st = self.state
        cur = st.players.get(st.admin_player_id) if st.admin_player_id else None
        if cur and cur.connected:
            return False
        nxt = next((pid for pid, p in st.players.items() if p.connected and not self.is_bot(pid) and not p.is_spectator), None)
        if nxt and nxt != st.admin_player_id:
            st.admin_player_id = nxt
            return True
        return False

    def transfer_admin(self, requester_id: str, target_id: str) -> dict:
        st = self.state
        if st.phase != "lobby":
            return {"success": False, "message": "Admin can only be handed over in the lobby"}
        if st.admin_player_id and requester_id != st.admin_player_id:
            return {"success": False, "message": "Only the admin can hand over admin"}
        target = st.players.get(target_id)
        if not target or self.is_bot(target_id) or target.is_spectator or not target.connected or target_id == requester_id:
            return {"success": False, "message": "That player can't be made admin"}
        st.admin_player_id = target_id
        return {"success": True}

    def set_bot_level(self, requester_id: str, level: str) -> dict:
        if level not in ("easy", "medium", "hard", "expert", "claude"):
            return {"success": False, "message": "Unknown bot level"}
        if self.state.phase != "lobby":
            return {"success": False, "message": "Bot difficulty can only be changed in the lobby"}
        if self.state.admin_player_id and requester_id != self.state.admin_player_id:
            return {"success": False, "message": "Only the room admin can change bot difficulty"}
        self.state.bot_level = level
        return {"success": True}

    def set_game_mode(self, requester_id: str, mode: str) -> dict:
        if mode not in ("voice", "turns"):
            return {"success": False, "message": "Unknown game mode"}
        if self.state.phase != "lobby":
            return {"success": False, "message": "The game mode can only be changed in the lobby"}
        if self.state.admin_player_id and requester_id != self.state.admin_player_id:
            return {"success": False, "message": "Only the room admin can change the game mode"}
        self.state.game_mode = mode
        return {"success": True}

    def set_voice_turns(self, requester_id: str, on: bool) -> dict:
        if self.state.phase != "lobby":
            return {"success": False, "message": "Turn tracking can only be changed in the lobby"}
        if self.state.admin_player_id and requester_id != self.state.admin_player_id:
            return {"success": False, "message": "Only the room admin can change turn tracking"}
        self.state.voice_turns = bool(on)
        return {"success": True}

    def set_language(self, requester_id: str, lang: str) -> dict:
        if lang not in ("en", "si"):
            return {"success": False, "message": "Unknown language"}
        if self.state.admin_player_id and requester_id != self.state.admin_player_id:
            return {"success": False, "message": "Only the room admin can change the language"}
        self.state.language = lang
        return {"success": True}

    def _voice_tracked(self) -> bool:
        return self.state.game_mode == "voice" and self.state.voice_turns and self.state.phase == "playing"

    def voice_spot_set(self, asker_id: str, target_id: Optional[str]) -> dict:
        """Voice Play with turn tracking: the turn player points the gold spotlight at the opponent
        they are asking out loud (or takes it back with target_id=None)."""
        if not self._voice_tracked():
            raise ValueError("Turn tracking is off")
        if self.state.turn_player != asker_id:
            raise ValueError("Not your turn")
        if target_id is None:
            self.state.voice_spot = None
            return {"success": True}
        if self.state.voice_spot:
            raise ValueError("Finish the current ask first")
        if self.state.pending_handoff:
            raise ValueError("Choose who plays next first")
        asker, target = self.state.players.get(asker_id), self.state.players.get(target_id)
        if not asker or not target:
            raise ValueError("Unknown player")
        if asker.team == target.team:
            raise ValueError("Must ask an opponent")
        if not target.hand:
            raise ValueError("That player has no cards")
        self.state.voice_spot = {"asker_id": asker_id, "target_id": target_id}
        return {"success": True}

    def voice_no_card(self, target_id: str) -> dict:
        """The asked player doesn't have it: the turn goes to them (or on, if their hand is empty)."""
        spot = self.state.voice_spot
        if not self._voice_tracked() or not spot or spot["target_id"] != target_id:
            raise ValueError("Nobody is asking you")
        self.state.voice_spot = None
        target = self.state.players[target_id]
        if target.hand:
            self.state.turn_player = target_id
        else:
            self.state.turn_player = self._next_ccw_matching(
                target.seat or 0, lambda pid: self.state.players[pid].team == target.team and self._has_cards(pid)
            ) or self._next_ccw_matching(target.seat or 0, self._has_cards)
        return {"success": True, "asker_id": spot["asker_id"], "target_id": target_id, "next_turn": self.state.turn_player}

    def ask_card(self, asker_id: str, target_id: str, suit: str, set_type: str, ranks) -> dict:
        """Turns mode: the turn player asks an opponent for one or more cards of one set.
        All or nothing: if the opponent lacks any of them, nothing moves and the turn passes.
        Raises ValueError if not allowed."""
        if isinstance(ranks, str):
            ranks = [ranks]
        ranks = list(dict.fromkeys(ranks or []))
        if self.state.game_mode != "turns":
            raise ValueError("Asking through the game is only used in Turn Play")
        if self.state.phase != "playing":
            raise ValueError("The round isn't in play")
        if self.state.awaiting_start:
            raise ValueError("Press Start when everyone has looked at their cards")
        if self.state.pending_ask:
            raise ValueError("Waiting for the previous answer")
        if self.state.pending_handoff:
            raise ValueError("Pass the turn to a teammate first")
        if set_type not in ("lower", "upper") or not ranks or any(r not in self.ranks_for(set_type) for r in ranks):
            raise ValueError("That card isn't in this set")
        if self.state.turn_player != asker_id:
            raise ValueError("Not your turn")
        asker = self.state.players.get(asker_id)
        target = self.state.players.get(target_id)
        if not asker or not target:
            raise ValueError("Unknown player")
        if asker.team == target.team:
            raise ValueError("Must ask an opponent")
        if not target.hand:
            raise ValueError("That player has no cards")
        if self._table_has_set(suit, set_type):
            raise ValueError("That set is already on the table")

        # Real-table mistakes forfeit the set to the other team (like a failed laydown)
        own = [r for r in ranks if any(c.suit == suit and c.rank == r for c in asker.hand)]
        if own:
            res = self.forfeit_set(asker_id, target_id, suit, set_type, own[0], "own_card")
            res["ranks"] = ranks
            return res
        if not self.has_at_least_one_in_set(asker, suit, set_type):
            res = self.forfeit_set(asker_id, target_id, suit, set_type, ranks[0], "no_card_in_set")
            res["ranks"] = ranks
            return res

        res = self.prepare_ask(asker_id, target_id, suit, set_type, ranks)
        if res.get("reason") == "target_empty":
            raise ValueError("That player has no cards")
        self.state.pending_ask = {
            "asker_id": asker_id, "target_id": target_id,
            "suit": suit, "set_type": set_type, "ranks": ranks,
            "has_card": all(any(c.suit == suit and c.rank == r for c in target.hand) for r in ranks),
        }
        return res

    def forfeit_set(self, asker_id: str, target_id: str, suit: str, set_type: str, rank: str, mistake: str, move_turn: bool = True) -> dict:
        """Turn Play penalty: the whole set goes to the opposing team and the turn moves on
        exactly as after a failed laydown."""
        asker = self.state.players[asker_id]
        winner_team = "A" if asker.team == "B" else "B"
        needed = set(self.ranks_for(set_type))
        contributors, collected = [], []
        for pid, p in self.state.players.items():
            take = [c for c in p.hand if c.suit == suit and c.rank in needed]
            if take:
                p.hand = [c for c in p.hand if not (c.suit == suit and c.rank in needed)]
                contributors.append({"player_id": pid, "cards": [c.model_dump() for c in take]})
                collected.extend(take)
        self.state.table_sets.append(TableSet(suit=suit, set_type=set_type, cards=collected, owner_team=winner_team))
        self.state.team_scores[winner_team] += POINTS[set_type]

        start_seat = asker.seat or 0
        if move_turn:
            self.state.turn_player = self._next_ccw_matching(
                start_seat, lambda pid: self.state.players[pid].team == winner_team and self._has_cards(pid)
            ) or self._next_ccw_matching(start_seat, self._has_cards)
        self.state.pending_ask = None
        self.state.pending_handoff = None
        logger.info(f"{asker_id} asked for {rank} of {suit} ({mistake}); {suit} {set_type} forfeited to team {winner_team}")
        return {
            "penalty": True, "mistake": mistake,
            "asker_id": asker_id, "target_id": target_id,
            "suit": suit, "set_type": set_type, "ranks": [rank],
            "owner_team": winner_team, "points": POINTS[set_type],
            "contributors": contributors, "scores": self.state.team_scores,
            "next_turn": self.state.turn_player,
            "game_end": self.check_game_end(),
        }

    def penalty_laydown(self, who_id: str, suit: str, set_type: str) -> dict:
        """Voice Play: a player owns up to a wrong ask (made out loud) and gives the set to the other team.
        The turn is left alone; the table carries on in voice. With turn tracking on, the turn goes
        to the other team the way it does after a failed laydown."""
        if self.state.phase != "playing":
            raise ValueError("No round in play")
        if self.state.game_mode != "voice":
            raise ValueError("Penalty laydown is for Voice Play; Turn Play applies penalties automatically")
        me = self.state.players.get(who_id)
        if not me or not me.team or me.is_spectator:
            raise ValueError("Only seated players can do a penalty laydown")
        if suit not in ("hearts", "diamonds", "clubs", "spades") or set_type not in ("lower", "upper"):
            raise ValueError("Unknown set")
        if any(t.suit == suit and t.set_type == set_type for t in self.state.table_sets):
            raise ValueError("That set is already on the table")
        tracked = self._voice_tracked()
        res = self.forfeit_set(who_id, None, suit, set_type, None, "penalty", move_turn=tracked)
        if tracked:
            self.state.voice_spot = None
        res["ranks"] = []
        return res

    def answer_ask(self, responder_id: str) -> dict:
        """Turns mode: the asked player answers. The server decides what is handed over."""
        ask = self.state.pending_ask
        if not ask:
            raise ValueError("Nobody is asking you for a card")
        if responder_id != ask["target_id"]:
            raise ValueError("Only the asked player can answer")
        target = self.state.players[ask["target_id"]]
        cards = [c for c in target.hand if c.suit == ask["suit"] and c.rank in ask["ranks"]]
        if len(cards) < len(ask["ranks"]):
            cards = []  # all or nothing: missing any card means nothing moves and the turn passes
        self.state.pending_ask = None
        self.state.pending_handoff = None
        self.public_log.append({
            "asker_id": ask["asker_id"], "target_id": ask["target_id"], "suit": ask["suit"],
            "set_type": ask["set_type"], "ranks": list(ask["ranks"]), "success": bool(cards),
        })
        res = self.confirm_pass(ask["asker_id"], ask["target_id"], cards)
        return {**res, **{k: ask[k] for k in ("asker_id", "target_id", "suit", "ranks")}, "cards": [c.model_dump() for c in cards]}

    def begin_play(self, player_id: str) -> bool:
        """Turn Play: a seated player starts the round once hands have been looked at."""
        me = self.state.players.get(player_id)
        if not self.state.awaiting_start or not me or not me.team or me.is_spectator:
            return False
        self.state.awaiting_start = False
        return True

    def bot_level(self, bot_id: str) -> str:
        return self.bot_levels.get(bot_id, "medium")

    def bot_decide(self, bot_id: str) -> Optional[dict]:
        """The bot's move on its turn: an ask, a laydown, or None if it has nothing to do."""
        import bot_ai
        level = self.bot_level(bot_id)
        return bot_ai.decide(self, bot_id, "expert" if level == "claude" else level)   # claude: see bot_decide_async

    async def bot_decide_async(self, bot_id: str) -> Optional[dict]:
        """Like bot_decide, but the "claude" level asks Claude Haiku (falls back to the rules)."""
        if self.bot_level(bot_id) == "claude":
            import haiku_bot
            return await haiku_bot.decide(self, bot_id)
        return self.bot_decide(bot_id)

    def _turn_after_laydown(self, who_id: str, helpers: List[str]) -> List[str]:
        """Turn Play, successful laydown. The turn goes to a teammate who helped:
        - no helpers: the declarer keeps the turn
        - helpers with cards: one -> that teammate; two -> the declarer chooses (pending_handoff)
        - helpers all empty: next teammate anti-clockwise with cards, else the declarer
        Returns the ids the declarer may choose between (empty when decided already)."""
        self.state.pending_handoff = None
        me = self.state.players[who_id]
        if not helpers:
            nxt = who_id
        else:
            with_cards = [pid for pid in helpers if self._has_cards(pid)]
            if len(with_cards) >= 2:
                self.state.turn_player = who_id
                self.state.pending_handoff = {"who_id": who_id, "options": with_cards}
                return with_cards
            nxt = with_cards[0] if with_cards else (self._next_ccw_matching(
                me.seat or 0,
                lambda pid: pid != who_id and self.state.players[pid].team == me.team and self._has_cards(pid),
            ) or who_id)
        if not self._has_cards(nxt):
            # the declarer used their last cards: fall back to a teammate, then anyone, with cards
            nxt = self._next_ccw_matching(
                me.seat or 0, lambda pid: self.state.players[pid].team == me.team and self._has_cards(pid)
            ) or self._next_ccw_matching(me.seat or 0, self._has_cards) or nxt
        self.state.turn_player = nxt
        return []

    def skip_empty_turn(self) -> Optional[str]:
        """If the turn player has no cards, move the turn counter-clockwise to someone who does."""
        pid = self.state.turn_player
        if pid and self._has_cards(pid):
            return pid
        seat = self.state.players[pid].seat if pid in self.state.players else 0
        self.state.turn_player = self._next_ccw_matching(seat or 0, self._has_cards)
        return self.state.turn_player

    # ---------------- Pass Cards ----------------
    def pass_cards(self, from_player_id: str, to_player_id: str, cards: List[Card], free: bool = False):
        """Pass cards from one player to another (opponent only).
        free: spectator testing tool - any player to any player, any mode, any time, no rules."""
        if self.state.game_mode == "turns" and not free:
            raise ValueError("In Turn Play, cards move only when someone asks for them")
        if from_player_id not in self.state.players or to_player_id not in self.state.players:
            raise ValueError("Unknown player")
        
        from_player = self.state.players[from_player_id]
        to_player = self.state.players[to_player_id]
        spot = self.state.voice_spot if self._voice_tracked() and not free else None
        if self._voice_tracked() and not free and (not spot or spot["target_id"] != from_player_id or spot["asker_id"] != to_player_id):
            raise ValueError("Cards can only go to the player asking you")
        if not to_player.hand and not free:
            raise ValueError("That player has no cards left and is out of this round")
        
        # Can only pass to opponent team
        if from_player.team == to_player.team and not free:
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
        if spot:   # answered: the asker keeps the turn and asks again
            self.state.voice_spot = None
            self.state.turn_player = to_player_id
        
        # Log all player hands after card passing
        self.log_all_player_hands(f"AFTER PASS - {from_player.name} -> {to_player.name}")
        
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

        if self.state.game_mode == "turns" or self._voice_tracked():
            handoff = self.state.pending_handoff
            if not handoff or handoff["who_id"] != who_id or to_id not in handoff["options"]:
                return {"ok": False, "reason": "not_offered", "turn_player": self.state.turn_player}
            self.state.pending_handoff = None

        self.state.turn_player = to_id
        return {"ok": True, "turn_player": to_id}

    # ---------------- Game End Logic ----------------
    def check_game_end(self):
        """Check if game should end and return game result if so"""
        if self.state.round_result is not None:
            return self.state.round_result
        if self.state.phase not in ["playing", "ended"]:
            return {"game_ended": False}
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

            self.state.completed_rounds += 1
            if winner == "tie":
                self.state.tied_rounds += 1
            else:
                self.state.round_wins[winner] += 1
            wins = self.state.round_wins
            overall_winner = "A" if wins["A"] > wins["B"] else "B" if wins["B"] > wins["A"] else "tie"
            
            result = {
                "game_ended": True,
                "winner": winner,
                "round_number": self.state.completed_rounds,
                "round_wins": dict(wins),
                "tied_rounds": self.state.tied_rounds,
                "overall_winner": overall_winner,
                "team_a_score": team_a_score,
                "team_b_score": team_b_score,
                "team_a_sets": len([s for s in self.state.table_sets if s.owner_team == "A"]),
                "team_b_sets": len([s for s in self.state.table_sets if s.owner_team == "B"])
            }
            
            logger.info(f"Game ended in room {self.state.room_id}: Winner={winner}, A={team_a_score}, B={team_b_score}, Sets={len(self.state.table_sets)}")
            self.state.round_result = result
            if getattr(self, "bot_params", None) is None:   # not a test/simulation game
                import move_log
                move_log.record_result(self, result)
            return result
        return {"game_ended": False}

    def request_abort(self, requester_id: str):
        """Request to abort the current game - requires one player from each team to accept"""
        if self.state.phase != "playing":
            return {"success": False, "reason": "not_playing"}
        
        # Clear any previous abort votes
        self.state.abort_votes = {}
        
        # Add the requester's vote
        self.state.abort_votes[requester_id] = True
        
        # Count votes by team
        total_players = len(self.state.players)
        votes_for_abort = len(self.state.abort_votes)
        team_a_yes = self._team_yes_votes(self.state.abort_votes, "A")
        team_b_yes = self._team_yes_votes(self.state.abort_votes, "B")
        
        return {
            "success": True, 
            "requester_id": requester_id,
            "votes_for_abort": votes_for_abort,
            "total_players": total_players,
            "team_a_yes": team_a_yes,
            "team_b_yes": team_b_yes,
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
        
        # If anyone votes NO, immediately fail the voting
        if vote is False:
            self.state.abort_votes = {}
            logger.info(f"Abort voting failed - {voter_id} voted NO in room {self.state.room_id}")
            return {
                "success": False, 
                "reason": "voting_failed", 
                "message": "New game voting failed - someone voted NO",
                "voter_id": voter_id,
                "vote": vote,
                "abort_executed": False,
                "voting_failed": True
            }
        
        # Count votes
        total_players = len(self.state.players)
        votes_for_abort = sum(1 for v in self.state.abort_votes.values() if v)
        votes_against = sum(1 for v in self.state.abort_votes.values() if v is False)
        
        # Check if we have one vote from each team
        team_a_yes = self._team_yes_votes(self.state.abort_votes, "A")
        team_b_yes = self._team_yes_votes(self.state.abort_votes, "B")
        
        if self._vote_passed(self.state.abort_votes):
            return self._execute_abort()
        
        # Check if voting has failed (impossible to get one from each team)
        team_a_players = len(self._human_voters("A"))
        team_b_players = len(self._human_voters("B"))
        
        team_a_remaining = team_a_players - sum(1 for pid, vote in self.state.abort_votes.items() 
                                               if self.state.players[pid].team == "A")
        team_b_remaining = team_b_players - sum(1 for pid, vote in self.state.abort_votes.items() 
                                               if self.state.players[pid].team == "B")
        
        if (team_a_players and team_a_yes == 0 and team_a_remaining == 0) or (team_b_players and team_b_yes == 0 and team_b_remaining == 0):
            return self._handle_voting_failure("insufficient_support")
        
        return {
            "success": True,
            "voter_id": voter_id,
            "vote": vote,
            "votes_for_abort": votes_for_abort,
            "total_players": total_players,
            "team_a_yes": team_a_yes,
            "team_b_yes": team_b_yes,
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
        if self.state.phase == "ended":
            result = self.start_new_round(self.state.current_dealer)
            return {**result, "abort_executed": result.get("success", False)}
        # Reset game state but keep players and teams
        self.state.phase = "ready"  # Set to ready so shuffle/deal can be used
        self.state.pending_ask = None
        self.state.pending_handoff = None
        self.state.turn_player = None
        self.state.voice_spot = None
        self.state.ask_chain_from = None
        self.state.deck_count = 0
        self.state.team_scores = {"A": 0, "B": 0}
        self.state.table_sets = []
        
        # Restarting an unfinished round keeps its dealer and match standings.
        self.state.round_result = None

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
        """Deal a round; only a completed round advances the dealer."""
        if self.state.phase == "ended":
            prepared = self.start_new_round(dealer_id)
            if not prepared.get("success"):
                return prepared
        if self.state.phase not in ["lobby", "ready"]:
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
        
        # Determine the next dealer clockwise from the player who clicked
        def find_next_occupied_seat(start_seat):
            for offset in range(1, 7):
                seat = (start_seat + offset) % 6
                player_id = self.state.seats.get(seat)
                if player_id:
                    return seat, player_id
            return None, None

        # Never rotate dealer in shuffle_deal_new_game - keep current dealer
        # Dealer rotation only happens in start_new_round() after completion.
        next_dealer_seat = current_dealer_seat
        next_dealer_id = self.state.current_dealer

        if next_dealer_seat is None or not next_dealer_id:
            return {"success": False, "reason": "no_dealer"}

        # Turn starts from the player clockwise from the new dealer
        next_turn_seat, next_turn_id = find_next_occupied_seat(next_dealer_seat)

        if next_turn_seat is None or not next_turn_id:
            return {"success": False, "reason": "no_turn_player"}

        
        # Reset game state
        self.state.phase = "playing"
        self.state.awaiting_start = self.state.game_mode == "turns"  # held until someone presses Start
        self.state.pending_ask = None
        self.state.pending_handoff = None
        self.state.team_scores = {"A": 0, "B": 0}
        self.state.table_sets = []
        self.state.current_dealer = next_dealer_id
        self.state.turn_player = next_turn_id
        
        # Build deck and deal starting from the seat clockwise from the dealer
        self.build_deck()

        deal_start_seat = next_turn_seat  # Start dealing from the turn player (clockwise from dealer)

        # Create dealing sequence for animation to mirror real dealing order
        dealing_sequence = []
        # Use the same deck order for both animation and actual dealing
        order = [(deal_start_seat + i) % 6 for i in range(6)]
        # Create animation sequence using the same deck that will be used for actual dealing
        # We'll create the sequence by simulating the actual dealing process
        temp_deck = self._deck.copy()  # This should be the same deck used in deal_all
        round_num = 0
        while temp_deck:
            dealt_this_round = False
            for seat in order:
                if not temp_deck:
                    break
                player_id = self.state.seats.get(seat)
                if not player_id:
                    continue
                card = temp_deck.pop()  # Use pop() to match deal_all behavior (removes from end)
                dealt_this_round = True
                dealing_sequence.append({
                    "seat": seat,
                    "player_id": player_id,
                    "round": round_num,
                    "card": {"suit": card.suit, "rank": card.rank},
                    "from_seat": None  # Animation origin handled on frontend
                })
            if not dealt_this_round:
                break
            round_num += 1

        # Now actually deal the cards using the same start seat
        self.deal_all(start_from_seat=deal_start_seat)
        
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
        if self.state.match_finished:
            return {"success": False, "reason": "match_finished"}
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
        
        # Find next occupied seat clockwise
        next_dealer_seat = None
        next_dealer_id = None
        for offset in range(1, 7):
            seat = (current_dealer_seat + offset) % 6
            player_id = self.state.seats.get(seat)
            if player_id:
                next_dealer_seat = seat
                next_dealer_id = player_id
                break
        
        if not next_dealer_id:
            return {"success": False, "reason": "no_dealer"}
        
        # Turn starts from the next player after dealer
        next_turn_seat = None
        next_turn_id = None
        for offset in range(1, 7):
            seat = (next_dealer_seat + offset) % 6
            player_id = self.state.seats.get(seat)
            if player_id:
                next_turn_seat = seat
                next_turn_id = player_id
                break
        
        if not next_turn_id:
            return {"success": False, "reason": "no_turn_player"}
        
        # Reset this round while preserving the match's round wins.
        self.state.round_result = None
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

    def finish_match(self, requester_id: str):
        player = self.state.players.get(requester_id)
        if not player or player.is_spectator or player.seat is None:
            return {"success": False, "reason": "not_a_player"}
        if self.state.phase != "ended" or self.state.round_result is None:
            return {"success": False, "reason": "round_not_completed"}
        self.state.match_finished = True
        self.state.round_result = {**self.state.round_result, "match_finished": True}
        return {"success": True, "result": self.state.round_result}
