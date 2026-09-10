import { getSegmentDuration, normalizePacketTimestamp } from "./services/packet-timing";

describe("Clip Shop packet timing", () => {
  it("moves a negative source timestamp to zero", () => {
    expect(normalizePacketTimestamp(-0.042666666666666665, -0.042666666666666665, 0)).toBe(0);
  });

  it("preserves the relative A/V offset inside a segment", () => {
    expect(normalizePacketTimestamp(0, -0.042666666666666665, 0)).toBeCloseTo(0.042666666666666665);
  });

  it("places subsequent segments after the previous output", () => {
    expect(normalizePacketTimestamp(-0.02, -0.02, 4.5)).toBe(4.5);
  });

  it("includes a negative source start in the effective duration", () => {
    expect(getSegmentDuration(4.5, -0.02)).toBeCloseTo(4.52);
  });
});
