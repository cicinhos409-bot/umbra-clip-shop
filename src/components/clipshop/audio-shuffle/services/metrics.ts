import type { AudioRegionUsage, AudioShuffleBatchSummary, AudioShuffleSequence } from "../types";

function round(value: number) { return Math.round(value * 10) / 10; }

export function calculateAudioBatchMetrics(sequences: AudioShuffleSequence[]) {
  if (!sequences.length) return { averageCoverage: 0, averageDiversity: 0, repetition: 0 };
  const cuts = sequences.flatMap((sequence) => sequence.cuts);
  const keys = cuts.map((cut) => `${cut.zone}:${Math.round(cut.start * 2) / 2}:${Math.round(cut.end * 2) / 2}`);
  return {
    averageCoverage: round(sequences.reduce((sum, sequence) => sum + sequence.coverage, 0) / sequences.length),
    averageDiversity: round(sequences.reduce((sum, sequence) => sum + sequence.diversityScore, 0) / sequences.length),
    repetition: round(cuts.length ? (1 - new Set(keys).size / cuts.length) * 100 : 0),
  };
}

export function createAudioBatchSummary(batchId: string, seed: string, sequences: AudioShuffleSequence[]): AudioShuffleBatchSummary {
  return { batchId, seed, createdAt: new Date().toISOString(), sequenceIds: sequences.map((item) => item.id), variationIds: sequences.map((item) => item.variationId), ...calculateAudioBatchMetrics(sequences) };
}

export function compareAudioSequences(a: AudioShuffleSequence | undefined, b: AudioShuffleSequence | undefined) {
  if (!a || !b) return null;
  const zonesA = new Set(a.cuts.map((cut) => cut.zone)); const zonesB = new Set(b.cuts.map((cut) => cut.zone));
  const common = [...zonesA].filter((zone) => zonesB.has(zone)).length;
  return {
    coverageDelta: round(a.coverage - b.coverage), diversityDelta: round(a.diversityScore - b.diversityScore),
    commonZonePercent: round(common / Math.max(1, new Set([...zonesA, ...zonesB]).size) * 100),
  };
}

export function buildAudioHeatmap(history: AudioRegionUsage[], zoneCount: number) {
  const uses = Array.from({ length: Math.max(1, zoneCount) }, (_, zone) => history.filter((item) => item.zone === zone).reduce((sum, item) => sum + item.useCount, 0));
  const maximum = Math.max(1, ...uses);
  return uses.map((useCount, zone) => ({ zone, useCount, intensity: useCount / maximum }));
}
