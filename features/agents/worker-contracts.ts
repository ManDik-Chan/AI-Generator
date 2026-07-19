import { z } from "zod";

const deliverableItem = z.string().trim().min(1).max(1_000);

export const workerDeliverableSchema = z.object({
  workSummary: z.string().trim().min(1).max(1_200),
  findings: z.array(deliverableItem).max(8),
  assumptions: z.array(deliverableItem).max(8),
  risks: z.array(deliverableItem).max(8),
  recommendations: z.array(deliverableItem).max(8),
  finalDeliverable: z.string().trim().min(1).max(40_000),
}).strict();

export type WorkerDeliverable = z.infer<typeof workerDeliverableSchema>;

export interface ParsedWorkerDeliverable extends WorkerDeliverable {
  structured: boolean;
}

export interface WorkerContextEnvelope {
  userProblem: string;
  planOverview: string;
  assignment: {
    key: string;
    title: string;
    objective: string;
    expectedDeliverable: string;
    priority: string;
  };
  dependencyDeliverables: Array<{
    workerKey: string;
    summary: string;
    result: string;
  }>;
  conversationSummary?: string;
  personaSummary?: string;
  memorySummary?: string;
}
