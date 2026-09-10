import type { QueueSnapshot } from "../types";
import { pendingQueueVariationIds, reconcileQueueWithOutputs } from "./queue";

const queue: QueueSnapshot = { projectId: "p", requestId: "r", reservationId: "x", targetVariationIds: ["v1", "v2", "v3"], completedVariationIds: ["v1"], failedVariationIds: ["v3"], status: "running", createdAt: "2026-01-01", updatedAt: "2026-01-01" };

describe("recuperação da fila", () => {
  it("continua somente itens não concluídos e sem erro", () => expect(pendingQueueVariationIds(queue)).toEqual(["v2"]));
  it("reconcilia outputs salvos antes de oferecer continuação", () => {
    const restored = reconcileQueueWithOutputs(queue, ["v2"]);
    expect(restored.completedVariationIds).toEqual(["v1", "v2"]);
    expect(pendingQueueVariationIds(restored)).toEqual([]);
  });
});
