let ws, ctx, stream, talking = false;
const $ = (id) => document.getElementById(id);
const log = (who, text) => {
  const el = document.createElement('div');
  el.className = 'bubble ' + who;
  el.textContent = text;
  $('feed').appendChild(el);
  $('feed').scrollTop = $('feed').scrollHeight;
};

async function start() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ type: 'call-start' }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'transcript') {
      if (m.final) { $('live').textContent = ''; log('you', m.text); }
      else $('live').textContent = m.text;
    }
    if (m.type === 'agent' && m.kind === 'reply') { $('status').textContent = 'Ira'; speak(m.text); log('ira', m.text); }
    if (m.type === 'agent' && m.kind === 'thinking') $('status').textContent = 'Ira soch rahi hai…';
    if (m.type === 'agent' && m.kind === 'whatsapp') {
      const el = document.createElement('div');
      el.className = 'bubble wa';
      el.innerHTML = '<div class="wa-head">WhatsApp · ' + (m.demo ? 'demo' : 'sent') + ' → ' + m.to + '</div>';
      el.appendChild(document.createTextNode(m.text));
      $('feed').appendChild(el);
      $('feed').scrollTop = $('feed').scrollHeight;
    }
  };
  stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule('pcm.worklet.js');
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-worklet');
  node.port.onmessage = (e) => { if (ws.readyState === 1) ws.send(e.data); };
  src.connect(node);
  $('mic').classList.add('live');
  $('status').textContent = 'Listening - speak Hindi, English, dono chalega';
  talking = true;
}

function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
  speechSynthesis.speak(u);
}

function stop() {
  talking = false;
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close(); ws?.close();
  $('mic').classList.remove('live');
  $('status').textContent = 'Call ended';
}

$('mic').onclick = () => (talking ? stop() : start());
$('send').onclick = () => {
  const t = $('typed').value.trim();
  if (!t || !ws) return;
  log('you', t);
  ws.send(JSON.stringify({ type: 'text-turn', text: t }));
  $('typed').value = '';
};
