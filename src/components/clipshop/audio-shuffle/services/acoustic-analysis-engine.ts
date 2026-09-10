import type { AudioAcousticAnalysis, AudioAcousticAnalysisSettings } from "../types";

export async function analyzeAudioSource(file: File, settings?: AudioAcousticAnalysisSettings, signal?: AbortSignal): Promise<AudioAcousticAnalysis> {
  if (signal?.aborted) throw new DOMException("Análise cancelada.", "AbortError");
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass) throw new Error("AudioContext não está disponível neste navegador.");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (signal?.aborted) throw new DOMException("Análise cancelada.", "AbortError");
    const buffers = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index).slice().buffer);
    return await new Promise<AudioAcousticAnalysis>((resolve, reject) => {
      const worker = new Worker(new URL("../workers/acoustic-analysis.worker.ts", import.meta.url), { type: "module" });
      const id = crypto.randomUUID();
      const cleanup = () => { signal?.removeEventListener("abort", abort); worker.terminate(); };
      const abort = () => { cleanup(); reject(new DOMException("Análise cancelada.", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Falha no Worker de análise acústica.")); };
      worker.onmessage = (event: MessageEvent<{ id: string; type: "done" | "error"; analysis?: AudioAcousticAnalysis; message?: string }>) => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.type === "done" && event.data.analysis) resolve(event.data.analysis);
        else reject(new Error(event.data.message || "Falha na análise acústica."));
      };
      worker.postMessage({ id, sampleRate: decoded.sampleRate, channels: buffers, settings }, buffers);
    });
  } finally {
    void context.close();
  }
}
