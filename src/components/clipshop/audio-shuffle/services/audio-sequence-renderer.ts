import type { AudioShuffleSequence } from "../types";

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodeAudioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const bytesPerSample = 2;
  const dataBytes = buffer.length * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true); view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true); writeAscii(view, 36, "data"); view.setUint32(40, dataBytes, true);
  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let cursor = 44;
  for (let sample = 0; sample < buffer.length; sample += 1) for (let channel = 0; channel < channels; channel += 1) {
    const value = Math.max(-1, Math.min(1, channelData[channel][sample] ?? 0));
    view.setInt16(cursor, value < 0 ? value * 0x8000 : value * 0x7fff, true); cursor += 2;
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function renderAudioSequence(file: Blob, sequence: AudioShuffleSequence, transitionMs = 80, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Renderização cancelada.", "AbortError");
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") throw new Error("Renderização de áudio indisponível neste navegador.");
  const decoder = new AudioContextClass();
  try {
    const decoded = await decoder.decodeAudioData(await file.arrayBuffer());
    const sampleRate = Math.min(48_000, decoded.sampleRate);
    const offline = new OfflineAudioContext(Math.min(2, decoded.numberOfChannels), Math.ceil(sequence.targetDuration * sampleRate), sampleRate);
    const fade = Math.max(0, transitionMs / 1_000);
    for (const cut of sequence.cuts) {
      const source = offline.createBufferSource(); source.buffer = decoded;
      const gain = offline.createGain(); source.connect(gain).connect(offline.destination);
      const actualFade = Math.min(fade, cut.duration / 2);
      gain.gain.setValueAtTime(actualFade ? 0 : 1, cut.timelineStart);
      if (actualFade) {
        gain.gain.linearRampToValueAtTime(1, cut.timelineStart + actualFade);
        gain.gain.setValueAtTime(1, Math.max(cut.timelineStart + actualFade, cut.timelineEnd - actualFade));
        gain.gain.linearRampToValueAtTime(0, cut.timelineEnd);
      }
      source.start(cut.timelineStart, cut.start, cut.duration);
    }
    if (signal?.aborted) throw new DOMException("Renderização cancelada.", "AbortError");
    return encodeAudioBufferToWav(await offline.startRendering());
  } finally { void decoder.close(); }
}

export function calculateDuckingCurve(channel: Float32Array, sampleRate: number, windowSeconds = 0.05) {
  const window = Math.max(1, Math.round(sampleRate * windowSeconds));
  const curve: Array<{ time: number; active: boolean }> = [];
  for (let offset = 0; offset < channel.length; offset += window) {
    let squares = 0;
    const end = Math.min(channel.length, offset + window);
    for (let index = offset; index < end; index += 1) squares += channel[index] * channel[index];
    curve.push({ time: offset / sampleRate, active: Math.sqrt(squares / Math.max(1, end - offset)) >= 0.025 });
  }
  return curve;
}

export async function mixVariationAudio(video: Blob, shuffleAudio: Blob, volume: number, ducking: boolean, duration: number, signal?: AbortSignal) {
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") throw new Error("Mixagem de áudio indisponível neste navegador.");
  const decoder = new AudioContextClass();
  try {
    const shuffle = await decoder.decodeAudioData(await shuffleAudio.arrayBuffer());
    let original: AudioBuffer | null = null;
    try { original = await decoder.decodeAudioData(await video.arrayBuffer()); } catch { /* vídeo sem faixa de áudio */ }
    if (signal?.aborted) throw new DOMException("Mixagem cancelada.", "AbortError");
    const sampleRate = Math.min(48_000, Math.max(shuffle.sampleRate, original?.sampleRate ?? 0));
    const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-2, 0); limiter.knee.setValueAtTime(4, 0); limiter.ratio.setValueAtTime(16, 0);
    limiter.attack.setValueAtTime(0.003, 0); limiter.release.setValueAtTime(0.12, 0); limiter.connect(offline.destination);
    if (original) { const node = offline.createBufferSource(); node.buffer = original; node.connect(limiter); node.start(0); }
    const background = offline.createBufferSource(); background.buffer = shuffle;
    const gain = offline.createGain(); background.connect(gain).connect(limiter);
    const baseVolume = Math.max(0, Math.min(1, volume));
    gain.gain.setValueAtTime(baseVolume, 0);
    if (ducking && original) for (const point of calculateDuckingCurve(original.getChannelData(0), original.sampleRate)) {
      gain.gain.linearRampToValueAtTime(point.active ? baseVolume * 0.28 : baseVolume, Math.min(duration, point.time + 0.03));
    }
    background.start(0);
    return encodeAudioBufferToWav(await offline.startRendering());
  } finally { void decoder.close(); }
}
