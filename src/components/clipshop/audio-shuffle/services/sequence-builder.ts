import { DEFAULT_AUDIO_SHUFFLE_SETTINGS } from "../presets";
import type { AudioShuffleTarget, GenerateAudioSequencesInput } from "../types";
import { generateAudioShuffleBatch } from "./diversity-engine";

function normalizeTargets(targetDurations: GenerateAudioSequencesInput["targetDurations"]): AudioShuffleTarget[] {
  return targetDurations.map((target, index) => typeof target === "number"
    ? { variationId: `V${String(index + 1).padStart(2, "0")}`, duration: target }
    : target);
}

/**
 * Contrato público do motor matemático. Não lê, decodifica ou envia o áudio:
 * recebe apenas duração, seed, regras e histórico e devolve intervalos temporais.
 */
export function generateAudioSequences(input: GenerateAudioSequencesInput) {
  return generateAudioShuffleBatch({
    sourceDuration: input.sourceDuration,
    sourceFingerprint: input.sourceFingerprint,
    targets: normalizeTargets(input.targetDurations),
    settings: {
      ...DEFAULT_AUDIO_SHUFFLE_SETTINGS,
      ...input.settings,
      enabled: true,
      seed: input.seed,
    },
    markedRegions: input.markedRegions,
    projectHistory: input.history,
    globalHistory: input.globalHistory,
    previousSequences: input.previousSequences,
    acousticAnalysis: input.acousticAnalysis,
    batchId: input.batchId,
  });
}
