import CardBack from '../cards/CardBack';

export function SeatCardStack({ count }) {
  if (!count) return null;
  // Show every held card, compressing the spacing for larger hands.
  const spacing = Math.min(9, 58 / Math.max(1, count - 1));
  const angleStep = Math.min(7, 32 / Math.max(1, count - 1));
  return <div className="seat-card-stack" aria-hidden="true">{Array.from({length:count},(_,i)=><div key={i} style={{'--stack-offset':`${(i-(count-1)/2)*spacing}px`,'--stack-angle':`${(i-(count-1)/2)*angleStep}deg`}}><CardBack size="xs"/></div>)}</div>;

}

export default function TableSceneDetails() {
  return <div className="room-details" aria-hidden="true">
    <div className="room-mug"><div className="room-mug__coffee"/><span className="room-mug__steam"/></div>
    <div className="room-notebook"><i/><i/><i/><span>card night</span></div>
  </div>;
}
