// config.ts
// Usage expectations for VITE_API_BASE (in .env):
// - Can be a full URL (https://api.example.com or http://10.0.0.5:8000)
// - Or just host[:port][/path] (api.example.com, 10.0.0.5:8000, api.example.com/v1)

const resolveApiAndWs = () => {
  const raw = import.meta.env.VITE_API_BASE?.trim();
  if (!raw) throw new Error('VITE_API_BASE is not set');

  // If someone passed ws/wss, normalize to http/https first
  const normalized = raw.replace(/^wss?:\/\//i, (m) => (m.toLowerCase() === 'wss://' ? 'https://' : 'http://'));

  // If no protocol provided, use the current page's protocol
  const withProtocol =
    /^https?:\/\//i.test(normalized) ? normalized : `${window.location.protocol}//${normalized}`;

  const apiUrl = new URL(withProtocol);

  // Build API base (keep origin + optional path; trim trailing slash)
  const apiBase =
    apiUrl.origin + (apiUrl.pathname.endsWith('/') ? apiUrl.pathname.slice(0, -1) : apiUrl.pathname);

  // Derive WS base by swapping protocol
  const wsUrl = new URL(apiBase);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBase =
    wsUrl.origin + (wsUrl.pathname.endsWith('/') ? wsUrl.pathname.slice(0, -1) : wsUrl.pathname);

  return { apiBase, wsBase };
};

const { apiBase, wsBase } = resolveApiAndWs();

export const API_BASE = apiBase;
export const WS_BASE = wsBase;
export const TEST_MODE_ENABLED = (() => {
  const raw = (import.meta.env.VITE_TEST_MODE_ENABLE ?? import.meta.env.TEST_MODE_ENABLE ?? '').toString();
  return /^(1|true|yes|on)$/i.test(raw);
})();
