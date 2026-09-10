export type ClipCategory = "hook" | "body" | "cta";
export type ClipStatus = "validating" | "ready" | "warning" | "error";
export type VariationStrategy = "balanced" | "hooks" | "bodies" | "ctas";
export type VariationStatus = "idle" | "queued" | "processing" | "completed" | "error" | "canceled";
export type ProjectStatus = "draft" | "ready" | "processing" | "completed";
export type OutputQuality = "performance" | "quality";
export type AudioPolicyMode = "preserve" | "normalize" | "mute";
export type VideoCompositionMode = "cover" | "contain" | "blur" | "original";

export interface AudioPolicy {
  mode: AudioPolicyMode;
  targetLoudnessDb: number;
  peakDb: number;
  fadeMs: number;
}

export interface ClipMediaInfo {
  duration: number;
  width: number;
  height: number;
  size: number;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  hasAudio: boolean;
  messages: string[];
}

export interface ClipAsset {
  id: string;
  category: ClipCategory;
  slot: number;
  file: File;
  fileName: string;
  semanticName: string;
  status: ClipStatus;
  media: ClipMediaInfo;
  thumbnail?: string;
  objectUrl: string;
  storageKey?: string;
  muted?: boolean;
  createdAt: string;
}

export interface Variation {
  id: string;
  algorithmVersion: number;
  number: number;
  hookId: string;
  bodyId: string;
  ctaId: string;
  selected: boolean;
  status: VariationStatus;
  progress: number;
  error?: string;
  recoverable?: boolean;
  outputId?: string;
}

export interface ClipShopProject {
  id: string;
  name: string;
  productName: string;
  status: ProjectStatus;
  strategy: VariationStrategy;
  quality: OutputQuality;
  audioPolicy: AudioPolicy;
  compositionMode: VideoCompositionMode;
  exportNameTemplate: string;
  clips: ClipAsset[];
  variations: Variation[];
  audioShuffle?: AudioShuffleProjectState;
  createdAt: string;
  updatedAt: string;
}

export interface RenderOutput {
  id: string;
  projectId: string;
  variationId: string;
  fileName: string;
  blob: Blob;
  objectUrl: string;
  duration: number;
  size: number;
  createdAt: string;
  storageKey?: string;
  audioStorageKey?: string;
  audioBlob?: Blob;
  audioObjectUrl?: string;
}

export interface RenderProgress {
  variationId: string;
  progress: number;
  stage: "preparing" | "rendering" | "finalizing";
}

export interface CompatibilityReport {
  supported: boolean;
  worker: boolean;
  indexedDb: boolean;
  opfs: boolean;
  webCodecs: boolean;
  webAssembly: boolean;
  storageQuota?: number;
  storageUsage?: number;
  warnings: string[];
}

export interface ClipShopUsage {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  plan: string;
}

export interface QueueSnapshot {
  projectId: string;
  requestId: string;
  reservationId: string;
  targetVariationIds: string[];
  completedVariationIds: string[];
  failedVariationIds: string[];
  currentVariationId?: string;
  status: "reserved" | "running" | "interrupted";
  createdAt: string;
  updatedAt: string;
  audioShuffle?: AudioShuffleQueueSnapshot;
}

export interface LocalProjectStorageInfo {
  projectId: string;
  sourceBytes: number;
  outputBytes: number;
  outputCount: number;
}
import type { AudioShuffleProjectState, AudioShuffleQueueSnapshot } from "./audio-shuffle/types";
