import { generateVariations, hasMinimumClips } from "./services/variation-engine";
import type { ClipAsset, ClipCategory } from "./types";

function clip(category: ClipCategory, slot: number): ClipAsset {
  const id = `${category}-${slot}`;
  return {
    id, category, slot, file: {} as File, fileName: `${id}.mp4`, semanticName: id, status: "ready",
    media: { duration: 5, width: 1080, height: 1920, size: 1, container: "MP4", videoCodec: "avc1", audioCodec: "mp4a", fps: 30, hasAudio: true, messages: [] },
    objectUrl: "", createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const full = (["hook", "body", "cta"] as const).flatMap((category) => [1, 2, 3].map((slot) => clip(category, slot)));

test("requires at least one valid clip in every category", () => {
  expect(hasMinimumClips(full)).toBe(true);
  expect(hasMinimumClips(full.filter((item) => item.category !== "cta"))).toBe(false);
});

test("returns every unique combination when fewer than 27 exist", () => {
  const clips = [clip("hook", 1), clip("hook", 2), clip("body", 1), clip("cta", 1), clip("cta", 2)];
  const result = generateVariations(clips);
  expect(result).toHaveLength(4);
  expect(new Set(result.map((item) => item.id)).size).toBe(4);
});

test("creates all 27 deterministic variations for 3x3x3", () => {
  const first = generateVariations(full);
  const second = generateVariations([...full].reverse());
  expect(first).toEqual(second);
  expect(first).toHaveLength(27);
  expect(new Set(first.map((item) => item.id)).size).toBe(27);
  expect(first.slice(0, 4).map((item) => [item.hookId, item.bodyId, item.ctaId])).toEqual([
    ["hook-1", "body-1", "cta-1"],
    ["hook-1", "body-1", "cta-2"],
    ["hook-1", "body-1", "cta-3"],
    ["hook-1", "body-2", "cta-1"],
  ]);
  for (const category of ["hookId", "bodyId", "ctaId"] as const) {
    const counts = new Map<string, number>();
    first.forEach((item) => counts.set(item[category], (counts.get(item[category]) ?? 0) + 1));
    expect([...counts.values()].sort()).toEqual([9, 9, 9]);
  }
});

test("caps a 6x6x6 workspace at 150 diverse unique variations", () => {
  const expanded = (["hook", "body", "cta"] as const).flatMap((category) =>
    [1, 2, 3, 4, 5, 6].map((slot) => clip(category, slot)),
  );
  const result = generateVariations(expanded);
  expect(result).toHaveLength(150);
  expect(new Set(result.map((item) => item.id)).size).toBe(150);
  for (const category of ["hookId", "bodyId", "ctaId"] as const) {
    expect(new Set(result.map((item) => item[category])).size).toBe(6);
  }
});

test.each(["balanced", "hooks", "bodies", "ctas"] as const)("strategy %s never duplicates a trio", (strategy) => {
  const result = generateVariations(full, strategy);
  const trios = result.map((item) => `${item.hookId}|${item.bodyId}|${item.ctaId}`);
  expect(new Set(trios).size).toBe(trios.length);
});
