// Cloudflare Pages Function: forwards /api/* (REST and WebSocket) to the backend VM,
// so the app's relative /api/v1 calls work on Pages exactly like they did behind nginx.
// Set BACKEND_ORIGIN in the Pages project settings to override the default.
const DEFAULT_BACKEND_ORIGIN = 'https://set-game-backend.ashankaushanka.dev';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN);
  // Passing the original request keeps method, headers, body and the WebSocket Upgrade
  return fetch(new Request(target, request));
}
