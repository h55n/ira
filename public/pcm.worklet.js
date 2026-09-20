// Captures mic frames and posts PCM16 (mono, native context rate; server expects 16kHz,
// so we downsample in-process before posting).
class PcmWorklet extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const ratio = sampleRate / 16000;
    const out = new Int16Array(Math.floor(ch.length / ratio));
    for (let i = 0, j = 0; j < out.length; j++, i += ratio) {
      const s = Math.max(-1, Math.min(1, ch[Math.floor(i)]));
      out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor('pcm-worklet', PcmWorklet);
