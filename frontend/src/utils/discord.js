// src/utils/discord.js
export function discordAvatarUrl(id, avatar, size = 128) {
    if (avatar) {
      const isGif = avatar.startsWith("a_");
      const ext = isGif ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=${size}`;
    }
    // Default avatar index is userId % 5
    try {
      const mod = window.BigInt
        ? Number(BigInt(id) % 5n)
        : [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
      return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
    } catch (_) {
      return `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
  }
  