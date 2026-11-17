// Streaming causal low-pass FIR + phase-continuous resampling and PCM16 framing.
// This exact implementation is imported by the AudioWorklet and Node tests.
export function pcm16(value) {
  const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return Math.round(sample < 0 ? sample * 32768 : sample * 32767);
}
export function lowpass(inputRate, outputRate) {
  if (inputRate <= outputRate) return [1];
  const count = 63;
  const cutoff = 0.45 * outputRate / inputRate;
  const taps = Array.from({ length: count }, (_, index) => {
    const offset = index - (count - 1) / 2;
    const sinc = offset === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * offset) / (Math.PI * offset);
    return sinc * (0.54 - 0.46 * Math.cos(2 * Math.PI * index / (count - 1)));
  });
  const sum = taps.reduce((a, b) => a + b, 0);
  return taps.map((tap) => tap / sum);
}
export class PcmStreamEncoder {
  constructor(inputRate, outputRate = 16000, frameSamples = 320) {
    if (!Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 384000) throw new Error("Unsupported sample rate.");
    this.step = inputRate / outputRate;
    this.taps = lowpass(inputRate, outputRate);
    this.frameSamples = frameSamples;
    this.reset();
  }
  reset() {
    this.ring = new Float64Array(this.taps.length); this.cursor = 0;
    this.inputIndex = 0; this.outputIndex = 0; this.previous = 0;
    this.frame = new DataView(new ArrayBuffer(this.frameSamples * 2)); this.offset = 0;
  }
  process(input) {
    const frames = [];
    for (const value of input) {
      this.ring[this.cursor] = Number.isFinite(value) ? value : 0;
      let filtered = 0; let position = this.cursor;
      for (const tap of this.taps) {
        filtered += tap * this.ring[position];
        position = (position - 1 + this.ring.length) % this.ring.length;
      }
      this.cursor = (this.cursor + 1) % this.ring.length;
      const index = this.inputIndex++;
      while (this.outputIndex * this.step <= index + 1e-9) {
        const phase = this.outputIndex * this.step;
        const sample = index === 0 ? filtered : this.previous + (filtered - this.previous) * (phase - index + 1);
        this.frame.setInt16(this.offset * 2, pcm16(sample), true);
        this.offset += 1; this.outputIndex += 1;
        if (this.offset === this.frameSamples) {
          frames.push(this.frame.buffer);
          this.frame = new DataView(new ArrayBuffer(this.frameSamples * 2)); this.offset = 0;
        }
      }
      this.previous = filtered;
    }
    return frames;
  }
}
