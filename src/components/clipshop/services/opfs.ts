function supported() {
  return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);
}

async function directory(parts: string[], create: boolean) {
  let current = await navigator.storage.getDirectory();
  for (const part of parts) current = await current.getDirectoryHandle(part, { create });
  return current;
}

export async function writeOpfs(path: string, blob: Blob) {
  if (!supported()) return false;
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return false;
  const folder = await directory(parts, true);
  const handle = await folder.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

export async function readOpfs(path: string) {
  if (!supported()) return null;
  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return null;
    const folder = await directory(parts, false);
    return await (await folder.getFileHandle(fileName)).getFile();
  } catch { return null; }
}

export async function removeProjectOpfs(projectId: string) {
  if (!supported()) return;
  try {
    const projects = await directory(["clipshop", "projects"], false);
    await projects.removeEntry(projectId, { recursive: true });
  } catch { /* diretório ausente */ }
}

export async function removeClipShopOpfs() {
  if (!supported()) return;
  try { await (await navigator.storage.getDirectory()).removeEntry("clipshop", { recursive: true }); }
  catch { /* diretório ausente */ }
}

export async function removeTemporaryOpfs() {
  if (!supported()) return;
  try { await (await navigator.storage.getDirectory()).removeEntry("clipshop-temp", { recursive: true }); }
  catch { /* diretório ausente */ }
}

export async function removeOpfs(path: string) {
  if (!supported()) return;
  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;
    const folder = await directory(parts, false);
    await folder.removeEntry(fileName);
  } catch { /* arquivo ausente */ }
}

export async function opfsUsage() {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}
