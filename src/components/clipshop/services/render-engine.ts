import type { AudioPolicy, ClipAsset, OutputQuality, RenderProgress, Variation, VideoCompositionMode } from "../types";

export interface RenderedVideo { blob: Blob; duration: number }

export function renderVariation(variation: Variation, clips: ClipAsset[], settings?: { audioPolicy: AudioPolicy; compositionMode: VideoCompositionMode; quality?: OutputQuality }, onProgress?: (event: RenderProgress) => void, signal?: AbortSignal): Promise<RenderedVideo> {
  const resolveClip = (id: string) => clips.find((clip) => clip.id === id);
  const hook = resolveClip(variation.hookId);
  const body = resolveClip(variation.bodyId);
  const cta = resolveClip(variation.ctaId);
  if (!hook || !body || !cta) return Promise.reject(new Error("Um dos clipes da variação não está disponível."));
  const worker = new Worker(new URL("../workers/render.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const abort = () => { worker.terminate(); reject(new DOMException("Renderização cancelada.", "AbortError")); };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ id: string; type: string; value?: number; buffer?: ArrayBuffer; duration?: number; message?: string }>) => {
      if (event.data.id !== requestId) return;
      if (event.data.type === "progress") onProgress?.({ variationId: variation.id, progress: event.data.value ?? 0, stage: (event.data.value ?? 0) >= 0.9 ? "finalizing" : "rendering" });
      if (event.data.type === "done" && event.data.buffer) {
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        resolve({ blob: new Blob([event.data.buffer], { type: "video/mp4" }), duration: event.data.duration ?? 0 });
      }
      if (event.data.type === "error") {
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        reject(new Error(event.data.message || "Falha ao gerar o vídeo."));
      }
    };
    worker.onerror = (event) => { signal?.removeEventListener("abort", abort); worker.terminate(); reject(new Error(event.message || "Falha no Worker de vídeo.")); };
    onProgress?.({ variationId: variation.id, progress: 0, stage: "preparing" });
    worker.postMessage({ id: requestId, clips: [hook, body, cta].map((clip) => ({ file: clip.file, muted: Boolean(clip.muted) })), settings });
  });
}
