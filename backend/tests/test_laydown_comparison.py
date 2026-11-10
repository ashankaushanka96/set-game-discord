import unittest
from game import Game
from models import Card, Player


class LaydownComparisonTests(unittest.TestCase):
    def test_failed_declaration_preserves_selected_and_actual_holders(self):
        game = Game('comparison-test')
        hands = {'declarer': ['2'], 'teammate': ['3', '4'], 'opponent': ['5', '6', '7']}
        for seat, (pid, ranks) in enumerate(hands.items()):
            game.state.players[pid] = Player(
                id=pid, name=pid, avatar='', seat=seat,
                team='B' if pid == 'opponent' else 'A',
                hand=[Card(suit='hearts', rank=rank) for rank in ranks] + [Card(suit='clubs', rank='A')],
            )
            game.state.seats[seat] = pid
        result = game.laydown('declarer', 'hearts', 'lower', {'teammate': ['3', '5', '6', '7']})
        self.assertFalse(result['success'])
        rows = {row['card']['rank']: row for row in result['declaration_comparison']}
        self.assertEqual(list(rows), ['2', '3', '4', '5', '6', '7'])
        self.assertTrue(rows['2']['correct'])
        self.assertTrue(rows['3']['correct'])
        self.assertEqual(rows['5']['selected_player_ids'], ['teammate'])
        self.assertEqual(rows['5']['actual_player_ids'], ['opponent'])
        self.assertFalse(rows['5']['correct'])
        # A card held by a teammate but omitted from the declaration is different
        # from a card assigned to the wrong person.
        self.assertEqual(rows['4']['selected_player_ids'], [])
        self.assertEqual(rows['4']['actual_player_ids'], ['teammate'])
        self.assertFalse(rows['4']['correct'])
        # Hands have already been cleared of this set; the snapshot must survive.
        self.assertTrue(all(c.suit != 'hearts' for p in game.state.players.values() for c in p.hand))
        self.assertEqual(game.state.team_scores['B'], 20)


if __name__ == '__main__':
    unittest.main()
