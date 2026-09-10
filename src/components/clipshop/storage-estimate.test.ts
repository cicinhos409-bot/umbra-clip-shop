import {
  AUDIO_BITRATE_BITS_PER_SECOND,
  CONTAINER_OVERHEAD_FACTOR,
  estimateRenderStorageBytes,
  TEMPORARY_WORKING_FACTOR,
  VIDEO_BITRATE_BITS_PER_SECOND,
} from "./services/storage-estimate";

test("estimates peak batch storage from duration and the performance bitrate", () => {
  const seconds = 90;
  const expected = Math.ceil(seconds * (VIDEO_BITRATE_BITS_PER_SECOND.performance + AUDIO_BITRATE_BITS_PER_SECOND) / 8 * CONTAINER_OVERHEAD_FACTOR * TEMPORARY_WORKING_FACTOR);
  expect(estimateRenderStorageBytes(seconds, "performance")).toBe(expected);
});

test("estimates a larger result for the 1080p quality profile", () => {
  expect(estimateRenderStorageBytes(60, "quality")).toBeGreaterThan(estimateRenderStorageBytes(60, "performance"));
});

test("does not estimate storage for an empty or invalid duration", () => {
  expect(estimateRenderStorageBytes(0, "quality")).toBe(0);
  expect(estimateRenderStorageBytes(Number.NaN, "quality")).toBe(0);
});
