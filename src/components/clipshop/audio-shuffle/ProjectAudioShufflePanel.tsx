import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, Library, Loader2, Lock, RefreshCw, Shuffle, Unlock, Upload } from "lucide-react";
import type { ClipShopProject } from "../types";
import { analyzeAudioSource } from "./services/acoustic-analysis-engine";
import { regenerateAudioShuffleSequence } from "./services/diversity-engine";
import { fingerprintAudioSource } from "./services/fingerprint";
import {
  copyAudioSourceToProject, deleteAudioSource, getAudioAnalysis, getAudioHistory, listAudioSources, saveAudioAnalysis,
  saveAudioHistory, saveAudioSequence, saveAudioSource,
} from "./services/library-storage";
import { calculateVariationAudioTargets, linkVariationSequences } from "./services/project-audio";
import { generateAudioSequences } from "./services/sequence-builder";
import type { AudioShuffleAsset, AudioShuffleStoredSource } from "./types";
import type { AudioAcousticAnalysis } from "./types";
import AdvancedAudioTimeline from "./AdvancedAudioTimeline";
import { createAudioBatchSummary } from "./services/metrics";

type Change = Partial<ClipShopProject> | ((project: ClipShopProject) => ClipShopProject);
interface Props { project: ClipShopProject; onChange: (change: Change) => void }

function assetMetadata(source: AudioShuffleStoredSource): AudioShuffleAsset {
  return { id: source.id, fileName: source.fileName, duration: source.duration, size: source.size, mimeType: source.mimeType, fingerprint: source.fingerprint, storageKey: source.storageKey, analysisStorageKey: source.analysisStorageKey, createdAt: source.createdAt };
}

export default function ProjectAudioShufflePanel({ project, onChange }: Props) {
  const state = project.audioShuffle!;
  const [library, setLibrary] = useState<AudioShuffleStoredSource[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AudioAcousticAnalysis | null>(null);
  const targets = useMemo(() => calculateVariationAudioTargets(project.variations, project.clips), [project.variations, project.clips]);

  useEffect(() => { listAudioSources().then((rows) => { setLibrary(rows); if (rows[0]) setLibraryId((value) => value || rows[0].id); }).catch(() => undefined); }, []);
  useEffect(() => { if (!state.source) { setAnalysis(null); return; } getAudioAnalysis(state.source.id).then(setAnalysis).catch(() => setAnalysis(null)); }, [state.source?.id]);

  const setAudioState = (update: (current: NonNullable<ClipShopProject["audioShuffle"]>) => NonNullable<ClipShopProject["audioShuffle"]>) => {
    onChange((current) => ({ ...current, audioShuffle: update(current.audioShuffle!) }));
  };

  const upload = async (file: File) => {
    setBusy("Analisando fonte do projeto..."); setError("");
    try {
      const [fingerprint, analysis] = await Promise.all([fingerprintAudioSource(file), analyzeAudioSource(file)]);
      const id = crypto.randomUUID();
      const source = await saveAudioSource(file, { id, fileName: file.name, duration: analysis.duration, size: file.size, mimeType: file.type || "audio/mpeg", fingerprint, createdAt: new Date().toISOString() }, project.id);
      await saveAudioAnalysis(id, analysis);
      if (state.source?.id) await deleteAudioSource(state.source.id);
      setAnalysis(analysis); setAudioState((current) => ({ ...current, source: assetMetadata(source), settings: { ...current.settings, enabled: true }, sequences: [], usageHistory: [], variationSequenceIds: {}, renderedAudioStorageKeys: {}, batchHistory: [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao importar a fonte."); }
    finally { setBusy(""); }
  };

  const copyFromLibrary = async () => {
    if (!libraryId) return; setBusy("Criando cópia independente..."); setError("");
    try {
      const copied = await copyAudioSourceToProject(libraryId, project.id);
      const analysis = await getAudioAnalysis(libraryId); if (analysis) await saveAudioAnalysis(copied.id, analysis);
      if (state.source?.id) await deleteAudioSource(state.source.id);
      setAnalysis(analysis); setAudioState((current) => ({ ...current, source: assetMetadata(copied), settings: { ...current.settings, enabled: true }, sequences: [], usageHistory: [], variationSequenceIds: {}, renderedAudioStorageKeys: {}, batchHistory: [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao copiar a fonte."); }
    finally { setBusy(""); }
  };

  const generateAll = async () => {
    if (!state.source || !targets.length) return; setBusy(`Gerando ${targets.length} sequências...`); setError("");
    try {
      const [analysis, history] = await Promise.all([getAudioAnalysis(state.source.id), getAudioHistory(state.source.id, project.id)]);
      const result = generateAudioSequences({ sourceDuration: state.source.duration, targetDurations: targets, settings: state.settings, seed: state.settings.seed, history, sourceFingerprint: state.source.fingerprint, acousticAnalysis: analysis ?? undefined, markedRegions: state.blockedRegions, previousSequences: state.sequences, batchId: crypto.randomUUID() });
      await Promise.all(result.sequences.map((sequence) => saveAudioSequence({ id: sequence.id, sourceId: state.source!.id, projectId: project.id, algorithmVersion: result.algorithmVersion, sourceFingerprint: result.sourceFingerprint, seed: sequence.seed, sequence, createdAt: new Date().toISOString() })));
      await saveAudioHistory(state.source.id, result.usageHistory, project.id);
      const summary = createAudioBatchSummary(result.batchId, result.seed, result.sequences);
      setAudioState((current) => ({ ...current, sequences: result.sequences, usageHistory: result.usageHistory, variationSequenceIds: linkVariationSequences(result.sequences), algorithmVersion: result.algorithmVersion, batchHistory: [...(current.batchHistory ?? []), summary].slice(-50) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao gerar o lote de áudio."); }
    finally { setBusy(""); }
  };

  const regenerate = async (variationId: string) => {
    if (!state.source) return;
    try {
      const analysis = await getAudioAnalysis(state.source.id);
      const sequences = regenerateAudioShuffleSequence({ sourceDuration: state.source.duration, sourceFingerprint: state.source.fingerprint, targets, settings: state.settings, projectHistory: state.usageHistory, markedRegions: state.blockedRegions, previousSequences: state.sequences, acousticAnalysis: analysis ?? undefined }, variationId, Date.now());
      const changed = sequences.find((sequence) => sequence.variationId === variationId)!;
      await saveAudioSequence({ id: changed.id, sourceId: state.source.id, projectId: project.id, algorithmVersion: state.algorithmVersion, sourceFingerprint: state.source.fingerprint, seed: changed.seed, sequence: changed, createdAt: new Date().toISOString() });
      setAudioState((current) => ({ ...current, sequences, variationSequenceIds: linkVariationSequences(sequences) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao regenerar a sequência."); }
  };

  return <section id="audio-shuffle" className="mb-8 rounded-[2rem] border border-amber-500/15 bg-gradient-to-br from-zinc-950 to-black p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">02 · Audio Shuffle</p><h2 className="mt-2 text-2xl font-black text-white">Áudio exclusivo para cada variação</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">Prepare até 150 sequências vinculadas às durações reais de Gancho + Corpo + CTA.</p></div><label className="flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black"><Upload className="h-4 w-4" />Enviar fonte<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div>
    {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
    {busy && <p className="mt-4 flex items-center gap-2 text-xs font-bold text-amber-300"><Loader2 className="h-4 w-4 animate-spin" />{busy}</p>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"><h3 className="text-xs font-black text-white">Fonte do projeto</h3>{state.source ? <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="truncate text-xs font-bold text-amber-200">{state.source.fileName}</p><p className="mt-1 text-[9px] text-zinc-600">{state.source.duration.toFixed(1)}s · cópia independente</p></div> : <p className="mt-3 text-[10px] text-zinc-600">Envie uma fonte ou copie uma da biblioteca.</p>}<div className="mt-4 flex gap-2"><select value={libraryId} onChange={(event) => setLibraryId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-[10px] text-zinc-300"><option value="">Biblioteca local</option>{library.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.fileName}</option>)}</select><button disabled={!libraryId || Boolean(busy)} onClick={() => void copyFromLibrary()} title="Copiar para o projeto" className="rounded-xl border border-zinc-700 px-3 text-amber-400 disabled:opacity-30"><Copy className="h-4 w-4" /></button></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><label className="text-[9px] font-bold text-zinc-500">Modo<select value={state.settings.mode} onChange={(event) => setAudioState((current) => ({ ...current, settings: { ...current.settings, mode: event.target.value as typeof current.settings.mode } }))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-xs text-white"><option value="audio-only">Exportar separadamente</option><option value="replace">Substituir áudio</option><option value="mix">Misturar como fundo</option></select></label><label className="text-[9px] font-bold text-zinc-500">Seed<input value={state.settings.seed} onChange={(event) => setAudioState((current) => ({ ...current, settings: { ...current.settings, seed: event.target.value } }))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-xs text-amber-300" /></label></div>
        {state.settings.mode === "mix" && <div className="mt-4 flex items-center gap-4"><label className="flex-1 text-[9px] font-bold text-zinc-500">Volume de fundo<input type="range" min="0" max="1" step=".01" value={state.settings.backgroundVolume} onChange={(event) => setAudioState((current) => ({ ...current, settings: { ...current.settings, backgroundVolume: Number(event.target.value) } }))} className="mt-2 w-full accent-amber-400" /></label><button onClick={() => setAudioState((current) => ({ ...current, settings: { ...current.settings, duckingEnabled: !current.settings.duckingEnabled } }))} className={`rounded-xl border px-3 py-2 text-[9px] font-black ${state.settings.duckingEnabled ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-zinc-800 text-zinc-600"}`}>Ducking {state.settings.duckingEnabled ? "ativo" : "inativo"}</button></div>}
        <button disabled={!state.source || !targets.length || Boolean(busy)} onClick={() => void generateAll()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-xs font-black text-black disabled:opacity-30"><Shuffle className="h-4 w-4" />Gerar {targets.length} sequências</button>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-black text-white">Matriz comparativa</h3><p className="mt-1 text-[9px] text-zinc-600">variationId → sequenceId persistido no projeto</p></div><Library className="h-4 w-4 text-amber-500" /></div><div className="mt-4 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">{targets.map((target, index) => { const sequence = state.sequences.find((item) => item.variationId === target.variationId); return <div key={target.variationId} className={`rounded-xl border p-3 ${sequence ? "border-amber-500/20 bg-amber-500/[.04]" : "border-zinc-800 bg-black/20"}`}><div className="flex items-center gap-2"><span className="text-[9px] font-black text-amber-400">V{String(index + 1).padStart(2, "0")}</span><span className="text-[9px] text-zinc-600">{target.duration.toFixed(1)}s</span>{sequence && <Check className="ml-auto h-3.5 w-3.5 text-emerald-400" />}</div>{sequence && <><p className="mt-2 truncate font-mono text-[8px] text-zinc-500">{state.variationSequenceIds[target.variationId]}</p><div className="mt-2 flex items-center justify-between"><span className="text-[8px] text-zinc-600">{sequence.cuts.length} cortes · {sequence.diversityScore}%</span><div className="flex gap-1"><button onClick={() => setAudioState((current) => ({ ...current, sequences: current.sequences.map((item) => item.id === sequence.id ? { ...item, locked: !item.locked } : item) }))} className="rounded p-1.5 text-zinc-500">{sequence.locked ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3" />}</button><button disabled={sequence.locked} onClick={() => void regenerate(target.variationId)} className="rounded p-1.5 text-zinc-500 disabled:opacity-20"><RefreshCw className="h-3 w-3" /></button></div></div></>}</div>; })}</div>{!targets.length && <p className="py-12 text-center text-[10px] text-zinc-700">Adicione os clipes para calcular as durações.</p>}</div>
    </div>
    {state.source && <AdvancedAudioTimeline duration={state.source.duration} analysis={analysis} sequences={state.sequences} history={state.usageHistory} batchHistory={state.batchHistory ?? []} regions={state.blockedRegions} onRegions={(regions) => setAudioState((current) => ({ ...current, blockedRegions: regions }))} />}
  </section>;
}
