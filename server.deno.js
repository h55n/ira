// Ira server - Deno Deploy entry. Static UI + WebSocket bridge to the voice session.
// The Node entry (src/server.js) remains canonical for local dev; this file exists
// because Deno Deploy has no long-lived node:http and no disk writes.
import { VoiceSession } from './src/session.js';

const root = new URL('./public/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// AssemblyAI browser-style auth: mint a temporary token over REST, pass it as a
// query param on the realtime socket (native Deno WebSocket can't set headers).
async function sttConnect(url) {
  const res = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
    headers: { Authorization: Deno.env.get('ASSEMBLYAI_API_KEY') },
  }).then(r => r.json());
  if (!res.token) throw new Error('stt token failed: ' + JSON.stringify(res).slice(0, 120));
  return new WebSocket(url + '&token=' + encodeURIComponent(res.token));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === '/health') {
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/ws') {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('websocket only', { status: 426 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    let session;
    socket.onopen = () => { session = new VoiceSession(socket, sttConnect); };
    socket.onmessage = (e) => session?.onClientMessage(e.data, typeof e.data !== 'string');
    socket.onclose = () => session?.close();
    socket.onerror = () => session?.close();
    return response;
  }

  // static files
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (rel.includes('..')) return new Response('not found', { status: 404 });
  try {
    const fileUrl = new URL(rel, root);
    const body = await Deno.readFile(fileUrl);
    const ext = '.' + rel.split('.').pop();
    return new Response(body, { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
});
