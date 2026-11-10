import { useId } from 'react';

export function Tomato() {
  const id = useId();
  return <svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id={id} cx="30%" cy="25%" r="75%"><stop stopColor="#ffaf6a"/><stop offset=".35" stopColor="#ef4934"/><stop offset=".75" stopColor="#c32025"/><stop offset="1" stopColor="#781d25"/></radialGradient></defs><path d="M50 23C31 12 10 29 11 53c0 25 18 38 39 37 25 2 41-17 40-39-1-25-22-35-40-28Z" fill={`url(#${id})`} stroke="#9b2524" strokeWidth="2"/><path d="m48 24-18-9 8 16-16 8 24-3 10 14 1-17 20-7-20-4 7-13-13 10-1-12Z" fill="#397044"/><path d="M51 25q-5-12 4-21" fill="none" stroke="#315a30" strokeWidth="5" strokeLinecap="round"/><ellipse cx="29" cy="43" rx="7" ry="12" fill="#ffe2ac" opacity=".35" transform="rotate(30 29 43)"/></svg>;
}

export function TomatoSplat() {
  return <svg viewBox="0 0 120 140" preserveAspectRatio="none" aria-hidden="true">
    <g fill="#b92923" fillOpacity=".88"><path d="m55 28 9-19 6 24 20-12-5 23 24 2-17 16 18 16-26 3 8 23-24-10-7 30-10-28-23 16 6-28-25-7 22-15-19-21 28 3-3-24Z"/><ellipse cx="59" cy="62" rx="33" ry="29"/></g>
    <path d="M37 69v45q0 11 5 11t5-11V78m25-7v54q0 8 4 8t4-8V73" stroke="#c93427" strokeWidth="6" strokeLinecap="round" fill="none"/>
    <path d="M37 47q18-18 39-3" stroke="#ff9b61" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" fill="none"/>
    <g fill="#f6c775"><ellipse cx="44" cy="62" rx="2" ry="4" transform="rotate(-30 44 62)"/><ellipse cx="68" cy="54" rx="2" ry="4"/><ellipse cx="62" cy="78" rx="2" ry="4" transform="rotate(35 62 78)"/></g>
  </svg>;
}
