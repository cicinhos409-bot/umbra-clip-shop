import { buildVariationRecipe, getVariationDifferentiationLevel, variationRecipeSignature } from "./services/variation-recipe";
import type { Variation } from "./types";

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

test("classifies differentiation against selected combinations", () => {
  const variation = { id: "base", hookId: "h1", bodyId: "b1", ctaId: "c1" } as Variation;
  const different = { id: "different", hookId: "h2", bodyId: "b2", ctaId: "c2" } as Variation;
  const oneShared = { id: "one", hookId: "h1", bodyId: "b2", ctaId: "c2" } as Variation;
  const twoShared = { id: "two", hookId: "h1", bodyId: "b1", ctaId: "c2" } as Variation;
  const recipe = buildVariationRecipe(1);
  const sameTreatment = { ...different, id: "visual", recipe };

  expect(getVariationDifferentiationLevel(variation, [variation])).toBe("high");
  expect(getVariationDifferentiationLevel(variation, [different])).toBe("high");
  expect(getVariationDifferentiationLevel(variation, [oneShared])).toBe("medium");
  expect(getVariationDifferentiationLevel(variation, [twoShared])).toBe("low");
  expect(getVariationDifferentiationLevel({ ...variation, recipe }, [sameTreatment])).toBe("medium");
});
