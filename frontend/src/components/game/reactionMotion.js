export function reactionMotion(emoji, from, to) {
  const dx = to.x-from.x, dy = to.y-from.y;
  const distance = Math.hypot(dx,dy);
  const direction = dx < 0 ? -1 : 1;
  const angle = Math.atan2(dy,dx)*180/Math.PI;
  const kind = ({'🔨':'hammer','🍅':'tomato','💣':'bomb','⚡':'lightning','🔥':'fire','❤️':'heart','🎉':'party','🏆':'trophy','👑':'crown','😂':'laugh','👏':'clap','👍':'thumb'})[emoji] || 'cheer';
  const duration = kind === 'lightning' ? 260 : Math.min(950,Math.max(580,distance*.45+420));
  const arc = ['tomato','bomb'].includes(kind) ? Math.min(150,distance*.23) : kind==='hammer' ? 55 : kind==='heart' ? 35 : 18;
  const frames = Array.from({length:17},(_,i) => {
    const t=i/16;
    const x=from.x+dx*t;
    const y=from.y+dy*t-4*arc*t*(1-t);
    const rotate = kind==='hammer' ? angle+45+direction*(-35+35*t) : kind==='bomb' ? direction*t*300 : kind==='tomato' ? direction*t*210 : kind==='fire' ? angle+90 : kind==='lightning' ? angle-45 : Math.sin(t*Math.PI)*direction*10;
    const scale = .9 + .1*Math.sin(t*Math.PI/2);
    return {transform:`translate3d(${x}px,${y}px,0) rotate(${rotate}deg) scale(${scale})`,opacity:1,offset:t};
  });
  return {kind,direction,angle,duration,frames};
}
