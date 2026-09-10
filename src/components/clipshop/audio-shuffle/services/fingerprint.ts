const SAMPLE_BYTES = 1024 * 1024;

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Local sampled fingerprint: metadata plus beginning, middle and end of the source. */
export async function fingerprintAudioSource(file: File) {
  const offsets = [0, Math.max(0, Math.floor(file.size / 2 - SAMPLE_BYTES / 2)), Math.max(0, file.size - SAMPLE_BYTES)];
  const samples = await Promise.all(offsets.map((offset) => file.slice(offset, Math.min(file.size, offset + SAMPLE_BYTES)).arrayBuffer()));
  const metadata = new TextEncoder().encode(`${file.size}:${file.type}:${file.lastModified}`);
  const total = metadata.byteLength + samples.reduce((sum, item) => sum + item.byteLength, 0);
  const payload = new Uint8Array(total);
  payload.set(metadata, 0);
  let cursor = metadata.byteLength;
  for (const sample of samples) { payload.set(new Uint8Array(sample), cursor); cursor += sample.byteLength; }
  return `sha256-sampled:${hex(await crypto.subtle.digest("SHA-256", payload))}`;
}
