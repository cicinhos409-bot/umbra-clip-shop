import type { ClipShopProject, LocalProjectStorageInfo, QueueSnapshot, RenderOutput } from "../types";
import { readOpfs, removeClipShopOpfs, removeOpfs, removeProjectOpfs, removeTemporaryOpfs, writeOpfs } from "./opfs";

const DB_NAME = "umbra-clipshop";
const DB_VERSION = 2;
const PROJECTS = "projects";
const OUTPUTS = "outputs";
const QUEUES = "queues";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(OUTPUTS)) {
        const store = db.createObjectStore(OUTPUTS, { keyPath: "id" });
        store.createIndex("projectId", "projectId");
      }
      if (!db.objectStoreNames.contains(QUEUES)) db.createObjectStore(QUEUES, { keyPath: "projectId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: ClipShopProject) {
  const db = await openDb();
  try {
    const storedClips = [];
    for (const clip of project.clips) {
      const storageKey = clip.storageKey || `clipshop/projects/${project.id}/source/${clip.id}`;
      const inOpfs = await writeOpfs(storageKey, clip.file).catch(() => false);
      const { objectUrl: _objectUrl, file, ...metadata } = clip;
      storedClips.push(inOpfs
        ? { ...metadata, storageKey }
        : { ...metadata, file, storageKey: undefined });
    }
    const clone = { ...project, clips: storedClips };
    await requestResult(db.transaction(PROJECTS, "readwrite").objectStore(PROJECTS).put(clone));
  } finally { db.close(); }
}

export async function listProjects(): Promise<ClipShopProject[]> {
  const db = await openDb();
  try {
    const rows = await requestResult(db.transaction(PROJECTS).objectStore(PROJECTS).getAll()) as ClipShopProject[];
    const restored = [] as ClipShopProject[];
    for (const project of rows) {
      const clips = [] as ClipShopProject["clips"];
      for (const clip of project.clips) {
        const stored = clip.storageKey ? await readOpfs(clip.storageKey) : null;
        const file = stored ? new File([stored], clip.fileName, { type: stored.type || clip.file?.type || "video/mp4", lastModified: stored.lastModified }) : clip.file;
        if (!file || !file.size) {
          const missing = new File([], clip.fileName, { type: clip.file?.type || "video/mp4" });
          clips.push({ ...clip, file: missing, status: "error", media: { ...clip.media, messages: [...clip.media.messages, "Arquivo local removido ou inacessível."] }, objectUrl: "" });
          continue;
        }
        clips.push({ ...clip, file, objectUrl: URL.createObjectURL(file) });
      }
      restored.push({ ...project, clips });
    }
    return restored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export async function deleteProject(projectId: string) {
  const db = await openDb();
  try {
    const keys = await requestResult(db.transaction(OUTPUTS).objectStore(OUTPUTS).index("projectId").getAllKeys(projectId));
    const tx = db.transaction([PROJECTS, OUTPUTS, QUEUES], "readwrite");
    tx.objectStore(PROJECTS).delete(projectId);
    tx.objectStore(QUEUES).delete(projectId);
    keys.forEach((key) => tx.objectStore(OUTPUTS).delete(key));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } finally { db.close(); }
  await removeProjectOpfs(projectId);
}

export async function deleteClipSource(storageKey?: string) {
  if (storageKey) await removeOpfs(storageKey);
}

export async function saveOutput(output: RenderOutput) {
  const db = await openDb();
  try {
    const storageKey = output.storageKey || `clipshop/projects/${output.projectId}/output/${output.id}.mp4`;
    const inOpfs = await writeOpfs(storageKey, output.blob).catch(() => false);
    const { objectUrl: _objectUrl, audioObjectUrl: _audioObjectUrl, blob, audioBlob, ...metadata } = output;
    const stored = inOpfs
      ? { ...metadata, storageKey, ...(metadata.audioStorageKey ? {} : { audioBlob }) }
      : { ...metadata, blob, storageKey: undefined, ...(metadata.audioStorageKey ? {} : { audioBlob }) };
    await requestResult(db.transaction(OUTPUTS, "readwrite").objectStore(OUTPUTS).put(stored));
  } finally { db.close(); }
}

export async function listOutputs(projectId: string): Promise<RenderOutput[]> {
  const db = await openDb();
  try {
    const rows = await requestResult(db.transaction(OUTPUTS).objectStore(OUTPUTS).index("projectId").getAll(projectId)) as Omit<RenderOutput, "objectUrl">[];
    const restored = [] as RenderOutput[];
    for (const output of rows) {
      const stored = output.storageKey ? await readOpfs(output.storageKey) : null;
      const blob = stored || output.blob;
      if (blob) {
        const audioBlob = output.audioStorageKey ? await readOpfs(output.audioStorageKey) : output.audioBlob;
        restored.push({ ...output, blob, objectUrl: URL.createObjectURL(blob), ...(audioBlob ? { audioBlob, audioObjectUrl: URL.createObjectURL(audioBlob) } : {}) });
      }
    }
    return restored;
  } finally { db.close(); }
}

export async function deleteOutput(id: string) {
  const db = await openDb();
  try {
    const stored = await requestResult(db.transaction(OUTPUTS).objectStore(OUTPUTS).get(id)) as RenderOutput | undefined;
    await requestResult(db.transaction(OUTPUTS, "readwrite").objectStore(OUTPUTS).delete(id));
    if (stored?.storageKey) await removeOpfs(stored.storageKey);
    if (stored?.audioStorageKey) await removeOpfs(stored.audioStorageKey);
  }
  finally { db.close(); }
}

export async function saveQueue(snapshot: QueueSnapshot) {
  const db = await openDb();
  try { await requestResult(db.transaction(QUEUES, "readwrite").objectStore(QUEUES).put(snapshot)); }
  finally { db.close(); }
}

export async function getQueue(projectId: string): Promise<QueueSnapshot | null> {
  const db = await openDb();
  try { return await requestResult(db.transaction(QUEUES).objectStore(QUEUES).get(projectId)) as QueueSnapshot | null; }
  finally { db.close(); }
}

export async function deleteQueue(projectId: string) {
  const db = await openDb();
  try { await requestResult(db.transaction(QUEUES, "readwrite").objectStore(QUEUES).delete(projectId)); }
  finally { db.close(); }
}

export async function getLocalStorageInfo(projects: ClipShopProject[]): Promise<LocalProjectStorageInfo[]> {
  const db = await openDb();
  try {
    const outputs = await requestResult(db.transaction(OUTPUTS).objectStore(OUTPUTS).getAll()) as RenderOutput[];
    return projects.map((project) => {
      const projectOutputs = outputs.filter((output) => output.projectId === project.id);
      return {
        projectId: project.id,
        sourceBytes: project.clips.reduce((sum, clip) => sum + clip.media.size, 0),
        outputBytes: projectOutputs.reduce((sum, output) => sum + output.size, 0),
        outputCount: projectOutputs.length,
      };
    });
  } finally { db.close(); }
}

export async function deleteProjectOutputs(projectId: string, olderThan?: string) {
  const db = await openDb();
  try {
    const rows = await requestResult(db.transaction(OUTPUTS).objectStore(OUTPUTS).index("projectId").getAll(projectId)) as RenderOutput[];
    const targets = rows.filter((row) => !olderThan || row.createdAt < olderThan);
    const tx = db.transaction(OUTPUTS, "readwrite");
    targets.forEach((row) => tx.objectStore(OUTPUTS).delete(row.id));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    await Promise.all(targets.flatMap((row) => [row.storageKey, row.audioStorageKey].filter(Boolean).map((key) => removeOpfs(key!))));
    return targets.length;
  } finally { db.close(); }
}

export async function clearTemporaryFiles() { await removeTemporaryOpfs(); }

export async function clearAllClipShopData() {
  const db = await openDb();
  try {
    const tx = db.transaction([PROJECTS, OUTPUTS, QUEUES], "readwrite");
    tx.objectStore(PROJECTS).clear(); tx.objectStore(OUTPUTS).clear(); tx.objectStore(QUEUES).clear();
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } finally { db.close(); }
  await removeClipShopOpfs();
}
