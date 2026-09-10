/// <reference lib="webworker" />
import {
  ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, canEncodeAudio,
  EncodedPacketSink, EncodedVideoPacketSource, Input, Mp4OutputFormat, Output,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

type Request = { id: string; video: Blob; audio: Blob };

function retimestamp(sample: AudioSample, timestamp: number) {
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels);
  for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
    sample.copyTo(data.subarray(channel * sample.numberOfFrames, (channel + 1) * sample.numberOfFrames), { planeIndex: channel, format: "f32-planar" });
  }
  return new AudioSample({ data, format: "f32-planar", numberOfChannels: sample.numberOfChannels, sampleRate: sample.sampleRate, timestamp });
}

async function mux(videoBlob: Blob, audioBlob: Blob) {
  if (!(await canEncodeAudio("aac"))) registerAacEncoder();
  const videoInput = new Input({ source: new BlobSource(videoBlob), formats: ALL_FORMATS });
  const audioInput = new Input({ source: new BlobSource(audioBlob), formats: ALL_FORMATS });
  try {
    const video = await videoInput.getPrimaryVideoTrack(); const audio = await audioInput.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error("Faixa necessária ausente durante o mux do Audio Shuffle.");
    const codec = await video.getCodec(); if (!codec) throw new Error("Codec de vídeo não identificado.");
    const target = new BufferTarget(); const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory", metadataFormat: "mdta" }), target });
    const videoSource = new EncodedVideoPacketSource(codec); const audioSource = new AudioSampleSource({ codec: "aac", bitrate: 160_000 });
    output.addVideoTrack(videoSource, { rotation: await video.getRotation() }); output.addAudioTrack(audioSource); output.setMetadataTags(await videoInput.getMetadataTags()); await output.start();
    const videoSink = new EncodedPacketSink(video); const videoConfig = await video.getDecoderConfig(); const videoFirst = await video.getFirstTimestamp(); let firstPacket = true;
    for await (const packet of videoSink.packets()) { await videoSource.add(packet.clone({ timestamp: Math.max(0, packet.timestamp - videoFirst) }), firstPacket && videoConfig ? { decoderConfig: videoConfig } : undefined); firstPacket = false; }
    const audioFirst = await audio.getFirstTimestamp(); const audioSink = new AudioSampleSink(audio);
    for await (const sample of audioSink.samples()) {
      const adjusted = retimestamp(sample, Math.max(0, sample.timestamp - audioFirst)); sample.close(); await audioSource.add(adjusted); adjusted.close();
    }
    videoSource.close(); audioSource.close(); await output.finalize();
    if (!target.buffer) throw new Error("O mux final não produziu um MP4.");
    return target.buffer;
  } finally { videoInput.dispose(); audioInput.dispose(); }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  try { const buffer = await mux(event.data.video, event.data.audio); self.postMessage({ id: event.data.id, type: "done", buffer }, { transfer: [buffer] }); }
  catch (error) { self.postMessage({ id: event.data.id, type: "error", message: error instanceof Error ? error.message : "Falha no mux de áudio." }); }
};

export {};
