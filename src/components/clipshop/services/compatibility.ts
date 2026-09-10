import type { CompatibilityReport } from "../types";

export async function checkCompatibility(): Promise<CompatibilityReport> {
  const worker = typeof Worker !== "undefined";
  const indexedDb = typeof indexedDB !== "undefined";
  const opfs = typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);
  const webCodecs = typeof VideoDecoder !== "undefined" && typeof VideoEncoder !== "undefined";
  const webAssembly = typeof WebAssembly !== "undefined";
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const warnings: string[] = [];
  if (!worker) warnings.push("Web Workers indisponíveis.");
  if (!indexedDb) warnings.push("IndexedDB indisponível; projetos não poderão ser restaurados.");
  if (!opfs) warnings.push("OPFS indisponível; o armazenamento local terá recursos limitados.");
  if (!webCodecs) warnings.push("WebCodecs indisponível; alguns codecs ou renders podem falhar.");
  if (!webAssembly) warnings.push("WebAssembly indisponível.");
  return {
    supported: worker && indexedDb && webAssembly,
    worker, indexedDb, opfs, webCodecs, webAssembly,
    storageQuota: estimate?.quota, storageUsage: estimate?.usage, warnings,
  };
}
