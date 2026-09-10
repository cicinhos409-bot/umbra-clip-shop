import { readOpfs, removeOpfs, writeOpfs } from "../../services/opfs";
import type {
  AudioAcousticAnalysis, AudioRegionUsage, AudioShuffleAsset, AudioShuffleSavedPreset,
  AudioShuffleSavedSequence, AudioShuffleStoredSource,
} from "../types";

const DB_NAME = "umbra-audio-shuffle";
const DB_VERSION = 1;
const SOURCES = "sources";
const ANALYSES = "analyses";
const PRESETS = "presets";
const SEQUENCES = "sequences";
const HISTORIES = "histories";

export type AudioSourceRecord = Omit<AudioShuffleStoredSource, "available" | "storage" | "blob"> & { fallbackBlob?: Blob; opfsStored: boolean };
type AnalysisRecord = { sourceId: string; analysis: AudioAcousticAnalysis; updatedAt: string };
type HistoryRecord = { id: string; sourceId: string; projectId?: string; rows: AudioRegionUsage[]; updatedAt: string };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SOURCES)) {
        const store = db.createObjectStore(SOURCES, { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("scope", "scope");
      }
      if (!db.objectStoreNames.contains(ANALYSES)) db.createObjectStore(ANALYSES, { keyPath: "sourceId" });
      if (!db.objectStoreNames.contains(PRESETS)) db.createObjectStore(PRESETS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SEQUENCES)) {
        const store = db.createObjectStore(SEQUENCES, { keyPath: "id" });
        store.createIndex("sourceId", "sourceId");
      }
      if (!db.objectStoreNames.contains(HISTORIES)) {
        const store = db.createObjectStore(HISTORIES, { keyPath: "id" });
        store.createIndex("sourceId", "sourceId");
      }
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

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function audioSourcePath(id: string, projectId?: string) {
  return projectId ? `clipshop/projects/${projectId}/audio-shuffle/sources/${id}` : `clipshop/audio-shuffle/sources/${id}`;
}

export function buildAudioSourceRecord(file: Blob, metadata: Omit<AudioShuffleAsset, "storageKey">, storageKey: string, opfsStored: boolean, projectId?: string): AudioSourceRecord {
  return { ...metadata, storageKey, scope: projectId ? "project" : "library", projectId, opfsStored, ...(opfsStored ? {} : { fallbackBlob: file }) };
}

export function restoreAudioSourceRecord(record: AudioSourceRecord, opfsFile: Blob | null): AudioShuffleStoredSource {
  const blob = opfsFile || record.fallbackBlob;
  const { fallbackBlob: _fallback, opfsStored: _opfs, ...metadata } = record;
  return { ...metadata, available: Boolean(blob?.size), storage: opfsFile ? "opfs" : record.fallbackBlob ? "indexeddb" : "missing", ...(blob ? { blob } : {}) };
}

export async function saveAudioSource(file: File, metadata: Omit<AudioShuffleAsset, "storageKey">, projectId?: string): Promise<AudioShuffleStoredSource> {
  const storageKey = audioSourcePath(metadata.id, projectId);
  const opfsStored = await writeOpfs(storageKey, file).catch(() => false);
  const record = buildAudioSourceRecord(file, metadata, storageKey, opfsStored, projectId);
  const db = await openDb();
  try { await requestResult(db.transaction(SOURCES, "readwrite").objectStore(SOURCES).put(record)); }
  catch (error) { if (opfsStored) await removeOpfs(storageKey); throw error; }
  finally { db.close(); }
  return { ...metadata, storageKey, scope: record.scope, projectId, available: true, storage: opfsStored ? "opfs" : "indexeddb", ...(opfsStored ? {} : { blob: file }) };
}

async function restoreSource(record: AudioSourceRecord): Promise<AudioShuffleStoredSource> {
  const opfsFile = record.opfsStored ? await readOpfs(record.storageKey) : null;
  return restoreAudioSourceRecord(record, opfsFile);
}

export async function listAudioSources(scope: "library" | "project" = "library", projectId?: string) {
  const db = await openDb();
  try {
    const store = db.transaction(SOURCES).objectStore(SOURCES);
    const records = projectId
      ? await requestResult(store.index("projectId").getAll(projectId)) as AudioSourceRecord[]
      : await requestResult(store.index("scope").getAll(scope)) as AudioSourceRecord[];
    return await Promise.all(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(restoreSource));
  } finally { db.close(); }
}

export async function getAudioSource(sourceId: string) {
  const db = await openDb();
  try {
    const record = await requestResult(db.transaction(SOURCES).objectStore(SOURCES).get(sourceId)) as AudioSourceRecord | undefined;
    return record ? restoreSource(record) : null;
  } finally { db.close(); }
}

export async function copyAudioSourceToProject(sourceId: string, projectId: string) {
  const source = await getAudioSource(sourceId);
  if (!source?.blob || !source.available) throw new Error("A fonte original não está mais disponível neste navegador.");
  const id = crypto.randomUUID();
  const file = new File([source.blob], source.fileName, { type: source.mimeType, lastModified: Date.now() });
  return saveAudioSource(file, {
    id, fileName: source.fileName, duration: source.duration, size: source.size, mimeType: source.mimeType,
    fingerprint: source.fingerprint, analysisStorageKey: source.analysisStorageKey, createdAt: new Date().toISOString(),
  }, projectId);
}

export async function deleteAudioSource(sourceId: string) {
  const db = await openDb();
  let source: AudioSourceRecord | undefined;
  try {
    source = await requestResult(db.transaction(SOURCES).objectStore(SOURCES).get(sourceId)) as AudioSourceRecord | undefined;
    const sequenceKeys = await requestResult(db.transaction(SEQUENCES).objectStore(SEQUENCES).index("sourceId").getAllKeys(sourceId));
    const historyKeys = await requestResult(db.transaction(HISTORIES).objectStore(HISTORIES).index("sourceId").getAllKeys(sourceId));
    const tx = db.transaction([SOURCES, ANALYSES, SEQUENCES, HISTORIES], "readwrite");
    tx.objectStore(SOURCES).delete(sourceId); tx.objectStore(ANALYSES).delete(sourceId);
    sequenceKeys.forEach((key) => tx.objectStore(SEQUENCES).delete(key));
    historyKeys.forEach((key) => tx.objectStore(HISTORIES).delete(key));
    await transactionDone(tx);
  } finally { db.close(); }
  if (source?.storageKey) await removeOpfs(source.storageKey);
  await removeOpfs(`clipshop/audio-shuffle/previews/${sourceId}.wav`);
  await removeOpfs(`clipshop/audio-shuffle/outputs/${sourceId}.wav`);
}

export async function deleteProjectAudioSources(projectId: string) {
  const sources = await listAudioSources("project", projectId);
  await Promise.all(sources.map((source) => deleteAudioSource(source.id)));
}

export async function saveAudioAnalysis(sourceId: string, analysis: AudioAcousticAnalysis) {
  const db = await openDb();
  try { await requestResult(db.transaction(ANALYSES, "readwrite").objectStore(ANALYSES).put({ sourceId, analysis, updatedAt: new Date().toISOString() } satisfies AnalysisRecord)); }
  finally { db.close(); }
}

export async function getAudioAnalysis(sourceId: string) {
  const db = await openDb();
  try { return (await requestResult(db.transaction(ANALYSES).objectStore(ANALYSES).get(sourceId)) as AnalysisRecord | undefined)?.analysis ?? null; }
  finally { db.close(); }
}

export async function saveAudioPreset(preset: AudioShuffleSavedPreset) {
  const db = await openDb();
  try { await requestResult(db.transaction(PRESETS, "readwrite").objectStore(PRESETS).put(preset)); }
  finally { db.close(); }
}

export async function listAudioPresets(): Promise<AudioShuffleSavedPreset[]> {
  const db = await openDb();
  try { return await requestResult(db.transaction(PRESETS).objectStore(PRESETS).getAll()); }
  finally { db.close(); }
}

export async function saveAudioSequence(record: AudioShuffleSavedSequence) {
  const db = await openDb();
  try { await requestResult(db.transaction(SEQUENCES, "readwrite").objectStore(SEQUENCES).put(record)); }
  finally { db.close(); }
}

export async function listAudioSequences(sourceId: string): Promise<AudioShuffleSavedSequence[]> {
  const db = await openDb();
  try { return await requestResult(db.transaction(SEQUENCES).objectStore(SEQUENCES).index("sourceId").getAll(sourceId)); }
  finally { db.close(); }
}

export async function saveAudioHistory(sourceId: string, rows: AudioRegionUsage[], projectId?: string) {
  const id = `${sourceId}:${projectId || "global"}`;
  const db = await openDb();
  try { await requestResult(db.transaction(HISTORIES, "readwrite").objectStore(HISTORIES).put({ id, sourceId, projectId, rows, updatedAt: new Date().toISOString() } satisfies HistoryRecord)); }
  finally { db.close(); }
}

export async function getAudioHistory(sourceId: string, projectId?: string) {
  const db = await openDb();
  try { return (await requestResult(db.transaction(HISTORIES).objectStore(HISTORIES).get(`${sourceId}:${projectId || "global"}`)) as HistoryRecord | undefined)?.rows ?? []; }
  finally { db.close(); }
}

export async function saveAudioMedia(kind: "previews" | "outputs", sourceId: string, blob: Blob) {
  const storageKey = `clipshop/audio-shuffle/${kind}/${sourceId}.wav`;
  const stored = await writeOpfs(storageKey, blob).catch(() => false);
  return stored ? storageKey : null;
}
