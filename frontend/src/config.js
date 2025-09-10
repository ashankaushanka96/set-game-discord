// Centralized configuration for backend API endpoints
// This automatically detects the current host and uses it for the backend

const getBackendUrl = () => {
  // Check if we're in production (GitHub Pages)
  if (window.location.hostname === 'ashankaushanka96.github.io') {
    // In production, use the HOST environment variable (set during build)
    const productionHost = import.meta.env.VITE_API_BASE;
    console.log('Production host from env:', productionHost); // Debug log
    
    if (productionHost) {
      // If it's already a complete URL, use it as is
      if (productionHost.startsWith('http://') || productionHost.startsWith('https://')) {
        return productionHost;
      }
      // If it's just an IP, construct the full URL
      return `http://${productionHost}:8000`;
    }
    // Fallback - this should not happen if HOST secret is set correctly
    console.error('VITE_API_BASE is not set! Check your GitHub secret HOST');
    return 'http://35.45.13.71:8000'; // Hardcoded fallback to your actual IP
  }
  
  // Development: Get the current host (e.g., localhost:5173, 192.168.1.100:5173, etc.)
  const host = window.location.hostname;
  
  // Use the same host but port 8000 for backend
  return `http://${host}:8000`;
};

const getWebSocketUrl = () => {
  // Check if we're in production (GitHub Pages)
  if (window.location.hostname === 'ashankaushanka96.github.io') {
    // In production, use the HOST environment variable (set during build)
    const productionHost = import.meta.env.VITE_API_BASE;
    if (productionHost) {
      // If it's already a complete URL, convert to WebSocket
      if (productionHost.startsWith('http://') || productionHost.startsWith('https://')) {
        return productionHost.replace('http://', 'ws://').replace('https://', 'wss://');
      }
      // If it's just an IP, construct the WebSocket URL
      return `ws://${productionHost}:8000`;
    }
    // Fallback to WebSocket if no WSS available
    return 'ws://35.45.13.71:8000'; // Hardcoded fallback to your actual IP
  }
  
  // Development: Get the current host
  const host = window.location.hostname;
  return `ws://${host}:8000`;
};

export const API_BASE = getBackendUrl();
export const WS_BASE = getWebSocketUrl();

// For development, you can override with specific IP if needed
// Uncomment and modify the line below if you want to use a specific IP
// export const API_BASE = "http://192.168.1.100:8000";
// export const WS_BASE = "ws://192.168.1.100:8000";
