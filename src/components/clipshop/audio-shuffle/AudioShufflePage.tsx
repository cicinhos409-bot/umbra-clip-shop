import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioWaveform as Waveform, Download, FileAudio, Loader2, Play, Plus, RefreshCw, Save, Shuffle, Trash2, Upload } from "lucide-react";
import Logo from "../../Logo";
import { DEFAULT_AUDIO_SHUFFLE_SETTINGS } from "./presets";
import { analyzeAudioSource } from "./services/acoustic-analysis-engine";
import { renderAudioSequence } from "./services/audio-sequence-renderer";
import { AUDIO_SHUFFLE_ALGORITHM_VERSION, regenerateAudioShuffleCut } from "./services/diversity-engine";
import { fingerprintAudioSource } from "./services/fingerprint";
import {
  deleteAudioSource, getAudioAnalysis, getAudioHistory, listAudioPresets, listAudioSequences, listAudioSources,
  saveAudioAnalysis, saveAudioHistory, saveAudioMedia, saveAudioPreset, saveAudioSequence, saveAudioSource,
} from "./services/library-storage";
import { generateAudioSequences } from "./services/sequence-builder";
import type { AudioAcousticAnalysis, AudioShuffleSavedPreset, AudioShuffleSavedSequence, AudioShuffleSequence, AudioShuffleSettings, AudioShuffleStoredSource } from "./types";

interface Props { onExitToApp: () => void; onLogout: () => void }

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function randomSeed() { return crypto.getRandomValues(new Uint32Array(2)).join("-"); }

function formatDuration(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function AudioShufflePage({ onExitToApp, onLogout }: Props) {
  const [sources, setSources] = useState<AudioShuffleStoredSource[]>([]);
  const [source, setSource] = useState<AudioShuffleStoredSource | null>(null);
  const [analysis, setAnalysis] = useState<AudioAcousticAnalysis | null>(null);
  const [sequences, setSequences] = useState<AudioShuffleSavedSequence[]>([]);
  const [presets, setPresets] = useState<AudioShuffleSavedPreset[]>([]);
  const [settings, setSettings] = useState<AudioShuffleSettings>({ ...DEFAULT_AUDIO_SHUFFLE_SETTINGS, enabled: true });
  const [targetDuration, setTargetDuration] = useState(30);
  const [calculatorCutSeconds, setCalculatorCutSeconds] = useState(10);
  const [seed, setSeed] = useState(DEFAULT_AUDIO_SHUFFLE_SETTINGS.seed);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [playingSequenceId, setPlayingSequenceId] = useState("");
  const [sourcePendingDelete, setSourcePendingDelete] = useState<AudioShuffleStoredSource | null>(null);
  const revisionRef = useRef(1);

  const refresh = async () => {
    const [storedSources, storedPresets] = await Promise.all([listAudioSources(), listAudioPresets()]);
    setSources(storedSources); setPresets(storedPresets);
  };

  useEffect(() => { refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao abrir a biblioteca.")); }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const selectSource = async (selected: AudioShuffleStoredSource) => {
    setError(""); setSource(selected); setSequences([]); setPlayingSequenceId("");
    const [storedAnalysis, storedSequences] = await Promise.all([getAudioAnalysis(selected.id), listAudioSequences(selected.id)]);
    setAnalysis(storedAnalysis); setSequences(storedSequences.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    if (storedAnalysis) setTargetDuration(Math.min(30, Math.max(1, Math.floor(storedAnalysis.duration))));
  };

  const upload = async (file: File) => {
    setBusy("Analisando a fonte localmente..."); setError("");
    try {
      const [fingerprint, acoustic] = await Promise.all([fingerprintAudioSource(file), analyzeAudioSource(file)]);
      const id = crypto.randomUUID();
      const saved = await saveAudioSource(file, { id, fileName: file.name, duration: acoustic.duration, size: file.size, mimeType: file.type || "audio/mpeg", fingerprint, createdAt: new Date().toISOString() });
      await saveAudioAnalysis(id, acoustic); await refresh(); await selectSource(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar o áudio."); }
    finally { setBusy(""); }
  };

  const generate = async (nextSeed = seed) => {
    if (!source || !analysis || !source.available) return;
    const usedCuts = sequences.reduce((total, item) => total + item.sequence.cuts.length, 0);
    const remainingCuts = settings.maxCutsPerSource - usedCuts;
    if (remainingCuts <= 0) { setError(`O limite de ${settings.maxCutsPerSource} cortes deste áudio já foi atingido.`); return; }
    setBusy("Gerando sequência determinística..."); setError("");
    try {
      const history = await getAudioHistory(source.id);
      const minimumDurationForLimit = targetDuration / remainingCuts;
      const limitedSettings = {
        ...settings,
        minCutSeconds: Math.max(settings.minCutSeconds, minimumDurationForLimit),
        maxCutSeconds: Math.max(settings.maxCutSeconds, settings.minCutSeconds, minimumDurationForLimit),
      };
      const result = generateAudioSequences({ sourceDuration: source.duration, targetDurations: [targetDuration], settings: limitedSettings, seed: nextSeed, history, sourceFingerprint: source.fingerprint, acousticAnalysis: analysis });
      const generated = result.sequences[0];
      if (generated.cuts.length > remainingCuts) throw new Error(`Esta sequência ultrapassaria o limite de ${settings.maxCutsPerSource} cortes do áudio.`);
      const savedSequence: AudioShuffleSavedSequence = { id: crypto.randomUUID(), sourceId: source.id, algorithmVersion: result.algorithmVersion, sourceFingerprint: result.sourceFingerprint, seed: nextSeed, sequence: generated, createdAt: new Date().toISOString() };
      setSequences((current) => [savedSequence, ...current]);
      await Promise.all([
        saveAudioSequence(savedSequence),
        saveAudioHistory(source.id, result.usageHistory),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao gerar a sequência."); }
    finally { setBusy(""); }
  };

  const render = async (savedSequence: AudioShuffleSavedSequence, download: boolean) => {
    if (!source?.blob) return;
    setBusy(download ? "Exportando WAV..." : "Preparando reprodução..."); setError("");
    try {
      const blob = await renderAudioSequence(source.blob, savedSequence.sequence, settings.transitionMs);
      await saveAudioMedia(download ? "outputs" : "previews", source.id, blob);
      if (download) downloadBlob(blob, `${source.fileName.replace(/\.[^.]+$/, "")}-${savedSequence.id}.wav`);
      else { if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(URL.createObjectURL(blob)); setPlayingSequenceId(savedSequence.id); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao renderizar o áudio."); }
    finally { setBusy(""); }
  };

  const regenerateCut = async (savedSequence: AudioShuffleSavedSequence, cutIndex: number) => {
    if (!source) return;
    try {
      const sequence = savedSequence.sequence;
      const next = regenerateAudioShuffleCut({ sourceDuration: source.duration, sourceFingerprint: source.fingerprint, targets: [{ variationId: sequence.variationId, duration: sequence.targetDuration }], settings: { ...settings, seed: savedSequence.seed }, acousticAnalysis: analysis ?? undefined, previousSequences: [sequence] }, sequence.variationId, cutIndex, revisionRef.current++);
      const updated = { ...savedSequence, algorithmVersion: AUDIO_SHUFFLE_ALGORITHM_VERSION, sequence: next };
      setSequences((current) => current.map((item) => item.id === savedSequence.id ? updated : item));
      await saveAudioSequence(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao regenerar o corte."); }
  };

  const savePreset = async () => {
    const name = window.prompt("Nome do preset:", "Meu preset"); if (!name?.trim()) return;
    const now = new Date().toISOString();
    await saveAudioPreset({ id: crypto.randomUUID(), name: name.trim(), settings: { ...settings, seed }, createdAt: now, updatedAt: now });
    await refresh();
  };

  const removeSource = async () => {
    if (!sourcePendingDelete) return;
    const item = sourcePendingDelete;
    setBusy("Apagando áudio e dados locais..."); setError("");
    try {
      await deleteAudioSource(item.id);
      if (source?.id === item.id) { setSource(null); setAnalysis(null); setSequences([]); setPlayingSequenceId(""); }
      setSourcePendingDelete(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível apagar o áudio."); }
    finally { setBusy(""); }
  };

  const sampledFrames = useMemo(() => analysis ? analysis.frames.filter((_, index) => index % Math.max(1, Math.ceil(analysis.frames.length / 160)) === 0).slice(0, 160) : [], [analysis]);
  const cutCalculation = useMemo(() => {
    const sourceSeconds = source?.duration ?? 0;
    const cutSeconds = Math.max(0, calculatorCutSeconds);
    if (!sourceSeconds || !cutSeconds) return { completeCuts: 0, remainder: 0, totalSegments: 0 };
    const completeCuts = Math.floor(sourceSeconds / cutSeconds);
    const remainder = Math.max(0, sourceSeconds - completeCuts * cutSeconds);
    return { completeCuts, remainder, totalSegments: completeCuts + (remainder > 0.01 ? 1 : 0) };
  }, [source?.duration, calculatorCutSeconds]);
  const usedCuts = useMemo(() => sequences.reduce((total, item) => total + item.sequence.cuts.length, 0), [sequences]);
  const remainingCuts = Math.max(0, settings.maxCutsPerSource - usedCuts);

  return <div className="min-h-screen bg-[#070707] text-zinc-200">
    <header className="sticky top-0 z-40 border-b border-zinc-900 bg-[#070707]/90 px-4 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3"><Logo size={31} /><div className="font-black text-white">UMBRA <span className="text-amber-400">AUDIO SHUFFLE</span></div><div className="ml-auto flex gap-2"><a href="#/clipshop" className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-300"><ArrowLeft className="h-4 w-4" />Clip Shop</a><button onClick={onLogout} className="rounded-lg border border-zinc-800 px-3 py-2 text-[10px] text-zinc-500">Sair</button></div></div></header>
    <main className="mx-auto max-w-[1450px] px-4 py-8 sm:px-6">
      <section className="mb-7 rounded-[2rem] border border-amber-500/15 bg-gradient-to-br from-zinc-900 to-black p-6 sm:p-8"><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">100% no seu navegador</p><h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">Transforme uma fonte em <span className="text-amber-400">sequências únicas.</span></h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">Fonte, análise, previews, outputs, seeds e históricos permanecem neste dispositivo.</p></section>
      {error && <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">{error}</div>}
      {busy && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs font-bold text-amber-300"><Loader2 className="h-4 w-4 animate-spin" />{busy}</div>}
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4"><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black"><Upload className="h-4 w-4" />Enviar áudio<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label><h2 className="mb-3 mt-6 text-[10px] font-black uppercase tracking-wider text-zinc-500">Biblioteca local</h2><div className="space-y-2">{sources.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${source?.id === item.id ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/40"}`}><button onClick={() => void selectSource(item)} className="w-full text-left"><p className="truncate text-xs font-bold text-white">{item.fileName}</p><p className="mt-1 text-[9px] text-zinc-600">{item.duration.toFixed(1)}s · {formatBytes(item.size)} · {item.storage.toUpperCase()}</p>{!item.available && <p className="mt-1 text-[9px] font-bold text-red-400">Fonte ausente</p>}</button><button title={`Apagar ${item.fileName}`} onClick={() => setSourcePendingDelete(item)} className="mt-2 rounded-lg p-1 text-zinc-700 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>{!sources.length && <p className="py-8 text-center text-[10px] text-zinc-700">Nenhuma fonte salva.</p>}</aside>
        <div className="space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Fonte ativa</p><h2 className="mt-1 text-xl font-black text-white">{source?.fileName || "Escolha ou envie um áudio"}</h2></div>{source && <div className="flex gap-3 text-[10px] text-zinc-500"><span>{source.duration.toFixed(1)}s</span><span>{formatBytes(source.size)}</span><span>{source.storage}</span></div>}</div><div className="mt-6 flex h-36 items-center gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-black/40 px-3">{sampledFrames.map((frame) => <span key={frame.index} title={`${frame.start.toFixed(2)}s · RMS ${frame.rms.toFixed(3)}`} className={`min-w-px flex-1 rounded-full ${frame.silence ? "bg-zinc-800" : frame.transient > .04 ? "bg-amber-300" : "bg-amber-500/70"}`} style={{ height: `${Math.max(3, Math.min(100, Math.abs(frame.max - frame.min) * 80))}%` }} />)}{!analysis && <div className="flex w-full flex-col items-center text-zinc-700"><Waveform className="h-7 w-7" /><span className="mt-2 text-[10px]">A waveform aparecerá após a análise.</span></div>}</div></section>
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Calculadora de cortes</p><h2 className="mt-1 text-lg font-black text-white">Quanto rende o áudio original?</h2><p className="mt-2 text-xs text-zinc-500">Calcula cortes consecutivos, sem intervalo e sem sobreposição.</p></div>
              <label className="w-full text-[10px] font-bold text-zinc-500 sm:w-52">Duração de cada corte (segundos)<input type="number" value={calculatorCutSeconds} min={0.1} step={0.1} onChange={(event) => setCalculatorCutSeconds(Math.max(0, Number(event.target.value)))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm font-black text-amber-300 outline-none focus:border-amber-500/40" /></label>
            </div>
            {source ? <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <CalculationResult label="Áudio original" value={`${formatDuration(source.duration)} (${source.duration.toFixed(1)}s)`} />
              <CalculationResult label="Cortes completos" value={`${cutCalculation.completeCuts}`} highlight />
              <CalculationResult label="Trecho restante" value={cutCalculation.remainder > 0.01 ? `${cutCalculation.remainder.toFixed(1)}s` : "Sem sobra"} />
              <CalculationResult label="Total aproveitando tudo" value={`${cutCalculation.totalSegments} trechos`} highlight />
            </div> : <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-[10px] text-zinc-700">Envie ou escolha um áudio para calcular.</div>}
          </section>
          <section className="grid gap-6 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 lg:grid-cols-2 sm:p-6"><div><h2 className="text-lg font-black text-white">Configurações</h2><div className="mt-5 grid grid-cols-2 gap-3"><NumberField label="Duração final" value={targetDuration} min={1} max={Math.max(1, source?.duration || 3600)} onChange={setTargetDuration} /><NumberField label="Corte mínimo (segundos)" value={settings.minCutSeconds} min={.5} max={60} onChange={(value) => setSettings({ ...settings, minCutSeconds: value, maxCutSeconds: Math.max(value, settings.maxCutSeconds) })} /><NumberField label="Corte máximo (segundos)" value={settings.maxCutSeconds} min={settings.minCutSeconds} max={120} onChange={(value) => setSettings({ ...settings, maxCutSeconds: value })} /><NumberField label="Distância mínima" value={settings.minimumDistanceSeconds} min={0} max={300} onChange={(value) => setSettings({ ...settings, minimumDistanceSeconds: value })} /><NumberField label="Quantidade máxima de cortes por áudio" value={settings.maxCutsPerSource} min={1} max={10000} step={1} onChange={(value) => setSettings({ ...settings, maxCutsPerSource: Math.max(1, Math.floor(value)) })} /></div><div className={`mt-4 rounded-xl border p-3 text-[10px] ${remainingCuts ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-red-500/20 bg-red-500/10 text-red-200"}`}><span className="font-black">{usedCuts}</span> de <span className="font-black">{settings.maxCutsPerSource}</span> cortes utilizados · <span className="font-black">{remainingCuts}</span> disponíveis</div><label className="mt-4 block text-[10px] font-bold text-zinc-500">Seed<div className="mt-1 flex gap-2"><input value={seed} onChange={(event) => setSeed(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-xs text-amber-300 outline-none" /><button title="Nova seed" onClick={() => setSeed(randomSeed())} className="rounded-xl border border-zinc-800 px-3 text-amber-400"><Shuffle className="h-4 w-4" /></button></div></label><div className="mt-4 flex flex-wrap gap-2"><button disabled={!source?.available || !analysis || Boolean(busy) || remainingCuts <= 0} onClick={() => void generate()} className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black disabled:opacity-30"><Plus className="h-4 w-4" />{remainingCuts > 0 ? "Gerar sequência" : "Limite atingido"}</button><button onClick={() => void savePreset()} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold"><Save className="h-4 w-4" />Salvar preset</button></div><div className="mt-4 flex flex-wrap gap-2">{presets.map((preset) => <button key={preset.id} onClick={() => { const next = { ...DEFAULT_AUDIO_SHUFFLE_SETTINGS, ...preset.settings }; setSettings(next); setSeed(next.seed); }} className="rounded-lg border border-zinc-800 px-3 py-2 text-[9px] text-zinc-400">{preset.name}</button>)}</div></div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-white">Sequências</h2>
                {sequences.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[9px] font-black text-amber-400">{sequences.length} salvas</span>}
              </div>
              {sequences.length ? <div className="mt-4 space-y-4">
                {sequences.map((savedSequence, sequenceIndex) => <article key={savedSequence.id} className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-xs font-black text-white">Sequência {sequences.length - sequenceIndex}</p><p className="mt-1 text-[8px] text-zinc-600">Seed: {savedSequence.seed} · {savedSequence.sequence.targetDuration.toFixed(1)}s</p></div>
                    <span className="text-[9px] text-zinc-600">{savedSequence.sequence.cuts.length} cortes</span>
                  </div>
                  <div className="mt-3 space-y-2">{savedSequence.sequence.cuts.map((cut, cutIndex) => <div key={cut.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/10 text-[9px] font-black text-amber-400">{cutIndex + 1}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-white">{cut.start.toFixed(2)}s → {cut.end.toFixed(2)}s</p><p className="mt-1 text-[8px] text-zinc-600">{cut.duration.toFixed(2)}s · zona {cut.zone + 1} · {cut.boundary}</p></div><button title="Regenerar somente este corte" onClick={() => void regenerateCut(savedSequence, cutIndex)} className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-amber-400"><RefreshCw className="h-3.5 w-3.5" /></button></div>)}</div>
                  <div className="mt-4 flex flex-wrap gap-2"><button disabled={Boolean(busy)} onClick={() => void render(savedSequence, false)} className="flex items-center gap-2 rounded-xl border border-amber-500/30 px-4 py-3 text-xs font-bold text-amber-300"><Play className="h-4 w-4" />Ouvir</button><button disabled={Boolean(busy)} onClick={() => void render(savedSequence, true)} className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black"><Download className="h-4 w-4" />Exportar WAV</button></div>
                  {audioUrl && playingSequenceId === savedSequence.id && <audio src={audioUrl} controls autoPlay className="mt-4 w-full" />}
                </article>)}
              </div> : <div className="mt-5 grid min-h-48 place-items-center rounded-2xl border border-dashed border-zinc-800 text-center text-[10px] text-zinc-700"><div><FileAudio className="mx-auto mb-2 h-7 w-7" />Gere uma sequência para ver os cortes.</div></div>}
            </div>
          </section>
        </div>
      </div>
    </main>
    {sourcePendingDelete && <div role="dialog" aria-modal="true" aria-labelledby="delete-audio-title" className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSourcePendingDelete(null); }}>
      <div className="w-full max-w-md rounded-3xl border border-red-500/20 bg-zinc-950 p-6 shadow-2xl shadow-red-950/30 sm:p-7">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400"><Trash2 className="h-5 w-5" /></div>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.22em] text-red-400">Excluir permanentemente</p>
        <h2 id="delete-audio-title" className="mt-2 text-xl font-black text-white">Apagar este áudio?</h2>
        <p className="mt-3 break-words text-sm font-bold text-zinc-300">{sourcePendingDelete.fileName}</p>
        <p className="mt-3 text-xs leading-5 text-zinc-500">A fonte, a análise, as sequências, os históricos, os previews e os outputs vinculados serão removidos deste navegador. Esta ação não pode ser desfeita.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={Boolean(busy)} onClick={() => setSourcePendingDelete(null)} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold text-zinc-300 disabled:opacity-40">Cancelar</button><button disabled={Boolean(busy)} onClick={() => void removeSource()} className="flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Sim, apagar definitivamente</button></div>
      </div>
    </div>}
  </div>;
}

function NumberField({ label, value, min, max, step = .5, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="text-[10px] font-bold text-zinc-500">{label}<input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500/40" /></label>;
}

function CalculationResult({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${highlight ? "border-amber-500/25 bg-amber-500/5" : "border-zinc-800 bg-black/30"}`}><p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{label}</p><p className={`mt-2 text-lg font-black ${highlight ? "text-amber-400" : "text-white"}`}>{value}</p></div>;
}
