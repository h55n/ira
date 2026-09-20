// One voice session: browser PCM in, AssemblyAI Realtime STT, agent turns, replies out.
// Runtime-agnostic: the server entry (Node or Deno) injects sttConnect, which
// returns a WebSocket-like object using property handlers (onopen/onmessage/...).
import { Agent } from './agent.js';

const AAI_WS = 'wss://streaming.assemblyai.com/v3/ws';

export class VoiceSession {
  constructor(clientWs, sttConnect) {
    this.client = clientWs;
    this.agent = new Agent((msg) => this.send({ type: 'agent', ...msg }));
    this.aai = null;
    this.open = false;
    this.audioBuf = [];   // queued client audio chunks
    this.audioBytes = 0;  // queued byte count
    this.flushTimer = null;
    // AssemblyAI hard-closes the socket if any single chunk is under 50ms
    // (1600 bytes at 16kHz PCM16) or over 1000ms. Never forward below the floor.
    this.MIN_FLUSH = 1600;
    this.TARGET_FLUSH = 3200; // ~100ms
    this.connectSTT(sttConnect);
  }

  async connectSTT(sttConnect) {
    const params = new URLSearchParams({
      sample_rate: '16000',
      format_turns: 'true',
      end_of_turn_confidence_threshold: '0.7',
      min_end_of_turn_silence_when_confident: '400',
      max_turn_silence: '1600',
    });
    try {
      this.aai = await sttConnect(`${AAI_WS}?${params}`);
    } catch (e) {
      this.send({ type: 'status', text: 'stt-error: ' + e.message });
      return;
    }
    this.aai.onopen = () => { this.open = true; this.send({ type: 'status', text: 'stt-connected' }); };
    this.aai.onclose = (ev) => { this.open = false; console.error('AAI_CLOSE', ev?.code, JSON.stringify(ev?.reason || '')); this.send({ type: 'status', text: 'stt-closed: refresh karke phir try karein' }); };
    this.aai.onmessage = (ev) => { const d = typeof ev === 'object' && 'data' in ev ? ev.data : ev; this.onSTT(JSON.parse(typeof d === 'string' ? d : d.toString())); };
    this.aai.onerror = (e) => this.send({ type: 'status', text: 'stt-error: ' + (e.message || 'ws error') });
  }

  onSTT(msg) {
    if (msg.type !== 'Turn') console.error('AAI_MSG', JSON.stringify(msg).slice(0, 300));
    if (msg.type === 'Turn') {
      const text = msg.transcript || '';
      if (!text.trim()) return;
      this.send({ type: 'transcript', text, final: msg.end_of_turn });
      if (msg.end_of_turn) this.agent.handleUserTurn(text);
    }
  }

  onClientMessage(data, isBinary) {
    if (isBinary) {
      // 16kHz mono PCM16 from the AudioWorklet. Browsers may send very small
      // frames (~3ms); AssemblyAI wants >=50ms chunks, so accumulate to ~100ms
      // (3200 bytes at 16kHz PCM16) and flush on a timer for the tail.
      this.audioBuf.push(data);
      this.audioBytes += data.byteLength;
      if (this.audioBytes >= this.TARGET_FLUSH) this.flushAudio();
      else this.armFlush();
      return;
    }
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'text-turn') this.agent.handleUserTurn(msg.text); // typed fallback for testing
    if (msg.type === 'call-start') this.agent.greet();
  }

  armFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAudio();
      if (this.audioBytes) this.armFlush(); // still holding a sub-floor tail: keep waiting for more audio
    }, 100);
  }

  flushAudio() {
    if (!this.audioBytes || this.audioBytes < this.MIN_FLUSH) return; // hold - never send <50ms
    const chunks = this.audioBuf;
    this.audioBuf = [];
    this.audioBytes = 0;
    if (!(this.open && this.aai && this.aai.readyState === 1)) return;
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(new Uint8Array(c.buffer || c, c.byteOffset || 0, c.byteLength), off); off += c.byteLength; }
    this.aai.send(merged.buffer);
  }

  send(obj) { if (this.client.readyState === 1) this.client.send(JSON.stringify(obj)); }
  close() { if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; } try { this.aai?.close(); } catch {} }
}
