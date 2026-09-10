export function muxAudioIntoVideo(video: Blob, audio: Blob, signal?: AbortSignal): Promise<Blob> {
  const worker = new Worker(new URL("../workers/audio-mux.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Mux cancelado.", "AbortError")); };
    if (signal?.aborted) return abort(); signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Falha no Worker de mux.")); };
    worker.onmessage = (event: MessageEvent<{ id: string; type: "done" | "error"; buffer?: ArrayBuffer; message?: string }>) => {
      if (event.data.id !== id) return; cleanup();
      if (event.data.type === "done" && event.data.buffer) resolve(new Blob([event.data.buffer], { type: "video/mp4" }));
      else reject(new Error(event.data.message || "Falha no mux do Audio Shuffle."));
    };
    worker.postMessage({ id, video, audio });
  });
}
