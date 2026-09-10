const TIMESTAMP_EPSILON = 1e-9;

export function normalizePacketTimestamp(timestamp: number, segmentStart: number, outputOffset: number) {
  const normalized = timestamp - segmentStart + outputOffset;
  return normalized < 0 && normalized > -TIMESTAMP_EPSILON ? 0 : Math.max(0, normalized);
}

export function getSegmentDuration(segmentEnd: number, segmentStart: number) {
  return Math.max(0, segmentEnd - segmentStart);
}
