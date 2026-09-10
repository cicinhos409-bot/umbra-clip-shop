import type { ClipAsset, Variation } from "../../types";
import type { AudioShuffleSequence } from "../types";

export function calculateVariationAudioTargets(variations: Variation[], clips: ClipAsset[]) {
  const durations = new Map(clips.map((clip) => [clip.id, clip.media.duration]));
  return variations.slice(0, 27).map((variation) => ({
    variationId: variation.id,
    duration: [variation.hookId, variation.bodyId, variation.ctaId].reduce((sum, id) => sum + (durations.get(id) ?? 0), 0),
  })).filter((target) => target.duration > 0);
}

export function linkVariationSequences(sequences: AudioShuffleSequence[]) {
  return Object.fromEntries(sequences.map((sequence) => [sequence.variationId, sequence.id]));
}

export function findVariationSequence(variationId: string, sequenceId: string | undefined, sequences: AudioShuffleSequence[]) {
  return sequences.find((sequence) => sequence.variationId === variationId && (!sequenceId || sequence.id === sequenceId)) ?? null;
}
