import { buildVariationRecipe, variationRecipeSignature } from "./services/variation-recipe";

test("creates 27 unique and stable visual recipes", () => {
  const first = Array.from({ length: 27 }, (_, index) => buildVariationRecipe(index + 1));
  const second = Array.from({ length: 27 }, (_, index) => buildVariationRecipe(index + 1));
  expect(second).toEqual(first);
  expect(new Set(first.map(variationRecipeSignature))).toHaveLength(27);
});

test("keeps transformations inside conservative limits", () => {
  for (let number = 1; number <= 27; number += 1) {
    const recipe = buildVariationRecipe(number);
    expect(recipe.zoom).toBeGreaterThanOrEqual(1);
    expect(recipe.zoom).toBeLessThanOrEqual(1.05);
    expect(Math.abs(recipe.offsetX)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(recipe.offsetY)).toBeLessThanOrEqual(0.006);
    expect(recipe.brightness).toBeGreaterThanOrEqual(0.98);
    expect(recipe.brightness).toBeLessThanOrEqual(1.02);
  }
});

