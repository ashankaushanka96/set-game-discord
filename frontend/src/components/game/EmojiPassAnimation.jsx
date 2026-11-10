import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Tomato, TomatoSplat } from './ReactionArtwork';
import { reactionMotion } from './reactionMotion';

function Hammer() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 54 40 24" stroke="#5d351c" strokeWidth="11" strokeLinecap="round"/><path d="M14 52 39 24" stroke="#c38c4d" strokeWidth="7" strokeLinecap="round"/><path d="m27 14 10-10 22 19-9 11-8-7-8 7-7-6 7-8Z" fill="#b9c3c9" stroke="#596773" strokeWidth="2"/><path d="m37 7 17 15" stroke="#f3f5f6" strokeWidth="3"/></svg>;
}

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
  const [direction,setDirection] = useState(1);
  const tomato = reaction.emoji === '🍅';
  const hammer = reaction.emoji === '🔨';
  const bomb = reaction.emoji === '💣';
  const lightning = reaction.emoji === '⚡';
  const fire = reaction.emoji === '🔥';
  const hearts = reaction.category === 'heart';
  const party = reaction.category === 'celebration';
  const kind = reactionMotion(reaction.emoji,{x:0,y:0},{x:1,y:0}).kind;

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
    const motion = reactionMotion(reaction.emoji,from,to);
    setDirection(motion.direction);
    const duration = reduced || self ? 0 : motion.duration;
    let flight;
    if (duration && projectile.current) {
      flight = projectile.current.animate(motion.frames,{duration,easing:'cubic-bezier(.2,.55,.35,1)',fill:'both'});
    }
    let hit;
    const timer = setTimeout(() => {
      setLanded(true);
      if (!reduced && (tomato || hammer || bomb)) hit = toSeat.animate([
        {transform:'translateX(0) rotate(0)'},{transform:`translateX(${motion.direction*5}px) rotate(${motion.direction*3}deg)`},
        {transform:`translateX(${-motion.direction*2}px) rotate(${-motion.direction}deg)`},{transform:'translateX(0) rotate(0)'},{transform:'translateX(0) rotate(0)'},
      ],{duration:350,easing:'ease-out'});
    },duration);
    return () => { clearTimeout(timer); flight?.cancel(); hit?.cancel(); observer.disconnect(); window.removeEventListener('resize',update); window.removeEventListener('scroll',update,true); };
  }, [reaction.id, reaction.from_player_id, reaction.to_player_id, reduced, tomato, hammer, bomb]);

  return <div className={`reaction-scene ${reduced ? 'reaction-scene--reduced' : ''}`} aria-hidden="true">
    {!landed && !reduced && <div ref={projectile} className="reaction-projectile">{tomato ? <Tomato/> : hammer ? <Hammer/> : <span>{reaction.emoji}</span>}</div>}
    {landed && target && <div className={`reaction-on-card reaction-on-card--${kind}`} style={{...target,'--impact-direction':direction}}>
      <div className="reaction-card-decal" style={{borderRadius:target.borderRadius}}>
        {tomato ? <div className="tomato-splat"><TomatoSplat/></div> :
          lightning ? <svg className="card-lightning" viewBox="0 0 100 140"><path d="m64 0-38 64 27-5-18 81 45-94-29 6Z" fill="#ffdf87" stroke="#fff5ce" strokeWidth="2"/></svg> :
          fire ? <div className="card-flames">{[0,1,2,3,4].map(i=><i key={i} style={{'--flame-i':i}}/>)}</div> :
          bomb ? <><div className="card-explosion"/><div className="card-smoke">{[0,1,2].map(i=><i key={i} style={{'--smoke-i':i}}/>)}</div></> : null}
      </div>
      {hammer && <div className="directional-hammer" style={{transform:`scaleX(${direction})`}}><div className="card-hammer"><Hammer/></div></div>}
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
