export const MAX_CLIP_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_PROJECT_SOURCE_BYTES = 3 * 1024 * 1024 * 1024;
export const STORAGE_HEADROOM_BYTES = 200 * 1024 * 1024;
export const RECOMMENDED_LOCAL_PROJECTS = 10;

export function validateProjectFiles(currentBytes: number, incoming: File[]) {
  const oversized = incoming.find((file) => file.size > MAX_CLIP_FILE_BYTES);
  if (oversized) return `${oversized.name} excede o limite de 500 MB por arquivo.`;
  const total = currentBytes + incoming.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_PROJECT_SOURCE_BYTES) return "O projeto excederia o limite de 3 GB em arquivos de origem.";
  return null;
}

export function hasStorageFor(availableBytes: number | undefined, estimatedBytes: number) {
  if (availableBytes === undefined) return true;
  return availableBytes >= estimatedBytes + STORAGE_HEADROOM_BYTES;
}
