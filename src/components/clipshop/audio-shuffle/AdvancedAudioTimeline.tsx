import React, { useMemo, useState } from "react";
import { BarChart3, Plus, Trash2 } from "lucide-react";
import { buildAudioHeatmap, calculateAudioBatchMetrics, compareAudioSequences } from "./services/metrics";
import type { AudioAcousticAnalysis, AudioMarkedRegion, AudioShuffleBatchSummary, AudioShuffleSequence, AudioRegionUsage } from "./types";

interface Props {
  duration: number; analysis: AudioAcousticAnalysis | null; sequences: AudioShuffleSequence[]; history: AudioRegionUsage[];
  batchHistory: AudioShuffleBatchSummary[]; regions: AudioMarkedRegion[]; onRegions: (regions: AudioMarkedRegion[]) => void;
}

export default function AdvancedAudioTimeline({ duration, analysis, sequences, history, batchHistory, regions, onRegions }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [aId, setAId] = useState(""); const [bId, setBId] = useState("");
  const zoneCount = Math.max(1, ...sequences.flatMap((sequence) => sequence.cuts.map((cut) => cut.zone + 1)), 8);
  const heatmap = useMemo(() => buildAudioHeatmap(history, zoneCount), [history, zoneCount]);
  const metrics = useMemo(() => calculateAudioBatchMetrics(sequences), [sequences]);
  const selected = regions.find((region) => region.id === selectedId);
  const comparison = compareAudioSequences(sequences.find((item) => item.id === aId), sequences.find((item) => item.id === bId));
  const waveform = analysis?.frames.filter((_, index) => index % Math.max(1, Math.ceil(analysis.frames.length / 140)) === 0).slice(0, 140) ?? [];

  const addRegion = (kind: "blocked" | "priority") => {
    const start = duration * .1; const region = { id: crypto.randomUUID(), kind, start, end: Math.min(duration, start + Math.max(1, duration * .1)) } satisfies AudioMarkedRegion;
    onRegions([...regions, region]); setSelectedId(region.id);
  };
  const changeBoundary = (edge: "start" | "end", value: number) => {
    if (!selected) return;
    onRegions(regions.map((region) => region.id === selected.id ? { ...region, [edge]: edge === "start" ? Math.min(value, region.end - .1) : Math.max(value, region.start + .1) } : region));
  };

  return <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-500">Timeline avançada</p><h3 className="mt-1 text-base font-black text-white">Calor, regiões e métricas</h3></div><div className="flex gap-2"><button onClick={() => addRegion("blocked")} className="rounded-lg border border-red-500/20 px-3 py-2 text-[9px] font-bold text-red-300"><Plus className="mr-1 inline h-3 w-3" />Não usar</button><button onClick={() => addRegion("priority")} className="rounded-lg border border-amber-500/20 px-3 py-2 text-[9px] font-bold text-amber-300"><Plus className="mr-1 inline h-3 w-3" />Prioridade</button></div></div>
    <div className="relative mt-5 h-36 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"><div className="absolute inset-x-0 bottom-0 flex h-20 items-end gap-px px-2">{waveform.map((frame) => <span key={frame.index} className="flex-1 bg-zinc-700/60" style={{ height: `${Math.max(2, Math.min(100, (frame.max - frame.min) * 70))}%` }} />)}</div><div className="absolute inset-x-0 top-0 flex h-10">{heatmap.map((cell) => <span key={cell.zone} title={`Zona ${cell.zone + 1}: ${cell.useCount} usos`} className="flex-1 border-r border-black/20" style={{ backgroundColor: `rgba(245,158,11,${.08 + cell.intensity * .75})` }} />)}</div>{regions.map((region) => <button key={region.id} onClick={() => setSelectedId(region.id)} className={`absolute bottom-0 top-0 border-x ${region.kind === "blocked" ? "border-red-400 bg-red-500/20" : "border-emerald-400 bg-emerald-500/15"} ${selectedId === region.id ? "ring-2 ring-white/60" : ""}`} style={{ left: `${region.start / duration * 100}%`, width: `${(region.end - region.start) / duration * 100}%` }} title={`${region.kind}: ${region.start.toFixed(1)}–${region.end.toFixed(1)}s`} />)}</div>
    {selected && <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"><div className="flex items-center justify-between"><p className="text-[9px] font-black text-white">Arraste os limites · {selected.kind}</p><button onClick={() => { onRegions(regions.filter((item) => item.id !== selected.id)); setSelectedId(""); }} className="text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div><label className="mt-3 block text-[8px] text-zinc-500">Início {selected.start.toFixed(1)}s<input type="range" min="0" max={duration} step=".1" value={selected.start} onChange={(event) => changeBoundary("start", Number(event.target.value))} className="w-full accent-red-400" /></label><label className="mt-2 block text-[8px] text-zinc-500">Fim {selected.end.toFixed(1)}s<input type="range" min="0" max={duration} step=".1" value={selected.end} onChange={(event) => changeBoundary("end", Number(event.target.value))} className="w-full accent-amber-400" /></label></div>}
    <div className="mt-4 grid grid-cols-3 gap-2">{[[metrics.averageCoverage, "Cobertura"], [metrics.averageDiversity, "Diversidade"], [metrics.repetition, "Repetição"]].map(([value, label]) => <div key={label} className="rounded-xl border border-zinc-800 p-3"><strong className="text-lg font-black text-amber-400">{value}%</strong><p className="text-[8px] uppercase text-zinc-600">{label}</p></div>)}</div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><p className="text-[9px] font-black text-zinc-400">Comparação A/B</p><div className="mt-2 grid grid-cols-2 gap-2">{[aId, bId].map((value, index) => <select key={index} value={value} onChange={(event) => index ? setBId(event.target.value) : setAId(event.target.value)} className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-[9px]"><option value="">{index ? "Sequência B" : "Sequência A"}</option>{sequences.map((item) => <option key={item.id} value={item.id}>{item.variationId}</option>)}</select>)}</div>{comparison && <p className="mt-2 text-[9px] text-zinc-500">Δ cobertura {comparison.coverageDelta}% · Δ diversidade {comparison.diversityDelta}% · zonas comuns {comparison.commonZonePercent}%</p>}</div><div><p className="text-[9px] font-black text-zinc-400"><BarChart3 className="mr-1 inline h-3 w-3" />Histórico de lotes</p><div className="mt-2 max-h-24 space-y-1 overflow-y-auto">{batchHistory.slice().reverse().map((batch) => <p key={batch.batchId} className="rounded-lg bg-zinc-900 px-2 py-1.5 text-[8px] text-zinc-500">{batch.createdAt.slice(0, 16).replace("T", " ")} · {batch.variationIds.length} seq. · div. {batch.averageDiversity}% · rep. {batch.repetition}%</p>)}{!batchHistory.length && <p className="text-[8px] text-zinc-700">Nenhum lote registrado.</p>}</div></div></div>
  </div>;
}
