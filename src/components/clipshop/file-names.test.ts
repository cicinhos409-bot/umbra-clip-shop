import { buildManifest, sanitizeFilePart, uniqueFileName, variationFileName } from "./services/file-names";
import type { ClipAsset, Variation } from "./types";

const asset = (id: string, semanticName: string): ClipAsset => ({
  id, semanticName, category: id[0] === "h" ? "hook" : id[0] === "b" ? "body" : "cta", slot: 1,
  file: {} as File, fileName: `${id}.mp4`, status: "ready", objectUrl: "", createdAt: "",
  media: { duration: 1, width: 1, height: 1, size: 1, container: "MP4", videoCodec: "avc", audioCodec: "aac", fps: 30, hasAudio: true, messages: [] },
});
const clips = [asset("h1", "Dor urgente"), asset("b1", "Benefício #1"), asset("t1", "Compre agora")];
const variation: Variation = { id: "CS-V1-GH1-CB1-TT1", algorithmVersion: 1, number: 1, hookId: "h1", bodyId: "b1", ctaId: "t1", selected: true, status: "idle", progress: 0 };

test("sanitizes accents and unsafe characters", () => expect(sanitizeFilePart("  Vídeo: Oferta / 01  ")).toBe("video-oferta-01"));
test("formats configurable export names", () => expect(variationFileName("Escova Elétrica", variation, clips, "{project}-{gancho}-{cta}")).toBe("escova-eletrica-dor-urgente-compre-agora.mp4"));
test("adds a stable suffix when a configured model collides", () => {
  const used = new Set(["produto-gancho.mp4", "produto-gancho-2.mp4"]);
  expect(uniqueFileName("produto-gancho.mp4", used)).toBe("produto-gancho-3.mp4");
});
test("manifest preserves permanent identity", () => {
  const csv = buildManifest("Produto", [variation], clips);
  expect(csv).toContain("CS-V1-GH1-CB1-TT1");
  expect(csv).toContain("Dor urgente");
});
