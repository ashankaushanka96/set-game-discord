import unittest
from game import Game
from models import Card, Player


class VoiceTurnsTests(unittest.TestCase):
    def make_game(self):
        game = Game('voice-turns')
        for seat in range(6):
            pid = str(seat)
            game.state.players[pid] = Player(id=pid, name=pid, avatar='', seat=seat, team='A' if seat % 2 == 0 else 'B')
            game.state.seats[seat] = pid
        game.start()
        game.state.phase = 'playing'
        game.state.game_mode = 'voice'
        game.state.voice_turns = True
        for p in game.state.players.values():
            p.hand = [Card(suit='clubs', rank='2')]
        game.state.players['1'].hand = [Card(suit='hearts', rank='J')]
        game.state.turn_player = '0'
        return game

    def test_only_turn_player_points_spotlight(self):
        g = self.make_game()
        with self.assertRaises(ValueError):
            g.voice_spot_set('2', '1')
        with self.assertRaises(ValueError):
            g.voice_spot_set('0', '2')   # teammate
        g.voice_spot_set('0', '1')
        self.assertEqual(g.state.voice_spot, {'asker_id': '0', 'target_id': '1'})

    def test_no_spotlight_no_passing(self):
        g = self.make_game()
        with self.assertRaises(ValueError):
            g.pass_cards('1', '0', [Card(suit='hearts', rank='J')])
        g.voice_spot_set('0', '1')
        with self.assertRaises(ValueError):
            g.pass_cards('1', '2', [Card(suit='hearts', rank='J')])   # not the asker
        g.pass_cards('1', '0', [Card(suit='hearts', rank='J')])
        self.assertIsNone(g.state.voice_spot)
        self.assertEqual(g.state.turn_player, '0')

    def test_no_card_passes_turn(self):
        g = self.make_game()
        g.voice_spot_set('0', '1')
        with self.assertRaises(ValueError):
            g.voice_no_card('3')
        g.voice_no_card('1')
        self.assertEqual(g.state.turn_player, '1')
        self.assertIsNone(g.state.voice_spot)

    def test_laydown_only_on_turn(self):
        g = self.make_game()
        with self.assertRaises(ValueError):
            g.laydown('2', 'clubs', 'lower', [])
        g.voice_spot_set('0', '1')
        with self.assertRaises(ValueError):
            g.laydown('0', 'clubs', 'lower', [])

    def test_successful_laydown_hands_turn_to_helper(self):
        g = self.make_game()
        lower = ['2', '3', '4', '5', '6', '7']
        g.state.players['0'].hand = [Card(suit='hearts', rank=r) for r in lower[:3]] + [Card(suit='clubs', rank='9')]
        g.state.players['2'].hand = [Card(suit='hearts', rank=r) for r in lower[3:]] + [Card(suit='clubs', rank='8')]
        res = g.laydown('0', 'hearts', 'lower', [{'player_id': '2', 'ranks': lower[3:]}])
        self.assertTrue(res['success'])
        self.assertEqual(g.state.turn_player, '2')

    def test_two_helpers_declarer_chooses(self):
        g = self.make_game()
        lower = ['2', '3', '4', '5', '6', '7']
        g.state.players['0'].hand = [Card(suit='hearts', rank='2'), Card(suit='clubs', rank='9')]
        g.state.players['2'].hand = [Card(suit='hearts', rank=r) for r in ['3', '4', '5']] + [Card(suit='clubs', rank='8')]
        g.state.players['4'].hand = [Card(suit='hearts', rank=r) for r in ['6', '7']] + [Card(suit='clubs', rank='10')]
        g.laydown('0', 'hearts', 'lower', [{'player_id': '2', 'ranks': ['3', '4', '5']}, {'player_id': '4', 'ranks': ['6', '7']}])
        self.assertEqual(g.state.pending_handoff['who_id'], '0')
        with self.assertRaises(ValueError):
            g.voice_spot_set('0', '1')
        self.assertFalse(g.handoff_after_laydown('2', '4')['ok'])
        self.assertTrue(g.handoff_after_laydown('0', '4')['ok'])
        self.assertEqual(g.state.turn_player, '4')

    def test_failed_laydown_turn_goes_to_other_team(self):
        g = self.make_game()
        g.state.players['0'].hand = [Card(suit='hearts', rank='2')]
        res = g.laydown('0', 'hearts', 'lower', [])
        self.assertFalse(res['success'])
        self.assertEqual(g.state.players[g.state.turn_player].team, 'B')

    def test_penalty_moves_turn_to_other_team(self):
        g = self.make_game()
        g.voice_spot_set('0', '1')
        g.state.players['0'].hand = [Card(suit='hearts', rank='2'), Card(suit='clubs', rank='2')]
        g.penalty_laydown('0', 'hearts', 'lower')
        self.assertIsNone(g.state.voice_spot)
        self.assertEqual(g.state.players[g.state.turn_player].team, 'B')

    def test_penalty_free_play_keeps_turn(self):
        g = self.make_game()
        g.state.voice_turns = False
        g.state.players['0'].hand = [Card(suit='hearts', rank='2'), Card(suit='clubs', rank='2')]
        g.penalty_laydown('0', 'hearts', 'lower')
        self.assertEqual(g.state.turn_player, '0')

    def test_off_means_free_play(self):
        g = self.make_game()
        g.state.voice_turns = False
        g.pass_cards('1', '0', [Card(suit='hearts', rank='J')])


if __name__ == '__main__':
    unittest.main()
