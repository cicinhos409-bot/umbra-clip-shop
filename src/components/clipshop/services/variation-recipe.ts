import type { VariationRecipe } from "../types";

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

