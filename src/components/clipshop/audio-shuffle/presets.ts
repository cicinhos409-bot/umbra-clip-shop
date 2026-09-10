import type { AudioShuffleProjectState, AudioShuffleSettings } from "./types";
import { AUDIO_SHUFFLE_ALGORITHM_VERSION } from "./services/diversity-engine";

export type AudioShufflePresetKey = "viral" | "natural" | "cinematic" | "voice" | "music";

export const DEFAULT_AUDIO_SHUFFLE_SETTINGS: AudioShuffleSettings = {
  enabled: false,
  mode: "mix",
  materialType: "auto",
  boundaryMode: "acoustic",
  minCutSeconds: 4,
  maxCutSeconds: 12,
  maxCutsPerSource: 100,
  minPauseSeconds: 1,
  maxPauseSeconds: 1,
  minimumDistanceSeconds: 30,
  zoneCooldownCuts: 5,
  zoneCount: "auto",
  diversity: "high",
  historyScope: "project",
  centerCuts: true,
  backgroundVolume: 0.22,
  duckingEnabled: true,
  transition: "auto",
  transitionMs: 100,
  seed: "813291",
};

export const AUDIO_SHUFFLE_PRESETS: Record<AudioShufflePresetKey, { name: string; description: string; settings: Partial<AudioShuffleSettings> }> = {
  viral: { name: "Viral rápido", description: "Mudanças frequentes e alta diversidade.", settings: { minCutSeconds: 2, maxCutSeconds: 6, minPauseSeconds: 0.2, maxPauseSeconds: 0.6, diversity: "high", transition: "cut", transitionMs: 40 } },
  natural: { name: "Natural", description: "Cortes equilibrados e transições suaves.", settings: { minCutSeconds: 5, maxCutSeconds: 12, minPauseSeconds: 0.5, maxPauseSeconds: 1.2, diversity: "medium", transition: "fade", transitionMs: 100 } },
  cinematic: { name: "Cinematográfico", description: "Trechos longos, menos mudanças e fades maiores.", settings: { minCutSeconds: 10, maxCutSeconds: 22, minPauseSeconds: 0, maxPauseSeconds: 0.4, diversity: "medium", transition: "crossfade", transitionMs: 250 } },
  voice: { name: "Voz completa", description: "Prioriza blocos de fala e pausas naturais.", settings: { materialType: "voice", boundaryMode: "speech", minCutSeconds: 5, maxCutSeconds: 14, minPauseSeconds: 0.4, maxPauseSeconds: 1, transition: "fade", transitionMs: 60 } },
  music: { name: "Música dinâmica", description: "Prioriza limites musicais e regiões energéticas.", settings: { materialType: "music", boundaryMode: "musical", minCutSeconds: 4, maxCutSeconds: 10, minPauseSeconds: 0, maxPauseSeconds: 0.3, diversity: "high", transition: "crossfade", transitionMs: 120 } },
};

export function settingsFromPreset(key: AudioShufflePresetKey, seed = DEFAULT_AUDIO_SHUFFLE_SETTINGS.seed): AudioShuffleSettings {
  return { ...DEFAULT_AUDIO_SHUFFLE_SETTINGS, ...AUDIO_SHUFFLE_PRESETS[key].settings, seed };
}

export function createDefaultAudioShuffleProjectState(): AudioShuffleProjectState {
  return {
    source: null,
    settings: { ...DEFAULT_AUDIO_SHUFFLE_SETTINGS },
    sequences: [],
    usageHistory: [],
    blockedRegions: [],
    algorithmVersion: AUDIO_SHUFFLE_ALGORITHM_VERSION,
    variationSequenceIds: {},
    renderedAudioStorageKeys: {},
    batchHistory: [],
  };
}
