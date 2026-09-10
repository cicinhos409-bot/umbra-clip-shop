import { hasStorageFor, MAX_CLIP_FILE_BYTES, validateProjectFiles } from "./services/limits";

test("rejects an oversized clip and project", () => {
  expect(validateProjectFiles(0, [new File([new Uint8Array(1)], "ok.mp4")])).toBeNull();
  const huge = { name: "huge.mp4", size: MAX_CLIP_FILE_BYTES + 1 } as File;
  expect(validateProjectFiles(0, [huge])).toContain("500 MB");
});

test("keeps storage headroom before rendering", () => {
  expect(hasStorageFor(500 * 1024 * 1024, 100 * 1024 * 1024)).toBe(true);
  expect(hasStorageFor(250 * 1024 * 1024, 100 * 1024 * 1024)).toBe(false);
});
