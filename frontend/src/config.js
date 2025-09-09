// Centralized configuration for backend API endpoints
// This automatically detects the current host and uses it for the backend

const getBackendUrl = () => {
  // Get the current host (e.g., localhost:5173, 192.168.1.100:5173, etc.)
  const host = window.location.hostname;
  
  // Use the same host but port 8000 for backend
  return `http://${host}:8000`;
};

const getWebSocketUrl = () => {
  const host = window.location.hostname;
  return `ws://${host}:8000`;
};

export const API_BASE = getBackendUrl();
export const WS_BASE = getWebSocketUrl();

// For development, you can override with specific IP if needed
// Uncomment and modify the line below if you want to use a specific IP
// export const API_BASE = "http://192.168.1.100:8000";
// export const WS_BASE = "ws://192.168.1.100:8000";
