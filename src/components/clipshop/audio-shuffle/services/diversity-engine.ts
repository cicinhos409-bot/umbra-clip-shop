import { createSeededRandom, deriveAudioSeed, type SeededRandom } from "./seeded-random";
import { automaticZoneCount, normalizeMarkedRegions, validateAudioShuffleInput } from "./validation";
import type {
  AudioAcousticAnalysis, AudioAcousticFrame, AudioMarkedRegion, AudioRegionUsage, AudioShuffleCut, AudioShuffleGenerationInput,
  AudioShuffleGenerationResult, AudioShuffleSequence, AudioShuffleSettings, AudioShuffleTarget,
} from "../types";

export const AUDIO_SHUFFLE_ALGORITHM_VERSION = 1;
const EPSILON = 0.001;
const MAX_CUTS_PER_SEQUENCE = 512;
const CANDIDATES_PER_ZONE = 8;

type Interval = { start: number; end: number; zone: number };
type Zone = { index: number; start: number; end: number };
type Candidate = Interval & { duration: number; score: number; relaxationLevel: number; boundary: AudioShuffleCut["boundary"] };

interface BatchMemory {
  intervals: Interval[];
  zoneUses: Map<number, number>;
  zoneLastCut: Map<number, number>;
  globalCutIndex: number;
}

function round(value: number) { return Math.round(value * 1000) / 1000; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function overlaps(a: Pick<Interval, "start" | "end">, b: Pick<Interval, "start" | "end">) { return a.start < b.end - EPSILON && b.start < a.end - EPSILON; }

function intervalDistance(a: Interval, b: Interval) {
  if (overlaps(a, b)) return 0;
  return a.end <= b.start ? b.start - a.end : a.start - b.end;
}

export function createAudioZones(sourceDuration: number, requested: number | "auto"): Zone[] {
  const count = requested === "auto" ? automaticZoneCount(sourceDuration) : requested;
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: sourceDuration * index / count,
    end: sourceDuration * (index + 1) / count,
  }));
}

function usageByZone(history: AudioRegionUsage[]) {
  const result = new Map<number, number>();
  history.forEach((item) => result.set(item.zone, (result.get(item.zone) ?? 0) + item.useCount));
  return result;
}

function historicalOverlap(candidate: Interval, history: AudioRegionUsage[]) {
  return history.reduce((sum, item) => sum + (overlaps(candidate, item) ? item.useCount : 0), 0);
}

function priorityAdjustment(candidate: Interval, regions: AudioMarkedRegion[]) {
  return regions.some((region) => ["priority", "favorite", "chorus"].includes(region.kind) && overlaps(candidate, region)) ? -18 : 0;
}

function candidateInterval(zone: Zone, duration: number, sourceDuration: number, centered: boolean, random: SeededRandom) {
  const point = random.between(zone.start, zone.end);
  const start = centered ? point - duration / 2 : point;
  const fittedStart = clamp(start, 0, Math.max(0, sourceDuration - duration));
  return { start: fittedStart, end: fittedStart + duration, zone: zone.index };
}

function frameBoundaryScore(frame: AudioAcousticFrame, mode: AudioShuffleSettings["boundaryMode"]) {
  const quiet = frame.rms * 80;
  const silenceBonus = frame.silence ? -8 : 0;
  if (mode === "speech") return quiet + silenceBonus + frame.voiceProbability * 18 + frame.transient * 8;
  if (mode === "musical") return quiet * 0.35 + silenceBonus - frame.transient * 20;
  return quiet + silenceBonus + frame.transient * 5 - Math.min(0.15, frame.zeroCrossingRate) * 8;
}

function boundaryKind(frame: AudioAcousticFrame, mode: AudioShuffleSettings["boundaryMode"]): AudioShuffleCut["boundary"] {
  if (mode === "speech" && frame.voiceProbability < 0.2) return "speech";
  if (mode === "musical" && frame.transient > 0.02) return "beat";
  if (frame.silence) return "acoustic";
  return "zero-crossing";
}

/** Ajusta o início sem alterar a duração, preservando o encaixe exato na timeline. */
function refineAcousticBoundary(interval: Interval, duration: number, sourceDuration: number, analysis: AudioAcousticAnalysis | undefined, settings: AudioShuffleSettings) {
  if (!analysis || settings.boundaryMode === "free" || !analysis.frames.length) return { ...interval, boundary: "temporal" as const };
  const radius = Math.max(0.12, analysis.windowSeconds * 4);
  const starts = analysis.frames.filter((frame) => Math.abs(frame.start - interval.start) <= radius);
  let best: { start: number; score: number; frame: AudioAcousticFrame } | undefined;
  for (const frame of starts) {
    const start = clamp(frame.start, 0, Math.max(0, sourceDuration - duration));
    const endFrame = analysis.frames.reduce((closest, item) => Math.abs(item.start - (start + duration)) < Math.abs(closest.start - (start + duration)) ? item : closest, analysis.frames[0]);
    const score = frameBoundaryScore(frame, settings.boundaryMode) + frameBoundaryScore(endFrame, settings.boundaryMode) + Math.abs(start - interval.start) * 2;
    if (!best || score < best.score) best = { start, score, frame };
  }
  return best
    ? { start: best.start, end: best.start + duration, zone: interval.zone, boundary: boundaryKind(best.frame, settings.boundaryMode) }
    : { ...interval, boundary: "temporal" as const };
}

function candidateAllowed(candidate: Interval, blocked: AudioMarkedRegion[], recent: Interval[], settings: AudioShuffleSettings, enforceDistance: boolean) {
  if (blocked.some((region) => overlaps(candidate, region))) return false;
  if (!enforceDistance || settings.minimumDistanceSeconds <= 0) return true;
  return recent.every((item) => intervalDistance(candidate, item) + EPSILON >= settings.minimumDistanceSeconds);
}

function scoreCandidate(candidate: Interval, history: AudioRegionUsage[], memory: BatchMemory, regions: AudioMarkedRegion[], settings: AudioShuffleSettings, random: SeededRandom) {
  const projectUses = usageByZone(history).get(candidate.zone) ?? 0;
  const batchUses = memory.zoneUses.get(candidate.zone) ?? 0;
  const diversityFactor = settings.diversity === "high" ? 2 : settings.diversity === "medium" ? 1 : 0.45;
  return batchUses * 45 * diversityFactor
    + projectUses * 14 * diversityFactor
    + historicalOverlap(candidate, history) * 22
    + priorityAdjustment(candidate, regions)
    + random.next() * 7;
}

function selectCandidate(args: {
  duration: number; zones: Zone[]; cycleZones: Set<number>; sourceDuration: number; settings: AudioShuffleSettings;
  markedRegions: AudioMarkedRegion[]; history: AudioRegionUsage[]; memory: BatchMemory; sequenceIntervals: Interval[]; random: SeededRandom;
  acousticAnalysis?: AudioAcousticAnalysis;
}) {
  const { duration, zones, cycleZones, sourceDuration, settings, markedRegions, history, memory, sequenceIntervals, random, acousticAnalysis } = args;
  const blocked = markedRegions.filter((region) => region.kind === "blocked");
  const recent = [...memory.intervals.slice(-Math.max(12, settings.zoneCooldownCuts * 3)), ...sequenceIntervals];

  for (let relaxationLevel = 0; relaxationLevel <= 3; relaxationLevel += 1) {
    const enforceDistance = relaxationLevel < 1;
    const enforceCooldown = relaxationLevel < 2;
    const enforceCycle = relaxationLevel < 3 && cycleZones.size > 0;
    const candidates: Candidate[] = [];
    for (const zone of zones) {
      if (enforceCycle && !cycleZones.has(zone.index)) continue;
      const lastCut = memory.zoneLastCut.get(zone.index);
      if (enforceCooldown && lastCut !== undefined && memory.globalCutIndex - lastCut <= settings.zoneCooldownCuts) continue;
      for (let attempt = 0; attempt < CANDIDATES_PER_ZONE; attempt += 1) {
        const temporal = candidateInterval(zone, duration, sourceDuration, settings.centerCuts, random);
        const interval = refineAcousticBoundary(temporal, duration, sourceDuration, acousticAnalysis, settings);
        if (!candidateAllowed(interval, blocked, recent, settings, enforceDistance)) continue;
        candidates.push({ ...interval, duration, relaxationLevel, score: scoreCandidate(interval, history, memory, markedRegions, settings, random) });
      }
    }
    if (candidates.length) return candidates.sort((a, b) => a.score - b.score || a.start - b.start)[0];
  }
  throw new Error("Não existe região utilizável para montar a sequência com a duração solicitada.");
}

function sequenceCoverage(cuts: AudioShuffleCut[], sourceDuration: number) {
  const sorted = cuts.map((cut) => ({ start: cut.start, end: cut.end })).sort((a, b) => a.start - b.start);
  let covered = 0; let start = -1; let end = -1;
  for (const interval of sorted) {
    if (start < 0) { start = interval.start; end = interval.end; continue; }
    if (interval.start <= end) end = Math.max(end, interval.end);
    else { covered += end - start; start = interval.start; end = interval.end; }
  }
  if (start >= 0) covered += end - start;
  return Math.round(clamp(covered / sourceDuration * 100, 0, 100));
}

function sequenceDiversity(cuts: AudioShuffleCut[]) {
  if (!cuts.length) return 0;
  const uniqueZones = new Set(cuts.map((cut) => cut.zone)).size;
  const relaxedPenalty = cuts.reduce((sum, cut) => sum + cut.relaxationLevel * 4, 0);
  const repeatedPenalty = (cuts.length - uniqueZones) * 5;
  return Math.round(clamp(100 - relaxedPenalty - repeatedPenalty, 0, 100));
}

function addCutToMemory(cut: AudioShuffleCut, memory: BatchMemory) {
  memory.intervals.push({ start: cut.start, end: cut.end, zone: cut.zone });
  memory.zoneUses.set(cut.zone, (memory.zoneUses.get(cut.zone) ?? 0) + 1);
  memory.globalCutIndex += 1;
  memory.zoneLastCut.set(cut.zone, memory.globalCutIndex);
}

function buildSequence(target: AudioShuffleTarget, sequenceSeed: string, sourceDuration: number, settings: AudioShuffleSettings, zones: Zone[], markedRegions: AudioMarkedRegion[], history: AudioRegionUsage[], memory: BatchMemory, acousticAnalysis?: AudioAcousticAnalysis): AudioShuffleSequence {
  const random = createSeededRandom(sequenceSeed);
  const cuts: AudioShuffleCut[] = [];
  const sequenceIntervals: Interval[] = [];
  let cycleZones = new Set(zones.map((zone) => zone.index));
  let timeline = 0;

  while (target.duration - timeline > EPSILON) {
    if (cuts.length >= MAX_CUTS_PER_SEQUENCE) throw new Error("A configuração produziu cortes demais para uma única sequência.");
    const remaining = target.duration - timeline;
    const desired = remaining <= settings.minCutSeconds
      ? remaining
      : Math.min(remaining, random.between(settings.minCutSeconds, settings.maxCutSeconds));
    const duration = Math.max(EPSILON, Math.min(desired, sourceDuration));
    const candidate = selectCandidate({ duration, zones, cycleZones, sourceDuration, settings, markedRegions, history, memory, sequenceIntervals, random, acousticAnalysis });
    const remainingAfterCut = Math.max(0, remaining - duration);
    const canPause = remainingAfterCut > settings.minCutSeconds + settings.minPauseSeconds;
    const pauseAfter = canPause ? Math.min(remainingAfterCut - settings.minCutSeconds, random.between(settings.minPauseSeconds, settings.maxPauseSeconds)) : 0;
    const cut: AudioShuffleCut = {
      id: `${target.variationId}-A${String(cuts.length + 1).padStart(3, "0")}`,
      zone: candidate.zone, start: round(candidate.start), end: round(candidate.end), duration: round(duration),
      timelineStart: round(timeline), timelineEnd: round(timeline + duration), pauseAfter: round(pauseAfter),
      boundary: candidate.boundary, locked: false, relaxationLevel: candidate.relaxationLevel,
    };
    cuts.push(cut);
    sequenceIntervals.push(candidate);
    addCutToMemory(cut, memory);
    cycleZones.delete(candidate.zone);
    if (!cycleZones.size) cycleZones = new Set(zones.map((zone) => zone.index));
    timeline = round(timeline + duration + pauseAfter);
  }

  const sequence: AudioShuffleSequence = {
    id: `AS-V${AUDIO_SHUFFLE_ALGORITHM_VERSION}-${target.variationId}`,
    variationId: target.variationId, seed: sequenceSeed, targetDuration: round(target.duration), cuts,
    diversityScore: sequenceDiversity(cuts), coverage: sequenceCoverage(cuts, sourceDuration),
    locked: false, status: "ready",
  };
  return sequence;
}

function historiesForScope(input: AudioShuffleGenerationInput) {
  if (input.settings.historyScope === "batch") return [];
  if (input.settings.historyScope === "global") return [...(input.projectHistory ?? []), ...(input.globalHistory ?? [])];
  return input.projectHistory ?? [];
}

function aggregateUsage(base: AudioRegionUsage[], sequences: AudioShuffleSequence[], batchId: string) {
  const rows = base.map((item) => ({ ...item }));
  for (const sequence of sequences) for (let index = 0; index < sequence.cuts.length; index += 1) {
    const cut = sequence.cuts[index];
    const matching = rows.find((row) => row.zone === cut.zone && overlaps(row, cut));
    if (matching) {
      matching.start = Math.min(matching.start, cut.start); matching.end = Math.max(matching.end, cut.end);
      matching.useCount += 1; matching.usedDuration += cut.duration; matching.lastBatchId = batchId;
      matching.lastSequenceId = sequence.id; matching.lastCutIndex = index;
    } else rows.push({ zone: cut.zone, start: cut.start, end: cut.end, useCount: 1, usedDuration: cut.duration, lastBatchId: batchId, lastSequenceId: sequence.id, lastCutIndex: index });
  }
  return rows;
}

export function generateAudioShuffleBatch(input: AudioShuffleGenerationInput): AudioShuffleGenerationResult {
  validateAudioShuffleInput(input);
  const regions = normalizeMarkedRegions(input.markedRegions ?? [], input.sourceDuration);
  const zones = createAudioZones(input.sourceDuration, input.settings.zoneCount);
  const history = historiesForScope(input);
  const batchId = input.batchId || `ASB-${input.settings.seed}`;
  const previous = new Map((input.previousSequences ?? []).map((sequence) => [sequence.variationId, sequence]));
  const memory: BatchMemory = { intervals: [], zoneUses: new Map(), zoneLastCut: new Map(), globalCutIndex: 0 };
  const sequences: AudioShuffleSequence[] = [];

  for (const target of input.targets) {
    const saved = previous.get(target.variationId);
    if (saved?.locked && Math.abs(saved.targetDuration - target.duration) <= EPSILON) {
      sequences.push(saved); saved.cuts.forEach((cut) => addCutToMemory(cut, memory)); continue;
    }
    sequences.push(buildSequence(target, deriveAudioSeed(input.settings.seed, target.variationId), input.sourceDuration, input.settings, zones, regions, history, memory, input.acousticAnalysis));
  }

  return {
    algorithmVersion: AUDIO_SHUFFLE_ALGORITHM_VERSION,
    sourceFingerprint: input.sourceFingerprint ?? `duration-only:${round(input.sourceDuration)}`,
    batchId, seed: input.settings.seed, sequences,
    usageHistory: aggregateUsage(input.projectHistory ?? [], sequences, batchId),
    relaxedSequenceIds: sequences.filter((sequence) => sequence.cuts.some((cut) => cut.relaxationLevel > 0)).map((sequence) => sequence.id),
  };
}

export function regenerateAudioShuffleSequence(input: AudioShuffleGenerationInput, variationId: string, revision = 1) {
  validateAudioShuffleInput(input);
  const target = input.targets.find((item) => item.variationId === variationId);
  if (!target) throw new Error(`Variação ${variationId} não encontrada.`);
  const preserved = (input.previousSequences ?? []).filter((sequence) => sequence.variationId !== variationId);
  const memory: BatchMemory = { intervals: [], zoneUses: new Map(), zoneLastCut: new Map(), globalCutIndex: 0 };
  preserved.forEach((sequence) => sequence.cuts.forEach((cut) => addCutToMemory(cut, memory)));
  const sequence = buildSequence(
    target, deriveAudioSeed(input.settings.seed, variationId, revision), input.sourceDuration, input.settings,
    createAudioZones(input.sourceDuration, input.settings.zoneCount), normalizeMarkedRegions(input.markedRegions ?? [], input.sourceDuration),
    historiesForScope(input), memory, input.acousticAnalysis,
  );
  return [...preserved, sequence].sort((a, b) => input.targets.findIndex((item) => item.variationId === a.variationId) - input.targets.findIndex((item) => item.variationId === b.variationId));
}

export function regenerateAudioShuffleCut(input: AudioShuffleGenerationInput, variationId: string, cutIndex: number, revision = 1) {
  validateAudioShuffleInput(input);
  const original = input.previousSequences?.find((sequence) => sequence.variationId === variationId);
  const originalCut = original?.cuts[cutIndex];
  if (!original || !originalCut) throw new Error("O corte solicitado não foi encontrado.");
  if (originalCut.locked) throw new Error("Desbloqueie o corte antes de regenerá-lo.");
  const settings = {
    ...input.settings, seed: deriveAudioSeed(input.settings.seed, `${variationId}:cut:${cutIndex}`, revision),
    minCutSeconds: originalCut.duration, maxCutSeconds: originalCut.duration, minPauseSeconds: 0, maxPauseSeconds: 0,
  };
  const replacement = generateAudioShuffleBatch({
    ...input, settings, targets: [{ variationId: `${variationId}-cut-${cutIndex}`, duration: originalCut.duration }],
    previousSequences: undefined,
  }).sequences[0].cuts[0];
  return {
    ...original,
    cuts: original.cuts.map((cut, index) => index === cutIndex ? {
      ...replacement, id: cut.id, timelineStart: cut.timelineStart, timelineEnd: cut.timelineEnd,
      duration: cut.duration, pauseAfter: cut.pauseAfter,
    } : cut),
  };
}
