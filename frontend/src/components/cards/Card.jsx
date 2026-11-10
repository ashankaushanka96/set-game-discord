import { SUIT_SYMBOL, isRed } from '../../lib/deck';

const SIZES = { xs: [32,44], 'sm-xs': [38,52], sm: [44,60], md: [64,88], lg: [96,132] };
const PIPS = {
  2: [[50,20],[50,80]], 3: [[50,20],[50,50],[50,80]],
  4: [[28,20],[72,20],[28,80],[72,80]],
  5: [[28,20],[72,20],[50,50],[28,80],[72,80]],
  6: [[28,20],[72,20],[28,50],[72,50],[28,80],[72,80]],
  7: [[28,20],[72,20],[50,35],[28,50],[72,50],[28,80],[72,80]],
  8: [[28,20],[72,20],[50,35],[28,50],[72,50],[50,65],[28,80],[72,80]],
  9: [[28,16],[72,16],[28,38],[72,38],[50,50],[28,62],[72,62],[28,84],[72,84]],
  10: [[28,16],[72,16],[50,27],[28,38],[72,38],[28,62],[72,62],[50,73],[28,84],[72,84]],
};

export default function Card({ suit = 'spades', rank = 'A', size = 'md' }) {
  const [width, height] = SIZES[size] || SIZES.md;
  const symbol = SUIT_SYMBOL[suit];
  const face = ['J','Q','K'].includes(rank);
  return (
    <div className={`playing-card ${isRed(suit) ? 'playing-card--red' : ''}`}
      role="img" aria-label={`${rank} of ${suit}`}
      style={{ width, height, '--card-unit': `${width / 64}px` }}>
      <div className="playing-card__corner">{rank}<span>{symbol}</span></div>
      <div className="playing-card__corner playing-card__corner--bottom" aria-hidden="true">{rank}<span>{symbol}</span></div>
      <div className="playing-card__art" aria-hidden="true">
        {PIPS[rank] ? PIPS[rank].map(([x,y], i) => (
          <span key={i} className="playing-card__pip" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${y > 50 ? 180 : 0}deg)` }}>{symbol}</span>
        )) : <div className={face ? 'playing-card__court' : 'playing-card__ace'}>{face && <span className="playing-card__crown">♛</span>}{symbol}{face && <span className="playing-card__court-rank">{rank}</span>}</div>}
      </div>
    </div>
  );
}
