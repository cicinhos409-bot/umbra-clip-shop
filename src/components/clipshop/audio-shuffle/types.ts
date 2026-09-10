export type AudioShuffleMode = "mix" | "replace" | "audio-only";
export type AudioMaterialType = "auto" | "music" | "voice" | "mixed";
export type AudioBoundaryMode = "free" | "acoustic" | "speech" | "musical";
export type AudioDiversity = "low" | "medium" | "high";
export type AudioHistoryScope = "batch" | "project" | "global";
export type AudioTransition = "cut" | "fade" | "crossfade" | "pause" | "auto";
export type AudioMarkedRegionKind = "blocked" | "priority" | "intro" | "chorus" | "outro" | "voice" | "instrumental" | "favorite";

export interface AudioShuffleAsset {
  id: string;
  fileName: string;
  duration: number;
  size: number;
  mimeType: string;
  fingerprint: string;
  storageKey: string;
  analysisStorageKey?: string;
  createdAt: string;
}

export interface AudioShuffleStoredSource extends AudioShuffleAsset {
  scope: "library" | "project";
  projectId?: string;
  blob?: Blob;
  available: boolean;
  storage: "opfs" | "indexeddb" | "missing";
}

export interface AudioShuffleSavedPreset {
  id: string;
  name: string;
  settings: AudioShuffleSettings;
  createdAt: string;
  updatedAt: string;
}

export interface AudioShuffleSavedSequence {
  id: string;
  sourceId: string;
  projectId?: string;
  algorithmVersion: number;
  sourceFingerprint: string;
  seed: string;
  sequence: AudioShuffleSequence;
  createdAt: string;
}

export interface AudioShuffleBatchSummary {
  batchId: string;
  seed: string;
  createdAt: string;
  sequenceIds: string[];
  variationIds: string[];
  averageCoverage: number;
  averageDiversity: number;
  repetition: number;
}

export interface AudioShuffleQueueSnapshot {
  sourceId: string;
  sourceFingerprint: string;
  algorithmVersion: number;
  settings: AudioShuffleSettings;
  variationSequenceIds: Record<string, string>;
  sequences: AudioShuffleSequence[];
}

export interface AudioShuffleSettings {
  enabled: boolean;
  mode: AudioShuffleMode;
  materialType: AudioMaterialType;
  boundaryMode: AudioBoundaryMode;
  minCutSeconds: number;
  maxCutSeconds: number;
  maxCutsPerSource: number;
  minPauseSeconds: number;
  maxPauseSeconds: number;
  minimumDistanceSeconds: number;
  zoneCooldownCuts: number;
  zoneCount: number | "auto";
  diversity: AudioDiversity;
  historyScope: AudioHistoryScope;
  centerCuts: boolean;
  backgroundVolume: number;
  duckingEnabled: boolean;
  transition: AudioTransition;
  transitionMs: number;
  seed: string;
}

export interface AudioMarkedRegion {
  id: string;
  start: number;
  end: number;
  kind: AudioMarkedRegionKind;
  label?: string;
}

export interface AudioRegionUsage {
  zone: number;
  start: number;
  end: number;
  useCount: number;
  usedDuration: number;
  lastBatchId?: string;
  lastSequenceId?: string;
  lastCutIndex?: number;
  updatedAt?: string;
}

export interface AudioAcousticFrame {
  index: number;
  start: number;
  end: number;
  min: number;
  max: number;
  rms: number;
  energy: number;
  zeroCrossingRate: number;
  transient: number;
  silence: boolean;
  voiceProbability: number;
}

export interface AudioAcousticAnalysis {
  version: number;
  duration: number;
  sampleRate: number;
  channels: number;
  windowSeconds: number;
  hopSeconds: number;
  silenceThreshold: number;
  frames: AudioAcousticFrame[];
  waveform: Array<{ start: number; end: number; min: number; max: number }>;
}

export interface AudioAcousticAnalysisSettings {
  windowMs?: number;
  hopMs?: number;
  silenceThresholdDb?: number;
}

export interface AudioShuffleCut {
  id: string;
  zone: number;
  start: number;
  end: number;
  duration: number;
  timelineStart: number;
  timelineEnd: number;
  pauseAfter: number;
  boundary: "temporal" | "acoustic" | "zero-crossing" | "speech" | "beat";
  locked: boolean;
  relaxationLevel: number;
}

export interface AudioShuffleSequence {
  id: string;
  variationId: string;
  seed: string;
  targetDuration: number;
  cuts: AudioShuffleCut[];
  diversityScore: number;
  coverage: number;
  locked: boolean;
  status: "draft" | "ready" | "rendering" | "completed" | "error";
  outputId?: string;
}

export interface AudioShuffleTarget {
  variationId: string;
  duration: number;
}

export interface AudioShuffleGenerationInput {
  sourceDuration: number;
  sourceFingerprint?: string;
  targets: AudioShuffleTarget[];
  settings: AudioShuffleSettings;
  markedRegions?: AudioMarkedRegion[];
  projectHistory?: AudioRegionUsage[];
  globalHistory?: AudioRegionUsage[];
  previousSequences?: AudioShuffleSequence[];
  acousticAnalysis?: AudioAcousticAnalysis;
  batchId?: string;
}

export interface AudioShuffleGenerationResult {
  algorithmVersion: number;
  sourceFingerprint: string;
  batchId: string;
  seed: string;
  sequences: AudioShuffleSequence[];
  usageHistory: AudioRegionUsage[];
  relaxedSequenceIds: string[];
}

export interface GenerateAudioSequencesInput {
  sourceDuration: number;
  targetDurations: number[] | AudioShuffleTarget[];
  settings?: Partial<AudioShuffleSettings>;
  seed: string;
  history?: AudioRegionUsage[];
  globalHistory?: AudioRegionUsage[];
  markedRegions?: AudioMarkedRegion[];
  previousSequences?: AudioShuffleSequence[];
  acousticAnalysis?: AudioAcousticAnalysis;
  sourceFingerprint?: string;
  batchId?: string;
}

export interface AudioShuffleProjectState {
  source: AudioShuffleAsset | null;
  settings: AudioShuffleSettings;
  sequences: AudioShuffleSequence[];
  usageHistory: AudioRegionUsage[];
  blockedRegions: AudioMarkedRegion[];
  algorithmVersion: number;
  variationSequenceIds: Record<string, string>;
  renderedAudioStorageKeys: Record<string, string>;
  batchHistory: AudioShuffleBatchSummary[];
}
