import { supabase } from "../../lib/supabase";
import type { ClipShopUsage } from "./types";
import { getClipShopPlan } from "./plans";

export async function getClipShopUsage(plan: string): Promise<ClipShopUsage> {
  const definition = getClipShopPlan(plan);
  const { data, error } = await supabase.rpc("get_clip_shop_usage");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const used = Number(row?.used ?? 0);
  const reserved = Number(row?.reserved ?? 0);
  const remoteLimit = Number(row?.limit_total ?? -1);
  const remoteIsUnlimited = String(row?.plan ?? definition.key) === "elite" || String(row?.plan) === "admin";
  const limit = remoteIsUnlimited ? -1 : remoteLimit >= 0 ? remoteLimit : definition.monthlyVideos;
  const remaining = limit < 0 ? Number.POSITIVE_INFINITY : remoteLimit >= 0 ? Number(row?.remaining ?? Math.max(0, limit - used - reserved)) : Math.max(0, limit - used - reserved);
  return { limit, used, reserved, remaining, plan: String(row?.plan ?? definition.key) };
}

export async function reserveGeneration(requestId: string, requestedCount: number) {
  const { data, error } = await supabase.rpc("reserve_clip_shop_generation", { p_request_id: requestId, p_requested_count: requestedCount });
  if (error) throw error;
  return String(data);
}

export async function startGeneration(reservationId: string) {
  const { error } = await supabase.rpc("start_clip_shop_generation", { p_reservation_id: reservationId });
  if (error) throw error;
}

export async function finishGeneration(reservationId: string, resultCount: number) {
  const { error } = await supabase.rpc("finish_clip_shop_generation", { p_reservation_id: reservationId, p_result_count: resultCount });
  if (error) throw error;
}

export async function releaseGeneration(reservationId: string, reason: string) {
  const { error } = await supabase.rpc("release_clip_shop_generation", { p_reservation_id: reservationId, p_reason: reason });
  if (error) throw error;
}
