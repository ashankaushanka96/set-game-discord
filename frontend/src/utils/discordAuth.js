// Discord authentication token management utilities

export const DISCORD_TOKEN_KEY = 'discord_token';

export const getStoredDiscordToken = () => {
  try {
    const stored = localStorage.getItem(DISCORD_TOKEN_KEY);
    if (!stored) return null;
    const tokenData = JSON.parse(stored);
    // Check if token is expired (with 5 minute buffer)
    if (Date.now() > tokenData.expires_at - 300000) {
      localStorage.removeItem(DISCORD_TOKEN_KEY);
      return null;
    }
    return tokenData;
  } catch {
    localStorage.removeItem(DISCORD_TOKEN_KEY);
    return null;
  }
};

export const storeDiscordToken = (accessToken, expiresIn = 604800) => { // Default 7 days
  try {
    const tokenData = {
      access_token: accessToken,
      expires_at: Date.now() + (expiresIn * 1000),
      stored_at: Date.now()
    };
    localStorage.setItem(DISCORD_TOKEN_KEY, JSON.stringify(tokenData));
    return true;
  } catch (error) {
    console.warn('Failed to store Discord token:', error);
    return false;
  }
};

export const clearStoredDiscordToken = () => {
  try {
    localStorage.removeItem(DISCORD_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
};

export const fetchDiscordUser = async (accessToken) => {
  try {
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      if (meRes.status === 401) {
        return { error: 'TOKEN_EXPIRED' };
      }
      throw new Error(`users/@me failed: ${meRes.status}`);
    }
    return await meRes.json();
  } catch (error) {
    return { error: error.message };
  }
};
