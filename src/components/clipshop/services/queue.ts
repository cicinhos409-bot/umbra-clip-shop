import type { QueueSnapshot } from "../types";

export function pendingQueueVariationIds(snapshot: QueueSnapshot) {
  return snapshot.targetVariationIds.filter((id) => !snapshot.completedVariationIds.includes(id) && !snapshot.failedVariationIds.includes(id));
}

export function reconcileQueueWithOutputs(snapshot: QueueSnapshot, outputVariationIds: string[]): QueueSnapshot {
  const completed = new Set([...snapshot.completedVariationIds, ...outputVariationIds.filter((id) => snapshot.targetVariationIds.includes(id))]);
  return { ...snapshot, completedVariationIds: [...completed], failedVariationIds: snapshot.failedVariationIds.filter((id) => !completed.has(id)), status: "interrupted", updatedAt: new Date().toISOString() };
}
