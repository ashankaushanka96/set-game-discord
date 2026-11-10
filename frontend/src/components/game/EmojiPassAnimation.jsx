import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Tomato, TomatoSplat } from './ReactionArtwork';

function seatFor(id) {
  const wrapper = [...document.querySelectorAll('[data-player-id]')].find(el => el.dataset.playerId === id);
  return wrapper?.querySelector('.game-seat') || wrapper;
}
function center(el) {
  const rect = el.getBoundingClientRect();
  return { x:rect.left + rect.width/2, y:rect.top + rect.height/2 };
}

function ReactionScene({ reaction, reduced }) {
  const projectile = useRef(null);
  const [target, setTarget] = useState(null);
  const [landed, setLanded] = useState(false);
  const tomato = reaction.emoji === '🍅';
  const hammer = reaction.emoji === '🔨';
  const bomb = reaction.emoji === '💣';
  const lightning = reaction.emoji === '⚡';
  const fire = reaction.emoji === '🔥';
  const hearts = reaction.category === 'heart';
  const party = reaction.category === 'celebration';
  const kind = tomato ? 'tomato' : hammer ? 'hammer' : bomb ? 'bomb' : lightning ? 'lightning' : fire ? 'fire' : hearts ? 'heart' : party ? 'party' : 'cheer';

  useEffect(() => {
    const fromSeat = seatFor(reaction.from_player_id);
    const toSeat = seatFor(reaction.to_player_id);
    if (!fromSeat || !toSeat) return;
    const update = () => {
      const r = toSeat.getBoundingClientRect();
      setTarget({ left:r.left, top:r.top, width:r.width, height:r.height, borderRadius:getComputedStyle(toSeat).borderRadius });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toSeat);
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    const from = center(fromSeat), to = center(toSeat);
    const self = reaction.from_player_id === reaction.to_player_id;
    const duration = reduced || self ? 0 : 640;
    let flight;
    if (duration && projectile.current) {
      const arc = Math.max(24, Math.min(from.y,to.y)-85);
      flight = projectile.current.animate([
        {transform:`translate(${from.x}px,${from.y}px) scale(.35) rotate(-30deg)`,opacity:1},
        {transform:`translate(${(from.x+to.x)/2}px,${arc}px) scale(1.1) rotate(30deg)`,opacity:1,offset:.5},
        {transform:`translate(${to.x}px,${to.y}px) scale(.8,1.15) rotate(90deg)`,opacity:1},
      ],{duration,easing:'cubic-bezier(.35,0,.65,1)',fill:'both'});
    }
    let hit;
    const timer = setTimeout(() => {
      setLanded(true);
      if (!reduced && (tomato || hammer || bomb)) hit = toSeat.animate([
        {transform:'translateX(0) rotate(0)'},{transform:'translateX(-4px) rotate(-3deg)'},
        {transform:'translateX(4px) rotate(3deg)'},{transform:'translateX(-2px) rotate(-1deg)'},{transform:'translateX(0) rotate(0)'},
      ],{duration:350,easing:'ease-out'});
    },duration);
    return () => { clearTimeout(timer); flight?.cancel(); hit?.cancel(); observer.disconnect(); window.removeEventListener('resize',update); window.removeEventListener('scroll',update,true); };
  }, [reaction.id, reaction.from_player_id, reaction.to_player_id, reduced, tomato, hammer, bomb]);

  return <div className={`reaction-scene ${reduced ? 'reaction-scene--reduced' : ''}`} aria-hidden="true">
    {!landed && !reduced && <div ref={projectile} className="reaction-projectile">{tomato ? <Tomato/> : <span>{reaction.emoji}</span>}</div>}
    {landed && target && <div className={`reaction-on-card reaction-on-card--${kind}`} style={target}>
      <div className="reaction-card-decal" style={{borderRadius:target.borderRadius}}>
        {tomato ? <div className="tomato-splat"><TomatoSplat/></div> :
          lightning ? <svg className="card-lightning" viewBox="0 0 100 140"><path d="m64 0-38 64 27-5-18 81 45-94-29 6Z" fill="#ffdf87" stroke="#fff5ce" strokeWidth="2"/></svg> :
          fire ? <div className="card-flames">{[0,1,2,3,4].map(i=><i key={i} style={{'--flame-i':i}}/>)}</div> :
          bomb ? <><div className="card-explosion"/><div className="card-smoke">{[0,1,2].map(i=><i key={i} style={{'--smoke-i':i}}/>)}</div></> : null}
      </div>
      {hammer && <div className="card-hammer">🔨</div>}
      {reduced && bomb && <div className="card-reaction-hero">💣</div>}
      {!tomato && !hammer && !lightning && !fire && !bomb && <div className="card-reaction-hero">{reaction.emoji}</div>}
      {!reduced && <div className="card-impact-particles">{Array.from({length:tomato?10:8},(_,i)=>{
        const angle=i*Math.PI*2/(tomato?10:8);
        return <span key={i} style={{'--dx':`${Math.cos(angle)*65}px`,'--dy':`${hearts?-65-i*4:Math.sin(angle)*60}px`,'--turn':`${i*45}deg`,'--delay':`${i*.02}s`}}>{tomato?'':hearts?'♥':party?'▰':'✦'}</span>;
      })}</div>}
    </div>}
  </div>;
}

export default function EmojiPassAnimation() {
  const animations=useStore(state=>state.emojiAnimations);
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReduced(preference.matches);
    preference.addEventListener('change',update);
    return ()=>preference.removeEventListener('change',update);
  },[]);
  return <div className="reaction-overlay">{(animations||[]).slice(-6).map(reaction=><ReactionScene key={reaction.id} reaction={reaction} reduced={reduced}/>)}</div>;
}
