import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../cards/Card';
import { mergeReceivedCards, removePassedCards } from './receivedCards';
import { useStore } from '../../store';

// Turn Play: a received card stays on the seat as long as a seat bubble does.
const TURN_PLAY_SHOW_MS = 5000;
const elementFor = (seats,id) => seats.current[id]?.querySelector('.game-seat') || seats.current[id];
const center = element => { const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}; };
function CardFan({cards}) {
  const shown=cards.slice(-6);
  return <div className="received-card-fan">{shown.map((card,i)=><div key={`${card.suit}-${card.rank}`} style={{transform:`translate(-50%,-50%) translateX(${(i-(shown.length-1)/2)*15}px) rotate(${(i-(shown.length-1)/2)*5}deg)`}}><Card {...card} size="sm"/></div>)}{cards.length>1 && <span className="received-card-fan__count">{cards.length}</span>}</div>;
}
function CardFlight({packet,onLand}) {
  const ref=useRef(null);
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced ? 120:650;
    const animation=ref.current.animate([
      {transform:`translate3d(${packet.from.x}px,${packet.from.y}px,0)`,opacity:reduced ? 0:1},
      {transform:`translate3d(${packet.to.x}px,${packet.to.y}px,0)`,opacity:1},
    ],{duration,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
    const timer=setTimeout(()=>onLand(packet),duration);
    return ()=>{animation.cancel();clearTimeout(timer)};
  },[packet,onLand]);
  return <div ref={ref} className="passed-card-flight"><CardFan cards={packet.cards}/></div>;
}
function ReceivedFan({id,cards,seatEls}) {
  const [point,setPoint]=useState(null);
  useEffect(()=>{
    const element=elementFor(seatEls,id);
    if(!element)return;
    const update=()=>setPoint(center(element));
    update();
    const observer=new ResizeObserver(update);observer.observe(element);
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return ()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)};
  },[id,seatEls]);
  return point && <div className="received-card-stack" style={{left:point.x,top:point.y}}><CardFan cards={cards}/></div>;
}
export default function PassedCardsAnimation({seatEls,phase}) {
  const [flights,setFlights]=useState([]);
  const [received,setReceived]=useState({});
  const timers=useRef(new Map());
  const sequence=useRef(0);
  const land=useCallback(packet=>{
    setFlights(prev=>prev.filter(f=>f.id!==packet.id));
    // A recipient can pass a card onward before its incoming flight finishes.
    const hand=useStore.getState().state?.players?.[packet.recipient]?.hand;
    const held=Array.isArray(hand) ? packet.cards.filter(card=>hand.some(c=>c.suit===card.suit && c.rank===card.rank)):packet.cards;
    if(!held.length)return;
    setReceived(prev=>({...prev,[packet.recipient]:mergeReceivedCards(prev[packet.recipient],held)}));
    clearTimeout(timers.current.get(packet.recipient));
    timers.current.set(packet.recipient,setTimeout(()=>{
      setReceived(prev=>{const next={...prev};delete next[packet.recipient];return next});
      timers.current.delete(packet.recipient);
    },useStore.getState().state?.game_mode==='turns' ? TURN_PLAY_SHOW_MS:15000));
  },[]);
  useEffect(()=>{
    setFlights([]);setReceived({});
    const onPass=event=>{
      if(phase!=='playing')return;
      const {from_player,to_player,cards}=event.detail || {};
      if(!cards?.length)return;
      const from=elementFor(seatEls,from_player),to=elementFor(seatEls,to_player);
      if(!from || !to)return;
      setReceived(prev=>({...prev,[from_player]:removePassedCards(prev[from_player],cards)}));
      // Every pass gets an independent flight; new events never reset old timers.
      const packet={id:++sequence.current,recipient:to_player,cards:mergeReceivedCards([],cards),from:center(from),to:center(to)};
      setFlights(prev=>[...prev,packet]);
    };
    const dismiss=()=>{setReceived({});for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear()};
    window.addEventListener('pass_anim',onPass);window.addEventListener('dismiss_passed_cards',dismiss);
    return ()=>{window.removeEventListener('pass_anim',onPass);window.removeEventListener('dismiss_passed_cards',dismiss);for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear()};
  },[phase,seatEls]);
  return createPortal(<div className="passed-cards-overlay" aria-hidden="true">
    {Object.entries(received).filter(([,cards])=>cards.length).map(([id,cards])=><ReceivedFan key={id} id={id} cards={cards} seatEls={seatEls}/>)}
    {flights.map(packet=><CardFlight key={packet.id} packet={packet} onLand={land}/>)}
  </div>,document.body);
}
