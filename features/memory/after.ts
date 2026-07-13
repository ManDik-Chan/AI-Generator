export type AfterScheduler = (task: () => Promise<void>) => void;

interface SafeExtractionLogContext {
  requestId: string;
  userId: string;
  conversationId: string;
  sourceMessageId: string;
}

export function scheduleMemoryExtraction(
  afterScheduler: AfterScheduler,
  task: () => Promise<void>,
  context: SafeExtractionLogContext,
) {
  afterScheduler(async () => {
    try {
      await task();
    } catch (error) {
      console.warn("memory_extraction_failed", {
        ...context,
        ...safeMemoryFailureDetails(error),
      });
    }
  });
}
import { safeMemoryFailureDetails } from "@/features/memory/diagnostics";
