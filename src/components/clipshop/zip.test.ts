import { buildStoredZip } from "./services/zip";

test("creates a ZIP containing every named result", async () => {
  const zip = await buildStoredZip([
    { name: "video-01.mp4", blob: new Blob(["one"]) },
    { name: "manifesto.csv", blob: new Blob(["two"]) },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
  expect(text).toContain("video-01.mp4");
  expect(text).toContain("manifesto.csv");
  expect(zip.type).toBe("application/zip");
});
