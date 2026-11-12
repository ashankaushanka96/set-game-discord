import random
import unittest

import bot_ai
from game import Game
from models import Card, Player

PERFECT = {'miss': 0.0, 'half_life': None, 'noise': 0.0}   # a bot that notices and keeps everything


def new_game(levels, seed, params=None):
    """Six bots, team A on even seats and team B on odd seats, freshly dealt in Turn Play."""
    random.seed(seed)
    game = Game(f'bots-{seed}')
    game.bot_params = {}
    for seat in range(6):
        pid = f'ai_{seat}'
        team = 'A' if seat % 2 == 0 else 'B'
        game.state.players[pid] = Player(id=pid, name=pid, avatar='', seat=seat, team=team)
        game.state.seats[seat] = pid
        game.bot_levels[pid] = levels[team]
        game.bot_params[pid] = params
    game.start()
    game.build_deck()
    game.deal_all(0)
    game.state.phase = 'playing'
    game.state.game_mode = 'turns'
    game.state.awaiting_start = False
    game.state.turn_player = 'ai_0' if seed % 2 == 0 else 'ai_1'
    return game


def check_sound(test, game, pid):
    """With perfect memory, everything a bot treats as certain must be true: it reasons from
    what was said, never from another player's hand."""
    k = bot_ai.Knowledge(game, pid, bot_ai.profile_for(game, pid, game.bot_level(pid)))
    actual = {(c.suit, c.rank): p.id for p in game.state.players.values() for c in p.hand}
    for card, holder in k.loc.items():
        if holder:
            test.assertEqual(actual.get(card), holder, f'{pid} wrongly places {card}')
    for card, players in k.not_have.items():
        test.assertNotIn(actual.get(card), players, f'{pid} wrongly rules out the holder of {card}')


def play(test, game, sound=False, max_moves=6000):
    stats = {'penalties': 0, 'failed_laydowns': 0, 'multi': 0}
    for _ in range(max_moves):
        st = game.state
        if st.phase != 'playing':
            return stats
        if st.pending_handoff:
            h = st.pending_handoff
            game.handoff_after_laydown(h['who_id'], bot_ai.choose_handoff(game, h['who_id'], h['options']))
            continue
        pid = game.skip_empty_turn()
        if not pid:
            return stats
        if sound:
            check_sound(test, game, pid)
        move = game.bot_decide(pid)
        test.assertIsNotNone(move, f'{pid} has cards but no move')
        if move['action'] == 'laydown':
            res = game.laydown(pid, move['suit'], move['set_type'], move['collaborators'])
            stats['failed_laydowns'] += 0 if res['success'] else 1
        else:
            stats['multi'] += 1 if len(move['ranks']) > 1 else 0
            res = game.ask_card(pid, move['target_id'], move['suit'], move['set_type'], move['ranks'])
            if res.get('penalty'):
                stats['penalties'] += 1
            else:
                game.answer_ask(move['target_id'])
    test.fail('game did not finish')


class BotAiTests(unittest.TestCase):
    def test_every_level_finishes_without_illegal_asks(self):
        for level in bot_ai.LEVELS:
            for seed in range(12):
                game = new_game({'A': level, 'B': level}, seed)
                stats = play(self, game)
                self.assertEqual(game.state.phase, 'ended', level)
                self.assertEqual(stats['penalties'], 0, f'{level} bots must never make an illegal ask')

    def test_bots_reason_only_from_public_play(self):
        for level in ('medium', 'hard', 'expert'):
            for seed in range(8):
                play(self, new_game({'A': level, 'B': level}, seed, PERFECT), sound=True)

    def test_stronger_levels_win_more(self):
        for strong, weak in (('medium', 'easy'), ('hard', 'medium'), ('expert', 'hard')):
            score = {'A': 0, 'B': 0}
            for seed in range(40):
                game = new_game({'A': strong, 'B': weak}, seed)
                play(self, game)
                ts = game.state.team_scores
                if ts['A'] != ts['B']:
                    score['A' if ts['A'] > ts['B'] else 'B'] += 1
            self.assertGreater(score['A'], score['B'], f'{strong} vs {weak}: {score}')

    def scripted(self, level='medium'):
        """Six bots with chosen hands. Team A: ai_0, ai_2, ai_4. Team B: ai_1, ai_3, ai_5."""
        game = new_game({'A': level, 'B': level}, 1, PERFECT)
        filler = {'ai_0': 'clubs', 'ai_1': 'clubs', 'ai_2': 'diamonds', 'ai_3': 'diamonds', 'ai_4': 'spades', 'ai_5': 'spades'}
        for pid, suit in filler.items():
            game.state.players[pid].hand = [Card(suit=suit, rank='8')]
        game.public_log = []
        return game

    def give(self, game, pid, suit, *ranks):
        game.state.players[pid].hand += [Card(suit=suit, rank=r) for r in ranks]

    def test_asks_together_for_cards_it_saw_one_player_take(self):
        game = self.scripted()
        self.give(game, 'ai_0', 'hearts', '2')
        self.give(game, 'ai_1', 'hearts', '3', '4', '7')
        # The table watched ai_1 take the 3 and the 4 of hearts from ai_2.
        for rank in ('3', '4'):
            game.public_log.append({'asker_id': 'ai_1', 'target_id': 'ai_2', 'suit': 'hearts', 'set_type': 'lower', 'ranks': [rank], 'success': True})
        move = game.bot_decide('ai_0')
        self.assertEqual(move['action'], 'ask')
        self.assertEqual(move['target_id'], 'ai_1')
        self.assertEqual(sorted(move['ranks']), ['3', '4'])

    def test_goes_after_the_collector_hunting_its_card(self):
        for level in bot_ai.LEVELS:
            hits = 0
            for _ in range(40):
                game = self.scripted(level)
                self.give(game, 'ai_0', 'hearts', '5')
                self.give(game, 'ai_1', 'hearts', '2', '3')
                # ai_1 has asked both of ai_0's teammates for the 5 of hearts. ai_0 is next.
                for mate in ('ai_2', 'ai_4'):
                    game.public_log.append({'asker_id': 'ai_1', 'target_id': mate, 'suit': 'hearts', 'set_type': 'lower', 'ranks': ['5'], 'success': False})
                move = game.bot_decide('ai_0')
                hits += 1 if (move['action'] == 'ask' and move['suit'] == 'hearts' and move['target_id'] == 'ai_1') else 0
            self.assertGreaterEqual(hits, 30, f'{level} should strike the collector ({hits}/40)')

    def test_supports_the_set_a_teammate_is_collecting(self):
        hits = 0
        for _ in range(40):
            game = self.scripted('medium')
            self.give(game, 'ai_0', 'hearts', '5')
            # A teammate has been asking for hearts lower; ai_0 holds one too, so it joins in
            # rather than starting on its clubs.
            game.public_log.append({'asker_id': 'ai_2', 'target_id': 'ai_1', 'suit': 'hearts', 'set_type': 'lower', 'ranks': ['2'], 'success': False})
            move = game.bot_decide('ai_0')
            hits += 1 if (move['action'] == 'ask' and move['suit'] == 'hearts') else 0
        self.assertGreaterEqual(hits, 30, f'should support the teammate ({hits}/40)')


if __name__ == '__main__':
    unittest.main()
