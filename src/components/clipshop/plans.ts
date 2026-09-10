export type ClipShopPlanKey = "free" | "pro" | "elite";

export interface ClipShopPlanDefinition {
  key: ClipShopPlanKey;
  name: string;
  monthlyVideos: number;
  combinations: number;
  batchSize: number;
  description: string;
}

export const CLIP_SHOP_PLANS: Record<ClipShopPlanKey, ClipShopPlanDefinition> = {
  free: { key: "free", name: "Free", monthlyVideos: 3, combinations: 3, batchSize: 1, description: "Para conhecer o fluxo completo do Clip Shop." },
  pro: { key: "pro", name: "Pro", monthlyVideos: 1000, combinations: 27, batchSize: 5, description: "Para afiliados que publicam criativos toda semana." },
  elite: { key: "elite", name: "Elite", monthlyVideos: -1, combinations: 27, batchSize: 27, description: "Para operações que precisam produzir sem limite mensal." },
};

export function isUnlimitedPlan(plan: ClipShopPlanDefinition) {
  return plan.monthlyVideos < 0;
}

export function normalizeClipShopPlan(plan?: string, isAdmin = false): ClipShopPlanKey {
  if (isAdmin || plan === "admin" || plan === "elite") return "elite";
  if (plan === "pro" || plan === "trial") return "pro";
  return "free";
}

export function getClipShopPlan(plan?: string, isAdmin = false) {
  return CLIP_SHOP_PLANS[normalizeClipShopPlan(plan, isAdmin)];
}
