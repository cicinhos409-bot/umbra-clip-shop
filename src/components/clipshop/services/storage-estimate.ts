import type { OutputQuality } from "../types";

export const VIDEO_BITRATE_BITS_PER_SECOND: Record<OutputQuality, number> = {
  performance: 4_000_000,
  quality: 8_000_000,
};

export const AUDIO_BITRATE_BITS_PER_SECOND = 128_000;
export const CONTAINER_OVERHEAD_FACTOR = 1.08;
export const TEMPORARY_WORKING_FACTOR = 2.25;

/**
 * Estimates peak local space for a batch: encoded outputs plus a conservative
 * allowance for normalized segments and the finalization buffer.
 */
export function estimateRenderStorageBytes(totalDurationSeconds: number, quality: OutputQuality) {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) return 0;
  const encodedBytes = totalDurationSeconds
    * (VIDEO_BITRATE_BITS_PER_SECOND[quality] + AUDIO_BITRATE_BITS_PER_SECOND)
    / 8;
  return Math.ceil(encodedBytes * CONTAINER_OVERHEAD_FACTOR * TEMPORARY_WORKING_FACTOR);
}
