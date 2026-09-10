import { CLIP_SHOP_PLANS, getClipShopPlan, normalizeClipShopPlan } from "./plans";

test("defines the monthly video limits for every Clip Shop plan", () => {
  expect(CLIP_SHOP_PLANS.free.monthlyVideos).toBe(3);
  expect(CLIP_SHOP_PLANS.pro.monthlyVideos).toBe(1000);
  expect(CLIP_SHOP_PLANS.elite.monthlyVideos).toBe(-1);
});

test("allows Elite to generate all 150 combinations in one batch", () => {
  expect(CLIP_SHOP_PLANS.elite.combinations).toBe(150);
  expect(CLIP_SHOP_PLANS.elite.batchSize).toBe(150);
});

test("normalizes trial and admin access to paid Clip Shop tiers", () => {
  expect(normalizeClipShopPlan("trial")).toBe("pro");
  expect(normalizeClipShopPlan(" Pro ")).toBe("pro");
  expect(normalizeClipShopPlan("ELITE")).toBe("elite");
  expect(normalizeClipShopPlan("free", true)).toBe("elite");
  expect(getClipShopPlan("unknown").key).toBe("free");
});
