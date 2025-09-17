# Emoji Sound Files Download Guide

## Current Status
- Volume boosted from 0.7 to 1.0 (maximum)
- Individual sound multipliers enhanced
- Placeholder files created in `frontend/public/sounds/`
- Need to replace placeholder `.txt` files with actual `.mp3` files

## Required Sound Files

Download these 12 MP3 files and place them in `frontend/public/sounds/emoji/`:

| File Name | Emoji | Description | Recommended Search Terms |
|-----------|-------|-------------|--------------------------|
| `bonk.mp3` | 🔨 | Hammer impact | "hammer hit", "metal clang" |
| `splat.mp3` | 🍅 | Tomato splat | "splat", "splash", "wet impact" |
| `explosion.mp3` | 💣 | Bomb explosion | "explosion", "blast", "boom" |
| `zap.mp3` | ⚡ | Lightning zap | "electric zap", "lightning" |
| `whoosh.mp3` | 🔥 | Fire whoosh | "whoosh", "flame", "air movement" |
| `party.mp3` | 🎉 | Party celebration | "party horn", "celebration" |
| `victory.mp3` | 🏆 | Victory fanfare | "victory", "fanfare" |
| `royal.mp3` | 👑 | Royal flourish | "royal", "majestic" |
| `laugh.mp3` | 😂 | Laugh sound | "laugh", "giggle" |
| `clap.mp3` | 👏 | Applause | "applause", "clap" |
| `heart.mp3` | ❤️ | Heartbeat | "heartbeat", "heart", "pulse" |
| `gentle.mp3` | 👍 | Gentle chime | "gentle", "soft chime" |

## Best Free Sound Sources

### 1. Mixkit (Recommended)
- **URL**: https://mixkit.co/free-sound-effects/
- **Quality**: High
- **License**: Free for commercial use
- **Format**: MP3, WAV
- **How to**: Browse categories, click download, no account needed

### 2. Freesound
- **URL**: https://freesound.org/
- **Quality**: Variable (very high to low)
- **License**: Creative Commons (check individual licenses)
- **Format**: Various
- **How to**: Create free account, search, download

### 3. Zapsplat
- **URL**: https://www.zapsplat.com/
- **Quality**: Professional
- **License**: Free with attribution (or paid for commercial)
- **Format**: MP3, WAV
- **How to**: Create free account, search, download

### 4. SoundBible
- **URL**: http://soundbible.com/
- **Quality**: Good
- **License**: Various (check individual files)
- **Format**: MP3, WAV
- **How to**: Search, click download

## Download Instructions

1. Visit one of the sound sources above.
2. Search for each sound type using the recommended search terms.
3. Download the MP3 files (prefer MP3 for web compatibility).
4. Rename files to match the exact names listed above.
5. Place files in the `frontend/public/sounds/emoji/` directory.
6. Remove the placeholder `.txt` files after adding real sounds.

## Quick Start (Mixkit)

1. Go to https://mixkit.co/free-sound-effects/
2. Browse categories like:
   - "UI Sounds" for bonk, clap, gentle
   - "Cartoon" for splat, laugh, party
   - "Music" for victory, royal
   - "Nature" for whoosh, zap
3. Download and rename files as needed

## Testing

After adding the sound files:
1. Start your game.
2. Send a reaction emoji from the tray.
3. The sounds should now use the actual MP3 files.
4. If a sound file is missing, it will play silently.

## File Size Recommendations

- Keep files under 100KB each for fast loading.
- Use MP3 format for best web compatibility.
- Prefer shorter clips (1-2 seconds) for better user experience.

## Troubleshooting

- **No sound**: Check browser audio permissions.
- **Still quiet**: Confirm the MP3 replaced the placeholder file.
- **Wrong sound**: Check file names match exactly.
- **Loading issues**: Ensure files are in the expected directory path.

