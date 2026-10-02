let ws, ctx, stream, talking = false;
let callerLang = null; // STT-reported language of the caller's current call
const $ = (id) => document.getElementById(id);
let muted = false, callT0 = 0, callTimer = 0, idleT1 = 0, idleT2 = 0, actx = null;

// ---- mild synthesized sounds (no files) ----
function tone(f, t0, d, v, f2) {
  try {
    const c = actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
    if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain(), n = c.currentTime + t0;
    o.type = 'sine'; o.frequency.setValueAtTime(f, n);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + d);
    g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(v, n + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, n + d);
    o.connect(g).connect(c.destination); o.start(n); o.stop(n + d + 0.02);
  } catch {}
}
const sfx = {
  ring() { tone(440, 0, .35, .03); tone(480, 0, .35, .03); tone(440, .55, .35, .03); tone(480, .55, .35, .03); },
  pick() { tone(600, 0, .1, .035); tone(900, .08, .16, .03); },
  hang() { tone(520, 0, .14, .035, 320); tone(340, .12, .2, .03, 220); },
  send() { tone(520, 0, .14, .04, 780); },
  recv() { tone(660, 0, .18, .035); tone(880, .09, .26, .03); },
};

// ---- numbers: read phone numbers digit by digit, never as '8 crore 9 lakh' ----
function speakable(t) {
  return t
    .replace(/\+?\d[\d\s-]{6,}\d/g, (m) => {
      const d = m.replace(/\D/g, '');
      if (d.length < 8) return m;
      const sp = d.split('');
      if (d.length === 10) sp.splice(5, 0, ',');
      return ' ' + sp.join(' ') + ' ';
    })
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ').trim();
}
// display: group bare 10-digit numbers as 98765 43210
const pretty = (t) => t.replace(/(^|[^\d])(\d{5})(\d{5})(?!\d)/g, '$1$2 $3');

function clearIdle() { clearTimeout(idleT1); clearTimeout(idleT2); }
function armIdle() {
  clearIdle();
  if (!talking) return;
  idleT1 = setTimeout(() => {
    if (!talking) return;
    const t = 'Hello? Aap line par hain?';
    log('ira', t); speak(t, false, true);
    idleT2 = setTimeout(() => {
      if (!talking) return;
      const b = 'Lagta hai aap busy hain, main call end kar rahi hoon. Dhanyavaad!';
      log('ira', b); speak(b, true);
    }, 15000);
  }, 20000);
}
function endGracefully() {
  clearIdle();
  if (!talking) return;
  cuState('st-ended', 'Call ended', 'dhanyavaad - phir milte hain');
  sfx.hang();
  setTimeout(() => { if (talking) stop(); }, 1500);
}
function fmtTime(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function typingOn() {
  typingOff();
  const f = $('feed');
  if (f.dataset.empty) { f.innerHTML = ''; delete f.dataset.empty; }
  const el = document.createElement('div');
  el.id = 'typing'; el.className = 'bubble ira typing';
  el.innerHTML = '<div class="glass"><i></i></div>';
  f.appendChild(el); f.scrollTop = f.scrollHeight;
}
function typingOff() { const t = document.getElementById('typing'); if (t) t.remove(); }
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

const log = (who, text) => {
  const f = $('feed');
  if (f.dataset.empty) { f.innerHTML = ''; delete f.dataset.empty; }
  typingOff();
  const el = document.createElement('div');
  el.className = 'bubble ' + who;
  el.textContent = pretty(text);
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
      clearIdle();
      // barge-in: user starts talking while Ira is speaking -> stop her immediately
      if (!m.final && talking && speechSynthesis.speaking && m.text.trim().length > 1) {
        speechSynthesis.cancel();
        cuState('st-listening', 'Listening…', 'ab aap bolo');
      }
      if (m.final) { $('live').textContent = ''; $('cu-live').textContent = ''; log('you', m.text); }
      else { $('live').textContent = m.text; if (talking) $('cu-live').textContent = m.text; }
    }
    if (m.type === 'agent' && m.kind === 'reply') { $('status').textContent = 'Ira'; if (talking) speak(m.text, !!m.end); else { sfx.recv(); if (m.end) { /* chat stays open */ } } log('ira', m.text); }
    if (m.type === 'agent' && m.kind === 'thinking') { clearIdle(); if (!talking) typingOn(); $('status').textContent = 'Ira soch rahi hai…'; if (talking) cuState('st-thinking', 'Ira soch rahi hai…', 'ek second'); }
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
  cuShow(); muted = false; $('cu-mute').setAttribute('aria-pressed', 'false'); $('cu-time').textContent = '0:00'; sfx.ring();
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
      node.port.onmessage = (e) => { if (!muted && ws.readyState === 1) ws.send(e.data); };
      src.connect(node);
      $('mic').classList.add('live');
      $('mic').querySelector('span').textContent = 'End';
      $('status').textContent = 'Listening - speak Hindi, English, dono chalega';
      talking = true;
      sfx.pick(); callT0 = Date.now(); clearInterval(callTimer);
      callTimer = setInterval(() => { $('cu-time').textContent = fmtTime(Math.floor((Date.now() - callT0) / 1000)); }, 500);
      cuState('st-listening', 'Listening…', 'bolo - Hindi, English, dono chalega');
    },
  });
}

function speak(text, end = false, noArm = false) {
  clearIdle();
  const u = new SpeechSynthesisUtterance(speakable(text));
  // Devanagari always sounds Hindi; romanized replies follow the caller's
  // detected language, so Hinglish callers never get a stiff English voice.
  u.lang = (/[\u0900-\u097F]/.test(text) || callerLang === 'hi') ? 'hi-IN' : 'en-IN';
  u.onstart = () => { if (talking) cuState('st-speaking', 'Ira bol rahi hai', 'suno - beech mein bolna ho toh bol do'); };
  const done = () => { if (!talking) return; if (end) { endGracefully(); return; } cuState('st-listening', 'Listening…', 'ab aap bolo'); if (!noArm) armIdle(); };
  u.onend = done; u.onerror = done;
  speechSynthesis.speak(u);
}

function stop() {
  talking = false; clearIdle(); clearInterval(callTimer);
  cuHide();
  try { speechSynthesis.cancel(); } catch {}
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close(); ws?.close(); ws = null;
  $('mic').classList.remove('live');
  $('mic').querySelector('span').textContent = 'Call';
  $('status').textContent = 'Call ended - type karke bhi baat kar sakte hain';
}

$('mic').onclick = () => (talking ? stop() : start());
$('cu-end').onclick = () => { sfx.hang(); stop(); };
$('cu-mute').onclick = () => { muted = !muted; $('cu-mute').setAttribute('aria-pressed', String(muted)); if (muted) $('cu-live').textContent = 'Mic muted'; else $('cu-live').textContent = ''; };
$('send').onclick = () => {
  const t = $('typed').value.trim();
  if (!t) return;
  sfx.send();
  if (!ws || ws.readyState !== 1) {
    openSocket({ onOpen: () => { log('you', t); ws.send(JSON.stringify({ type: 'text-turn', text: t })); } });
  } else {
    log('you', t);
    ws.send(JSON.stringify({ type: 'text-turn', text: t }));
  }
  $('typed').value = '';
};
$('typed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('send').click(); });
