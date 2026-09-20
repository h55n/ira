// Ira server: static UI + WebSocket bridge to the voice agent session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { VoiceSession } from './session.js';

const PORT = process.env.PORT || 3000;
const root = path.resolve('public');

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
  const p = path.join(root, req.url === '/' ? 'index.html' : req.url);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(p);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.worklet.js': 'text/javascript' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(p).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const session = new VoiceSession(ws);
  ws.on('message', (data, isBinary) => session.onClientMessage(data, isBinary));
  ws.on('close', () => session.close());
});

server.listen(PORT, '0.0.0.0', () => console.log(`Ira listening on :${PORT}`));
