import unittest
from game import Game
from models import Card, Player


class MultiAskTests(unittest.TestCase):
    def make_game(self):
        game = Game('multi-ask')
        for seat in range(6):
            pid = str(seat)
            game.state.players[pid] = Player(id=pid, name=pid, avatar='', seat=seat, team='A' if seat % 2 == 0 else 'B')
            game.state.seats[seat] = pid
        game.start()
        game.state.phase = 'playing'
        game.state.game_mode = 'turns'
        for p in game.state.players.values():
            p.hand = [Card(suit='clubs', rank='2')]
        game.state.players['0'].hand = [Card(suit='hearts', rank='8')]
        game.state.players['1'].hand = [Card(suit='hearts', rank='J'), Card(suit='hearts', rank='K')]
        game.state.turn_player = '0'
        return game

    def hand(self, game, pid):
        return sorted(c.rank for c in game.state.players[pid].hand if c.suit == 'hearts')

    def test_all_present_moves_all_and_keeps_turn(self):
        g = self.make_game()
        g.ask_card('0', '1', 'hearts', 'upper', ['J', 'K'])
        self.assertTrue(g.state.pending_ask['has_card'])
        res = g.answer_ask('1')
        self.assertTrue(res['success'])
        self.assertEqual(self.hand(g, '0'), ['8', 'J', 'K'])
        self.assertEqual(g.state.turn_player, '0')

    def test_any_missing_moves_nothing_and_turn_passes(self):
        g = self.make_game()
        g.ask_card('0', '1', 'hearts', 'upper', ['J', 'Q', 'K'])
        self.assertFalse(g.state.pending_ask['has_card'])
        res = g.answer_ask('1')
        self.assertFalse(res['success'])
        self.assertEqual(self.hand(g, '0'), ['8'])
        self.assertEqual(self.hand(g, '1'), ['J', 'K'])
        self.assertEqual(g.state.turn_player, '1')

    def test_own_card_in_list_forfeits(self):
        g = self.make_game()
        res = g.ask_card('0', '1', 'hearts', 'upper', ['J', '8'])
        self.assertTrue(res['penalty'])
        self.assertEqual(res['mistake'], 'own_card')

    def test_single_rank_string_still_works(self):
        g = self.make_game()
        g.ask_card('0', '1', 'hearts', 'upper', 'J')
        self.assertEqual(g.state.pending_ask['ranks'], ['J'])


if __name__ == '__main__':
    unittest.main()
