export function connectWS(roomId, playerId, onMessage) {
    const ws = new WebSocket(`ws://localhost:8000/ws/${roomId}/${playerId}`);
    ws.onmessage = (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch {}
    };
    return ws;
  }
  
  export function send(ws, type, payload) {
    ws?.readyState === 1 && ws.send(JSON.stringify({ type, payload }));
  }
  