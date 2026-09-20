// One voice session: browser PCM in, AssemblyAI Realtime STT, agent turns, replies out.
import WebSocket from 'ws';
import { Agent } from './agent.js';

const AAI_WS = 'wss://streaming.assemblyai.com/v3/ws';

export class VoiceSession {
  constructor(clientWs) {
    this.client = clientWs;
    this.agent = new Agent((msg) => this.send({ type: 'agent', ...msg }));
    this.aai = null;
    this.open = false;
    this.connectSTT();
  }

  connectSTT() {
    const params = new URLSearchParams({
      sample_rate: '16000',
      format_turns: 'true',
      end_of_turn_confidence_threshold: '0.7',
      min_end_of_turn_silence_when_confident: '400',
      max_turn_silence: '1600',
    });
    this.aai = new WebSocket(`${AAI_WS}?${params}`, {
      headers: { Authorization: process.env.ASSEMBLYAI_API_KEY },
    });
    this.aai.on('open', () => { this.open = true; this.send({ type: 'status', text: 'stt-connected' }); });
    this.aai.on('message', (raw) => this.onSTT(JSON.parse(raw.toString())));
    this.aai.on('close', () => { this.open = false; });
    this.aai.on('error', (e) => this.send({ type: 'status', text: 'stt-error: ' + e.message }));
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
      if (this.open && this.aai.readyState === WebSocket.OPEN) this.aai.send(data);
      return;
    }
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'text-turn') this.agent.handleUserTurn(msg.text); // typed fallback for testing
    if (msg.type === 'call-start') this.agent.greet();
  }

  send(obj) { if (this.client.readyState === 1) this.client.send(JSON.stringify(obj)); }
  close() { try { this.aai?.close(); } catch {} }
}
