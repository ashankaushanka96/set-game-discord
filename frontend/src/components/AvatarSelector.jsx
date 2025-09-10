import { useState, useEffect, useRef } from 'react';

const AVATARS = [
  '🦊','🐼','🐸','🐯','🐵','🐱','🐶','🦁','🐨','🐷',
  '🔥','⚡','🌟','💎','🎯','🎮','🏆','🎨','🎭','🎪',
  '🚀','⚽','🏀','🎲','🎸','🎺','🎻','🎹','🎤','🎧'
];

export default function AvatarSelector({ selectedAvatar, onAvatarSelect, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <label className="block text-sm mb-1">Avatar</label>
      
      {/* Selected Avatar Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-zinc-800 rounded px-3 py-2 flex items-center justify-between hover:bg-zinc-700 transition-colors"
      >
        <span className="text-2xl">{selectedAvatar}</span>
        <span className="text-zinc-400">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Avatar Grid */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-800 rounded-lg p-2 shadow-xl border border-zinc-700 z-[9999]">
          <div className="grid grid-cols-6 gap-1 max-h-24 overflow-y-auto">
            {AVATARS.map((avatar) => (
              <button
                key={avatar}
                onClick={() => {
                  onAvatarSelect(avatar);
                  setIsOpen(false);
                }}
                className={`text-lg p-1 rounded transition-colors ${
                  selectedAvatar === avatar
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
                title={avatar}
              >
                {avatar}
              </button>
            ))}
          </div>
          
          {/* Custom Avatar Input */}
          <div className="mt-2 pt-2 border-t border-zinc-700">
            <label className="block text-xs text-zinc-400 mb-1">Custom</label>
            <input
              type="text"
              placeholder="Emoji..."
              className="w-full bg-zinc-700 rounded px-2 py-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  onAvatarSelect(e.target.value.trim());
                  setIsOpen(false);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
