import type { ClipAsset, Variation } from "../types";

export function sanitizeFilePart(value: string, fallback = "clip") {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  return (normalized || fallback).slice(0, 80);
}

export function variationFileName(projectName: string, variation: Variation, clips: ClipAsset[], pattern = "{project}-{variationId}") {
  const find = (id: string) => clips.find((clip) => clip.id === id)?.semanticName || id;
  const values: Record<string, string> = {
    project: projectName,
    variationId: variation.id,
    gancho: find(variation.hookId),
    corpo: find(variation.bodyId),
    cta: find(variation.ctaId),
  };
  const base = pattern.replace(/\{(project|variationId|gancho|corpo|cta)\}/g, (_, key: string) => values[key]);
  return `${sanitizeFilePart(base, variation.id)}.mp4`;
}

export function uniqueFileName(fileName: string, usedNames: Set<string>) {
  if (!usedNames.has(fileName)) { usedNames.add(fileName); return fileName; }
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  let suffix = 2;
  while (usedNames.has(`${base}-${suffix}${extension}`)) suffix += 1;
  const unique = `${base}-${suffix}${extension}`;
  usedNames.add(unique);
  return unique;
}

export function buildManifest(projectName: string, variations: Variation[], clips: ClipAsset[], pattern = "{project}-{variationId}", outputNames: Record<string, string> = {}) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const find = (id: string) => clips.find((clip) => clip.id === id)?.semanticName || id;
  const rows = variations.map((variation) => [
    variation.id,
    outputNames[variation.id] || variationFileName(projectName, variation, clips, pattern),
    find(variation.hookId), find(variation.bodyId), find(variation.ctaId),
  ].map(escape).join(","));
  return ["variation_id,arquivo,gancho,corpo,cta", ...rows].join("\n");
}
