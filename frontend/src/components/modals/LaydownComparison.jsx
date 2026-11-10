import Card from '../cards/Card';

export default function LaydownComparison({ comparisons, players, declaredBy }) {
  const names = ids => ids.map(id => players[id]?.name || 'Unknown player').join(', ');
  const wrong = comparisons.filter(row => !row.correct).length;
  return <section className="laydown-comparison" aria-label="Selected versus actual card holders">
    <div className="laydown-comparison__intro"><h3>What was selected vs. who held it</h3>
      <p>{players[declaredBy]?.name || 'The declaring player'} made {wrong} incorrect {wrong === 1 ? 'assignment' : 'assignments'}. Only cards from this set are shown.</p>
    </div>
    <div className="laydown-comparison__head" aria-hidden="true"><span>Card</span><span>Selected player</span><span>Actual holder</span></div>
    {comparisons.map(row => {
      const selected = row.selected_player_ids || [];
      const actual = row.actual_player_ids || [];
      const reason = !selected.length ? 'Not assigned in the declaration' : selected.length > 1 ? 'Assigned to more than one player' : !actual.length ? 'Card was not held by any player' : 'Assigned to the wrong player';
      return <div key={`${row.card.suit}-${row.card.rank}`} className={`laydown-comparison__row ${row.correct ? 'laydown-comparison__row--correct' : 'laydown-comparison__row--wrong'}`}>
        <div className="laydown-comparison__card"><Card {...row.card} size="xs" /></div>
        <div className="laydown-comparison__selected"><span className="sr-only">Selected player: </span>{selected.length ? names(selected) : 'Not selected'}</div>
        <div className="laydown-comparison__actual"><span className="sr-only">Actual holder: </span>{actual.length ? names(actual) : 'Not held'}</div>
        <div className="laydown-comparison__reason"><span aria-hidden="true">{row.correct ? '✓' : '!'}</span> {row.correct ? 'Correctly assigned' : reason}</div>
      </div>;
    })}
  </section>;
}
