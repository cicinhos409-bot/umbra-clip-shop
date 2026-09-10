import type { AudioShuffleSequence, AudioShuffleSettings } from "../types";
import { muxAudioIntoVideo } from "./audio-mux-engine";
import { mixVariationAudio, renderAudioSequence } from "./audio-sequence-renderer";

export interface VariationAudioRenderResult { video: Blob; audio: Blob; applied: boolean }

export async function renderVariationAudio(args: {
  video: Blob; videoDuration: number; source: Blob; sequence: AudioShuffleSequence;
  settings: AudioShuffleSettings; signal?: AbortSignal;
}): Promise<VariationAudioRenderResult> {
  const audio = await renderAudioSequence(args.source, args.sequence, args.settings.transitionMs, args.signal);
  if (args.settings.mode === "audio-only") return { video: args.video, audio, applied: false };
  const finalAudio = args.settings.mode === "replace"
    ? audio
    : await mixVariationAudio(args.video, audio, args.settings.backgroundVolume, args.settings.duckingEnabled, args.videoDuration, args.signal);
  return { video: await muxAudioIntoVideo(args.video, finalAudio, args.signal), audio, applied: true };
}
