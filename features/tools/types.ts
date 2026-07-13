export type ToolTypeValue = "SUMMARIZE" | "REWRITE" | "TRANSLATE";
export type ToolRunState = "idle" | "submitting" | "streaming" | "complete" | "stopped" | "error";

export interface ToolRunListItem {
  id: string;
  type: ToolTypeValue;
  status: "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";
  title?: string;
  inputPreview?: string;
  outputPreview?: string;
  createdAt: string;
}

export interface ToolRunDetail extends ToolRunListItem {
  inputText: string;
  outputText?: string;
  options: Record<string, unknown>;
}

export type ToolSseEvent =
  | { event: "start"; data: { runId: string; tool: ToolTypeValue } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { runId: string; status: "COMPLETE"; saved: boolean } }
  | { event: "error"; data: { code: string; message: string } };
