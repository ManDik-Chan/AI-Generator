/* Presets of the docs request console (TryIt) and the curl each one copies. */
import { curlCommand } from "@/features/demos/components/format";

export interface Preset {
  id: string;
  label: string;
  method: "GET" | "POST";
  path: string;
  stream?: boolean;
  body?: unknown;
  note: string;
}

export const presets: Preset[] = [
  { id: "list", label: "能力列表", method: "GET", path: "/api/demo/v1/capabilities", note: "列出两个能力及其输入输出 Schema。" },
  { id: "run", label: "同步运行", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { instance: { kind: "clustered", count: 120, seed: 7 }, improvement: "or-opt" } }, note: "一次返回终态 Run。" },
  { id: "stream", label: "事件流", method: "POST", path: "/api/demo/v1/runs", stream: true, body: { capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 250, seed: 3 }, improvement: "annealing", annealingIterations: 600000 } }, note: "Accept: text/event-stream，逐条显示 run.status 与 run.progress。" },
  { id: "timeout", label: "截止时间", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 400 }, improvement: "annealing", annealingIterations: 3000000, deadlineMs: 50 } }, note: "50 ms 内无法完成 → TIMED_OUT，带部分结果。" },
  { id: "invalid", label: "错误示例", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { points: [[1, 2]], color: "red" } }, note: "输入不符合契约 → 400，issues 指出问题位置。" },
];

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The curl equivalent of a preset. GET presets never carry a body. */
export function presetCurl(preset: Preset, bodyText: string, origin: string) {
  const body = preset.method === "POST" ? parseOrText(bodyText) : undefined;
  return curlCommand(`${origin}${preset.path}`, body, { stream: preset.stream });
}
