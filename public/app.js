let ws, ctx, stream, talking = false;
let callerLang = null; // STT-reported language of the caller's current call
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

function cuState(cls, state, sub) {
  const ui = $('callui');
  ui.className = 'on ' + cls;
  if (state) $('cu-state').textContent = state;
  if (sub) $('cu-sub').textContent = sub;
}
const cuShow = () => cuState('st-listening', 'Connecting…', 'Ira ko call lag raha hai');
const cuHide = () => { $('callui').className = ''; };

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
      // remember the caller's detected language so TTS answers in their register
      if (m.lang) callerLang = m.lang;
      // barge-in: user starts talking while Ira is speaking -> stop her immediately
      if (!m.final && talking && speechSynthesis.speaking && m.text.trim().length > 1) {
        speechSynthesis.cancel();
        cuState('st-listening', 'Listening…', 'ab aap bolo');
      }
      if (m.final) { $('live').textContent = ''; $('cu-live').textContent = ''; log('you', m.text); }
      else { $('live').textContent = m.text; if (talking) $('cu-live').textContent = m.text; }
    }
    if (m.type === 'agent' && m.kind === 'reply') { $('status').textContent = 'Ira'; if (talking) speak(m.text); log('ira', m.text); }
    if (m.type === 'agent' && m.kind === 'thinking') { $('status').textContent = 'Ira soch rahi hai…'; if (talking) cuState('st-thinking', 'Ira soch rahi hai…', 'ek second'); }
    if (m.type === 'status' && m.text && m.text.indexOf('stt-closed') === 0 && talking) {
      stop();
      $('status').textContent = 'Voice line cut ho gayi - Call dabake phir try karein';
    }
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
  cuShow();
  try { speechSynthesis.cancel(); const w = new SpeechSynthesisUtterance(' '); w.volume = 0; speechSynthesis.speak(w); } catch {}
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    $('status').textContent = 'Mic permission chahiye - ya neeche type karein';
    cuHide();
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
      cuState('st-listening', 'Listening…', 'bolo - Hindi, English, dono chalega');
    },
  });
}

function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  // Devanagari always sounds Hindi; romanized replies follow the caller's
  // detected language, so Hinglish callers never get a stiff English voice.
  u.lang = (/[\u0900-\u097F]/.test(text) || callerLang === 'hi') ? 'hi-IN' : 'en-IN';
  u.onstart = () => { if (talking) cuState('st-speaking', 'Ira bol rahi hai', 'suno - beech mein bolna ho toh bol do'); };
  u.onend = () => { if (talking) cuState('st-listening', 'Listening…', 'ab aap bolo'); };
  speechSynthesis.speak(u);
}

function stop() {
  talking = false;
  cuHide();
  try { speechSynthesis.cancel(); } catch {}
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close(); ws?.close(); ws = null;
  $('mic').classList.remove('live');
  $('mic').querySelector('span').textContent = 'Call';
  $('status').textContent = 'Call ended - type karke bhi baat kar sakte hain';
}

$('mic').onclick = () => (talking ? stop() : start());
$('cu-end').onclick = () => stop();
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
