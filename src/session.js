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
    this.aai.onmessage = (ev) => { const d = typeof ev === 'object' && 'data' in ev ? ev.data : ev; this.onSTT(JSON.parse(typeof d === 'string' ? d : d.toString())); };
    this.aai.onclose = () => { this.open = false; };
    this.aai.onerror = (e) => this.send({ type: 'status', text: 'stt-error: ' + (e.message || 'ws error') });
  }

  onSTT(msg) {
    if (msg.type === 'Turn') {
      const text = msg.transcript || '';
      if (!text.trim()) return;
      this.send({ type: 'transcript', text, final: msg.end_of_turn });
      if (msg.end_of_turn) this.agent.handleUserTurn(text);
    }
  }

  onClientMessage(data, isBinary) {
    if (isBinary) {
      // 16kHz mono PCM16 from the AudioWorklet
      if (this.open && this.aai.readyState === 1) this.aai.send(data);
      return;
    }
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'text-turn') this.agent.handleUserTurn(msg.text); // typed fallback for testing
    if (msg.type === 'call-start') this.agent.greet();
  }

  send(obj) { if (this.client.readyState === 1) this.client.send(JSON.stringify(obj)); }
  close() { try { this.aai?.close(); } catch {} }
}
