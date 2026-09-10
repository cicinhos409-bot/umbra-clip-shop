import type { AudioMarkedRegion, AudioShuffleGenerationInput, AudioShuffleSettings } from "../types";

export class AudioShuffleValidationError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "AudioShuffleValidationError"; }
}

export function automaticZoneCount(duration: number) {
  if (duration <= 5 * 60) return 5;
  if (duration <= 15 * 60) return 8;
  return duration <= 30 * 60 ? 10 : 12;
}

export function validateAudioShuffleSettings(settings: AudioShuffleSettings) {
  if (!Number.isFinite(settings.minCutSeconds) || settings.minCutSeconds <= 0) throw new AudioShuffleValidationError("INVALID_MIN_CUT", "A duração mínima deve ser maior que zero.");
  if (!Number.isFinite(settings.maxCutSeconds) || settings.maxCutSeconds < settings.minCutSeconds) throw new AudioShuffleValidationError("INVALID_MAX_CUT", "A duração máxima deve ser igual ou maior que a mínima.");
  if (!Number.isInteger(settings.maxCutsPerSource) || settings.maxCutsPerSource < 1) throw new AudioShuffleValidationError("INVALID_MAX_CUTS_PER_SOURCE", "A quantidade máxima de cortes por áudio deve ser um número inteiro maior que zero.");
  if (settings.minPauseSeconds < 0 || settings.maxPauseSeconds < settings.minPauseSeconds) throw new AudioShuffleValidationError("INVALID_PAUSE", "O intervalo de pausa é inválido.");
  if (settings.minimumDistanceSeconds < 0) throw new AudioShuffleValidationError("INVALID_DISTANCE", "A distância mínima não pode ser negativa.");
  if (!Number.isInteger(settings.zoneCooldownCuts) || settings.zoneCooldownCuts < 0) throw new AudioShuffleValidationError("INVALID_COOLDOWN", "O cooldown deve ser um número inteiro não negativo.");
  if (settings.zoneCount !== "auto" && (!Number.isInteger(settings.zoneCount) || settings.zoneCount < 1 || settings.zoneCount > 64)) throw new AudioShuffleValidationError("INVALID_ZONE_COUNT", "A quantidade de zonas deve ficar entre 1 e 64.");
  if (settings.backgroundVolume < 0 || settings.backgroundVolume > 1) throw new AudioShuffleValidationError("INVALID_VOLUME", "O volume de fundo deve ficar entre 0 e 1.");
}

export function normalizeMarkedRegions(regions: AudioMarkedRegion[], sourceDuration: number) {
  return regions.map((region) => ({ ...region, start: Math.max(0, Math.min(sourceDuration, region.start)), end: Math.max(0, Math.min(sourceDuration, region.end)) }))
    .filter((region) => Number.isFinite(region.start) && Number.isFinite(region.end) && region.end > region.start)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}

export function validateAudioShuffleInput(input: AudioShuffleGenerationInput) {
  validateAudioShuffleSettings(input.settings);
  if (!Number.isFinite(input.sourceDuration) || input.sourceDuration <= 0) throw new AudioShuffleValidationError("INVALID_SOURCE_DURATION", "A fonte precisa ter duração válida.");
  if (!input.targets.length) throw new AudioShuffleValidationError("NO_TARGETS", "Informe ao menos uma variação para gerar.");
  if (input.targets.length > 27) throw new AudioShuffleValidationError("TOO_MANY_TARGETS", "O lote aceita no máximo 27 variações.");
  const ids = new Set<string>();
  for (const target of input.targets) {
    if (!target.variationId || ids.has(target.variationId)) throw new AudioShuffleValidationError("INVALID_TARGET_ID", "As variações precisam ter IDs únicos.");
    if (!Number.isFinite(target.duration) || target.duration <= 0) throw new AudioShuffleValidationError("INVALID_TARGET_DURATION", `A duração de ${target.variationId} é inválida.`);
    ids.add(target.variationId);
  }
  const blocked = normalizeMarkedRegions(input.markedRegions ?? [], input.sourceDuration).filter((region) => region.kind === "blocked");
  let blockedDuration = 0; let blockedEnd = 0;
  for (const region of blocked) {
    if (region.start >= blockedEnd) blockedDuration += region.end - region.start;
    else if (region.end > blockedEnd) blockedDuration += region.end - blockedEnd;
    blockedEnd = Math.max(blockedEnd, region.end);
  }
  if (blockedDuration >= input.sourceDuration - 0.01) throw new AudioShuffleValidationError("NO_USABLE_REGION", "Todas as regiões da fonte estão bloqueadas.");
}
