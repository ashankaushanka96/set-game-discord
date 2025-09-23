import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { send } from '../../ws';
import ReactionTray from './ReactionTray';

const EMOJIS = [
  // Special Ludo-style emojis
  { emoji: '🔨', name: 'Hammer', category: 'attack' },
  { emoji: '🍅', name: 'Tomato', category: 'attack' },
  { emoji: '🥚', name: 'Egg', category: 'attack' },
  { emoji: '💣', name: 'Bomb', category: 'attack' },
  { emoji: '⚡', name: 'Lightning', category: 'attack' },
  { emoji: '🔥', name: 'Fire', category: 'attack' },
  { emoji: '❄️', name: 'Ice', category: 'attack' },
  { emoji: '💨', name: 'Wind', category: 'attack' },
  
  // Celebration emojis
  { emoji: '🎉', name: 'Party', category: 'celebration' },
  { emoji: '🎊', name: 'Confetti', category: 'celebration' },
  { emoji: '🏆', name: 'Trophy', category: 'celebration' },
  { emoji: '🥇', name: 'Gold Medal', category: 'celebration' },
  { emoji: '👑', name: 'Crown', category: 'celebration' },
  { emoji: '💎', name: 'Diamond', category: 'celebration' },
  { emoji: '🌟', name: 'Star', category: 'celebration' },
  { emoji: '✨', name: 'Sparkles', category: 'celebration' },
  
  // Reaction emojis
  { emoji: '😀', name: 'Happy', category: 'reaction' },
  { emoji: '😂', name: 'Laughing', category: 'reaction' },
  { emoji: '😍', name: 'Love', category: 'reaction' },
  { emoji: '🤩', name: 'Star Eyes', category: 'reaction' },
  { emoji: '😎', name: 'Cool', category: 'reaction' },
  { emoji: '🤔', name: 'Thinking', category: 'reaction' },
  { emoji: '😏', name: 'Smirk', category: 'reaction' },
  { emoji: '😤', name: 'Huffing', category: 'reaction' },
  { emoji: '😡', name: 'Angry', category: 'reaction' },
  { emoji: '😢', name: 'Crying', category: 'reaction' },
  { emoji: '😱', name: 'Screaming', category: 'reaction' },
  { emoji: '🤯', name: 'Mind Blown', category: 'reaction' },
  
  // Gesture emojis
  { emoji: '👍', name: 'Thumbs Up', category: 'gesture' },
  { emoji: '👎', name: 'Thumbs Down', category: 'gesture' },
  { emoji: '👌', name: 'OK', category: 'gesture' },
  { emoji: '✌️', name: 'Peace', category: 'gesture' },
  { emoji: '🤞', name: 'Cross Fingers', category: 'gesture' },
  { emoji: '🤘', name: 'Rock On', category: 'gesture' },
  { emoji: '👋', name: 'Wave', category: 'gesture' },
  { emoji: '👏', name: 'Clap', category: 'gesture' },
  { emoji: '🙌', name: 'Raise Hands', category: 'gesture' },
  { emoji: '🤜', name: 'Fist Bump', category: 'gesture' },
  { emoji: '✊', name: 'Fist', category: 'gesture' },
  { emoji: '👊', name: 'Punch', category: 'gesture' },
  
  // Heart emojis
  { emoji: '❤️', name: 'Red Heart', category: 'heart' },
  { emoji: '🧡', name: 'Orange Heart', category: 'heart' },
  { emoji: '💛', name: 'Yellow Heart', category: 'heart' },
  { emoji: '💚', name: 'Green Heart', category: 'heart' },
  { emoji: '💙', name: 'Blue Heart', category: 'heart' },
  { emoji: '💜', name: 'Purple Heart', category: 'heart' },
  { emoji: '🖤', name: 'Black Heart', category: 'heart' },
  { emoji: '🤍', name: 'White Heart', category: 'heart' },
  { emoji: '💕', name: 'Two Hearts', category: 'heart' },
  { emoji: '💖', name: 'Sparkling Heart', category: 'heart' },
  { emoji: '💗', name: 'Growing Heart', category: 'heart' },
  { emoji: '💘', name: 'Heart Arrow', category: 'heart' }
];

export default function ChatBubble({ selectedCardsToPass = [] }) {
  const { me, state } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [showPlayerSelection, setShowPlayerSelection] = useState(false);
  const [activeCategory, setActiveCategory] = useState('attack');
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);

  const players = state?.players || {};
  const otherPlayers = Object.values(players).filter(p => p.id !== me.id);

  const categories = ['attack', 'celebration', 'reaction', 'gesture', 'heart'];

  const handleSendMessage = () => {
    if (message.trim()) {
      send(useStore.getState().ws, 'chat_message', {
        player_id: me.id,
        text: message.trim()
      });
      setMessage('');
    }
  };

  const handleEmojiSelect = (emojiData) => {
    setSelectedEmoji(emojiData);
    setShowEmojis(false);
    setShowPlayerSelection(true);
  };

  const handlePlayerSelect = (targetPlayer) => {
    if (selectedEmoji) {
      send(useStore.getState().ws, 'emoji_throw', {
        from_player_id: me.id,
        to_player_id: targetPlayer.id,
        emoji: selectedEmoji.emoji,
        emoji_name: selectedEmoji.name,
        category: selectedEmoji.category
      });
    }
    setSelectedEmoji(null);
    setShowPlayerSelection(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleChatButtonClick = () => {
    if (!isOpen) {
      // When opening chat, show the reaction tray
      setReactionTrayOpen(true);
    } else {
      // When closing chat, close everything
      setIsOpen(false);
      setShowEmojis(false);
      setShowPlayerSelection(false);
      setSelectedEmoji(null);
    }
  };

  if (!me) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Chat Toggle Button */}
      <button
        onClick={handleChatButtonClick}
        className="bg-white/10 backdrop-blur-xl border border-white/20 text-white p-3 rounded-full shadow-lg hover:bg-white/20 transition-all duration-200"
        title="Emojis & Chat"
      >
        💬
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="absolute bottom-12 left-0 w-80">
          {/* Glassmorphism backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm rounded-xl" />
          
          {/* Floating liquid effect */}
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-accent-blue/10 via-accent-purple/5 to-accent-cyan/10 rounded-full blur-3xl liquid-bg-1" />
            <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-pink/10 via-accent-emerald/5 to-accent-amber/10 rounded-full blur-3xl liquid-bg-2" />
          </div>

          {/* Chat container */}
          <div 
            className="relative backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl glassmorphism-modal"
            style={{
              background: `
                linear-gradient(135deg, 
                  rgba(255, 255, 255, 0.05) 0%, 
                  rgba(255, 255, 255, 0.02) 50%, 
                  rgba(255, 255, 255, 0.01) 100%
                ),
                radial-gradient(circle at 30% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)
              `,
              boxShadow: `
                0 25px 50px -12px rgba(0, 0, 0, 0.15),
                0 0 0 1px rgba(255, 255, 255, 0.05),
                inset 0 1px 0 rgba(255, 255, 255, 0.05)
              `
            }}
          >
            {/* Inner glow effect */}
            <div 
              className="absolute inset-0 rounded-xl"
              style={{
                background: `
                  radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%),
                  linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%)
                `
              }}
            />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between p-3 border-b border-white/20">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Emojis</h3>
                <button
                  onClick={() => setShowEmojis(!showEmojis)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    showEmojis 
                      ? 'bg-white/20 text-white' 
                      : 'bg-white/10 text-white/70 hover:bg-white/15'
                  }`}
                >
                  😀
                </button>
                <button
                  onClick={() => {
                    setShowEmojis(false);
                    setShowPlayerSelection(false);
                    setSelectedEmoji(null);
                  }}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    !showEmojis && !showPlayerSelection
                      ? 'bg-white/20 text-white' 
                      : 'bg-white/10 text-white/70 hover:bg-white/15'
                  }`}
                >
                  💬
                </button>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowEmojis(false);
                  setShowPlayerSelection(false);
                  setSelectedEmoji(null);
                }}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Player Selection */}
            {showPlayerSelection && selectedEmoji && (
              <div className="relative z-10 p-3 border-b border-white/20">
                <div className="text-sm text-white mb-2">
                  Select target for {selectedEmoji.emoji} {selectedEmoji.name}:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {otherPlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handlePlayerSelect(player)}
                      className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 text-white px-3 py-2 rounded transition-all duration-200"
                    >
                      {typeof player.avatar === "string" && player.avatar.startsWith("http") ? (
                        <img 
                          src={player.avatar} 
                          alt={player.name} 
                          className="h-6 w-6 rounded-full border border-white/30" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-lg">{player.avatar}</span>
                      )}
                      <span className="text-sm">{player.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setShowPlayerSelection(false);
                    setSelectedEmoji(null);
                  }}
                  className="mt-2 text-xs text-white/70 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Emoji Picker */}
            {showEmojis && (
              <div className="relative z-10 p-3 border-b border-white/20 max-h-60 overflow-y-auto">
                {/* Category Tabs */}
                <div className="flex gap-1 mb-3">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveCategory(category)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        activeCategory === category 
                          ? 'bg-white/20 text-white' 
                          : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                
                {/* Emoji Grid */}
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.filter(emoji => emoji.category === activeCategory).map((emojiData, index) => (
                    <button
                      key={index}
                      onClick={() => handleEmojiSelect(emojiData)}
                      className="text-lg hover:bg-white/10 rounded p-1 transition-colors"
                      title={emojiData.name}
                    >
                      {emojiData.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input - Only show when not in emoji mode */}
            {!showEmojis && !showPlayerSelection && (
              <div className="relative z-10 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/10 backdrop-blur-sm text-white px-3 py-2 rounded border border-white/20 focus:border-white/40 focus:outline-none text-sm placeholder-white/50"
                    maxLength={100}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                    className="bg-white/10 backdrop-blur-sm hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed text-white px-3 py-2 rounded transition-all duration-200 border border-white/20 disabled:border-white/10"
                    title="Send"
                  >
                    Send
                  </button>
                </div>
                <div className="text-xs text-white/70 mt-1">
                  {message.length}/100 characters
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reaction Tray */}
      <ReactionTray 
        isOpen={reactionTrayOpen}
        onClose={() => setReactionTrayOpen(false)}
        selectedCardsToPass={selectedCardsToPass}
      />
    </div>
  );
}
