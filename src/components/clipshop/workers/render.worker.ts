/// <reference lib="webworker" />

import {
  ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo, Conversion,
  EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Input, Mp4OutputFormat, Output,
  VideoSample,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { getSegmentDuration, normalizePacketTimestamp } from "../services/packet-timing";
import type { AudioPolicy, OutputAspectRatio, OutputQuality, VariationRecipe, VideoCompositionMode } from "../types";

type RenderSettings = {
  audioPolicy: AudioPolicy;
  compositionMode: VideoCompositionMode;
  quality?: OutputQuality;
  recipe?: VariationRecipe;
  metadata?: { title: string; description: string; comment: string };
  outputAspectRatio?: OutputAspectRatio;
  headlineText?: string;
  captionText?: string;
};
type Request = { id: string; clips: [{ file: File; muted: boolean }, { file: File; muted: boolean }, { file: File; muted: boolean }]; settings?: RenderSettings };
type Response = { id: string; type: "progress"; value: number } | { id: string; type: "done"; buffer: ArrayBuffer; duration: number } | { id: string; type: "error"; message: string };

const DEFAULT_SETTINGS: RenderSettings = { audioPolicy: { mode: "normalize", targetLoudnessDb: -14, peakDb: -1, fadeMs: 12 }, compositionMode: "contain" };

type AudioAnalysis = { rms: number; peak: number; firstTimestamp: number };

async function analyzeAudio(input: Input) : Promise<AudioAnalysis | null> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  const sink = new AudioSampleSink(track);
  let squareSum = 0;
  let peak = 0;
  let valueCount = 0;
  for await (const sample of sink.samples()) {
    try {
      const frames = sample.numberOfFrames;
      for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
        const plane = new Float32Array(frames);
        sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
        for (const value of plane) { squareSum += value * value; peak = Math.max(peak, Math.abs(value)); }
        valueCount += frames;
      }
    } finally { sample.close(); }
  }
  return { rms: Math.sqrt(squareSum / Math.max(1, valueCount)), peak, firstTimestamp: await track.getFirstTimestamp() };
}

function processAudioSample(sample: AudioSample, duration: number, policy: AudioPolicy, analysis: AudioAnalysis) {
  const channels = sample.numberOfChannels;
  const frames = sample.numberOfFrames;
  const data = new Float32Array(frames * channels);
  for (let channel = 0; channel < channels; channel += 1) {
    const plane = data.subarray(channel * frames, (channel + 1) * frames);
    sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
  }
  const target = 10 ** (policy.targetLoudnessDb / 20);
  const ceiling = 10 ** (policy.peakDb / 20);
  const gain = analysis.rms > 0.00001 ? Math.min(target / analysis.rms, analysis.peak > 0 ? ceiling / analysis.peak : 1, 8) : 1;
  const fadeSeconds = policy.fadeMs / 1000;
  for (let channel = 0; channel < channels; channel += 1) {
    const plane = data.subarray(channel * frames, (channel + 1) * frames);
    for (let frame = 0; frame < frames; frame += 1) {
      const time = Math.max(0, sample.timestamp - analysis.firstTimestamp + frame / sample.sampleRate);
      const fadeIn = fadeSeconds > 0 ? Math.min(1, Math.max(0, time / fadeSeconds)) : 1;
      const fadeOut = fadeSeconds > 0 ? Math.min(1, Math.max(0, (duration - time) / fadeSeconds)) : 1;
      plane[frame] = Math.max(-ceiling, Math.min(ceiling, plane[frame] * gain * fadeIn * fadeOut));
    }
  }
  return new AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: sample.sampleRate, timestamp: sample.timestamp });
}

function transformedFrame(sample: VideoSample, width: number, height: number, settings: RenderSettings) {
  const recipe = settings.recipe;
  if (!recipe && settings.compositionMode !== "blur" && !settings.headlineText && !settings.captionText) return sample;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return sample;
  context.fillStyle = "black";
  context.fillRect(0, 0, width, height);

  const sourceRatio = sample.displayWidth / sample.displayHeight;
  const targetRatio = width / height;
  if (settings.compositionMode === "blur") {
    const coverWidth = sourceRatio > targetRatio ? height * sourceRatio : width;
    const coverHeight = sourceRatio > targetRatio ? height : width / sourceRatio;
    context.filter = "blur(28px) brightness(.65)";
    sample.draw(context, (width - coverWidth) / 2, (height - coverHeight) / 2, coverWidth, coverHeight);
  }

  const cover = settings.compositionMode === "cover";
  const baseWidth = cover
    ? (sourceRatio > targetRatio ? height * sourceRatio : width)
    : (sourceRatio > targetRatio ? width : height * sourceRatio);
  const baseHeight = cover
    ? (sourceRatio > targetRatio ? height : width / sourceRatio)
    : (sourceRatio > targetRatio ? width / sourceRatio : height);
  const zoom = recipe?.zoom ?? 1;
  const drawWidth = baseWidth * zoom;
  const drawHeight = baseHeight * zoom;
  const x = (width - drawWidth) / 2 + (recipe?.offsetX ?? 0) * width;
  const y = (height - drawHeight) / 2 + (recipe?.offsetY ?? 0) * height;
  context.filter = `brightness(${recipe?.brightness ?? 1}) saturate(${recipe?.saturation ?? 1})`;
  sample.draw(context, x, y, drawWidth, drawHeight);
  context.filter = "none";
  drawOverlayText(context, settings.headlineText, width, height * 0.1, width, "top");
  drawOverlayText(context, settings.captionText, width, height * 0.86, width, "bottom");
  return canvas;
}

function drawOverlayText(context: OffscreenCanvasRenderingContext2D, text: string | undefined, width: number, y: number, canvasWidth: number, position: "top" | "bottom") {
  const value = text?.trim();
  if (!value) return;
  const fontSize = Math.max(24, Math.round(canvasWidth * (position === "top" ? 0.052 : 0.04)));
  context.font = `900 ${fontSize}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(5, fontSize * 0.16);
  context.strokeStyle = "rgba(0,0,0,.92)";
  context.fillStyle = position === "top" ? "#fbbf24" : "#ffffff";
  const maxChars = Math.max(12, Math.floor(34 * canvasWidth / 1080));
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((row, index) => {
    const lineY = y + index * fontSize * 1.15;
    context.strokeText(row, width / 2, lineY);
    context.fillText(row, width / 2, lineY);
  });
}

async function addSilentAudio(file: File) {
  if (!(await canEncodeAudio("aac"))) registerAacEncoder();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error("Não foi possível criar silêncio: faixa de vídeo ausente.");
  const codec = await video.getCodec();
  if (!codec) throw new Error("Não foi possível criar silêncio: codec de vídeo ausente.");
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const videoSource = new EncodedVideoPacketSource(codec);
  const audioSource = new AudioSampleSource({ codec: "aac", bitrate: 128_000 });
  output.addVideoTrack(videoSource, { rotation: await video.getRotation() });
  output.addAudioTrack(audioSource);
  try {
    await output.start();
    const sink = new EncodedPacketSink(video);
    const config = await video.getDecoderConfig();
    const firstTimestamp = await video.getFirstTimestamp();
    let first = true;
    for await (const packet of sink.packets()) {
      await videoSource.add(packet.clone({ timestamp: Math.max(0, packet.timestamp - firstTimestamp) }), first && config ? { decoderConfig: config } : undefined);
      first = false;
    }
    const duration = await input.computeDuration();
    for (let timestamp = 0; timestamp < duration; timestamp += 1) {
      const frames = Math.max(1, Math.round(Math.min(1, duration - timestamp) * 48_000));
      const silence = new AudioSample({ data: new Float32Array(frames * 2), format: "f32-planar", numberOfChannels: 2, sampleRate: 48_000, timestamp });
      await audioSource.add(silence); silence.close();
    }
    videoSource.close(); audioSource.close();
    await output.finalize();
    if (!target.buffer) throw new Error("Não foi possível criar a faixa de silêncio.");
    return new File([target.buffer], `${file.name}.silence.mp4`, { type: "video/mp4" });
  } finally { input.dispose(); }
}

async function normalizeFile(file: File, includeAudio: boolean, ensureAudio: boolean, width: number, height: number, settings: RenderSettings) {
  if (!(await canEncodeVideo("avc", { width, height, bitrate: 4_000_000 }))) {
    throw new Error("Este dispositivo não possui um encoder H.264 compatível para normalizar os clipes.");
  }
  if (includeAudio && !(await canEncodeAudio("aac"))) registerAacEncoder();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const inputDuration = await input.computeDuration();
  const audioAnalysis = includeAudio && settings.audioPolicy.mode === "normalize" ? await analyzeAudio(input) : null;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  try {
    const conversion = await Conversion.init({
      input, output, tracks: "primary", showWarnings: false,
      video: { width, height, fit: settings.compositionMode === "cover" ? "cover" : "contain", codec: "avc", bitrate: settings.quality === "quality" ? 8_000_000 : 4_000_000, frameRate: 30, keyFrameInterval: 2, forceTranscode: true, allowRotationMetadata: false, process: settings.recipe || settings.compositionMode === "blur" || settings.headlineText || settings.captionText ? (sample) => transformedFrame(sample, width, height, settings) : undefined, processedWidth: width, processedHeight: height },
      audio: includeAudio ? { codec: "aac", bitrate: 128_000, sampleRate: 48_000, numberOfChannels: 2, sampleFormat: "f32", forceTranscode: true, process: settings.audioPolicy.mode === "normalize" && audioAnalysis ? (sample) => processAudioSample(sample, inputDuration, settings.audioPolicy, audioAnalysis) : undefined } : { discard: true },
    });
    if (!conversion.isValid) throw new Error("Não foi possível preparar este clipe para o perfil interno.");
    await conversion.execute();
    if (!target.buffer) throw new Error("A normalização não produziu um arquivo.");
    const normalized = new File([target.buffer], `${file.name}.normalized.mp4`, { type: "video/mp4" });
    return ensureAudio && !includeAudio ? await addSilentAudio(normalized) : normalized;
  } finally { input.dispose(); }
}

async function concat(files: [File, File, File], muted: [boolean, boolean, boolean], settings: RenderSettings, progress: (value: number) => void, normalized = false): Promise<{ buffer: ArrayBuffer; duration: number }> {
  const inputs = files.map((file) => new Input({ source: new BlobSource(file), formats: ALL_FORMATS }));
  try {
    const videoTracks = await Promise.all(inputs.map((input) => input.getPrimaryVideoTrack()));
    if (videoTracks.some((track) => !track)) throw new Error("Todos os segmentos precisam ter uma faixa de vídeo.");
    const videos = videoTracks as NonNullable<(typeof videoTracks)[number]>[];
    const videoCodecs = await Promise.all(videos.map((track) => track.getCodec()));
    const dimensions = await Promise.all(videos.map(async (track) => [await track.getDisplayWidth(), await track.getDisplayHeight(), await track.getRotation()] as const));
    const audioTracks = await Promise.all(inputs.map((input) => input.getPrimaryAudioTrack()));
    const effectiveAudio = audioTracks.map((track, index) => Boolean(track) && !muted[index] && settings.audioPolicy.mode !== "mute");
    const hasEveryAudio = effectiveAudio.every(Boolean);
    const hasSomeAudio = effectiveAudio.some(Boolean);

    const needsVideoNormalization = !videoCodecs[0]
      || videoCodecs.some((codec) => codec !== videoCodecs[0])
      || dimensions.some(([width, height, rotation]) => width !== dimensions[0][0] || height !== dimensions[0][1] || rotation !== dimensions[0][2]);
    let needsAudioNormalization = false;
    if (hasEveryAudio) {
      const audios = audioTracks as NonNullable<(typeof audioTracks)[number]>[];
      const codecs = await Promise.all(audios.map((track) => track.getCodec()));
      const configs = await Promise.all(audios.map((track) => track.getDecoderConfig()));
      needsAudioNormalization = !codecs[0] || codecs.some((codec) => codec !== codecs[0]) || configs.some((config) => config?.sampleRate !== configs[0]?.sampleRate || config?.numberOfChannels !== configs[0]?.numberOfChannels);
    }
    const forcePolicyNormalization = Boolean(settings.outputAspectRatio) || Boolean(settings.recipe) || Boolean(settings.headlineText) || Boolean(settings.captionText) || settings.compositionMode !== "original" || settings.audioPolicy.mode !== "preserve" || muted.some(Boolean) || (hasSomeAudio && !hasEveryAudio);
    if ((needsVideoNormalization || needsAudioNormalization || forcePolicyNormalization) && !normalized) {
      progress(0.03);
      const normalizedFiles = [] as File[];
      const longEdge = settings.quality === "quality" ? 1920 : 1280;
      const shortEdge = settings.quality === "quality" ? 1080 : 720;
      const profile = settings.outputAspectRatio === "1:1" ? [shortEdge, shortEdge]
        : settings.outputAspectRatio === "16:9" ? [longEdge, shortEdge]
          : [shortEdge, longEdge];
      const targetWidth = settings.compositionMode === "original" && !settings.outputAspectRatio ? Math.max(2, dimensions[0][0] - dimensions[0][0] % 2) : profile[0];
      const targetHeight = settings.compositionMode === "original" && !settings.outputAspectRatio ? Math.max(2, dimensions[0][1] - dimensions[0][1] % 2) : profile[1];
      for (let index = 0; index < files.length; index += 1) {
        normalizedFiles.push(await normalizeFile(files[index], effectiveAudio[index], hasSomeAudio, targetWidth, targetHeight, settings));
        progress(0.05 + (index + 1) / files.length * 0.4);
      }
      return concat(normalizedFiles as [File, File, File], [false, false, false], settings, (value) => progress(0.45 + value * 0.55), true);
    }
    if (!videoCodecs[0]) throw new Error("Codec de vídeo não identificado.");

    const videoSource = new EncodedVideoPacketSource(videoCodecs[0]);
    let audioSource: EncodedAudioPacketSource | null = null;
    let audioDecoderConfig: AudioDecoderConfig | null = null;
    if (hasEveryAudio) {
      const audios = audioTracks as NonNullable<(typeof audioTracks)[number]>[];
      const codecs = await Promise.all(audios.map((track) => track.getCodec()));
      const configs = await Promise.all(audios.map((track) => track.getDecoderConfig()));
      if (!codecs[0] || codecs.some((codec) => codec !== codecs[0]) || configs.some((config) => config?.sampleRate !== configs[0]?.sampleRate || config?.numberOfChannels !== configs[0]?.numberOfChannels)) throw new Error("As faixas de áudio permaneceram incompatíveis após a normalização.");
      audioSource = new EncodedAudioPacketSource(codecs[0]);
      audioDecoderConfig = configs[0];
    }

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory", metadataFormat: "mdta" }), target });
    output.addVideoTrack(videoSource, { rotation: dimensions[0][2] });
    if (audioSource) output.addAudioTrack(audioSource);
    if (settings.metadata) output.setMetadataTags({
      title: settings.metadata.title,
      description: settings.metadata.description,
      artist: "UMBRA Clip Shop",
      comment: settings.metadata.comment,
      date: new Date(),
    });
    await output.start();

    const segmentStarts = await Promise.all(videos.map(async (video, index) => {
      const timestamps = [await video.getFirstTimestamp()];
      const audio = audioTracks[index];
      if (audio) timestamps.push(await audio.getFirstTimestamp());
      return Math.min(...timestamps);
    }));
    const segmentEnds = await Promise.all(inputs.map((input) => input.computeDuration()));
    const segmentDurations = segmentEnds.map((end, index) => getSegmentDuration(end, segmentStarts[index]));
    const totalDuration = segmentDurations.reduce((sum, value) => sum + value, 0);
    let offset = 0;
    for (let index = 0; index < inputs.length; index += 1) {
      const videoTrack = videos[index];
      const videoSink = new EncodedPacketSink(videoTrack);
      const videoConfig = await videoTrack.getDecoderConfig();
      let firstVideo = true;
      for await (const packet of videoSink.packets()) {
        await videoSource.add(packet.clone({ timestamp: normalizePacketTimestamp(packet.timestamp, segmentStarts[index], offset) }), firstVideo && videoConfig ? { decoderConfig: videoConfig } : undefined);
        firstVideo = false;
      }
      const audioTrack = audioTracks[index];
      if (audioSource && audioTrack) {
        const audioSink = new EncodedPacketSink(audioTrack);
        let firstAudio = true;
        for await (const packet of audioSink.packets()) {
          await audioSource.add(packet.clone({ timestamp: normalizePacketTimestamp(packet.timestamp, segmentStarts[index], offset) }), firstAudio && audioDecoderConfig ? { decoderConfig: audioDecoderConfig } : undefined);
          firstAudio = false;
        }
      }
      offset += segmentDurations[index];
      progress((index + 1) / inputs.length * 0.9);
    }
    videoSource.close();
    audioSource?.close();
    await output.finalize();
    progress(1);
    if (!target.buffer) throw new Error("O motor não produziu o arquivo final.");
    return { buffer: target.buffer, duration: totalDuration };
  } finally {
    inputs.forEach((input) => input.dispose());
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, clips, settings = DEFAULT_SETTINGS } = event.data;
  try {
    const files = clips.map((clip) => clip.file) as [File, File, File];
    const muted = clips.map((clip) => clip.muted) as [boolean, boolean, boolean];
    const result = await concat(files, muted, settings, (value) => self.postMessage({ id, type: "progress", value } satisfies Response));
    self.postMessage({ id, type: "done", ...result } satisfies Response, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : "Falha ao gerar o vídeo." } satisfies Response);
  }
};

export {};
