import type { AudioAcousticAnalysis, AudioAcousticAnalysisSettings, AudioAcousticFrame } from "../types";

export const AUDIO_ACOUSTIC_ANALYSIS_VERSION = 1;

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }

/** Analisa PCM em janelas sem rede e sem depender de APIs do DOM. */
export function analyzePcmChannels(channels: Float32Array[], sampleRate: number, settings: AudioAcousticAnalysisSettings = {}): AudioAcousticAnalysis {
  if (!channels.length || !channels[0]?.length) throw new Error("O PCM de áudio está vazio.");
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("A taxa de amostragem do áudio é inválida.");
  const length = Math.min(...channels.map((channel) => channel.length));
  const windowSamples = Math.max(32, Math.round(sampleRate * (settings.windowMs ?? 40) / 1_000));
  const hopSamples = Math.max(16, Math.round(sampleRate * (settings.hopMs ?? 20) / 1_000));
  const silenceThreshold = 10 ** ((settings.silenceThresholdDb ?? -45) / 20);
  const frames: AudioAcousticFrame[] = [];
  let previousRms = 0;

  for (let offset = 0, index = 0; offset < length; offset += hopSamples, index += 1) {
    const end = Math.min(length, offset + windowSamples);
    let sumSquares = 0; let crossings = 0; let min = 1; let max = -1; let previous = 0; let samples = 0;
    for (let position = offset; position < end; position += 1) {
      let value = 0;
      for (const channel of channels) value += channel[position] ?? 0;
      value /= channels.length;
      min = Math.min(min, value); max = Math.max(max, value); sumSquares += value * value;
      if (samples > 0 && ((previous < 0 && value >= 0) || (previous >= 0 && value < 0))) crossings += 1;
      previous = value; samples += 1;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, samples));
    const zeroCrossingRate = crossings / Math.max(1, samples - 1);
    const transient = Math.abs(rms - previousRms);
    const silence = rms <= silenceThreshold;
    const zcrVoiceBand = 1 - clamp(Math.abs(zeroCrossingRate - 0.09) / 0.09, 0, 1);
    const energyVoiceBand = clamp((rms - silenceThreshold) / Math.max(0.001, 0.16 - silenceThreshold), 0, 1);
    frames.push({
      index, start: round(offset / sampleRate), end: round(end / sampleRate), min: round(min), max: round(max),
      rms: round(rms), energy: round(rms * rms), zeroCrossingRate: round(zeroCrossingRate), transient: round(transient),
      silence, voiceProbability: round(silence ? 0 : zcrVoiceBand * energyVoiceBand),
    });
    previousRms = rms;
  }

  return {
    version: AUDIO_ACOUSTIC_ANALYSIS_VERSION, duration: round(length / sampleRate), sampleRate, channels: channels.length,
    windowSeconds: round(windowSamples / sampleRate), hopSeconds: round(hopSamples / sampleRate), silenceThreshold: round(silenceThreshold),
    frames, waveform: frames.map(({ start, end, min, max }) => ({ start, end, min, max })),
  };
}
