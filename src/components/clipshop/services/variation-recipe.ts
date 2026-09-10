import type { Variation, VariationRecipe } from "../types";

export type VariationDiversityLevel = "original" | "light" | "high";
export type VariationDifferentiationLevel = "high" | "medium" | "low";

/** Produz até 150 receitas visuais estáveis, conservadoras e com assinaturas exclusivas. */
export function buildVariationRecipe(number: number): VariationRecipe {
  const index = Math.max(0, Math.floor(number) - 1) % 150;
  return {
    version: 2,
    zoom: 1 + (index % 11) * 0.0045,
    offsetX: (((index * 7) % 11) - 5) * 0.003,
    offsetY: (((index * 13) % 5) - 2) * 0.003,
    brightness: 0.98 + ((index * 3) % 9) * 0.005,
    saturation: 1 + ((index * 5) % 11) * 0.007,
    textPositionVariant: index % 3,
    transitionMs: (index % 4) * 40,
    trimStartMs: (index % 3) * 20,
    trimEndMs: ((index * 2) % 3) * 20,
  };
}

export function variationRecipeSignature(recipe: VariationRecipe) {
  return `VR${recipe.version}-Z${recipe.zoom.toFixed(4)}-X${recipe.offsetX.toFixed(3)}-Y${recipe.offsetY.toFixed(3)}-B${recipe.brightness.toFixed(3)}-S${recipe.saturation.toFixed(3)}-T${recipe.textPositionVariant ?? 0}-F${recipe.transitionMs ?? 0}-I${recipe.trimStartMs ?? 0}-O${recipe.trimEndMs ?? 0}`;
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

  const repeatsEntireCombination = comparisons.some((item) => item.hookId === variation.hookId && item.bodyId === variation.bodyId && item.ctaId === variation.ctaId);
  if (repeatsEntireCombination && repeatsVisualTreatment) return "low";
  if (mostSharedParts > 0 || repeatsVisualTreatment) return "medium";
  return "high";
}
