import unittest
from game import Game
from models import Card, Player


class PenaltyLaydownTests(unittest.TestCase):
    def make_game(self, mode='voice'):
        game = Game('penalty-test')
        for seat in range(6):
            pid = str(seat)
            game.state.players[pid] = Player(id=pid, name=pid, avatar='', seat=seat, team='A' if seat % 2 == 0 else 'B')
            game.state.seats[seat] = pid
        game.start()
        game.state.phase = 'playing'
        game.state.game_mode = mode
        upper = ['8', '9', '10', 'J', 'Q', 'K', 'A']
        game.state.players['0'].hand = [Card(suit='hearts', rank=r) for r in upper[:3]] + [Card(suit='spades', rank='2')]
        game.state.players['1'].hand = [Card(suit='hearts', rank=r) for r in upper[3:]]
        game.state.players['2'].hand = [Card(suit='clubs', rank='3')]
        game.state.turn_player = '2'
        return game

    def test_set_goes_to_other_team_and_turn_unchanged(self):
        game = self.make_game()
        res = game.penalty_laydown('0', 'hearts', 'upper')
        self.assertEqual(res['owner_team'], 'B')
        self.assertEqual(game.state.team_scores['B'], 30)
        self.assertEqual(game.state.turn_player, '2')
        self.assertEqual(len(game.state.table_sets[-1].cards), 7)
        self.assertFalse(any(c.suit == 'hearts' for p in game.state.players.values() for c in p.hand))
        self.assertEqual([c.suit for c in game.state.players['0'].hand], ['spades'])

    def test_rejected_cases(self):
        game = self.make_game()
        game.penalty_laydown('0', 'hearts', 'upper')
        with self.assertRaises(ValueError):
            game.penalty_laydown('0', 'hearts', 'upper')  # already on the table
        with self.assertRaises(ValueError):
            self.make_game('turns').penalty_laydown('0', 'hearts', 'upper')  # Turn Play does it automatically
        with self.assertRaises(ValueError):
            game.penalty_laydown('0', 'stars', 'upper')
        g = self.make_game(); g.state.phase = 'ready'
        with self.assertRaises(ValueError):
            g.penalty_laydown('0', 'hearts', 'upper')


if __name__ == '__main__':
    unittest.main()
