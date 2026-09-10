import type { ClipShopProject } from "../../types";
import type { AudioShuffleQueueSnapshot } from "../types";
import { findVariationSequence } from "./project-audio";

export function buildAudioShuffleQueueSnapshot(project: ClipShopProject, variationIds: string[]): AudioShuffleQueueSnapshot | undefined {
  const state = project.audioShuffle;
  if (!state?.settings.enabled || !state.source) return undefined;
  const sequences = variationIds.map((variationId) => {
    const sequence = findVariationSequence(variationId, state.variationSequenceIds[variationId], state.sequences);
    if (!sequence) throw new Error(`A variação ${variationId} não possui uma sequência de áudio persistida.`);
    return structuredClone(sequence);
  });
  return {
    sourceId: state.source.id, sourceFingerprint: state.source.fingerprint, algorithmVersion: state.algorithmVersion,
    settings: structuredClone(state.settings), variationSequenceIds: Object.fromEntries(sequences.map((sequence) => [sequence.variationId, sequence.id])), sequences,
  };
}

export function findQueueAudioSequence(snapshot: AudioShuffleQueueSnapshot | undefined, variationId: string) {
  if (!snapshot) return null;
  const id = snapshot.variationSequenceIds[variationId];
  return snapshot.sequences.find((sequence) => sequence.variationId === variationId && sequence.id === id) ?? null;
}
