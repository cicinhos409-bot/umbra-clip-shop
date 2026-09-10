interface MediaValidationResult {
  engine: "mediabunny" | "browser";
  status: "compatible" | "warning" | "incompatible";
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  hasAudio: boolean;
  videoDecodable: boolean | null;
  audioDecodable: boolean | null;
  checkedAt: string;
  messages: string[];
}

export interface MediaInspection {
  durationInSeconds: number;
  width: number;
  height: number;
  thumbnail?: string;
  validation: MediaValidationResult;
}

async function canvasToDataUrl(source: HTMLCanvasElement | OffscreenCanvas) {
  if (source instanceof HTMLCanvasElement) return source.toDataURL("image/jpeg", 0.76);
  const blob = await source.convertToBlob({ type: "image/jpeg", quality: 0.76 });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function inspectMediaWithMediabunny(file: File): Promise<MediaInspection> {
  // O pacote é carregado apenas durante a ingestão para não pesar na abertura do editor/Player.
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const checkedAt = new Date().toISOString();
  try {
    const readable = await input.canRead();
    if (!readable) throw new Error("Formato não reconhecido pelo Mediabunny.");
    const [format, videoTrack, audioTrack] = await Promise.all([
      input.getFormat(), input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(),
    ]);
    if (!videoTrack && !audioTrack) throw new Error("O arquivo não possui faixa de vídeo ou áudio utilizável.");

    const [duration, videoCodec, audioCodec, videoDecodable, audioDecodable] = await Promise.all([
      input.computeDuration(),
      videoTrack?.getCodecParameterString() ?? Promise.resolve(null),
      audioTrack?.getCodecParameterString() ?? Promise.resolve(null),
      videoTrack?.canDecode() ?? Promise.resolve(null),
      audioTrack?.canDecode() ?? Promise.resolve(null),
    ]);
    const [width, height, packetStats] = videoTrack
      ? await Promise.all([videoTrack.getDisplayWidth(), videoTrack.getDisplayHeight(), videoTrack.computePacketStats(120)])
      : [0, 0, null] as const;
    const fps = packetStats && Number.isFinite(packetStats.averagePacketRate) ? Number(packetStats.averagePacketRate.toFixed(3)) : null;
    const messages: string[] = [];
    if (videoTrack && !videoDecodable) messages.push(`Codec de vídeo não decodificável: ${videoCodec ?? "desconhecido"}.`);
    if (audioTrack && !audioDecodable) messages.push(`Codec de áudio não decodificável: ${audioCodec ?? "desconhecido"}.`);
    if (videoTrack && (!width || !height)) messages.push("Resolução de vídeo inválida.");
    if (!Number.isFinite(duration) || duration <= 0) messages.push("Duração inválida ou não determinada.");

    let thumbnail: string | undefined;
    if (videoTrack && videoDecodable) {
      try {
        const sink = new CanvasSink(videoTrack, { width: 320, fit: "contain" });
        const wrapped = await sink.getCanvas(Math.min(Math.max(duration * 0.1, 0), Math.max(0, duration - 0.05)));
        if (wrapped) thumbnail = await canvasToDataUrl(wrapped.canvas);
      } catch {
        messages.push("O vídeo é válido, mas não foi possível gerar a thumbnail.");
      }
    }

    const incompatible = (videoTrack && !videoDecodable) || (!videoTrack && audioTrack && !audioDecodable) || duration <= 0;
    return {
      durationInSeconds: duration,
      width,
      height,
      thumbnail,
      validation: {
        engine: "mediabunny",
        status: incompatible ? "incompatible" : messages.length ? "warning" : "compatible",
        container: format.name,
        videoCodec,
        audioCodec,
        fps,
        hasAudio: Boolean(audioTrack),
        videoDecodable,
        audioDecodable,
        checkedAt,
        messages,
      },
    };
  } catch (cause) {
    return {
      durationInSeconds: 0,
      width: 0,
      height: 0,
      validation: {
        engine: "mediabunny", status: "incompatible", container: null, videoCodec: null, audioCodec: null,
        fps: null, hasAudio: false, videoDecodable: null, audioDecodable: null, checkedAt,
        messages: [cause instanceof Error ? cause.message : "Arquivo incompatível."],
      },
    };
  } finally {
    input.dispose();
  }
}
