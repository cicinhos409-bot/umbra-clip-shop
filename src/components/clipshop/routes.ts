export const clipShopRoutes = {
  home: () => "#/clipshop",
  audioShuffle: () => "#/clipshop/audio-shuffle",
  project: (id: string) => `#/clipshop/${encodeURIComponent(id)}`,
};

export function isClipShopAudioShuffleRoute(hash = window.location.hash) {
  return hash.replace(/\?.*$/, "").toLowerCase() === "#/clipshop/audio-shuffle";
}

export function clipShopProjectId(hash = window.location.hash) {
  const slug = hash.replace(/^#\/?/, "").split("?")[0];
  if (!slug.toLowerCase().startsWith("clipshop/")) return null;
  if (slug.toLowerCase() === "clipshop/audio-shuffle") return null;
  return decodeURIComponent(slug.slice("clipshop/".length)) || null;
}
