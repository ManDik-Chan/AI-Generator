import { waitUntil } from "@vercel/functions";
import { after } from "next/server";

interface BackgroundTaskContext {
  taskType: string;
  taskId: string;
  userId: string;
}

function safeErrorCode(error: unknown) {
  return error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN";
}

/** Register an already-started job with the request lifecycle. */
export function registerGenerationTask(task: Promise<void>, context: BackgroundTaskContext) {
  const guarded = task.catch((error) => {
    console.error("generation_background_task_rejected", {
      taskType: context.taskType,
      taskId: context.taskId,
      errorCode: safeErrorCode(error),
    });
  });

  try {
    waitUntil(guarded);
  } catch {
    // The promise is already running; after() is only a local lifecycle fallback.
    after(() => guarded);
  }
  return guarded;
}
