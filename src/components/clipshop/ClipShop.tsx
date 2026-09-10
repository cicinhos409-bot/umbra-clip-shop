import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Clapperboard, Crown, Download, FileVideo, FolderOpen, HardDrive, Layers3, Loader2, LogOut, Play, Plus, RefreshCw, Sparkles, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import Logo from "../Logo";
import { emitShopFactoryEvent } from "../../lib/shopFactory";
import { finishGeneration, getClipShopUsage, releaseGeneration, reserveGeneration, startGeneration } from "./api";
import { clipShopProjectId, clipShopRoutes, isClipShopAudioShuffleRoute } from "./routes";
import AudioShufflePage from "./audio-shuffle/AudioShufflePage";
import ProjectAudioShufflePanel from "./audio-shuffle/ProjectAudioShufflePanel";
import { findVariationSequence } from "./audio-shuffle/services/project-audio";
import { deleteProjectAudioSources, getAudioSource, saveAudioMedia, saveAudioSequence } from "./audio-shuffle/services/library-storage";
import { renderVariationAudio } from "./audio-shuffle/services/variation-audio-renderer";
import { buildAudioShuffleQueueSnapshot, findQueueAudioSequence } from "./audio-shuffle/services/queue-snapshot";
import { checkCompatibility } from "./services/compatibility";
import { createClipAsset } from "./services/clip-metadata";
import { buildManifest, sanitizeFilePart, uniqueFileName, variationFileName } from "./services/file-names";
import { clearTemporaryFiles, deleteClipSource, deleteOutput, deleteProject, deleteQueue, getQueue, listOutputs, listProjects, saveOutput, saveQueue } from "./services/project-storage";
import { renderVariation } from "./services/render-engine";
import { generateVariations, hasMinimumClips } from "./services/variation-engine";
import { buildStoredZip } from "./services/zip";
import { hasStorageFor, MAX_PROJECT_SOURCE_BYTES, RECOMMENDED_LOCAL_PROJECTS, validateProjectFiles } from "./services/limits";
import { CLIP_SHOP_PLANS, getClipShopPlan, isUnlimitedPlan } from "./plans";
import { classifyClipShopError } from "./services/errors";
import { pendingQueueVariationIds, reconcileQueueWithOutputs } from "./services/queue";
import { estimateRenderStorageBytes } from "./services/storage-estimate";
import { getVariationDiversityLevel } from "./services/variation-recipe";
import { useClipShopProject } from "./hooks/useClipShopProject";
import { useClipShopQueue } from "./hooks/useClipShopQueue";
import { useClipShopStorage } from "./hooks/useClipShopStorage";
import { createDefaultAudioShuffleProjectState } from "./audio-shuffle/presets";
import type { ClipShopPlanDefinition, ClipShopPlanKey } from "./plans";
import type { ClipAsset, ClipCategory, ClipShopProject, ClipShopUsage, CompatibilityReport, LocalProjectStorageInfo, QueueSnapshot, RenderOutput, Variation } from "./types";

interface Props {
  currentUser: { name: string; email: string; id?: string; plan?: string; isAdmin?: boolean };
  onExitToApp: () => void;
  onLogout: () => void;
  onUpgrade: () => void;
}

type DeleteTarget =
  | { kind: "project"; project: ClipShopProject }
  | { kind: "output"; output: RenderOutput };

const categoryInfo = {
  hook: { number: "01", title: "Ganchos", singular: "Gancho", description: "Prenda a atenção nos primeiros segundos", color: "text-amber-300", badge: "bg-amber-400 text-zinc-950" },
  body: { number: "02", title: "Corpos", singular: "Corpo", description: "Mostre o produto e o principal benefício", color: "text-amber-400", badge: "bg-amber-500 text-zinc-950" },
  cta: { number: "03", title: "CTAs", singular: "CTA", description: "Convide a pessoa para comprar", color: "text-amber-500", badge: "bg-amber-600 text-white" },
} as const;

const WORKSPACE_SLOTS = [1, 2, 3, 4, 5, 6] as const;
const MAX_WORKSPACE_SLOTS = WORKSPACE_SLOTS.length;
const MAX_WORKSPACE_CLIPS = MAX_WORKSPACE_SLOTS * 3;
const MAX_SAVED_SELECTIONS = 150;
const DEFAULT_EXPORT_NAME_TEMPLATE = "{project}-{variationId}";
const ONBOARDING_STORAGE_KEY = "umbra.clipshop.onboarding.v1";
const DEFAULT_AUDIO_POLICY = { mode: "normalize", targetLoudnessDb: -14, peakDb: -1, fadeMs: 12 } as const;
const CLIPSHOP_QUESTIONS = [
  { question: "Preciso preencher todos os espaços para começar?", answer: "Não. Você pode começar com apenas 1 Gancho, 1 Corpo e 1 CTA. Com 6 trechos em cada categoria, o Clip Shop calcula 216 possibilidades e seleciona até 150 combinações diversas." },
  { question: "Quantos vídeos consigo criar com 1 Gancho, 1 Corpo e 1 CTA?", answer: "Essa configuração possui somente 1 combinação única. Para criar mais vídeos realmente diferentes, adicione novos Ganchos, Corpos ou CTAs." },
  { question: "Como as combinações são formadas?", answer: "O Clip Shop multiplica a quantidade de Ganchos × Corpos × CTAs. Com 6 de cada, existem 216 possibilidades; o motor prepara até 150 trios diversos e sem duplicação." },
  { question: "Quantos vídeos posso selecionar por lote?", answer: "O Free permite 1 vídeo por lote, o Pro permite até 50 e o Elite permite até 150 combinações de uma vez." },
  { question: "Quando meu limite mensal é consumido?", answer: "Somente cada vídeo concluído com sucesso desconta uma unidade do limite mensal. Abrir a revisão, gerar o teste ou receber um erro de processamento não consome saldo." },
  { question: "Meus vídeos são enviados para algum servidor?", answer: "Não. Os arquivos e a renderização permanecem no seu dispositivo. O Supabase registra apenas a reserva e o consumo da geração, nunca o conteúdo dos vídeos." },
  { question: "Quais arquivos posso adicionar?", answer: "O fluxo atual aceita MP4 e MOV com até 30 segundos por clipe. A compatibilidade final também depende dos codecs disponíveis no navegador e no dispositivo." },
  { question: "O que acontece com vídeos que não estão em 9:16?", answer: "Quando necessário, o Clip Shop normaliza o vídeo para o perfil vertical interno 720×1280, preservando toda a imagem com enquadramento do tipo contain." },
  { question: "Como o áudio dos trechos é tratado?", answer: "Clipes compatíveis mantêm o áudio original no caminho rápido. Quando necessário, o sistema normaliza para AAC, 48 kHz e dois canais antes de concatenar." },
  { question: "Posso escolher o nome dos arquivos exportados?", answer: "Sim. Cada projeto possui um modelo configurável com variáveis para projeto, ID da variação, Gancho, Corpo e CTA. Colisões recebem um sufixo seguro automaticamente." },
  { question: "Como baixo todos os resultados de uma vez?", answer: "Use “Baixar tudo em ZIP” na área de exportação. O pacote contém todos os MP4 salvos e um manifesto CSV com a composição de cada variação." },
  { question: "Posso fechar a página durante a geração?", answer: "Não é recomendado. O navegador exibe uma proteção contra fechamento enquanto a fila está processando. Aguarde a conclusão ou cancele o lote antes de sair." },
] as const;

function newProject(): ClipShopProject {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: "Novo projeto", productName: "", status: "draft", strategy: "balanced", quality: "performance", audioPolicy: { ...DEFAULT_AUDIO_POLICY }, audioShuffle: createDefaultAudioShuffleProjectState(), compositionMode: "contain", visualVariationsEnabled: true, mp4MetadataEnabled: true, outputAspectRatio: "9:16", headlineText: "", captionText: "", exportNameTemplate: DEFAULT_EXPORT_NAME_TEMPLATE, clips: [], variations: [], createdAt: now, updatedAt: now };
}

function normalizeWorkspaceProject(project: ClipShopProject): ClipShopProject {
  const clips = project.clips.filter((clip) => clip.slot <= MAX_WORKSPACE_SLOTS);
  const previous = new Map(project.variations.map((variation) => [variation.id, variation]));
  let selectedCount = 0;
  const variations = generateVariations(clips, project.strategy).map((variation) => {
    const saved = previous.get(variation.id);
    const selected = Boolean(saved?.selected) && selectedCount < MAX_SAVED_SELECTIONS;
    if (selected) selectedCount += 1;
    return saved ? { ...variation, ...saved, number: variation.number, selected, ...(saved.status === "processing" ? { status: "queued" as const, progress: 0, error: "Geração interrompida; pronta para continuar." } : {}) } : variation;
  });
  const audioShuffle = project.audioShuffle
    ? { ...project.audioShuffle, variationSequenceIds: project.audioShuffle.variationSequenceIds || {}, renderedAudioStorageKeys: project.audioShuffle.renderedAudioStorageKeys || {}, batchHistory: project.audioShuffle.batchHistory || [] }
    : createDefaultAudioShuffleProjectState();
  return { ...project, audioPolicy: project.audioPolicy || { ...DEFAULT_AUDIO_POLICY }, audioShuffle, compositionMode: project.compositionMode || "contain", visualVariationsEnabled: project.visualVariationsEnabled !== false, mp4MetadataEnabled: project.mp4MetadataEnabled !== false, outputAspectRatio: project.outputAspectRatio || "9:16", headlineText: project.headlineText || "", captionText: project.captionText || "", exportNameTemplate: project.exportNameTemplate || DEFAULT_EXPORT_NAME_TEMPLATE, clips, variations };
}

function ClipShopWorkspace({ currentUser, onExitToApp, onLogout, onUpgrade }: Props) {
  const { projects, setProjects, project, setProject, updateProject, saveState, saveError, retrySave } = useClipShopProject();
  const [outputs, setOutputs] = useState<RenderOutput[]>([]);
  const [compatibility, setCompatibility] = useState<CompatibilityReport | null>(null);
  const [usage, setUsage] = useState<ClipShopUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySlots, setBusySlots] = useState<string[]>([]);
  const [preview, setPreview] = useState<Variation | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [testOutputUrl, setTestOutputUrl] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const { processing, setProcessing, paused, setPaused, queueMessage, setQueueMessage, pauseRef, cancelRef, renderAbortRef } = useClipShopQueue();
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [queueRecovery, setQueueRecovery] = useState<QueueSnapshot | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Array<{ id: string; file: File; category: ClipCategory }>>([]);
  const [generationQuantity, setGenerationQuantity] = useState(1);
  const [combinationFilters, setCombinationFilters] = useState({ hook: 0, body: 0, cta: 0, diversity: "all" });
  const [outputSearch, setOutputSearch] = useState("");
  const projectRef = useRef(project);
  const outputsRef = useRef(outputs);
  const testOutputUrlRef = useRef(testOutputUrl);
  const storage = useClipShopStorage(projects, setProjects, setCompatibility);
  projectRef.current = project;
  outputsRef.current = outputs;
  testOutputUrlRef.current = testOutputUrl;
  const planDefinition = getClipShopPlan(currentUser.plan, currentUser.isAdmin);
  const maxSelectionPerGeneration = planDefinition.batchSize;

  useEffect(() => {
    Promise.all([listProjects(), checkCompatibility(), getClipShopUsage(currentUser.plan || "free").catch(() => null)]).then(([rows, report, currentUsage]) => {
      const normalizedRows = rows.map(normalizeWorkspaceProject);
      setProjects(normalizedRows); setCompatibility(report); setUsage(currentUsage);
      const requested = clipShopProjectId();
      const found = requested ? normalizedRows.find((item) => item.id === requested) : null;
      if (found) { setProject(found); Promise.all([listOutputs(found.id), getQueue(found.id)]).then(([savedOutputs, queue]) => { setOutputs(savedOutputs); setQueueRecovery(queue ? reconcileQueueWithOutputs(queue, savedOutputs.filter((output) => output.createdAt >= queue.createdAt).map((output) => output.variationId)) : null); }); }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível abrir o armazenamento local.")).finally(() => setLoading(false));
  }, [currentUser.plan]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (processing || (project && saveState !== "saved")) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [processing, project, saveState]);

  useEffect(() => () => revokeWorkspaceObjectUrls(projectRef.current, outputsRef.current, testOutputUrlRef.current), []);

  useEffect(() => {
    if (!project || window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done") return;
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }, [project?.id]);

  const recompute = (clips: ClipAsset[], strategy = project?.strategy || "balanced") => generateVariations(clips.filter((clip) => clip.slot <= MAX_WORKSPACE_SLOTS), strategy);

  const addFiles = async (category: ClipCategory, files: File[], forcedSlot?: number) => {
    if (!project) return;
    setError("");
    if (forcedSlot && project.clips.some((clip) => clip.category === category && clip.slot === forcedSlot) && !window.confirm(`Substituir ${categoryInfo[category].singular} ${forcedSlot}?`)) return;
    const occupied = new Set(project.clips.filter((clip) => clip.category === category).map((clip) => clip.slot));
    const slots = forcedSlot ? [forcedSlot] : WORKSPACE_SLOTS.filter((slot) => !occupied.has(slot));
    const accepted = files.slice(0, slots.length);
    if (files.length > accepted.length) setError(`${files.length - accepted.length} arquivo(s) excedente(s) não foram adicionados porque esta coluna possui ${MAX_WORKSPACE_SLOTS} slots.`);
    if (!accepted.length) { setError(`Os três espaços de ${categoryInfo[category].title} já estão preenchidos.`); return; }
    const replaced = new Set(slots.slice(0, accepted.length));
    const currentBytes = project.clips.filter((clip) => clip.category !== category || !replaced.has(clip.slot)).reduce((sum, clip) => sum + clip.media.size, 0);
    const limitError = validateProjectFiles(currentBytes, accepted);
    if (limitError) { setError(limitError); return; }
    setBusySlots((rows) => [...rows, ...slots.slice(0, accepted.length).map((slot) => `${category}-${slot}`)]);
    try {
      const created = await Promise.all(accepted.map((file, index) => createClipAsset(file, category, slots[index])));
      const replacedClips = project.clips.filter((clip) => clip.category === category && created.some((createdClip) => createdClip.slot === clip.slot));
      updateProject((current) => {
        const replacedSlots = new Set(created.map((clip) => clip.slot));
        const clips = [...current.clips.filter((clip) => clip.category !== category || !replacedSlots.has(clip.slot)), ...created];
        return { ...current, clips, variations: recompute(clips, current.strategy), status: hasMinimumClips(clips) ? "ready" : "draft" };
      });
      replacedClips.forEach((clip) => URL.revokeObjectURL(clip.objectUrl));
      await Promise.all(replacedClips.map((clip) => deleteClipSource(clip.storageKey)));
      const resultingClipIds = [...project.clips.filter((clip) => clip.category !== category || !replaced.has(clip.slot)).map((clip) => clip.id), ...created.map((clip) => clip.id)].sort();
      void emitShopFactoryEvent("umbra_clip_shop", `clipshop:variations:${project.id}:${resultingClipIds.join("-")}`, {
        agent: "UMBRA Clip Shop", eventType: "variations.updated", projectId: project.id,
        clipCount: resultingClipIds.length, variationCount: recompute([...project.clips.filter((clip) => clip.category !== category || !replaced.has(clip.slot)), ...created], project.strategy).length,
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível validar os arquivos."); }
    finally { setBusySlots((rows) => rows.filter((key) => !key.startsWith(`${category}-`) || !slots.includes(Number(key.split("-")[1])))); }
  };

  const removeClip = (clip: ClipAsset) => {
    URL.revokeObjectURL(clip.objectUrl);
    updateProject((current) => {
      const clips = current.clips.filter((item) => item.id !== clip.id);
      return { ...current, clips, variations: recompute(clips, current.strategy), status: hasMinimumClips(clips) ? "ready" : "draft" };
    });
    void deleteClipSource(clip.storageKey);
  };

  const moveClip = (clip: ClipAsset, category: ClipCategory, slot: number) => {
    if (!project || (clip.category === category && clip.slot === slot)) return;
    const occupied = project.clips.find((item) => item.id !== clip.id && item.category === category && item.slot === slot);
    if (occupied && !window.confirm(`O slot ${categoryInfo[category].singular} ${slot} está ocupado. Substituir o clipe atual?`)) return;
    updateProject((current) => {
      const clips = current.clips.filter((item) => item.id === clip.id || item.id !== occupied?.id).map((item) => item.id === clip.id ? { ...item, category, slot, semanticName: `${categoryInfo[category].singular} ${slot}` } : item);
      return { ...current, clips, variations: recompute(clips, current.strategy), status: hasMinimumClips(clips) ? "ready" : "draft" };
    });
    if (occupied) {
      URL.revokeObjectURL(occupied.objectUrl);
      void deleteClipSource(occupied.storageKey);
    }
  };

  const importStagedFiles = async () => {
    const groups = (["hook", "body", "cta"] as const).map((category) => ({ category, files: stagedFiles.filter((item) => item.category === category).map((item) => item.file) }));
    setStagedFiles([]);
    for (const group of groups) if (group.files.length) await addFiles(group.category, group.files);
  };

  const selected = project?.variations.filter((item) => item.selected) ?? [];
  const workspaceClips = project?.clips.filter((clip) => clip.slot <= MAX_WORKSPACE_SLOTS && clip.status !== "error") ?? [];
  const variationDesk = project ? buildVariationDesk(project.clips, project.variations) : [];
  const filteredVariationDesk = variationDesk.filter((row) =>
    (!combinationFilters.hook || row.hookSlot === combinationFilters.hook)
    && (!combinationFilters.body || row.bodySlot === combinationFilters.body)
    && (!combinationFilters.cta || row.ctaSlot === combinationFilters.cta)
    && (combinationFilters.diversity === "all" || getVariationDiversityLevel(row.hookSlot, row.bodySlot, row.ctaSlot) === combinationFilters.diversity),
  );
  const filteredOutputs = outputs.filter((output) => output.fileName.toLocaleLowerCase("pt-BR").includes(outputSearch.trim().toLocaleLowerCase("pt-BR")));
  const possibleCombinations = countPossibleCombinations(workspaceClips);
  const availableCombinations = project?.variations.length ?? 0;
  const selectableCombinations = Math.min(maxSelectionPerGeneration, filteredVariationDesk.length);
  const exportNamePreview = project?.variations[0]
    ? variationFileName(project.name, project.variations[0], project.clips, project.exportNameTemplate)
    : `${sanitizeFilePart(project?.name || "projeto")}-variacao.mp4`;
  const toggleVariation = (variationId: string) => updateProject((current) => {
    const target = current.variations.find((item) => item.id === variationId);
    if (!target) return current;
    const selectedCount = current.variations.filter((item) => item.selected).length;
    if (!target.selected && selectedCount >= maxSelectionPerGeneration) {
      setError(`Seu plano ${planDefinition.name} permite até ${maxSelectionPerGeneration} variações por lote.`);
      return current;
    }
    return { ...current, variations: current.variations.map((item) => item.id === variationId ? { ...item, selected: !item.selected } : item) };
  });
  const selectVariationCount = (requested: number) => {
    const quantity = Math.max(0, Math.min(Math.floor(requested), selectableCombinations));
    const targetIds = new Set(filteredVariationDesk.slice(0, quantity).map((row) => row.variation.id));
    setGenerationQuantity(Math.max(1, quantity));
    updateProject((current) => ({ ...current, variations: current.variations.map((item) => ({ ...item, selected: targetIds.has(item.id) })) }));
  };
  const changeGenerationQuantity = (increment: number) => {
    setGenerationQuantity((current) => Math.max(1, Math.min(current + increment, Math.max(1, selectableCombinations))));
  };
  const totalDuration = selected.reduce((sum, variation) => sum + [variation.hookId, variation.bodyId, variation.ctaId].reduce((part, id) => part + (project?.clips.find((clip) => clip.id === id)?.media.duration ?? 0), 0), 0);
  const estimatedBytes = estimateRenderStorageBytes(totalDuration, project?.quality ?? "performance");

  const runQueue = async (recovery?: QueueSnapshot, explicitIds?: string[]) => {
    if (!project || processing) return;
    const targetIds = recovery
      ? pendingQueueVariationIds(recovery)
      : explicitIds ?? selected.map((item) => item.id);
    const targets = project.variations.filter((item) => targetIds.includes(item.id));
    if (!targets.length) return;
    if (!recovery && usage && usage.remaining >= 0 && targets.length > usage.remaining) {
      setError(`Seu saldo permite gerar mais ${usage.remaining} vídeo${usage.remaining === 1 ? "" : "s"} neste mês.`);
      return;
    }
    const targetBytes = targets.reduce((sum, variation) => sum + [variation.hookId, variation.bodyId, variation.ctaId].reduce((part, id) => part + (project.clips.find((clip) => clip.id === id)?.media.size ?? 0), 0), 0);
    const availableStorage = compatibility?.storageQuota === undefined ? undefined : compatibility.storageQuota - (compatibility.storageUsage ?? 0);
    if (!hasStorageFor(availableStorage, targetBytes)) {
      setError("Não há espaço local suficiente para este lote mantendo a reserva de segurança de 200 MB.");
      return;
    }
    let audioQueueSnapshot: QueueSnapshot["audioShuffle"];
    try {
      audioQueueSnapshot = recovery?.audioShuffle ?? buildAudioShuffleQueueSnapshot(project, targetIds);
      if (!recovery && audioQueueSnapshot) await Promise.all(audioQueueSnapshot.sequences.map((sequence) => saveAudioSequence({
        id: sequence.id, sourceId: audioQueueSnapshot!.sourceId, projectId: project.id,
        algorithmVersion: audioQueueSnapshot!.algorithmVersion, sourceFingerprint: audioQueueSnapshot!.sourceFingerprint,
        seed: sequence.seed, sequence, createdAt: new Date().toISOString(),
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível preservar o áudio antes do lote."); return; }
    setReviewOpen(false); setProcessing(true); setPaused(false); pauseRef.current = false; cancelRef.current = false; setError(""); setQueueMessage("Autorizando geração...");
    const requestId = recovery?.requestId ?? crypto.randomUUID();
    let reservationId = recovery?.reservationId ?? "";
    let started = false;
    let completedIds = [...(recovery?.completedVariationIds ?? [])];
    let failedIds = [...(recovery?.failedVariationIds ?? [])];
    const createdAt = recovery?.createdAt ?? new Date().toISOString();
    try {
      if (!reservationId) reservationId = await reserveGeneration(requestId, targets.length);
      void emitShopFactoryEvent("umbra_clip_shop", `clipshop:batch:${requestId}`, {
        agent: "UMBRA Clip Shop", eventType: "batch.started", projectId: project.id,
        variationCount: targets.length, quality: project.quality, compositionMode: project.compositionMode,
      });
      const usedFileNames = new Set(outputs.map((output) => output.fileName));
      updateProject((current) => ({ ...current, status: "processing", variations: current.variations.map((item) => targetIds.includes(item.id) ? { ...item, status: "queued", progress: 0, error: undefined } : item) }));
      for (let index = 0; index < targets.length; index += 1) {
        while (pauseRef.current && !cancelRef.current) await new Promise((resolve) => window.setTimeout(resolve, 200));
        if (cancelRef.current) break;
        const variation = targets[index];
        const snapshot = (): QueueSnapshot => ({ projectId: project.id, requestId, reservationId, targetVariationIds: recovery?.targetVariationIds ?? targetIds, completedVariationIds: completedIds, failedVariationIds: failedIds, currentVariationId: variation.id, status: "running", createdAt, updatedAt: new Date().toISOString(), audioShuffle: audioQueueSnapshot });
        await saveQueue(snapshot());
        setQueueMessage(`Gerando ${index + 1} de ${targets.length}`);
        await startGeneration(reservationId); started = true;
        updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, status: "processing", progress: 0 } : item) }));
        try {
          const controller = new AbortController(); renderAbortRef.current = controller;
          const currentProject = projectRef.current;
          const rendered = await renderVariation(variation, currentProject?.clips ?? [], currentProject ? { audioPolicy: currentProject.audioPolicy, compositionMode: currentProject.compositionMode, quality: currentProject.quality, visualVariationsEnabled: currentProject.visualVariationsEnabled, mp4MetadataEnabled: currentProject.mp4MetadataEnabled, outputAspectRatio: currentProject.outputAspectRatio, headlineText: currentProject.headlineText, captionText: currentProject.captionText } : undefined, (progress) => updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, progress: Math.round(progress.progress * 75) } : item) })), controller.signal);
          let finalBlob = rendered.blob;
          let audioStorageKey: string | undefined;
          let audioBlob: Blob | undefined;
          let audioObjectUrl: string | undefined;
          const sequence = findQueueAudioSequence(audioQueueSnapshot, variation.id);
          if (audioQueueSnapshot && !sequence) throw new Error(`A fila recuperada não contém o áudio da variação ${variation.number}.`);
          if (audioQueueSnapshot && sequence) {
            setQueueMessage(`Aplicando áudio exclusivo ${index + 1} de ${targets.length}`);
            updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, progress: 82 } : item) }));
            const storedSource = await getAudioSource(audioQueueSnapshot.sourceId);
            if (!storedSource?.available || !storedSource.blob) throw new Error("A fonte de áudio preservada pela fila não está mais disponível.");
            const audioResult = await renderVariationAudio({ video: rendered.blob, videoDuration: rendered.duration, source: storedSource.blob, sequence, settings: audioQueueSnapshot.settings, signal: controller.signal });
            finalBlob = audioResult.video;
            audioStorageKey = await saveAudioMedia("outputs", `${project.id}-${variation.id}`, audioResult.audio) ?? undefined;
            audioBlob = audioResult.audio;
            audioObjectUrl = URL.createObjectURL(audioResult.audio);
            if (audioStorageKey) {
              const storedAudioKey = audioStorageKey;
              updateProject((current) => ({
                ...current,
                audioShuffle: current.audioShuffle ? {
                  ...current.audioShuffle,
                  renderedAudioStorageKeys: {
                    ...current.audioShuffle.renderedAudioStorageKeys,
                    [variation.id]: storedAudioKey,
                  },
                } : current.audioShuffle,
              }));
            }
          }
          const output: RenderOutput = {
            id: crypto.randomUUID(), projectId: project.id, variationId: variation.id,
            fileName: uniqueFileName(variationFileName(project.name, variation, project.clips, project.exportNameTemplate), usedFileNames), blob: finalBlob,
            objectUrl: URL.createObjectURL(finalBlob), duration: rendered.duration, size: finalBlob.size, createdAt: new Date().toISOString(),
            audioStorageKey, audioBlob, audioObjectUrl,
          };
          await saveOutput(output); setOutputs((rows) => [output, ...rows]); completedIds = [...completedIds, variation.id]; failedIds = failedIds.filter((id) => id !== variation.id);
          void emitShopFactoryEvent("umbra_clip_shop", `clipshop:output:${output.id}`, {
            agent: "UMBRA Clip Shop", eventType: "output.completed", projectId: project.id,
            variationId: variation.id, duration: output.duration, size: output.size,
          });
          updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, status: "completed", progress: 100, outputId: output.id } : item) }));
          await saveQueue(snapshot());
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, status: "canceled", error: "Cancelado pelo usuário." } : item) }));
            break;
          }
          const detail = classifyClipShopError(cause);
          failedIds = [...new Set([...failedIds, variation.id])];
          updateProject((current) => ({ ...current, variations: current.variations.map((item) => item.id === variation.id ? { ...item, status: "error", error: `${detail.title}: ${detail.message}`, recoverable: detail.recoverable } : item) }));
          await saveQueue(snapshot());
        } finally { renderAbortRef.current = null; }
      }
      await finishGeneration(reservationId, completedIds.length);
      await deleteQueue(project.id); setQueueRecovery(null);
      updateProject((current) => ({ ...current, status: completedIds.length ? "completed" : "ready" }));
      setUsage(await getClipShopUsage(currentUser.plan || "free"));
      if (!completedIds.length) setError("Nenhuma variação foi concluída. Use “Tentar novamente” nos erros recuperáveis ou revise os codecs dos clipes.");
    } catch (cause) {
      if (reservationId && !started) await releaseGeneration(reservationId, "client_preparation_failed").catch(() => undefined);
      getClipShopUsage(currentUser.plan || "free").then(setUsage).catch(() => undefined);
      const detail = classifyClipShopError(cause);
      setError(`${detail.title}: ${detail.message}`);
    } finally { setProcessing(false); setPaused(false); pauseRef.current = false; renderAbortRef.current = null; setQueueMessage(""); }
  };

  const runTest = async () => {
    if (!project || !selected[0] || testBusy) return;
    setTestBusy(true); setError("");
    try {
      const rendered = await renderVariation(selected[0], project.clips, { audioPolicy: project.audioPolicy, compositionMode: project.compositionMode, quality: project.quality, visualVariationsEnabled: project.visualVariationsEnabled, mp4MetadataEnabled: project.mp4MetadataEnabled, outputAspectRatio: project.outputAspectRatio, headlineText: project.headlineText, captionText: project.captionText });
      if (testOutputUrl) URL.revokeObjectURL(testOutputUrl);
      setTestOutputUrl(URL.createObjectURL(rendered.blob));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o vídeo de teste."); }
    finally { setTestBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.kind === "project") {
        await deleteProjectAudioSources(deleteTarget.project.id);
        await deleteProject(deleteTarget.project.id);
        setProjects((rows) => rows.filter((row) => row.id !== deleteTarget.project.id));
      } else {
        await deleteOutput(deleteTarget.output.id);
        URL.revokeObjectURL(deleteTarget.output.objectUrl);
        if (deleteTarget.output.audioObjectUrl) URL.revokeObjectURL(deleteTarget.output.audioObjectUrl);
        updateProject((current) => current.audioShuffle ? { ...current, audioShuffle: { ...current.audioShuffle, renderedAudioStorageKeys: Object.fromEntries(Object.entries(current.audioShuffle.renderedAudioStorageKeys).filter(([variationId]) => variationId !== deleteTarget.output.variationId)) } } : current);
        setOutputs((rows) => rows.filter((item) => item.id !== deleteTarget.output.id));
      }
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o item local.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const downloadAllResults = async () => {
    if (!project || !outputs.length || zipBusy) return;
    setZipBusy(true); setError("");
    try {
      const completedVariations = project.variations.filter((variation) => outputs.some((output) => output.variationId === variation.id));
      const outputNames = Object.fromEntries(outputs.map((output) => [output.variationId, output.fileName]));
      const manifest = buildManifest(project.name, completedVariations, project.clips, project.exportNameTemplate, outputNames);
      const zip = await buildStoredZip([
        ...outputs.map((output) => ({ name: output.fileName, blob: output.blob })),
        ...outputs.filter((output) => output.audioBlob).map((output) => ({ name: output.fileName.replace(/\.mp4$/i, "-audio.wav"), blob: output.audioBlob! })),
        { name: `${sanitizeFilePart(project.name)}-manifesto.csv`, blob: new Blob([manifest], { type: "text/csv;charset=utf-8" }) },
      ]);
      downloadBlob(zip, `${sanitizeFilePart(project.name)}-resultados.zip`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar o arquivo ZIP.");
    } finally {
      setZipBusy(false);
    }
  };

  const finishOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
    setOnboardingOpen(false);
  };

  if (loading) return <Shell currentUser={currentUser} onExit={onExitToApp} onLogout={onLogout}><div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-amber-400" /></div></Shell>;

  if (!project) return <Shell currentUser={currentUser} onExit={onExitToApp} onLogout={onLogout} usage={usage}>
    <div className="mx-auto max-w-6xl py-8">
        <div className="mb-8"><p className="text-xs font-black uppercase tracking-[.28em] text-amber-500">Criativos em escala</p><h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">Um produto. <span className="text-amber-400">150 maneiras de vender.</span></h1><p className="mt-4 max-w-2xl text-sm text-zinc-400">Combine Ganchos, Corpos e CTAs. Seus vídeos permanecem no dispositivo durante o processamento local.</p></div>
      {error && <ErrorBox text={error} />}
      {compatibility && !compatibility.supported && <ErrorBox text={`Este navegador não oferece o suporte mínimo: ${compatibility.warnings.join(" ")}`} />}
      <div className="mb-8 flex flex-wrap gap-3"><button onClick={() => { const created = newProject(); setProject(created); setOutputs([]); void emitShopFactoryEvent("umbra_clip_shop", `clipshop:project:${created.id}`, { agent: "UMBRA Clip Shop", eventType: "project.created", projectId: created.id }); window.location.hash = clipShopRoutes.project(created.id); }} className="flex items-center gap-3 rounded-2xl bg-amber-400 px-6 py-4 text-sm font-black text-zinc-950 hover:bg-amber-300"><Plus className="h-5 w-5" />Novo projeto</button><a href={clipShopRoutes.audioShuffle()} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 text-sm font-black text-amber-300 hover:bg-amber-500/10"><Volume2 className="h-5 w-5" />Audio Shuffle</a></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((item) => <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><div className="flex items-start justify-between"><div><h2 className="font-bold text-white">{item.name}</h2><p className="mt-1 text-xs text-zinc-500">{item.clips.filter((clip) => clip.slot <= MAX_WORKSPACE_SLOTS).length}/{MAX_WORKSPACE_CLIPS} clipes · {item.variations.length} combinações</p></div><FolderOpen className="h-5 w-5 text-amber-500" /></div><div className="mt-5 flex gap-2"><button onClick={() => { revokeWorkspaceObjectUrls(project, outputs, testOutputUrl); setTestOutputUrl(""); setProject(item); Promise.all([listOutputs(item.id), getQueue(item.id)]).then(([savedOutputs, queue]) => { setOutputs(savedOutputs); setQueueRecovery(queue ? reconcileQueueWithOutputs(queue, savedOutputs.filter((output) => output.createdAt >= queue.createdAt).map((output) => output.variationId)) : null); }); window.location.hash = clipShopRoutes.project(item.id); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white">Continuar<ChevronRight className="h-4 w-4" /></button><button onClick={() => setDeleteTarget({ kind: "project", project: item })} title={`Excluir ${item.name}`} className="rounded-xl border border-zinc-800 px-3 text-zinc-500 transition hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
      {!projects.length && <div className="rounded-3xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-600">Nenhum projeto local ainda.</div>}
      <div className="mt-8"><StoragePanel projects={projects} compatibility={compatibility} onOpen={storage.openCenter} /></div>
      <div className="mt-16"><PlanCard plan={planDefinition} usage={usage} onOpen={() => setPlanOpen(true)} /></div>
      <div className="mt-6"><QuestionsSection /></div>
    </div>
    {deleteTarget && <DeleteConfirmDialog target={deleteTarget} busy={deleteBusy} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
    {planOpen && <PlanModal currentPlan={planDefinition.key} usage={usage} onClose={() => setPlanOpen(false)} onUpgrade={onUpgrade} />}
    {storage.open && <StorageCenter projects={projects} info={storage.info} compatibility={compatibility} onClose={storage.closeCenter} onRefresh={storage.refresh} onDeleteOld={storage.deleteOld} onClearOutputs={storage.clearOutputs} onClearTemporary={storage.clearTemporary} onClearAll={storage.clearAll} />}
  </Shell>;

  return <Shell currentUser={currentUser} onExit={onExitToApp} onLogout={onLogout} usage={usage}>
    <div className="mx-auto max-w-[1320px] py-7 sm:py-10">
      <button onClick={() => { revokeWorkspaceObjectUrls(project, outputs, testOutputUrl); setProject(null); setOutputs([]); setTestOutputUrl(""); window.location.hash = clipShopRoutes.home(); }} className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-zinc-500 hover:text-amber-400"><ArrowLeft className="h-4 w-4" />Projetos salvos</button>
      <section className="relative mb-8 overflow-hidden rounded-[2rem] border border-amber-500/15 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-8"><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">Criativos em escala</p><input value={project.name} onChange={(event) => updateProject({ name: event.target.value })} className="mt-3 w-full max-w-2xl bg-transparent text-3xl font-black tracking-tight text-white outline-none sm:text-5xl" /><p className="mt-2 text-xl font-black text-amber-400 sm:text-3xl">150 maneiras de vender.</p><input value={project.productName} onChange={(event) => updateProject({ productName: event.target.value })} placeholder="Nome do produto (opcional)" className="mt-5 block w-full max-w-xl border-b border-zinc-800 bg-transparent pb-2 text-xs text-zinc-400 outline-none transition focus:border-amber-500/60" /></div><div className="min-w-44"><div className="flex items-end gap-1"><strong className="text-4xl font-black text-white">{workspaceClips.length}</strong><span className="mb-1 text-sm font-bold text-zinc-600">/{MAX_WORKSPACE_CLIPS}</span></div><p className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-zinc-500">trechos enviados</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all" style={{ width: `${workspaceClips.length / MAX_WORKSPACE_CLIPS * 100}%` }} /></div></div></div>
      </section>
      <div className="-mt-5 mb-7 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8">
        <button onClick={() => { setOnboardingStep(0); setOnboardingOpen(true); }} className="text-[10px] font-black uppercase tracking-[.16em] text-amber-400 hover:text-amber-300">Como funciona →</button>
        <div className={`flex items-center gap-2 text-[10px] font-bold ${saveState === "error" ? "text-red-300" : saveState === "saved" ? "text-emerald-400" : "text-zinc-500"}`}>
          {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveState === "saved" && <Check className="h-3.5 w-3.5" />}
          {saveState === "error" && <AlertTriangle className="h-3.5 w-3.5" />}
          <span title={saveError}>{saveState === "saving" ? "Salvando projeto..." : saveState === "saved" ? "Projeto salvo" : saveState === "error" ? `Falha ao salvar${saveError ? `: ${saveError}` : ""}` : ""}</span>
          {saveState === "error" && <button onClick={retrySave} className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-red-200 hover:bg-red-500/10"><RefreshCw className="mr-1 inline h-3 w-3" />Tentar novamente</button>}
        </div>
      </div>
      <nav className="mb-6 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">{[["clips", "01 Clipes"], ["audio-shuffle", "02 Audio Shuffle"], ["combinations", "03 Combinações"], ["generation", "04 Geração"]].map(([id, label]) => <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })} className={`rounded-lg border px-3 py-2 ${id === "audio-shuffle" ? "border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-400"}`}>{label}</button>)}</nav>
      {error && <ErrorBox text={error} onClose={() => setError("")} />}
      {queueRecovery && <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="text-sm font-black text-amber-300">Geração interrompida detectada</p><p className="mt-1 text-xs text-zinc-400">{queueRecovery.completedVariationIds.length} concluído(s). A fila e a reserva original foram recuperadas.</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => runQueue(queueRecovery)} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-black">Continuar geração</button><button onClick={async () => { await finishGeneration(queueRecovery.reservationId, queueRecovery.completedVariationIds.length).catch(() => undefined); await deleteQueue(project.id); setQueueRecovery(null); await clearTemporaryFiles(); setUsage(await getClipShopUsage(currentUser.plan || "free")); }} className="rounded-xl border border-red-500/20 px-4 py-2.5 text-xs font-bold text-red-300">Descartar fila</button></div></div>}
      {compatibility?.warnings.length ? <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{compatibility.warnings.join(" ")}</span></div> : null}
      <ProjectMediaSettings project={project} onChange={updateProject} />
      <WorkspaceControls project={project} compatibility={compatibility} estimatedBytes={estimatedBytes} estimatedSeconds={totalDuration} onChange={(change) => updateProject((current) => ({ ...current, ...change, variations: change.strategy ? recompute(current.clips, change.strategy) : current.variations }))} />
      <section id="clips" className="mb-8"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">01 · Monte seu criativo</p><h2 className="mt-2 text-2xl font-black text-white">Envie até {MAX_WORKSPACE_CLIPS} trechos</h2><p className="mt-1 text-xs text-zinc-500">Até {MAX_WORKSPACE_SLOTS} Ganchos, {MAX_WORKSPACE_SLOTS} Corpos e {MAX_WORKSPACE_SLOTS} CTAs. Arraste arquivos ou use o upload geral.</p></div><label className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-black text-amber-300"><input type="file" multiple accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); setStagedFiles(files.map((file, index) => ({ id: `${file.name}-${file.lastModified}-${index}`, file, category: index < MAX_WORKSPACE_SLOTS ? "hook" : index < MAX_WORKSPACE_SLOTS * 2 ? "body" : "cta" }))); event.target.value = ""; }} />Upload geral e classificar</label></div><div className="grid gap-4 lg:grid-cols-3">{(["hook", "body", "cta"] as const).map((category) => <ClipColumnWithAudio key={category} category={category} clips={project.clips} busySlots={busySlots} onFiles={(files) => addFiles(category, files)} onSlotFile={(slot, file) => addFiles(category, [file], slot)} onRemove={removeClip} onRename={(clip, semanticName) => updateProject((current) => ({ ...current, clips: current.clips.map((item) => item.id === clip.id ? { ...item, semanticName } : item) }))} onMove={moveClip} onMute={(clip) => updateProject((current) => ({ ...current, clips: current.clips.map((item) => item.id === clip.id ? { ...item, muted: !item.muted } : item) }))} />)}</div></section>
      <ProjectAudioShufflePanel project={project} onChange={updateProject} />
      <section id="combinations" className="mb-8 rounded-[2rem] border border-amber-500/10 bg-[#0c0c0c] p-5 shadow-2xl shadow-black/30 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">03 · Combinações</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Suas combinações</h2><p className="mt-2 text-xs text-zinc-500">{possibleCombinations.toLocaleString("pt-BR")} combinações possíveis · {availableCombinations.toLocaleString("pt-BR")} preparadas pelo motor · limite de {maxSelectionPerGeneration} por lote.</p></div>
          <div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-3 text-[9px] font-bold"><span className="text-amber-300">● Gancho</span><span className="text-amber-400">● Corpo</span><span className="text-amber-500">● CTA</span></div><button onClick={() => { setGenerationQuantity(1); updateProject((current) => ({ ...current, variations: current.variations.map((item) => ({ ...item, selected: false })) })); }} className="text-[10px] font-bold text-zinc-500 hover:text-white">Limpar</button></div>
        </div>
        <div className="mb-4 grid gap-2 rounded-2xl border border-zinc-800 bg-black/20 p-4 sm:grid-cols-4">
          {(["hook", "body", "cta"] as const).map((category) => <label key={category} className="text-[9px] font-black uppercase tracking-wider text-zinc-600">{category === "hook" ? "Gancho" : category === "body" ? "Corpo" : "CTA"}<select value={combinationFilters[category]} onChange={(event) => setCombinationFilters((current) => ({ ...current, [category]: Number(event.target.value) }))} className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs normal-case text-white"><option value={0}>Todos</option>{WORKSPACE_SLOTS.map((slot) => <option key={slot} value={slot}>Slot {slot}</option>)}</select></label>)}
          <label className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Diversidade<select value={combinationFilters.diversity} onChange={(event) => setCombinationFilters((current) => ({ ...current, diversity: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs normal-case text-white"><option value="all">Todos os níveis</option><option value="original">Original</option><option value="light">Leve</option><option value="high">Alta</option></select></label>
          <p className="sm:col-span-4 text-[10px] text-zinc-600">Mostrando {filteredVariationDesk.length} de {variationDesk.length} combinações.</p>
        </div>
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">Quantos vídeos deseja gerar?</p><div className="mt-3 flex flex-wrap items-center gap-2"><div className="flex items-center overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900"><button type="button" aria-label="Diminuir um vídeo" disabled={generationQuantity <= 1 || !selectableCombinations} onClick={() => changeGenerationQuantity(-1)} className="px-3 py-2.5 text-sm font-black text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">−1</button><input aria-label="Quantidade de vídeos" type="number" min={1} max={Math.max(1, selectableCombinations)} value={generationQuantity} onChange={(event) => setGenerationQuantity(Math.max(1, Math.min(Number(event.target.value) || 1, Math.max(1, selectableCombinations))))} className="w-16 border-x border-zinc-700 bg-transparent px-2 py-2.5 text-center text-sm font-black text-white outline-none" /><button type="button" aria-label="Adicionar um vídeo" disabled={!selectableCombinations || generationQuantity >= selectableCombinations} onClick={() => changeGenerationQuantity(1)} className="px-3 py-2.5 text-sm font-black text-amber-300 transition hover:bg-amber-500/10 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-30">+1</button></div><button type="button" disabled={!selectableCombinations} onClick={() => selectVariationCount(generationQuantity)} className="rounded-xl bg-amber-400 px-4 py-3 text-[10px] font-black text-black disabled:opacity-40">Selecionar quantidade</button>{[10, 30, 50, 100, 150].filter((value) => value <= selectableCombinations).map((value) => <button type="button" key={value} onClick={() => selectVariationCount(value)} className="rounded-xl border border-zinc-800 px-3 py-2.5 text-[10px] font-bold text-zinc-400 hover:border-amber-500/30 hover:text-amber-300">{value}</button>)}<span className="text-[10px] text-zinc-600">Selecionados: {selected.length}</span></div></div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{filteredVariationDesk.map((row) => <VariationCard key={row.number} number={row.number} hookSlot={row.hookSlot} bodySlot={row.bodySlot} ctaSlot={row.ctaSlot} variation={row.variation} selectionFull={selected.length >= maxSelectionPerGeneration} onToggle={() => row.variation && toggleVariation(row.variation.id)} onPreview={() => row.variation && setPreview(row.variation)} />)}</div>
        <div id="generation" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5"><div className="flex items-center gap-4"><strong className="text-3xl font-black text-amber-400">{selected.length}</strong><div><p className="text-xs font-bold text-white">variações selecionadas</p><p className="mt-1 text-[10px] text-zinc-600">{selected.length}/{maxSelectionPerGeneration} neste lote · aproximadamente {formatBytes(estimatedBytes)}</p>{queueMessage && <p className="mt-1 text-[10px] font-bold text-amber-400">{paused ? "Fila pausada após o vídeo atual" : queueMessage}</p>}</div></div>{processing ? <div className="flex gap-2"><button onClick={() => { const next = !pauseRef.current; pauseRef.current = next; setPaused(next); }} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold text-zinc-300">{paused ? "Continuar" : "Pausar"}</button><button onClick={() => { cancelRef.current = true; pauseRef.current = false; setPaused(false); renderAbortRef.current?.abort(); }} className="rounded-xl border border-red-500/30 px-4 py-3 text-xs font-bold text-red-400">Cancelar</button></div> : <button disabled={!selected.length || usage?.remaining === 0} onClick={() => setReviewOpen(true)} className="flex items-center gap-3 rounded-xl bg-amber-400 px-6 py-3.5 text-xs font-black text-zinc-950 shadow-lg shadow-amber-950/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-30">Gerar vídeos<ChevronRight className="h-4 w-4" /></button>}</div>
      </section>
      {!processing && project.variations.some((item) => item.status === "error" && item.recoverable !== false) && <div className="-mt-4 mb-8 flex justify-end"><button onClick={() => runQueue(undefined, project.variations.filter((item) => item.status === "error" && item.recoverable !== false).map((item) => item.id))} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-black text-amber-300"><RefreshCw className="mr-2 inline h-4 w-4" />Tentar novamente somente nos erros recuperáveis</button></div>}
      <section className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-500">Resultados</p><h2 className="mt-1 text-xl font-black text-white">Seus vídeos prontos</h2><p className="mt-1 text-[10px] text-zinc-600">{outputs.length} arquivos · {formatBytes(outputs.reduce((sum, output) => sum + output.size, 0))}</p></div>{outputs.length > 0 && <input value={outputSearch} onChange={(event) => setOutputSearch(event.target.value)} placeholder="Buscar pelo nome..." className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs text-white outline-none focus:border-amber-500/40 sm:w-64" />}</div>
        {outputs.length > 0 && <div className="mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-white">{filteredOutputs.length} criativos encontrados</h3><button onClick={() => downloadText(buildManifest(project.name, project.variations.filter((item) => outputs.some((output) => output.variationId === item.id)), project.clips), `${sanitizeFilePart(project.name)}-manifesto.csv`, "text/csv;charset=utf-8")} className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><Download className="h-4 w-4" />Manifesto CSV</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredOutputs.map((output) => <div key={output.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"><video src={output.objectUrl} controls preload="metadata" className="max-h-72 w-full bg-black object-contain" /><div className="p-4"><p className="truncate text-xs font-bold text-white">{output.fileName}</p><p className="mt-1 text-[10px] text-zinc-500">{formatBytes(output.size)} · {output.duration.toFixed(1)}s · {new Date(output.createdAt).toLocaleDateString("pt-BR")}</p><div className="mt-3 flex gap-2"><a href={output.objectUrl} download={output.fileName} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2 text-[10px] font-black text-zinc-950"><Download className="h-3.5 w-3.5" />MP4</a>{output.audioObjectUrl && <a href={output.audioObjectUrl} download={`${output.fileName.replace(/\\.mp4$/i, "")}-audio.wav`} className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-[10px] font-black text-amber-300"><Volume2 className="h-3.5 w-3.5" />WAV</a>}<button onClick={() => setDeleteTarget({ kind: "output", output })} title={`Excluir ${output.fileName}`} className="rounded-lg border border-zinc-700 px-2.5 text-zinc-500 transition hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div></div></div>)}</div>{!filteredOutputs.length && <div className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-xs text-zinc-600">Nenhum resultado corresponde à busca.</div>}</div>}
        {!outputs.length && <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-xs text-zinc-600">Os vídeos concluídos aparecerão aqui.</div>}
      </section>
      <section className="mb-6 rounded-3xl border border-amber-500/15 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-500">Exportação</p><h2 className="mt-1 text-xl font-black text-white">Modelo dos nomes</h2><p className="mt-2 max-w-xl text-xs leading-5 text-zinc-500">Monte o nome de todos os próximos vídeos usando as variáveis do projeto.</p></div>{outputs.length > 0 && <div className="flex gap-2"><button onClick={() => downloadText(buildManifest(project.name, project.variations.filter((item) => outputs.some((output) => output.variationId === item.id)), project.clips, project.exportNameTemplate), `${sanitizeFilePart(project.name)}-manifesto.csv`, "text/csv;charset=utf-8")} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-[10px] font-black text-zinc-300 hover:border-amber-500/30 hover:text-amber-400">Manifesto CSV</button><button disabled={zipBusy} onClick={downloadAllResults} className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-[10px] font-black text-zinc-950 disabled:cursor-wait disabled:opacity-60">{zipBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{zipBusy ? "Preparando ZIP..." : "Baixar tudo em ZIP"}</button></div>}</div>
        <input value={project.exportNameTemplate} onChange={(event) => updateProject({ exportNameTemplate: event.target.value || DEFAULT_EXPORT_NAME_TEMPLATE })} spellCheck={false} className="mt-5 w-full rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 font-mono text-xs text-amber-300 outline-none transition focus:border-amber-500/40" />
        <div className="mt-3 flex flex-wrap gap-2">{["{project}-{variationId}", "{project}-{gancho}-{corpo}-{cta}", "{project}-{gancho}-{cta}"].map((pattern) => <button key={pattern} onClick={() => updateProject({ exportNameTemplate: pattern })} className={`rounded-lg border px-2.5 py-1.5 font-mono text-[9px] transition ${project.exportNameTemplate === pattern ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-zinc-800 text-zinc-600 hover:text-zinc-300"}`}>{pattern}</button>)}</div>
        <div className="mt-4 rounded-xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3"><p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Prévia do próximo arquivo</p><p className="mt-1 truncate font-mono text-[10px] text-zinc-300">{exportNamePreview}</p><p className="mt-2 text-[9px] text-zinc-600">Variáveis: {`{project} · {variationId} · {gancho} · {corpo} · {cta}`}</p></div>
      </section>
    </div>
    {preview && <SequencePreview variation={preview} clips={project.clips} onClose={() => setPreview(null)} />}
    {reviewOpen && <ReviewModal project={project} compatibility={compatibility} selected={selected} totalDuration={totalDuration} estimatedBytes={estimatedBytes} usage={usage} testOutputUrl={testOutputUrl} testBusy={testBusy} onTest={runTest} onClose={() => setReviewOpen(false)} onConfirm={() => runQueue()} onUpgrade={onUpgrade} />}
    {deleteTarget && <DeleteConfirmDialog target={deleteTarget} busy={deleteBusy} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
    {onboardingOpen && <OnboardingDialog step={onboardingStep} onStep={setOnboardingStep} onClose={finishOnboarding} />}
    {stagedFiles.length > 0 && <ClassificationDialog files={stagedFiles} onChange={setStagedFiles} onCancel={() => setStagedFiles([])} onConfirm={importStagedFiles} />}
  </Shell>;
}

export default function ClipShop(props: Props) {
  const [audioRoute, setAudioRoute] = useState(() => isClipShopAudioShuffleRoute());
  useEffect(() => {
    const updateRoute = () => setAudioRoute(isClipShopAudioShuffleRoute());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);
  return audioRoute
    ? <AudioShufflePage onExitToApp={props.onExitToApp} onLogout={props.onLogout} />
    : <ClipShopWorkspace {...props} />;
}

function DeleteConfirmDialog({ target, busy, onCancel, onConfirm }: { target: DeleteTarget; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isProject = target.kind === "project";
  const itemName = isProject ? target.project.name : target.output.fileName;

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-[#0b0b0b] p-6 shadow-[0_30px_100px_rgba(0,0,0,.75)] sm:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />
      <div className="mb-5 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400"><Trash2 className="h-5 w-5" /></div>
        <div className="min-w-0 pt-0.5"><p className="text-[10px] font-black uppercase tracking-[.24em] text-red-400">Ação permanente</p><h2 id="delete-dialog-title" className="mt-1 text-xl font-black text-white">Excluir {isProject ? "projeto" : "resultado"}?</h2></div>
      </div>
      <p id="delete-dialog-description" className="text-sm leading-6 text-zinc-400">{isProject ? "O projeto, seus clipes e todos os resultados salvos neste dispositivo serão excluídos." : "Este vídeo será removido dos resultados salvos neste dispositivo."}</p>
      <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3"><p className="truncate text-xs font-bold text-zinc-200">{itemName}</p><p className="mt-1 text-[10px] text-zinc-600">Essa ação não poderá ser desfeita.</p></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <button ref={cancelRef} disabled={busy} onClick={onCancel} className="order-2 rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-xs font-bold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-400/70 disabled:opacity-50 sm:order-1">Manter {isProject ? "projeto" : "resultado"}</button>
        <button disabled={busy} onClick={onConfirm} className="order-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-wait disabled:opacity-60 sm:order-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{busy ? "Excluindo..." : "Excluir agora"}</button>
      </div>
    </div>
  </div>;
}

function OnboardingDialog({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const steps = [
    { number: "01", title: "Envie seus trechos", text: "Adicione até 6 Ganchos, 6 Corpos e 6 CTAs. Você pode começar apenas com um clipe de cada categoria.", icon: <Upload className="h-6 w-6" /> },
    { number: "02", title: "Escolha as combinações", text: "A mesa organiza até 150 combinações. Informe quantos vídeos deseja e use o botão de play para revisar cada sequência.", icon: <Layers3 className="h-6 w-6" /> },
    { number: "03", title: "Gere e exporte", text: "Revise o lote, gere localmente e baixe cada MP4 ou todos os resultados juntos em um único arquivo ZIP.", icon: <Download className="h-6 w-6" /> },
  ];
  const current = steps[step];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"><div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-amber-500/20 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 shadow-[0_35px_120px_rgba(0,0,0,.8)] sm:p-8"><div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" /><button onClick={onClose} aria-label="Fechar guia" className="absolute right-5 top-5 rounded-lg p-2 text-zinc-600 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button><div className="relative"><p className="text-[10px] font-black uppercase tracking-[.28em] text-amber-500">Comece por aqui</p><div className="mt-6 grid h-14 w-14 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400">{current.icon}</div><p className="mt-6 text-xs font-black text-amber-500">PASSO {current.number}</p><h2 id="onboarding-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">{current.title}</h2><p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">{current.text}</p><div className="mt-6 flex gap-2">{steps.map((item, index) => <button key={item.number} onClick={() => onStep(index)} aria-label={`Abrir passo ${index + 1}`} className={`h-1.5 flex-1 rounded-full transition ${index <= step ? "bg-amber-400" : "bg-zinc-800"}`} />)}</div><div className="mt-7 flex items-center justify-between gap-3"><button onClick={onClose} className="text-[10px] font-bold text-zinc-600 hover:text-zinc-300">Pular guia</button><div className="flex gap-2">{step > 0 && <button onClick={() => onStep(step - 1)} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold text-zinc-300">Voltar</button>}<button onClick={() => step < steps.length - 1 ? onStep(step + 1) : onClose()} className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-xs font-black text-zinc-950 hover:bg-amber-300">{step < steps.length - 1 ? "Próximo" : "Começar agora"}<ChevronRight className="h-4 w-4" /></button></div></div></div></div></div>;
}

function QuestionsSection() {
  return <section className="mb-10 rounded-[2rem] border border-zinc-800 bg-[#0a0a0a] p-5 sm:p-8"><div className="mb-7 max-w-2xl"><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">Central de ajuda</p><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">12 perguntas abertas</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Tudo o que você precisa saber antes de montar e exportar seus criativos.</p></div><div className="grid gap-3 lg:grid-cols-2">{CLIPSHOP_QUESTIONS.map((item, index) => <details key={item.question} className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 open:border-amber-500/25 open:bg-amber-500/[.035]"><summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 text-left marker:hidden sm:px-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-black/30 text-[9px] font-black text-amber-500 group-open:border-amber-500/20 group-open:bg-amber-500/10">{String(index + 1).padStart(2, "0")}</span><span className="flex-1 text-xs font-bold leading-5 text-zinc-200 group-hover:text-white">{item.question}</span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform duration-200 group-open:rotate-90 group-open:text-amber-400" /></summary><div className="border-t border-zinc-800/70 px-5 py-4 pl-16 text-xs leading-6 text-zinc-500">{item.answer}</div></details>)}</div></section>;
}

function ProjectMediaSettings({ project, onChange }: { project: ClipShopProject; onChange: (change: Partial<ClipShopProject>) => void }) {
  const preview = project.clips.find((clip) => clip.thumbnail)?.thumbnail;
  const modes = [
    { value: "cover", label: "Preencher e cortar" },
    { value: "contain", label: "Ajustar com bordas" },
    { value: "blur", label: "Fundo desfocado" },
    { value: "original", label: "Manter proporção" },
  ] as const;
  return <section className="mb-8 grid gap-5 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-5 lg:grid-cols-[1fr_220px] sm:p-6">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-500">Mídia do projeto</p>
      <h2 className="mt-2 text-xl font-black text-white">Enquadramento, variações e áudio</h2>
      <div className="mt-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vídeos fora de 9:16</p>
        <div className="flex flex-wrap gap-2">{modes.map((mode) => <button key={mode.value} onClick={() => onChange({ compositionMode: mode.value })} className={`rounded-xl border px-3 py-2 text-[10px] font-bold ${project.compositionMode === mode.value ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{mode.label}</button>)}</div>
      </div>
      <div className="mt-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Formato de saída</p><div className="flex flex-wrap gap-2">{(["9:16", "1:1", "16:9"] as const).map((format) => <button key={format} onClick={() => onChange({ outputAspectRatio: format })} className={`rounded-xl border px-4 py-2 text-[10px] font-black ${project.outputAspectRatio === format ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{format}{format === "9:16" ? " · TikTok" : format === "1:1" ? " · Feed" : " · Paisagem"}</button>)}</div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-bold text-zinc-500">Headline opcional<input maxLength={90} value={project.headlineText} onChange={(event) => onChange({ headlineText: event.target.value })} placeholder="Ex.: O segredo que ninguém conta" className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs text-white outline-none focus:border-amber-500/40" /></label><label className="text-[10px] font-bold text-zinc-500">Legenda opcional<input maxLength={140} value={project.captionText} onChange={(event) => onChange({ captionText: event.target.value })} placeholder="Ex.: Clique no carrinho para conferir" className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs text-white outline-none focus:border-amber-500/40" /></label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ToggleSetting label="Variações visuais" description="Zoom, posição, brilho e saturação exclusivos em cada versão." checked={project.visualVariationsEnabled} onChange={(checked) => onChange({ visualVariationsEnabled: checked })} />
        <ToggleSetting label="Metadados no MP4" description="Identificação da variação, combinação e versão do algoritmo." checked={project.mp4MetadataEnabled} onChange={(checked) => onChange({ mp4MetadataEnabled: checked })} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4"><label className="text-[10px] font-bold text-zinc-500">Política<select value={project.audioPolicy.mode} onChange={(event) => onChange({ audioPolicy: { ...project.audioPolicy, mode: event.target.value as ClipShopProject["audioPolicy"]["mode"] } })} className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"><option value="preserve">Preservar</option><option value="normalize">Normalizar</option><option value="mute">Sem áudio</option></select></label><NumberSetting label="Loudness alvo" value={project.audioPolicy.targetLoudnessDb} suffix="dB" min={-24} max={-8} onChange={(value) => onChange({ audioPolicy: { ...project.audioPolicy, targetLoudnessDb: value } })} /><NumberSetting label="Teto de pico" value={project.audioPolicy.peakDb} suffix="dB" min={-6} max={0} onChange={(value) => onChange({ audioPolicy: { ...project.audioPolicy, peakDb: value } })} /><NumberSetting label="Fade nas emendas" value={project.audioPolicy.fadeMs} suffix="ms" min={0} max={100} onChange={(value) => onChange({ audioPolicy: { ...project.audioPolicy, fadeMs: value } })} /></div>
      <p className="mt-3 text-[9px] leading-4 text-zinc-600">Normalizar cria AAC estéreo 48 kHz, adiciona silêncio onde faltar áudio, aproxima o nível ao alvo e limita picos para evitar clipping.</p>
    </div>
    <div className={`relative mx-auto w-36 overflow-hidden rounded-2xl border border-zinc-800 bg-black lg:w-full ${project.outputAspectRatio === "1:1" ? "aspect-square" : project.outputAspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"}`}>{preview ? <><img src={preview} alt="Prévia do enquadramento" className={`h-full w-full ${project.compositionMode === "cover" ? "object-cover" : "object-contain"}`} />{project.compositionMode === "blur" && <><img src={preview} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-60" /><img src={preview} alt="" className="absolute inset-0 h-full w-full object-contain" /></>}</> : <div className="grid h-full place-items-center px-4 text-center text-[9px] text-zinc-700">Adicione um clipe para visualizar</div>}{project.headlineText && <strong className="absolute left-2 right-2 top-[8%] text-center text-[9px] font-black uppercase text-amber-300 [text-shadow:0_1px_3px_#000]">{project.headlineText}</strong>}{project.captionText && <strong className="absolute bottom-[10%] left-2 right-2 text-center text-[8px] font-black text-white [text-shadow:0_1px_3px_#000]">{project.captionText}</strong>}<span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[8px] font-bold text-white">{project.outputAspectRatio}</span></div>
  </section>;
}

function ToggleSetting({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-amber-400/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/40"}`}><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-amber-400" : "bg-zinc-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span><span><b className={`block text-xs ${checked ? "text-amber-300" : "text-zinc-300"}`}>{label}</b><span className="mt-1 block text-[9px] leading-4 text-zinc-500">{description}</span></span></button>;
}

function NumberSetting({ label, value, suffix, min, max, onChange }: { label: string; value: number; suffix: string; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-[10px] font-bold text-zinc-500">{label}<div className="mt-1.5 flex rounded-xl border border-zinc-800 bg-zinc-900"><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} className="w-full bg-transparent px-3 py-2 text-xs text-white outline-none" /><span className="px-2 py-2 text-[9px] text-zinc-600">{suffix}</span></div></label>;
}

function WorkspaceControls({ project, compatibility, estimatedBytes, estimatedSeconds, onChange }: { project: ClipShopProject; compatibility: CompatibilityReport | null; estimatedBytes: number; estimatedSeconds: number; onChange: (change: Partial<ClipShopProject>) => void }) {
  const strategies = [
    { value: "balanced", title: "Balanceado", text: "Distribui Ganchos, Corpos e CTAs com a maior diversidade possível." },
    { value: "hooks", title: "Priorizar Ganchos", text: "Varia primeiro os Ganchos para testar aberturas diferentes." },
    { value: "bodies", title: "Priorizar Corpos", text: "Varia primeiro as demonstrações e benefícios do produto." },
    { value: "ctas", title: "Priorizar CTAs", text: "Varia primeiro as chamadas para ação e ofertas." },
  ] as const;
  return <section className="mb-8 grid gap-5 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-5 lg:grid-cols-2 sm:p-6"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-500">Estratégia de seleção</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{strategies.map((item) => <button key={item.value} title={item.text} onClick={() => onChange({ strategy: item.value })} className={`rounded-xl border p-3 text-left ${project.strategy === item.value ? "border-amber-400/40 bg-amber-500/10" : "border-zinc-800"}`}><b className="block text-xs text-white">{item.title}</b><span className="mt-1 block text-[9px] leading-4 text-zinc-500">{item.text}</span></button>)}</div></div><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-500">Perfil de qualidade</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => onChange({ quality: "performance" })} className={`rounded-xl border p-4 text-left ${project.quality === "performance" ? "border-amber-400/40 bg-amber-500/10" : "border-zinc-800"}`}><b className="block text-xs text-white">Performance</b><span className="mt-1 block text-[9px] text-zinc-500">720×1280 · 4 Mbps</span></button><button onClick={() => onChange({ quality: "quality" })} className={`rounded-xl border p-4 text-left ${project.quality === "quality" ? "border-amber-400/40 bg-amber-500/10" : "border-zinc-800"}`}><b className="block text-xs text-white">Qualidade</b><span className="mt-1 block text-[9px] text-zinc-500">1080×1920 · 8 Mbps</span></button></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Metric value={formatBytes(estimatedBytes)} label="Pico estimado" /><Metric value={`~${formatDuration(Math.max(estimatedSeconds, estimatedSeconds * (project.quality === "quality" ? 1.8 : 1)))}`} label="Tempo relativo" /><Metric value={compatibility?.webCodecs ? "Compatível" : "Limitado"} label="Dispositivo" /></div></div></section>;
}

function ClassificationDialog({ files, onChange, onCancel, onConfirm }: { files: Array<{ id: string; file: File; category: ClipCategory }>; onChange: React.Dispatch<React.SetStateAction<Array<{ id: string; file: File; category: ClipCategory }>>>; onCancel: () => void; onConfirm: () => void }) {
  const counts = (category: ClipCategory) => files.filter((item) => item.category === category).length;
  const excess = files.filter((item) => counts(item.category) > MAX_WORKSPACE_SLOTS).length;
  return <div className="fixed inset-0 z-[125] overflow-y-auto bg-black/85 p-4 backdrop-blur-md"><div className="mx-auto my-8 max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6"><div className="flex justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Classificar upload</p><h2 className="mt-1 text-xl font-black text-white">Defina Gancho, Corpo ou CTA</h2></div><button onClick={onCancel}><X className="h-5 w-5" /></button></div>{excess > 0 && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">Cada categoria aceita até {MAX_WORKSPACE_SLOTS} arquivos. Os excedentes aparecem destacados e não serão importados.</p>}<div className="mt-5 space-y-2">{files.map((item, index) => { const categoryIndex = files.filter((row, rowIndex) => row.category === item.category && rowIndex <= index).length; return <div key={item.id} className={`flex items-center gap-3 rounded-xl border p-3 ${categoryIndex > MAX_WORKSPACE_SLOTS ? "border-red-500/30 bg-red-500/5" : "border-zinc-800"}`}><FileVideo className="h-4 w-4 text-amber-400" /><span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{item.file.name}</span><select value={item.category} onChange={(event) => onChange((rows) => rows.map((row) => row.id === item.id ? { ...row, category: event.target.value as ClipCategory } : row))} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white"><option value="hook">Gancho</option><option value="body">Corpo</option><option value="cta">CTA</option></select></div>; })}</div><div className="mt-6 flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-zinc-700 py-3 text-xs font-bold text-zinc-300">Cancelar</button><button disabled={excess > 0} onClick={onConfirm} className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-black text-black disabled:opacity-40">Importar classificados</button></div></div></div>;
}

function StoragePanel({ projects, compatibility, onOpen }: { projects: ClipShopProject[]; compatibility: CompatibilityReport | null; onOpen: () => void }) {
  const sourceBytes = projects.reduce((sum, item) => sum + item.clips.reduce((clipSum, clip) => clipSum + clip.media.size, 0), 0);
  const usage = compatibility?.storageUsage ?? 0;
  const quota = compatibility?.storageQuota ?? 0;
  const percent = quota ? Math.min(100, Math.round(usage / quota * 100)) : 0;
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-400"><HardDrive className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-500">Armazenamento local</p><h2 className="mt-1 text-lg font-black text-white">{formatBytes(usage)} usados · {quota ? formatBytes(Math.max(0, quota - usage)) : "disponível não informado"}</h2><p className="mt-1 text-[10px] text-zinc-600">Fontes dos projetos: {formatBytes(sourceBytes)} · máximo {formatBytes(MAX_PROJECT_SOURCE_BYTES)} por projeto</p></div></div><button onClick={onOpen} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[10px] font-black text-amber-300">Abrir Central de armazenamento</button></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${percent >= 85 ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${percent}%` }} /></div>{projects.length > RECOMMENDED_LOCAL_PROJECTS && <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-300">Você possui {projects.length} projetos locais. Considere excluir projetos antigos para liberar espaço.</p>}</section>;
}

function StorageCenter({ projects, info, compatibility, onClose, onRefresh, onDeleteOld, onClearOutputs, onClearTemporary, onClearAll }: { projects: ClipShopProject[]; info: LocalProjectStorageInfo[]; compatibility: CompatibilityReport | null; onClose: () => void; onRefresh: () => Promise<void>; onDeleteOld: (id: string) => Promise<void>; onClearOutputs: (id: string) => Promise<void>; onClearTemporary: () => Promise<void>; onClearAll: () => Promise<void> }) {
  const usage = compatibility?.storageUsage ?? 0; const quota = compatibility?.storageQuota ?? 0;
  const [message, setMessage] = useState("");
  const persist = async () => { const granted = await navigator.storage?.persist?.(); setMessage(granted ? "Armazenamento persistente autorizado." : "O navegador não autorizou a persistência; verifique as permissões do site."); };
  return <div className="fixed inset-0 z-[130] overflow-y-auto bg-black/85 p-4 backdrop-blur-md"><div className="mx-auto my-6 max-w-4xl rounded-[2rem] border border-zinc-800 bg-zinc-950 p-5 sm:p-8"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-500">Central de armazenamento local</p><h2 className="mt-2 text-2xl font-black text-white">{formatBytes(usage)} utilizados</h2><p className="mt-1 text-sm text-zinc-500">{quota ? `${formatBytes(Math.max(0, quota - usage))} disponíveis de ${formatBytes(quota)}` : "O navegador não informou a cota disponível."}</p></div><button onClick={onClose}><X className="h-5 w-5" /></button></div>{message && <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300">{message}</p>}<div className="mt-6 space-y-3">{projects.map((project) => { const row = info.find((item) => item.projectId === project.id); return <div key={project.id} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 md:grid-cols-[1fr_auto]"><div><p className="font-bold text-white">{project.name}</p><p className="mt-1 text-[10px] text-zinc-500">Fontes: {formatBytes(row?.sourceBytes ?? 0)} · Resultados: {row?.outputCount ?? 0} ({formatBytes(row?.outputBytes ?? 0)}) · Total: {formatBytes((row?.sourceBytes ?? 0) + (row?.outputBytes ?? 0))}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => onDeleteOld(project.id)} className="rounded-lg border border-zinc-700 px-3 py-2 text-[9px] font-bold text-zinc-300">Excluir resultados +30 dias</button><button onClick={() => window.confirm(`Excluir todos os resultados de ${project.name}?`) && onClearOutputs(project.id)} className="rounded-lg border border-red-500/20 px-3 py-2 text-[9px] font-bold text-red-300">Excluir resultados</button></div></div>; })}</div><div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><button onClick={persist} className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-black">Solicitar persistência</button><button onClick={async () => { await onClearTemporary(); setMessage("Arquivos temporários e incompletos removidos."); }} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold text-white">Limpar temporários</button><button onClick={onRefresh} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold text-white">Atualizar medidas</button><button onClick={() => window.confirm("Excluir todos os projetos, clipes e resultados locais do Clip Shop?") && onClearAll()} className="rounded-xl border border-red-500/30 px-4 py-3 text-xs font-black text-red-300">Limpar tudo</button></div></div></div>;
}

function PlanCard({ plan, usage, onOpen }: { plan: ClipShopPlanDefinition; usage: ClipShopUsage | null; onOpen: () => void }) {
  const used = usage?.used ?? 0;
  const unlimited = isUnlimitedPlan(plan);
  const percent = unlimited ? 100 : Math.min(100, Math.round((used / plan.monthlyVideos) * 100));
  return <button onClick={onOpen} className="group w-full overflow-hidden rounded-[2rem] border border-amber-500/20 bg-gradient-to-br from-amber-500/[.09] via-zinc-950 to-black p-5 text-left transition hover:border-amber-400/40 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400"><Crown className="h-6 w-6" /></span><div><p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-500">Seu plano no Clip Shop</p><h2 className="mt-1 text-xl font-black text-white">Plano {plan.name}</h2><p className="mt-1 text-xs text-zinc-500">Clique para consultar limites e benefícios.</p></div></div><div className="min-w-52"><div className="flex items-end justify-between gap-4"><strong className="text-2xl font-black text-white">{unlimited ? "Ilimitado" : <>{used}<span className="text-sm text-zinc-600">/{plan.monthlyVideos}</span></>}</strong><span className="text-[9px] font-black uppercase tracking-wider text-amber-400">{unlimited ? `${used} vídeos gerados` : "vídeos usados"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} /></div></div><ChevronRight className="h-5 w-5 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-amber-400" /></div></button>;
}

function PlanModal({ currentPlan, usage, onClose, onUpgrade }: { currentPlan: ClipShopPlanKey; usage: ClipShopUsage | null; onClose: () => void; onUpgrade: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const plan = CLIP_SHOP_PLANS[currentPlan];
  const unlimited = isUnlimitedPlan(plan);
  return <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md" onMouseDown={onClose}><div role="dialog" aria-modal="true" aria-labelledby="clipshop-plan-title" className="my-5 w-full max-w-4xl rounded-[2rem] border border-amber-500/20 bg-zinc-950 p-5 shadow-[0_35px_120px_rgba(0,0,0,.8)] sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.3em] text-amber-500">Plano e consumo</p><h2 id="clipshop-plan-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">Seu Clip Shop é {plan.name}</h2><p className="mt-2 text-sm text-zinc-500">{unlimited ? `Plano ilimitado · ${usage?.used ?? 0} vídeos gerados neste período.` : `${usage?.used ?? 0} de ${plan.monthlyVideos} vídeos utilizados neste período.`}</p></div><button onClick={onClose} aria-label="Fechar planos" className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button></div>
    <div className="mt-7 grid gap-4 md:grid-cols-3">{Object.values(CLIP_SHOP_PLANS).map((item) => { const active = item.key === currentPlan; const itemUnlimited = isUnlimitedPlan(item); return <article key={item.key} className={`relative rounded-2xl border p-5 ${active ? "border-amber-400 bg-amber-500/[.07]" : "border-zinc-800 bg-zinc-900/40"}`}>{active && <span className="absolute right-4 top-4 rounded-md bg-amber-400 px-2 py-1 text-[8px] font-black uppercase text-black">Plano atual</span>}<h3 className="text-lg font-black text-white">{item.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-zinc-500">{item.description}</p><strong className="mt-5 block text-3xl font-black text-amber-400">{itemUnlimited ? "Ilimitado" : item.monthlyVideos.toLocaleString("pt-BR")}</strong><span className="text-[10px] uppercase tracking-wider text-zinc-600">{itemUnlimited ? "vídeos sem limite mensal" : "vídeos por mês"}</span><ul className="mt-5 space-y-2 text-xs text-zinc-300"><li className="flex gap-2"><Check className="h-4 w-4 text-amber-400" />Até {item.combinations} combinações</li><li className="flex gap-2"><Check className="h-4 w-4 text-amber-400" />Até {item.batchSize} por lote</li><li className="flex gap-2"><Check className="h-4 w-4 text-amber-400" />Navegação completa</li><li className="flex gap-2"><Check className="h-4 w-4 text-amber-400" />Prévia sem consumo</li></ul>{!active && item.key !== "free" && <button onClick={onUpgrade} className="mt-5 w-full rounded-xl bg-amber-400 py-3 text-xs font-black text-zinc-950 hover:bg-amber-300">Fazer upgrade</button>}</article>; })}</div>
    <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-xs leading-6 text-zinc-500"><strong className="text-zinc-300">Como funciona:</strong> somente vídeos concluídos entram no histórico. O Pro renova seu limite mensalmente; o Elite não possui limite mensal. Validação, prévia e processamento com erro não consomem.</div>
  </div></div>;
}

function Shell({ currentUser, onExit, onLogout, usage, children }: { currentUser: Props["currentUser"]; onExit: () => void; onLogout: () => void; usage?: ClipShopUsage | null; children: React.ReactNode }) {
  const openDashboard = () => { onExit(); window.location.hash = "#/dashboard"; };
  return <div className="min-h-screen bg-[#070707] text-zinc-200"><header className="sticky top-0 z-40 border-b border-zinc-900 bg-[#070707]/90 px-4 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3"><Logo size={31} /><div className="font-black text-white">UMBRA <span className="text-amber-400">CLIP SHOP</span></div><div className="ml-auto flex items-center gap-2"><span className="hidden rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-400 sm:block">{currentUser.plan || "Free"}</span>{usage && <span className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-400">{usage.limit < 0 ? "Vídeos ilimitados" : `${usage.remaining}/${usage.limit} vídeos`}</span>}<a href="#/dashboard" onClick={(event) => { event.preventDefault(); openDashboard(); }} title="Voltar ao Umbra Copy" className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-300 transition hover:border-amber-500/30 hover:text-amber-400"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Umbra Copy</span></a><button onClick={onLogout} title="Sair da conta" className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-red-400"><LogOut className="h-4 w-4" /></button></div></div></header><main className="px-4 sm:px-6">{children}</main></div>;
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="mb-6 rounded-3xl border border-zinc-850 bg-zinc-950/50 p-5 sm:p-6"><h2 className="text-lg font-black text-white">{title}</h2><p className="mb-5 mt-1 text-xs text-zinc-500">{subtitle}</p>{children}</section>; }
function Metric({ value, label }: { value: string; label: string }) { return <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"><b className="block text-lg text-amber-400">{value}</b><span className="text-[9px] uppercase text-zinc-600">{label}</span></div>; }
function ErrorBox({ text, onClose }: { text: string; onClose?: () => void }) { return <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{text}</span>{onClose && <button onClick={onClose}><X className="h-4 w-4" /></button>}</div>; }

function ClipColumnWithAudio(props: React.ComponentProps<typeof ClipColumn> & { onMute: (clip: ClipAsset) => void }) {
  const categoryClips = props.clips.filter((clip) => clip.category === props.category).sort((a, b) => a.slot - b.slot);
  const { onMute, ...columnProps } = props;
  return <div><ClipColumn {...columnProps} /><div className="mt-2 grid grid-cols-3 gap-2">{WORKSPACE_SLOTS.map((slot) => { const clip = categoryClips.find((item) => item.slot === slot); return <button key={slot} disabled={!clip} onClick={() => clip && onMute(clip)} className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-[8px] font-bold ${clip?.muted ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-zinc-800 text-zinc-600"} disabled:opacity-30`}>{clip?.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}{clip?.muted ? `Slot ${slot} mudo` : `Áudio ${slot}`}</button>; })}</div></div>;
}

function ClipColumn({ category, clips, busySlots, onFiles, onSlotFile, onRemove, onRename, onMove }: { category: ClipCategory; clips: ClipAsset[]; busySlots: string[]; onFiles: (files: File[]) => void; onSlotFile: (slot: number, file: File) => void; onRemove: (clip: ClipAsset) => void; onRename: (clip: ClipAsset, value: string) => void; onMove: (clip: ClipAsset, category: ClipCategory, slot: number) => void }) {
  const info = categoryInfo[category];
  return <div onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }} className="overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950 shadow-xl shadow-black/20"><div className="border-b border-zinc-800 p-5"><div className="flex items-start gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-black ${info.badge}`}>{info.number}</span><div className="min-w-0 flex-1"><h3 className="text-lg font-black text-white">{info.title}</h3><p className="mt-1 text-[10px] leading-4 text-zinc-500">{info.description} · solte arquivos aqui</p></div><label className="cursor-pointer rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[9px] font-bold text-zinc-500 transition hover:border-amber-500/30 hover:text-amber-400"><input type="file" multiple accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />Lote</label></div></div><div className="space-y-3 p-4">{WORKSPACE_SLOTS.map((slot) => { const clip = clips.find((item) => item.category === category && item.slot === slot); const busy = busySlots.includes(`${category}-${slot}`); return <div key={slot} className={`relative min-h-36 overflow-hidden rounded-2xl border border-dashed transition ${clip ? "border-amber-500/20 bg-amber-500/[.03]" : "border-zinc-700 bg-black/20 hover:border-amber-500/40 hover:bg-amber-500/[.03]"}`}>{busy ? <div className="grid min-h-36 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /></div> : clip ? <><div className="flex gap-3 p-3">{clip.thumbnail ? <img src={clip.thumbnail} alt="" className="h-20 w-14 rounded-xl bg-black object-cover" /> : <div className="grid h-20 w-14 place-items-center rounded-xl bg-zinc-900"><FileVideo className="h-5 w-5 text-zinc-600" /></div>}<div className="min-w-0 flex-1"><input value={clip.semanticName} onChange={(event) => onRename(clip, event.target.value)} className="w-full bg-transparent text-xs font-bold text-white outline-none focus:text-amber-300" /><p className="mt-1 truncate text-[9px] text-zinc-600">{clip.fileName}</p><p className="mt-2 text-[9px] text-zinc-500">{clip.media.duration.toFixed(1)}s · {clip.media.width}×{clip.media.height}</p><div className="mt-2 flex gap-1"><select value={clip.category} onChange={(event) => onMove(clip, event.target.value as ClipCategory, clip.slot)} className="min-w-0 rounded bg-zinc-900 px-1 py-1 text-[8px] text-zinc-400"><option value="hook">Gancho</option><option value="body">Corpo</option><option value="cta">CTA</option></select><select value={clip.slot} onChange={(event) => onMove(clip, clip.category, Number(event.target.value))} className="rounded bg-zinc-900 px-1 py-1 text-[8px] text-zinc-400">{WORKSPACE_SLOTS.map((value) => <option key={value} value={value}>Slot {value}</option>)}</select></div></div></div><div className="flex border-t border-zinc-800/70"><label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 text-[9px] font-bold text-zinc-500 hover:text-amber-400"><RefreshCw className="h-3 w-3" />Trocar<input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSlotFile(slot, file); event.target.value = ""; }} /></label><button onClick={() => onRemove(clip)} className="flex flex-1 items-center justify-center gap-1.5 border-l border-zinc-800/70 py-2 text-[9px] font-bold text-zinc-500 hover:text-red-400"><Trash2 className="h-3 w-3" />Remover</button></div>{clip.media.messages.length > 0 && <p title={clip.media.messages.join(" ")} className="truncate border-t border-zinc-900 px-3 py-2 text-[8px] text-amber-500">{clip.media.messages.join(" ")}</p>}</> : <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center p-3 text-center"><span className={`grid h-9 w-9 place-items-center rounded-full border border-amber-500/20 bg-amber-500/5 text-xl font-light ${info.color}`}>+</span><span className="mt-3 text-xs font-black text-zinc-300">{info.singular} {slot}</span><span className="mt-1 text-[8px] uppercase tracking-wider text-zinc-700">MP4 ou MOV · até 30s</span><input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSlotFile(slot, file); event.target.value = ""; }} /></label>}</div>; })}</div></div>;
}

function VariationCard({ number, hookSlot, bodySlot, ctaSlot, variation, selectionFull, onToggle, onPreview }: { number: number; hookSlot: number; bodySlot: number; ctaSlot: number; variation?: Variation; selectionFull: boolean; onToggle: () => void; onPreview: () => void }) {
  const enabled = Boolean(variation);
  const selected = variation?.selected ?? false;
  const diversity = getVariationDiversityLevel(hookSlot, bodySlot, ctaSlot);
  const diversityInfo = diversity === "original" ? { label: "Original", style: "bg-emerald-500/10 text-emerald-400" } : diversity === "light" ? { label: "Leve", style: "bg-amber-500/10 text-amber-400" } : { label: "Alta", style: "bg-violet-500/10 text-violet-400" };
  return <div className={`rounded-xl border p-3 transition ${selected ? "border-amber-400/50 bg-amber-400/[.07] shadow-lg shadow-amber-950/10" : enabled ? "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700" : "border-zinc-900 bg-black/20 opacity-40"}`}><div className="flex items-center gap-2"><button disabled={!enabled || (selectionFull && !selected)} onClick={onToggle} aria-label={`Selecionar variação ${number}`} className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${selected ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 bg-zinc-950"} disabled:cursor-not-allowed`}>{selected && <Check className="h-3 w-3" />}</button><span className="w-7 text-[9px] font-black text-zinc-600">{String(number).padStart(3, "0")}</span><div className="flex min-w-0 flex-1 items-center gap-1.5"><span className="rounded-md bg-amber-300/10 px-2 py-1 text-[9px] font-black text-amber-300">G{hookSlot}</span><span className="rounded-md bg-amber-400/10 px-2 py-1 text-[9px] font-black text-amber-400">C{bodySlot}</span><span className="rounded-md bg-amber-500/10 px-2 py-1 text-[9px] font-black text-amber-500">CTA{ctaSlot}</span></div><span className={`rounded-md px-2 py-1 text-[8px] font-black ${diversityInfo.style}`}>{diversityInfo.label}</span><button disabled={!enabled} onClick={onPreview} aria-label={`Visualizar variação ${number}`} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-amber-500/10 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-30"><Play className="h-3 w-3 fill-current" /></button></div>{variation && variation.status !== "idle" && <div className="mt-2"><div className="h-1 overflow-hidden rounded bg-zinc-800"><div className={`h-full ${variation.status === "error" ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${variation.progress}%` }} /></div><p className={`mt-1 truncate text-[8px] ${variation.status === "error" ? "text-red-400" : "text-zinc-600"}`}>{variation.error || variation.status}</p></div>}</div>;
}

function SequencePreview({ variation, clips, onClose }: { variation: Variation; clips: ClipAsset[]; onClose: () => void }) {
  const sequence = [variation.hookId, variation.bodyId, variation.ctaId].map((id) => clips.find((clip) => clip.id === id)).filter(Boolean) as ClipAsset[];
  const [index, setIndex] = useState(0);
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={onClose}><div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-5" onMouseDown={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase text-amber-400">Preview lógico</p><h3 className="font-bold text-white">Variação {variation.number}</h3></div><button onClick={onClose}><X className="h-5 w-5 text-zinc-500" /></button></div>{sequence[index] && <video key={sequence[index].id} src={sequence[index].objectUrl} autoPlay controls onEnded={() => index < sequence.length - 1 ? setIndex(index + 1) : setIndex(0)} className="aspect-[9/16] max-h-[65vh] w-full rounded-2xl bg-black object-contain" />}<div className="mt-3 flex justify-center gap-2">{sequence.map((clip, itemIndex) => <button key={clip.id} onClick={() => setIndex(itemIndex)} className={`rounded-full px-3 py-1 text-[9px] font-bold ${index === itemIndex ? "bg-amber-400 text-black" : "bg-zinc-800 text-zinc-400"}`}>{clip.semanticName}</button>)}</div></div></div>;
}

function ReviewModal({ project, compatibility, selected, totalDuration, estimatedBytes, usage, testOutputUrl, testBusy, onTest, onClose, onConfirm, onUpgrade }: { project: ClipShopProject; compatibility: CompatibilityReport | null; selected: Variation[]; totalDuration: number; estimatedBytes: number; usage: ClipShopUsage | null; testOutputUrl: string; testBusy: boolean; onTest: () => void; onClose: () => void; onConfirm: () => void; onUpgrade: () => void }) {
  const available = compatibility?.storageQuota === undefined ? undefined : compatibility.storageQuota - (compatibility.storageUsage ?? 0);
  const filesAccessible = selected.every((variation) => [variation.hookId, variation.bodyId, variation.ctaId].every((id) => Boolean(project.clips.find((clip) => clip.id === id)?.file?.size)));
  const storageOk = hasStorageFor(available, estimatedBytes);
  const balanceAfter = usage && usage.limit >= 0 ? usage.remaining - selected.length : null;
  const blocked = Boolean((usage && usage.limit >= 0 && usage.remaining < selected.length) || !filesAccessible || !storageOk || compatibility?.supported === false);
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={onClose}><div className="my-4 w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Revisão completa do lote</p><h3 className="mt-1 text-xl font-black text-white">Tudo pronto para gerar?</h3></div><button onClick={onClose}><X className="h-5 w-5 text-zinc-500" /></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric value={String(selected.length)} label="Variações" /><Metric value={formatDuration(totalDuration)} label="Duração total" /><Metric value={formatBytes(estimatedBytes)} label="Pico de espaço" /><Metric value={`~${formatDuration(totalDuration * (project.quality === "quality" ? 1.8 : 1))}`} label="Tempo estimado" /></div><div className="mt-4 grid gap-2 text-[10px] sm:grid-cols-2"><ReviewCheck ok={filesAccessible} text="Arquivos locais ainda acessíveis" /><ReviewCheck ok={storageOk} text={`Espaço disponível: ${available === undefined ? "não informado" : formatBytes(available)}`} /><ReviewCheck ok={compatibility?.supported !== false} text={`Dispositivo: ${compatibility?.webCodecs ? "WebCodecs disponível" : "modo compatibilidade"}`} /><ReviewCheck ok={balanceAfter === null || balanceAfter >= 0} text={`Saldo após o lote: ${balanceAfter ?? "não informado"}`} /><ReviewCheck ok text={`Qualidade: ${project.quality === "quality" ? "1080×1920" : "720×1280"}`} /><ReviewCheck ok text={`Composição: ${project.compositionMode}`} /><ReviewCheck ok text={`Áudio: ${project.audioPolicy.mode} · alvo ${project.audioPolicy.targetLoudnessDb} dB`} /><ReviewCheck ok text="Concorrência: 1 vídeo por vez" /></div><details className="mt-4 rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-xs font-bold text-zinc-300">Combinações que serão processadas ({selected.length})</summary><div className="mt-3 grid gap-1 sm:grid-cols-2">{selected.map((variation) => <span key={variation.id} className="rounded-lg bg-zinc-900 px-3 py-2 text-[9px] text-zinc-500">#{variation.number} · {variation.id}</span>)}</div></details><div className="mt-4 rounded-xl border border-zinc-800 p-3">{testOutputUrl ? <video src={testOutputUrl} controls className="mx-auto max-h-64 rounded-lg bg-black" /> : <p className="py-4 text-center text-[10px] text-zinc-600">Gere uma prévia renderizada para validar imagem, áudio e emendas.</p>}<button disabled={testBusy} onClick={onTest} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2.5 text-[10px] font-bold text-zinc-300 disabled:opacity-50">{testBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{testOutputUrl ? "Gerar teste novamente" : "Gerar vídeo de teste"}</button></div>{blocked ? <div className="mt-5 grid gap-2"><p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-300">Corrija os itens marcados antes de gerar.</p>{usage && usage.remaining < selected.length && <button onClick={onUpgrade} className="rounded-xl bg-amber-400 py-3 text-xs font-black text-zinc-950">Fazer upgrade</button>}</div> : <div className="mt-5 flex gap-2"><button onClick={onClose} className="flex-1 rounded-xl border border-zinc-800 py-3 text-xs font-bold text-zinc-400">Voltar e revisar</button><button onClick={onConfirm} className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-black text-zinc-950">Confirmar lote</button></div>}</div></div>;
}

function ReviewCheck({ ok, text }: { ok: boolean; text: string }) { return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ok ? "border-amber-500/15 bg-amber-500/5 text-zinc-400" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>{ok ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <AlertTriangle className="h-3.5 w-3.5" />}{text}</div>; }

function buildVariationDesk(clips: ClipAsset[], variations: Variation[]) {
  const byId = new Map(clips.filter((clip) => clip.slot <= MAX_WORKSPACE_SLOTS && clip.status !== "error").map((clip) => [clip.id, clip]));
  return variations.map((variation) => ({
    number: variation.number,
    hookSlot: byId.get(variation.hookId)?.slot ?? 0,
    bodySlot: byId.get(variation.bodyId)?.slot ?? 0,
    ctaSlot: byId.get(variation.ctaId)?.slot ?? 0,
    variation,
  }));
}

function countPossibleCombinations(clips: ClipAsset[]) {
  const count = (category: ClipCategory) => clips.filter((clip) => clip.category === category && clip.status !== "error").length;
  return count("hook") * count("body") * count("cta");
}

function formatBytes(value: number) { if (!value) return "0 MB"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`; }
function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`; }
function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function downloadText(text: string, fileName: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function revokeWorkspaceObjectUrls(project: ClipShopProject | null, outputs: RenderOutput[], testOutputUrl: string) {
  const urls = new Set([
    ...(project?.clips.map((clip) => clip.objectUrl) ?? []),
    ...outputs.map((output) => output.objectUrl),
    ...outputs.map((output) => output.audioObjectUrl ?? ""),
    testOutputUrl,
  ].filter(Boolean));
  urls.forEach((url) => URL.revokeObjectURL(url));
}
