import { WS_BASE } from './config.js';

export function connectWS(roomId, playerId, onMessage) {
    const ws = new WebSocket(`${WS_BASE}/api/v1/ws/${roomId}/${playerId}`);
    
    ws.onmessage = (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch {}
    };
    
    ws.onclose = (event) => {
      // If the connection was closed unexpectedly (not a clean close), attempt to reconnect
      if (event.code !== 1000 && event.code !== 1001) {
        console.log('WebSocket connection lost, attempting to reconnect...');
        setTimeout(() => {
          // Attempt to reconnect after 3 seconds
          const newWs = connectWS(roomId, playerId, onMessage);
          // Replace the old WebSocket reference
          if (window.currentWS) {
            window.currentWS = newWs;
          }
          // Update the store with the new WebSocket
          if (window.updateWS) {
            window.updateWS(newWs);
          }
        }, 3000);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return ws;
  }
  
  export function send(ws, type, payload) {
    ws?.readyState === 1 && ws.send(JSON.stringify({ type, payload }));
  }
  