import unittest
from game import Game
from models import Card, Player


class MatchRoundTests(unittest.TestCase):
    def make_game(self):
        game = Game('rounds-test')
        for seat in range(6):
            pid = str(seat)
            game.state.players[pid] = Player(id=pid, name=pid, avatar='', seat=seat, team='A' if seat % 2 == 0 else 'B')
            game.state.seats[seat] = pid
        game.start()
        return game

    def complete(self, game, scores):
        game.state.phase = 'playing'
        game.state.team_scores = scores
        for player in game.state.players.values():
            player.hand = []
        return game.check_game_end()

    def test_restart_keeps_dealer_and_standings(self):
        game = self.make_game()
        self.complete(game, {'A':120,'B':80})
        game.start_new_round('0')
        dealer = game.state.current_dealer
        game.state.phase = 'playing'
        game.state.players['0'].hand = [Card(suit='hearts',rank='2')]
        self.assertTrue(game._execute_abort()['success'])
        self.assertEqual(game.state.current_dealer, dealer)
        self.assertEqual(game.state.round_wins, {'A':1,'B':0})
        self.assertEqual(game.state.completed_rounds, 1)
        self.assertFalse(game.check_game_end()['game_ended'])
        game.shuffle_deal_new_game(dealer)
        self.assertEqual(game.state.current_dealer, dealer)

    def test_completed_round_counts_once_and_rotates_once(self):
        game = self.make_game()
        result = self.complete(game, {'A':120,'B':80})
        self.assertEqual(game.check_game_end(), result)
        self.assertEqual(game.state.round_wins, {'A':1,'B':0})
        self.assertEqual(game.state.completed_rounds, 1)
        game.start_new_round('0')
        self.assertEqual(game.state.current_dealer, '1')
        self.assertFalse(game.start_new_round('0')['success'])
        game.shuffle_deal_new_game('1')
        self.assertEqual(game.state.current_dealer, '1')

    def test_deal_or_restart_after_completion_rotates(self):
        for action in ('deal','restart'):
            with self.subTest(action=action):
                game = self.make_game()
                self.complete(game, {'A':120,'B':80})
                if action == 'deal':
                    game.shuffle_deal_new_game('0')
                else:
                    game._execute_abort()
                self.assertEqual(game.state.current_dealer, '1')
                self.assertEqual(game.state.round_wins, {'A':1,'B':0})

    def test_ties_and_manual_finish(self):
        game = self.make_game()
        self.complete(game, {'A':120,'B':80})
        game.start_new_round('0')
        self.complete(game, {'A':100,'B':100})
        game.start_new_round('0')
        result = self.complete(game, {'A':90,'B':110})
        self.assertEqual(result['round_wins'], {'A':1,'B':1})
        self.assertEqual(result['tied_rounds'], 1)
        self.assertEqual(game.finish_match('0')['result']['overall_winner'], 'tie')
        self.assertFalse(game.start_new_round('0')['success'])
        self.assertFalse(game.shuffle_deal_new_game('0')['success'])
        game.start()
        self.assertEqual(game.state.round_wins, {'A':0,'B':0})
        self.assertFalse(game.state.match_finished)

    def test_round_wins_outweigh_last_round_points(self):
        game = self.make_game()
        self.complete(game, {'A':120,'B':80})
        game.start_new_round('0')
        self.complete(game, {'A':120,'B':80})
        game.start_new_round('0')
        self.complete(game, {'A':0,'B':200})
        self.assertEqual(game.finish_match('0')['result']['overall_winner'], 'A')

    def test_cannot_finish_during_active_round(self):
        game = self.make_game()
        game.state.phase = 'playing'
        self.assertFalse(game.finish_match('0')['success'])


if __name__ == '__main__':
    unittest.main()
