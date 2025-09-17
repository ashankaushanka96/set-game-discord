import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';
import emojiSoundManager from '../../utils/sounds';

// Cross-platform safe audio unlock for iOS/macOS/Windows
async function safeForceInitAudio() {
  try {
    if (emojiSoundManager && typeof emojiSoundManager.forceInit === 'function') {
      emojiSoundManager.forceInit();
      if (typeof emojiSoundManager.markUnlocked === 'function') emojiSoundManager.markUnlocked();
      return;
    }
  } catch (_) {}
  try {
    const mod = await import('../../utils/sounds');
    if (mod && typeof mod.forceInit === 'function') {
      mod.forceInit();
      if (typeof mod.markEmojiAudioUnlocked === 'function') mod.markEmojiAudioUnlocked();
      return;
    }
    if (mod && mod.default && typeof mod.default.forceInit === 'function') {
      mod.default.forceInit();
      if (mod.default && typeof mod.default.markUnlocked === 'function') mod.default.markUnlocked();
      return;
    }
  } catch (_) {}
  try {
    // Last-resort unlock: create a short, near-silent AudioContext tone on user gesture
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // inaudible
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.01);
    }
  } catch (_) { /* ignore */ }
}

// Curated emoji set for quick reactions (Ludo King style)
const QUICK_EMOJIS = [
  { emoji: '🔨', name: 'Hammer', category: 'attack', cooldown: 5000 },
  { emoji: '🍅', name: 'Tomato', category: 'attack', cooldown: 5000 },
  { emoji: '💣', name: 'Bomb', category: 'attack', cooldown: 5000 },
  { emoji: '⚡', name: 'Lightning', category: 'attack', cooldown: 5000 },
  { emoji: '🔥', name: 'Fire', category: 'attack', cooldown: 5000 },
  { emoji: '🎉', name: 'Party', category: 'celebration', cooldown: 3000 },
  { emoji: '🏆', name: 'Trophy', category: 'celebration', cooldown: 3000 },
  { emoji: '👑', name: 'Crown', category: 'celebration', cooldown: 3000 },
  { emoji: '😂', name: 'Laughing', category: 'reaction', cooldown: 2000 },
  { emoji: '👏', name: 'Clap', category: 'gesture', cooldown: 2000 },
  { emoji: '❤️', name: 'Heart', category: 'heart', cooldown: 2000 },
  { emoji: '👍', name: 'Thumbs Up', category: 'gesture', cooldown: 2000 }
];

export default function ReactionTray({ isOpen, onClose }) {
  const { me, state, ws } = useStore();
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [showPlayerSelection, setShowPlayerSelection] = useState(false);
  const [cooldowns, setCooldowns] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);
  const trayRef = useRef(null);

  // Get other players (excluding self)
  const otherPlayers = Object.values(state?.players || {}).filter(p => p.id !== me?.id && p.connected !== false);

  // Handle emoji selection
  const handleEmojiSelect = (emojiData) => {
    const now = Date.now();
    const lastUsed = cooldowns[emojiData.emoji] || 0;
    const timeLeft = emojiData.cooldown - (now - lastUsed);

    if (timeLeft > 0) {
      // Show cooldown feedback
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 200);
      return;
    }

    // Initialize/unlock audio context on first emoji selection (user gesture)
    safeForceInitAudio();

    setSelectedEmoji(emojiData);
    setShowPlayerSelection(true);
  };

  // Handle player selection and send emoji
  const handlePlayerSelect = (targetPlayer) => {
    if (selectedEmoji && ws) {
      // Update cooldown
      setCooldowns(prev => ({
        ...prev,
        [selectedEmoji.emoji]: Date.now()
      }));

      // Send emoji
      send(ws, 'emoji_throw', {
        from_player_id: me.id,
        to_player_id: targetPlayer.id,
        emoji: selectedEmoji.emoji,
        emoji_name: selectedEmoji.name,
        category: selectedEmoji.category
      });

      // Close tray
      setSelectedEmoji(null);
      setShowPlayerSelection(false);
      onClose();
    }
  };

  // Update cooldowns
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldowns(prev => {
        const now = Date.now();
        const updated = {};
        Object.entries(prev).forEach(([emoji, lastUsed]) => {
          const emojiData = QUICK_EMOJIS.find(e => e.emoji === emoji);
          if (emojiData && now - lastUsed < emojiData.cooldown) {
            updated[emoji] = lastUsed;
          }
        });
        return updated;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        ref={trayRef}
        className="bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-700/50 max-w-md w-full"
      >
        {!showPlayerSelection ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700/50">
              <h3 className="text-lg font-semibold text-white">Quick Reactions</h3>
              <button
                onClick={onClose}
                className="text-zinc-400 hover:text-white transition-colors p-1"
              >
                ✕
              </button>
            </div>

            {/* Emoji Grid */}
            <div className="p-4">
              <div className="grid grid-cols-6 gap-3">
                {QUICK_EMOJIS.map((emojiData, index) => {
                  const now = Date.now();
                  const lastUsed = cooldowns[emojiData.emoji] || 0;
                  const timeLeft = emojiData.cooldown - (now - lastUsed);
                  const isOnCooldown = timeLeft > 0;
                  const cooldownPercent = isOnCooldown ? (timeLeft / emojiData.cooldown) * 100 : 0;

                  return (
                    <button
                      key={index}
                      onClick={() => handleEmojiSelect(emojiData)}
                      disabled={isOnCooldown}
                      className={`
                        relative p-3 rounded-xl transition-all duration-200 transform
                        ${isOnCooldown 
                          ? 'opacity-50 cursor-not-allowed' 
                          : 'hover:scale-110 hover:bg-zinc-800/50 active:scale-95'
                        }
                        ${isAnimating && isOnCooldown ? 'animate-pulse' : ''}
                      `}
                      title={`${emojiData.name}${isOnCooldown ? ` (${Math.ceil(timeLeft/1000)}s)` : ''}`}
                    >
                      {/* Emoji */}
                      <div className="text-2xl mb-1">
                        {emojiData.emoji}
                      </div>

                      {/* Cooldown Ring */}
                      {isOnCooldown && (
                        <div className="absolute inset-0 rounded-xl overflow-hidden">
                          <div 
                            className="absolute inset-0 bg-zinc-800/30"
                            style={{
                              clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.cos((cooldownPercent / 100) * 2 * Math.PI - Math.PI/2)}% ${50 + 50 * Math.sin((cooldownPercent / 100) * 2 * Math.PI - Math.PI/2)}%, 50% 50%)`
                            }}
                          />
                        </div>
                      )}

                      {/* Category Indicator */}
                      <div className={`
                        absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-zinc-900
                        ${emojiData.category === 'attack' ? 'bg-red-500' :
                          emojiData.category === 'celebration' ? 'bg-yellow-500' :
                          emojiData.category === 'heart' ? 'bg-pink-500' :
                          'bg-blue-500'}
                      `} />
                    </button>
                  );
                })}
              </div>

              {/* Quick Target Hint */}
              <div className="mt-4 p-3 bg-zinc-800/30 rounded-lg">
                <p className="text-xs text-zinc-400 text-center">
                  💡 Tip: Select an emoji, then choose a target player to send it flying across the screen!
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Player Selection */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Send {selectedEmoji?.emoji} {selectedEmoji?.name}
                </h3>
                <button
                  onClick={() => {
                    setSelectedEmoji(null);
                    setShowPlayerSelection(false);
                  }}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                >
                  ← Back
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {otherPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerSelect(player)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
                  >
                    <div className="relative">
                      {typeof player.avatar === "string" && player.avatar.startsWith("http") ? (
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="w-8 h-8 rounded-full border border-zinc-600" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center text-sm">
                          {player.avatar}
                        </div>
                      )}
                      {state?.admin_player_id === player.id && (
                        <span className="absolute -top-1 -right-1 text-xs">👑</span>
                      )}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-white">{player.name}</div>
                      <div className="text-xs text-zinc-400">
                        {player.team ? `Team ${player.team}` : 'No team'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {otherPlayers.length === 0 && (
                <div className="text-center py-8 text-zinc-400">
                  <div className="text-4xl mb-2">👥</div>
                  <p>No other players to send reactions to</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
