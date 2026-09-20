// Captures mic frames and posts PCM16 mono at 16kHz.
// Buffers ~128ms before posting: streaming STT expects 50-250ms chunks,
// and the raw 128-frame blocks (~3ms) flood the socket and can get the
// upstream connection closed - which previously killed all transcripts.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.acc = new Float32Array(8192); // ~170ms at 48k
    this.n = 0;
    this.TARGET = 6144; // 128ms at 48k (scales with actual rate)
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    // copy into accumulator
    if (this.n + ch.length > this.acc.length) this.flush();
    this.acc.set(ch, this.n);
    this.n += ch.length;
    const target = Math.round(0.128 * sampleRate);
    if (this.n >= target) this.flush();
    return true;
  }
  flush() {
    if (!this.n) return;
    const ratio = sampleRate / 16000;
    const out = new Int16Array(Math.floor(this.n / ratio));
    for (let i = 0, j = 0; j < out.length; j++, i += ratio) {
      const s = Math.max(-1, Math.min(1, this.acc[Math.floor(i)]));
      out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    this.n = 0;
  }
}
registerProcessor('pcm-worklet', PcmWorklet);
