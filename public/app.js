let ws, ctx, stream, talking = false;
const $ = (id) => document.getElementById(id);
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

const log = (who, text) => {
  const f = $('feed');
  if (f.dataset.empty) { f.innerHTML = ''; delete f.dataset.empty; }
  const el = document.createElement('div');
  el.className = 'bubble ' + who;
  el.textContent = text;
  f.appendChild(el);
  f.scrollTop = f.scrollHeight;
};

function openSocket({ greet = false, onOpen } = {}) {
  ws = new WebSocket(WS_URL);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    if (greet) ws.send(JSON.stringify({ type: 'call-start' }));
    if (onOpen) onOpen();
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'transcript') {
      if (m.final) { $('live').textContent = ''; log('you', m.text); }
      else $('live').textContent = m.text;
    }
    if (m.type === 'agent' && m.kind === 'reply') { $('status').textContent = 'Ira'; if (talking) speak(m.text); log('ira', m.text); }
    if (m.type === 'agent' && m.kind === 'thinking') $('status').textContent = 'Ira soch rahi hai…';
    if (m.type === 'agent' && m.kind === 'whatsapp') {
      const f = $('feed');
      if (f.dataset.empty) { f.innerHTML = ''; delete f.dataset.empty; }
      const el = document.createElement('div');
      el.className = 'bubble wa';
      el.innerHTML = '<div class="wa-head">WhatsApp · ' + (m.demo ? 'demo' : 'sent') + ' → ' + m.to + '</div>';
      el.appendChild(document.createTextNode(m.text));
      f.appendChild(el);
      f.scrollTop = f.scrollHeight;
    }
  };
  ws.onclose = () => { if (talking) stop(); };
  ws.onerror = () => { $('status').textContent = 'Connection issue - ek baar phir try karein'; };
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    $('status').textContent = 'Mic permission chahiye - ya neeche type karein';
    return;
  }
  openSocket({
    greet: true,
    onOpen: async () => {
      ctx = new AudioContext();
      await ctx.audioWorklet.addModule('pcm.worklet.js');
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-worklet');
      node.port.onmessage = (e) => { if (ws.readyState === 1) ws.send(e.data); };
      src.connect(node);
      $('mic').classList.add('live');
      $('mic').querySelector('span').textContent = 'End';
      $('status').textContent = 'Listening - speak Hindi, English, dono chalega';
      talking = true;
    },
  });
}

function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
  speechSynthesis.speak(u);
}

function stop() {
  talking = false;
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close(); ws?.close(); ws = null;
  $('mic').classList.remove('live');
  $('mic').querySelector('span').textContent = 'Call';
  $('status').textContent = 'Call ended - type karke bhi baat kar sakte hain';
}

$('mic').onclick = () => (talking ? stop() : start());
$('send').onclick = () => {
  const t = $('typed').value.trim();
  if (!t) return;
  if (!ws || ws.readyState !== 1) {
    openSocket({ onOpen: () => { log('you', t); ws.send(JSON.stringify({ type: 'text-turn', text: t })); } });
  } else {
    log('you', t);
    ws.send(JSON.stringify({ type: 'text-turn', text: t }));
  }
  $('typed').value = '';
};
$('typed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('send').click(); });
