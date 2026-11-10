import { useEffect, useRef } from 'react';
import { CardBack } from '../cards';

const LAYERS = 12;

function ShuffleCard({ index, side, shuffling }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!shuffling || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lift = index * .85;
    const stagger = (LAYERS - index - 1) * .012;
    const pose = (x, y, z, twist, bend) => `translate3d(${x}px,${y}px,${z}px) rotateZ(${twist}deg) rotateY(${bend}deg)`;
    const squared = pose(0, -lift, index * .3, 0, 0);
    const animation = ref.current.animate([
      { transform:squared, offset:0 },
      { transform:pose(side*52,-lift-5,12,side*13,0), offset:.18 },
      { transform:pose(side*47,-lift-8,25,side*8,-side*29), offset:.32 },
      { transform:pose(side*38,-lift-10,30,side*6,-side*34), offset:.40+stagger },
      // Each leaf releases in order, alternating with the other half.
      { transform:pose(side*13,-lift,12,side*2,-side*7), offset:.46+stagger },
      { transform:pose(side*9,-lift,8,0,0), offset:.65 },
      // Bridge the interleaved deck, then let it settle onto the felt.
      { transform:pose(side*7,-lift-11,34,side*2,side*23), offset:.76 },
      { transform:pose(side*3,-lift-3,9,0,side*5), offset:.87 },
      { transform:squared, offset:.96 },
      { transform:squared, offset:1 },
    ], { duration:3200, easing:'cubic-bezier(.35,0,.25,1)', fill:'both' });
    return () => animation.cancel();
  }, [index,side,shuffling]);
  return <div ref={ref} className="riffle-card" style={{zIndex:index*2+(side===1?1:0),transform:`translate3d(0,${-index*.85}px,${index*.3}px)`}}><CardBack size="sm" /></div>;
}

export default function ShuffleDeck({ shuffling, position }) {
  return <div className={`riffle-scene ${shuffling ? 'riffle-scene--active' : ''}`} style={{left:position.x,top:position.y}} aria-hidden="true">
    <div className="riffle-shadow" />
    <div className="riffle-deck">{[-1,1].flatMap(side => Array.from({length:LAYERS},(_,index) => <ShuffleCard key={`${side}-${index}`} side={side} index={index} shuffling={shuffling} />))}</div>
    <span>{shuffling ? 'Shuffling the deck…' : 'Dealing from the deck…'}</span>
  </div>;
}
