import { PcmStreamEncoder } from "./pcm-resampler.mjs";

class PresentCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.encoder = new PcmStreamEncoder(sampleRate);
    this.enabled = false; this.revision = ""; this.squares = 0; this.samples = 0;
    this.port.onmessage = ({ data }) => {
      if (!data || data.type !== "revision" || typeof data.revision !== "string") return;
      this.enabled = data.enabled === true; this.revision = data.revision;
      this.encoder.reset(); this.squares = 0; this.samples = 0;
    };
  }
  process(inputs) {
    if (!this.enabled || !inputs[0]?.length) return true;
    const channels = inputs[0];
    const mono = new Float32Array(channels[0].length);
    for (let index = 0; index < mono.length; index += 1) {
      for (const channel of channels) mono[index] += (channel[index] ?? 0) / channels.length;
      this.squares += mono[index] * mono[index]; this.samples += 1;
    }
    // Silence is sent too. RMS is only a UI meter, never a voice gate.
    for (const buffer of this.encoder.process(mono)) {
      this.port.postMessage({ type: "pcm", revision: this.revision, time: currentTime, buffer }, [buffer]);
    }
    if (this.samples >= sampleRate / 10) {
      this.port.postMessage({ type: "level", revision: this.revision, rms: Math.sqrt(this.squares / this.samples) });
      this.squares = 0; this.samples = 0;
    }
    // Output remains silent; the main graph also uses a zero-gain destination.
    return true;
  }
}
registerProcessor("present-capture", PresentCaptureProcessor);
