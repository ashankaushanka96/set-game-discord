import { useState } from 'react';
import { useStore } from '../store';

const AVATARS = ['🦊','🐼','🐸','🐯','🐵','🐱','🐶','🦁','🐨','🐷'];

export default function AvatarPicker(){
  const { setMe } = useStore();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Create Player</h1>
      <input className="w-full px-3 py-2 rounded bg-zinc-800" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} />
      <div className="grid grid-cols-10 gap-2">
        {AVATARS.map(a=> (
          <button key={a} onClick={()=>setAvatar(a)} className={`text-2xl p-2 rounded ${avatar===a?'bg-emerald-600':'bg-zinc-800'}`}>{a}</button>
        ))}
      </div>
      <button
        disabled={!name}
        onClick={()=>{
          const id = crypto.randomUUID();
          setMe({ id, name, avatar }); // writes to sessionStorage
        }}
        className="px-4 py-2 rounded bg-emerald-600 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
