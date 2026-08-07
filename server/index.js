import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('+58express Real-Time WebSocket Server Active 🇻🇪');
});

const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[+58express Socket Server] Client connected. Total active clients: ${clients.size}`);

  ws.on('message', (message) => {
    try {
      const dataStr = message.toString();
      // Broadcast message to all connected clients except sender
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(dataStr);
        }
      });
    } catch (err) {
      console.error('[+58express Socket Server] Message broadcast error:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[+58express Socket Server] Client disconnected. Active clients: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[+58express Socket Server] WS Error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 +58express WebSocket Server running on port ${PORT}`);
});
