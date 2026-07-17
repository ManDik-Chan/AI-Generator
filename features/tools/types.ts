import type { BrainstormWorkerDto } from "@/features/tools/brainstorm/types";

export type ToolTypeValue = "SUMMARIZE" | "REWRITE" | "TRANSLATE" | "IMAGE_ANALYZE" | "IMAGE_GENERATE" | "BRAINSTORM";
export type TextToolTypeValue = Exclude<ToolTypeValue, "IMAGE_ANALYZE" | "IMAGE_GENERATE" | "BRAINSTORM">;
export type ToolRunState = "idle" | "submitting" | "streaming" | "complete" | "stopped" | "error";

export interface ToolRunListItem {
  id: string;
  type: ToolTypeValue;
  status: "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";
  errorCode?: string;
  title?: string;
  inputPreview?: string;
  outputPreview?: string;
  createdAt: string;
  asset?: { id: string; mimeType: string; width: number; height: number; expired: boolean };
  generatedImage?: { id: string; width: number | null; height: number | null };
}

export interface ToolRunDetail extends ToolRunListItem {
  inputText: string;
  outputText?: string;
  options: Record<string, unknown>;
  brainstormWorkers?: BrainstormWorkerDto[];
}

export type ToolSseEvent =
  | { event: "start"; data: { runId: string; tool: ToolTypeValue } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { runId: string; status: "COMPLETE"; saved: boolean } }
  | { event: "error"; data: { code: string; message: string } };
