# Discord Integration Setup

This app is configured to run as a Discord Activity and automatically uses Discord usernames and avatars.

## Environment Variables Required

### Backend (.env) - **OPTIONAL**
The backend OAuth endpoint is available but not required for basic Discord integration. If you want to use OAuth features, create a `.env` file in the `backend/` directory with:
```
DISCORD_CLIENT_ID=1416307116918181931
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
```

### Frontend (.env) - **REQUIRED**
Create a `.env` file in the `frontend/` directory with:
```
VITE_DISCORD_CLIENT_ID=1416307116918181931
```

**⚠️ IMPORTANT**: Without these environment variables, the Discord integration will fail!

## How It Works

1. **Discord SDK Integration**: The app uses `@discord/embedded-app-sdk` to get user information directly
2. **Automatic Profile Loading**: When the app loads, it automatically:
   - Initializes the Discord SDK
   - Calls `discordSdk.commands.getUser()` to get user data
   - Sets the username from `user.global_name || user.username`
   - Sets the avatar using Discord's CDN URLs

3. **Avatar Handling**: The app properly handles both:
   - Discord avatar URLs (displayed as images)
   - Emoji avatars (displayed as text)

## Components Updated

All game components now properly display Discord avatars:
- `Lobby.jsx` - Player lists and team displays
- `Seat.jsx` - Game table seats
- `TurnBanner.jsx` - Current player indicator
- `MessageFeed.jsx` - Chat messages
- `LaydownModal.jsx` - Team member selection
- `Table.jsx` - Handoff buttons
- `ConfirmPassModal.jsx` - Player confirmations

## Discord App Configuration

To set up your Discord application:

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to OAuth2 settings
4. Add redirect URI: `https://discord.com` (required for embedded apps)
5. Copy the Client ID and Client Secret
6. Set up the embedded app in the Rich Presence settings

## Testing

The Discord integration will automatically work when:
1. The app is running as a Discord Activity
2. Environment variables are properly set
3. The Discord SDK can authenticate the user

If Discord authentication fails, the app falls back to manual profile creation.
