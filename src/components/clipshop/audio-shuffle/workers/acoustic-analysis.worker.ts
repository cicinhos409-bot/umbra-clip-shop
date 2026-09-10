/// <reference lib="webworker" />
import { analyzePcmChannels } from "../services/acoustic-analysis";
import type { AudioAcousticAnalysisSettings } from "../types";

type Request = { id: string; sampleRate: number; channels: ArrayBuffer[]; settings?: AudioAcousticAnalysisSettings };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, sampleRate, channels, settings } = event.data;
  try {
    const analysis = analyzePcmChannels(channels.map((buffer) => new Float32Array(buffer)), sampleRate, settings);
    self.postMessage({ id, type: "done", analysis });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : "Falha na análise acústica." });
  }
};

export {};
