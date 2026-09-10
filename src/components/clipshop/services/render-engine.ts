import type { AudioPolicy, ClipAsset, OutputAspectRatio, OutputQuality, RenderProgress, Variation, VideoCompositionMode } from "../types";
import { buildVariationRecipe, variationRecipeSignature } from "./variation-recipe";

export interface RenderedVideo { blob: Blob; duration: number }

export function renderVariation(variation: Variation, clips: ClipAsset[], settings?: { audioPolicy: AudioPolicy; compositionMode: VideoCompositionMode; quality?: OutputQuality; visualVariationsEnabled?: boolean; mp4MetadataEnabled?: boolean; outputAspectRatio?: OutputAspectRatio; headlineText?: string; captionText?: string }, onProgress?: (event: RenderProgress) => void, signal?: AbortSignal): Promise<RenderedVideo> {
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
    const recipe = settings?.visualVariationsEnabled === false ? undefined : variation.recipe || buildVariationRecipe(variation.number);
    const metadata = settings?.mp4MetadataEnabled === false ? undefined : {
      title: `UMBRA Clip Shop - Variação ${String(variation.number).padStart(2, "0")}`,
      description: `${hook.semanticName} + ${body.semanticName} + ${cta.semanticName}`,
      comment: `variation_id=${variation.id}; algorithm=v${variation.algorithmVersion}; recipe=${recipe ? variationRecipeSignature(recipe) : "disabled"}`,
    };
    worker.postMessage({
      id: requestId,
      clips: [hook, body, cta].map((clip) => ({ file: clip.file, muted: Boolean(clip.muted) })),
      settings: {
        ...settings,
        recipe,
        metadata,
      },
    });
  });
}
