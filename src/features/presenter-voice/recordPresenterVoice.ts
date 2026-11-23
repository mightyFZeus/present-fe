const sampleBytes = 10 * 16_000 * 2;
const captureTimeoutMs = 18_000;

function cancelled() {
  return new DOMException("Recording was cancelled.", "AbortError");
}

export async function recordPresenterVoice(
  signal: AbortSignal,
  progress: (seconds: number) => void,
): Promise<ArrayBuffer> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    throw new Error("Open Prezntly over HTTPS in a browser with microphone access.");
  }
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let mute: GainNode | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let rejectAudio: (error: Error) => void = () => {};
  const buffer = new ArrayBuffer(sampleBytes);
  const bytes = new Uint8Array(buffer);
  let saved = false;
  const close = () => {
    for (const track of stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    if (node) {
      node.port.onmessage = null;
      node.onprocessorerror = null;
      node.disconnect();
    }
    source?.disconnect();
    mute?.disconnect();
    if (context.state !== "closed") void context.close().catch(() => {});
  };
  const abort = () => { close(); rejectAudio(cancelled()); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw cancelled();
    await context.resume();
    if (signal.aborted) throw cancelled();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (signal.aborted) throw cancelled();
    await context.audioWorklet.addModule("/audio/present-capture-worklet.mjs");
    if (signal.aborted) throw cancelled();

    const worklet = new AudioWorkletNode(context, "present-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node = worklet;
    source = context.createMediaStreamSource(stream);
    mute = context.createGain();
    mute.gain.value = 0;
    await new Promise<void>((resolve, reject) => {
      rejectAudio = reject;
      let offset = 0;
      let seconds = 0;
      const fail = () => reject(new Error("The microphone stopped. Record another sample."));
      for (const track of stream?.getTracks() ?? []) track.onended = fail;
      worklet.onprocessorerror = fail;
      deadline = setTimeout(fail, captureTimeoutMs);
      worklet.port.onmessage = ({ data }) => {
        if (data?.type !== "pcm" || data.revision !== "voice-sample" ||
            !(data.buffer instanceof ArrayBuffer)) return;
        const amount = Math.min(data.buffer.byteLength, sampleBytes - offset);
        bytes.set(new Uint8Array(data.buffer, 0, amount), offset);
        offset += amount;
        const elapsed = Math.floor(offset / 32_000);
        if (elapsed !== seconds) {
          seconds = elapsed;
          progress(elapsed);
        }
        if (offset === sampleBytes) resolve();
      };
      source?.connect(worklet);
      if (!mute) throw new Error("The microphone could not start.");
      worklet.connect(mute);
      mute.connect(context.destination);
      worklet.port.postMessage({ type: "revision", enabled: true, revision: "voice-sample" });
      progress(0);
    });
    if (signal.aborted) throw cancelled();
    saved = true;
    return buffer;
  } finally {
    signal.removeEventListener("abort", abort);
    clearTimeout(deadline);
    close();
    if (!saved) bytes.fill(0);
  }
}
