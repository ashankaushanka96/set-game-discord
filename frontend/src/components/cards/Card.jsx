// A playing card face. Every card on screen (hands, modals, chat bubbles, animations) uses the
// same real card artwork as the 3D table: "Vectorized Playing Cards 1.3" by Chris Aguilar
// (LGPL 3, see public/cards/LICENSE.txt), served as public/cards/<suit>-<rank>.png.
const SIZES = { xs: [32,44], 'sm-xs': [38,52], sm: [44,60], md: [64,88], lg: [96,132] };

export const cardImageUrl = (suit, rank) => `${import.meta.env.BASE_URL}cards/${suit}-${rank}.png`;

export default function Card({ suit = 'spades', rank = 'A', size = 'md' }) {
  const [width, height] = SIZES[size] || SIZES.md;
  return (
    <div className="playing-card playing-card--art" role="img" aria-label={`${rank} of ${suit}`}
      style={{ width, height, '--card-unit': `${width / 64}px` }}>
      <img src={cardImageUrl(suit, rank)} alt="" draggable={false} decoding="async" />
    </div>
  );
}
