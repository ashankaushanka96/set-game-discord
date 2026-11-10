import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../cards/Card';

function GatheringCard({item}) {
  const ref=useRef(null);
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation=ref.current.animate([
      {transform:`translate(${item.from.x}px,${item.from.y}px) rotate(0deg) scale(.65)`,opacity:0},
      {transform:`translate(${item.from.x}px,${item.from.y-16}px) rotate(-6deg) scale(.9)`,opacity:1,offset:.15},
      {transform:`translate(${item.to.x}px,${item.to.y}px) rotate(${item.angle}deg) scale(1)`,opacity:1},
    ],{duration:reduced?80:650,delay:reduced?0:item.index*35,easing:'cubic-bezier(.2,.75,.2,1)',fill:'both'});
    return ()=>animation.cancel();
  },[item]);
  return <div ref={ref} className="laydown-flight"><div><Card suit={item.suit} rank={item.rank} size="md"/></div></div>;
}
export default function LaydownAnimation({seatEls,tableCenterRef}) {
  const [scene,setScene]=useState(null);
  const timer=useRef(null);
  useEffect(()=>{
    const reveal=event=>{
      const {contributors=[],success}=event.detail||{};
      const center=tableCenterRef.current?.getBoundingClientRect();
      if(!center)return;
      const cards=[];
      for(const contributor of contributors){
        const wrapper=seatEls.current[contributor.player_id];
        const seat=wrapper?.querySelector('.game-seat')||wrapper;
        if(!seat)continue;
        const r=seat.getBoundingClientRect();
        for(const card of contributor.cards||[]) cards.push({...card,from:{x:r.left+r.width/2,y:r.top+r.height/2}});
      }
      if(!cards.length)return;
      const items=cards.map((card,index)=>({...card,index,angle:(index-(cards.length-1)/2)*4,to:{x:center.left+center.width/2+(index-(cards.length-1)/2)*25,y:center.top+center.height/2}}));
      clearTimeout(timer.current);
      setScene({id:Date.now(),items,success,x:center.left+center.width/2,y:center.top+center.height/2});
      timer.current=setTimeout(()=>setScene(null),window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120:1050);
    };
    window.addEventListener('lay_anim',reveal);
    return ()=>{window.removeEventListener('lay_anim',reveal);clearTimeout(timer.current)};
  },[seatEls,tableCenterRef]);
  return scene && createPortal(<div className={`laydown-reveal ${scene.success ? 'laydown-reveal--success' : 'laydown-reveal--failed'}`} aria-hidden="true" key={scene.id}>
    <div className="laydown-reveal__glow" style={{left:scene.x,top:scene.y}}/>
    {scene.items.map((item,i)=><GatheringCard key={i} item={item}/>)}
    <div className="laydown-reveal__caption" style={{left:scene.x,top:scene.y+74}}>{scene.success ? 'A set, beautifully played.' : 'Let’s check the declaration.'}</div>
  </div>,document.body);
}
