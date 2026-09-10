import type { ClipAsset, ClipCategory } from "../types";
import { inspectMediaWithMediabunny } from "../../editor/mediaValidation";

export const MAX_CLIP_DURATION_SECONDS = 30;

export async function createClipAsset(file: File, category: ClipCategory, slot: number): Promise<ClipAsset> {
  const inspected = await inspectMediaWithMediabunny(file);
  const tooLong = inspected.durationInSeconds > MAX_CLIP_DURATION_SECONDS + 0.01;
  const messages = [...inspected.validation.messages];
  if (tooLong) messages.push(`O clipe excede o limite de ${MAX_CLIP_DURATION_SECONDS} segundos.`);
  const incompatible = inspected.validation.status === "incompatible" || tooLong || !inspected.width || !inspected.height;
  const warning = !incompatible && (inspected.validation.status === "warning" || inspected.width / inspected.height > 0.7);
  const id = crypto.randomUUID();
  return {
    id, category, slot, file, fileName: file.name,
    semanticName: `${category === "hook" ? "Gancho" : category === "body" ? "Corpo" : "CTA"} ${slot}`,
    status: incompatible ? "error" : warning ? "warning" : "ready",
    media: {
      duration: inspected.durationInSeconds, width: inspected.width, height: inspected.height, size: file.size,
      container: inspected.validation.container, videoCodec: inspected.validation.videoCodec,
      audioCodec: inspected.validation.audioCodec, fps: inspected.validation.fps,
      hasAudio: inspected.validation.hasAudio, messages,
    },
    thumbnail: inspected.thumbnail, objectUrl: URL.createObjectURL(file), createdAt: new Date().toISOString(),
  };
}
