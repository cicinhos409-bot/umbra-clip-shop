import type { Variation, VariationRecipe } from "../types";

export type VariationDiversityLevel = "original" | "light" | "high";
export type VariationDifferentiationLevel = "high" | "medium" | "low";

const ZOOM_LEVELS = [1, 1.025, 1.05] as const;
const X_OFFSETS = [-0.015, 0, 0.015] as const;
const LOOKS = [
  { brightness: 0.98, saturation: 1.04 },
  { brightness: 1, saturation: 1 },
  { brightness: 1.02, saturation: 1.07 },
] as const;

/** Produz uma das 27 receitas visuais, estável para o número da variação. */
export function buildVariationRecipe(number: number): VariationRecipe {
  const index = Math.max(0, Math.floor(number) - 1) % 27;
  const look = LOOKS[Math.floor(index / 9) % LOOKS.length];
  return {
    version: 1,
    zoom: ZOOM_LEVELS[index % ZOOM_LEVELS.length],
    offsetX: X_OFFSETS[Math.floor(index / 3) % X_OFFSETS.length],
    offsetY: ((index * 7) % 3 - 1) * 0.006,
    brightness: look.brightness,
    saturation: look.saturation,
  };
}

export function variationRecipeSignature(recipe: VariationRecipe) {
  return `VR${recipe.version}-Z${recipe.zoom.toFixed(3)}-X${recipe.offsetX.toFixed(3)}-Y${recipe.offsetY.toFixed(3)}-B${recipe.brightness.toFixed(2)}-S${recipe.saturation.toFixed(2)}`;
}

export function getVariationDiversityLevel(hookSlot: number, bodySlot: number, ctaSlot: number): VariationDiversityLevel {
  const distinctSources = new Set([hookSlot, bodySlot, ctaSlot]).size;
  return distinctSources === 1 ? "original" : distinctSources === 2 ? "light" : "high";
}

/** Compara uma combinação com as demais selecionadas e informa quanto ela se diferencia. */
export function getVariationDifferentiationLevel(variation: Variation, selected: Variation[]): VariationDifferentiationLevel {
  const comparisons = selected.filter((item) => item.id !== variation.id);
  if (!comparisons.length) return "high";

  const mostSharedParts = comparisons.reduce((highest, item) => {
    const sharedParts = Number(item.hookId === variation.hookId)
      + Number(item.bodyId === variation.bodyId)
      + Number(item.ctaId === variation.ctaId);
    return Math.max(highest, sharedParts);
  }, 0);
  const repeatsVisualTreatment = Boolean(variation.recipe && comparisons.some((item) =>
    item.recipe && variationRecipeSignature(item.recipe) === variationRecipeSignature(variation.recipe!),
  ));

  if (mostSharedParts >= 2) return "low";
  if (mostSharedParts === 1 || repeatsVisualTreatment) return "medium";
  return "high";
}
