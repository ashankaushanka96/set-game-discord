# Ludo King-Style Emoji Pass Animation System

## Overview
This system provides a comprehensive emoji reaction system similar to Ludo King, with flying animations, sound effects, and interactive features.

## Components

### 1. EmojiPassAnimation.jsx
- **Purpose**: Main animation component that handles emoji physics and visual effects
- **Features**:
  - Emoji-specific physics (spinning, arcing, impact effects)
  - Category-based animations (attack, celebration, reaction, heart)
  - Impact effects (sparkles, confetti, splats)
  - Accessibility support (reduce motion)
  - Performance optimized (60fps/30fps based on preferences)

### 2. ReactionTray.jsx
- **Purpose**: Quick reaction interface for selecting and sending emojis
- **Features**:
  - Curated emoji set (12 most popular emojis)
  - Cooldown system with visual feedback
  - Player selection interface
  - Category indicators
  - Mobile-responsive design

### 3. EmojiSettings.jsx
- **Purpose**: Settings panel for emoji preferences
- **Features**:
  - Sound toggle
  - Animation toggle
  - Reduce motion toggle
  - Persistent settings (localStorage)
  - Accessibility information

### 4. sounds.js
- **Purpose**: Sound effect management system
- **Features**:
  - Web Audio API-based synthetic sounds
  - Emoji-specific sound mapping
  - Volume control
  - Mute functionality
  - Graceful fallback for unsupported browsers

## Emoji Categories & Behaviors

### Attack Emojis (5s cooldown)
- **🔨 Hammer**: Spins through air, "bonk" impact with shake effect
- **🍅 Tomato**: Arcs and splats, leaves messy decal
- **💣 Bomb**: Explosion effect with particles
- **⚡ Lightning**: Instant zigzag path, electric impact
- **🔥 Fire**: Flickering trail, burn effect

### Celebration Emojis (3s cooldown)
- **🎉 Party**: Confetti burst on impact
- **🏆 Trophy**: Sparkles and victory sound
- **👑 Crown**: Royal sparkles
- **💎 Diamond**: Gem sparkles

### Reaction Emojis (2s cooldown)
- **😂 Laughing**: Bouncy animation
- **👏 Clap**: Burst effect
- **❤️ Heart**: Heart particles
- **👍 Thumbs Up**: Simple bounce

## Integration Points

### Table.jsx
- Reaction button (purple gradient)
- Settings button (gear icon)
- EmojiPassAnimation component
- ReactionTray and EmojiSettings modals

### Store.js
- Sound integration in emoji_animation handler
- Dynamic import for sound system

## Accessibility Features

1. **Reduce Motion**: Respects system preferences
2. **Visual Cooldowns**: Clear feedback for disabled states
3. **Keyboard Navigation**: Escape key support
4. **Screen Reader**: Proper ARIA labels and titles
5. **High Contrast**: Clear visual indicators

## Performance Optimizations

1. **RequestAnimationFrame**: Smooth 60fps animations
2. **Concurrent Limits**: Max 8 emojis (4 with reduced motion)
3. **Dynamic Imports**: Sound system loaded on demand
4. **Efficient Cleanup**: Automatic removal of completed animations
5. **Mobile Optimization**: Reduced complexity on smaller devices

## Usage

### Sending Emojis
1. Click the "Reactions" button (purple)
2. Select an emoji from the grid
3. Choose target player
4. Emoji flies across screen with sound

### Settings
1. Click the gear icon (top right)
2. Toggle sound, animations, or reduce motion
3. Settings persist across sessions

### Keyboard Shortcuts
- **Escape**: Close reaction tray or settings
- **Tab**: Navigate through interface elements

## Technical Details

### Animation Physics
- **Easing**: Category-specific easing functions
- **Arcs**: Configurable arc heights per emoji
- **Rotation**: Spin speeds based on emoji type
- **Impact**: Scale and effect variations

### Sound System
- **Synthesis**: Web Audio API for consistent playback
- **Assets Override**: Drop MP3s into `frontend/public/sounds/<key>.mp3` to override synth per key
- **Mapping**: Each emoji has unique sound signature
- **Fallback**: Graceful degradation for unsupported browsers (assets -> synth)

Keys supported for asset files:
`bonk, splat, crack, explosion, zap, whoosh, freeze, party, confetti, victory, medal, royal, sparkle, laugh, clap, heart, gentle, default`.

All clients in a Discord Activity receive the same emoji event and resolve to the same sound key, ensuring the same sound plays for everyone.

### State Management
- **Cooldowns**: Per-emoji cooldown tracking
- **Settings**: Persistent user preferences
- **Animations**: Real-time animation state

## Future Enhancements

1. **Custom Emoji Sets**: User-defined emoji collections
2. **Emoji Packs**: Themed emoji sets (seasonal, special events)
3. **Advanced Physics**: More complex particle systems
4. **Voice Integration**: Discord voice channel reactions
5. **Analytics**: Emoji usage tracking and insights
