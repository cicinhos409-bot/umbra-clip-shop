import { clipShopProjectId, clipShopRoutes } from "./routes";

test("builds Clip Shop routes", () => {
  expect(clipShopRoutes.home()).toBe("#/clipshop");
  expect(clipShopRoutes.audioShuffle()).toBe("#/clipshop/audio-shuffle");
  expect(clipShopRoutes.project("abc 123")).toBe("#/clipshop/abc%20123");
});

test("parses project sub-routes", () => {
  expect(clipShopProjectId("#/clipshop/abc%20123")).toBe("abc 123");
  expect(clipShopProjectId("#/clipshop/audio-shuffle")).toBeNull();
  expect(clipShopProjectId("#/dashboard")).toBeNull();
});
