import { supabase } from "../../lib/supabase";
import type { ClipShopUsage } from "./types";
import { getClipShopPlan } from "./plans";

const NETWORK_RETRY_DELAYS = [0, 500, 1500] as const;

async function withNetworkRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delay of NETWORK_RETRY_DELAYS) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      return await operation();
    } catch (cause) {
      lastError = cause;
      const message = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause || "");
      if (!/network|failed to fetch|load failed|timeout/i.test(message)) throw cause;
    }
  }
  throw lastError;
}

export async function getClipShopUsage(plan: string): Promise<ClipShopUsage> {
  const definition = getClipShopPlan(plan);
  const { data } = await withNetworkRetry(async () => {
    const result = await supabase.rpc("get_clip_shop_usage");
    if (result.error) throw result.error;
    return result;
  });
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
  const { data } = await withNetworkRetry(async () => {
    const result = await supabase.rpc("reserve_clip_shop_generation", { p_request_id: requestId, p_requested_count: requestedCount });
    if (result.error) throw result.error;
    return result;
  });
  return String(data);
}

export async function startGeneration(reservationId: string) {
  await withNetworkRetry(async () => {
    const result = await supabase.rpc("start_clip_shop_generation", { p_reservation_id: reservationId });
    if (result.error) throw result.error;
    return result;
  });
}

export async function finishGeneration(reservationId: string, resultCount: number) {
  await withNetworkRetry(async () => {
    const result = await supabase.rpc("finish_clip_shop_generation", { p_reservation_id: reservationId, p_result_count: resultCount });
    if (result.error) throw result.error;
    return result;
  });
}

export async function releaseGeneration(reservationId: string, reason: string) {
  await withNetworkRetry(async () => {
    const result = await supabase.rpc("release_clip_shop_generation", { p_reservation_id: reservationId, p_reason: reason });
    if (result.error) throw result.error;
    return result;
  });
}
