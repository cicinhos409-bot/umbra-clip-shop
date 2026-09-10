import type { ClipAsset, ClipCategory, Variation, VariationStrategy } from "../types";
import { buildVariationRecipe } from "./variation-recipe";

export const CLIPSHOP_ALGORITHM_VERSION = 2;
export const MAX_SUGGESTED_VARIATIONS = 150;

type Trio = { hookId: string; bodyId: string; ctaId: string };

function bySlot(a: ClipAsset, b: ClipAsset) {
  return a.slot - b.slot || a.id.localeCompare(b.id);
}

function group(clips: ClipAsset[], category: ClipCategory) {
  return clips.filter((clip) => clip.category === category && (clip.status === "ready" || clip.status === "warning")).sort(bySlot);
}

function allTrios(clips: ClipAsset[]): Trio[] {
  const hooks = group(clips, "hook");
  const bodies = group(clips, "body");
  const ctas = group(clips, "cta");
  const result: Trio[] = [];
  for (const hook of hooks) for (const body of bodies) for (const cta of ctas) {
    result.push({ hookId: hook.id, bodyId: body.id, ctaId: cta.id });
  }
  return result;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function scoreTrio(
  trio: Trio,
  usage: { hook: Map<string, number>; body: Map<string, number>; cta: Map<string, number>; hb: Map<string, number>; hc: Map<string, number>; bc: Map<string, number> },
  strategy: VariationStrategy,
) {
  const h = usage.hook.get(trio.hookId) ?? 0;
  const b = usage.body.get(trio.bodyId) ?? 0;
  const c = usage.cta.get(trio.ctaId) ?? 0;
  const hb = usage.hb.get(`${trio.hookId}|${trio.bodyId}`) ?? 0;
  const hc = usage.hc.get(`${trio.hookId}|${trio.ctaId}`) ?? 0;
  const bc = usage.bc.get(`${trio.bodyId}|${trio.ctaId}`) ?? 0;
  const categoryWeight = strategy === "hooks" ? h * 0.35 + b * 1.5 + c * 1.5
    : strategy === "bodies" ? h * 1.5 + b * 0.35 + c * 1.5
      : strategy === "ctas" ? h * 1.5 + b * 1.5 + c * 0.35
        : h + b + c;
  return categoryWeight * 10 + (hb + hc + bc) * 18 + Math.max(hb, hc, bc) * 30;
}

export function createVariationId(trio: Trio) {
  const token = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "UNKNOWN";
  return `CS-V${CLIPSHOP_ALGORITHM_VERSION}-G${token(trio.hookId)}-C${token(trio.bodyId)}-T${token(trio.ctaId)}`;
}

export function generateVariations(clips: ClipAsset[], strategy: VariationStrategy = "balanced", limit = MAX_SUGGESTED_VARIATIONS): Variation[] {
  const candidates = allTrios(clips);
  if (!candidates.length) return [];
  if (candidates.length <= limit) {
    return candidates.map((trio, index) => ({
      id: createVariationId(trio), algorithmVersion: CLIPSHOP_ALGORITHM_VERSION, number: index + 1,
      ...trio, selected: false, status: "idle", progress: 0, recipe: buildVariationRecipe(index + 1),
    }));
  }
  const usage = {
    hook: new Map<string, number>(), body: new Map<string, number>(), cta: new Map<string, number>(),
    hb: new Map<string, number>(), hc: new Map<string, number>(), bc: new Map<string, number>(),
  };
  const selected: Trio[] = [];
  const remaining = [...candidates];
  while (remaining.length && selected.length < Math.min(limit, candidates.length)) {
    remaining.sort((a, b) => scoreTrio(a, usage, strategy) - scoreTrio(b, usage, strategy)
      || a.hookId.localeCompare(b.hookId) || a.bodyId.localeCompare(b.bodyId) || a.ctaId.localeCompare(b.ctaId));
    const next = remaining.shift()!;
    selected.push(next);
    increment(usage.hook, next.hookId); increment(usage.body, next.bodyId); increment(usage.cta, next.ctaId);
    increment(usage.hb, `${next.hookId}|${next.bodyId}`);
    increment(usage.hc, `${next.hookId}|${next.ctaId}`);
    increment(usage.bc, `${next.bodyId}|${next.ctaId}`);
  }
  return selected.map((trio, index) => ({
    id: createVariationId(trio), algorithmVersion: CLIPSHOP_ALGORITHM_VERSION, number: index + 1,
    ...trio, selected: false, status: "idle", progress: 0, recipe: buildVariationRecipe(index + 1),
  }));
}

export function hasMinimumClips(clips: ClipAsset[]) {
  return (["hook", "body", "cta"] as const).every((category) => group(clips, category).length > 0);
}
