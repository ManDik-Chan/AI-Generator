import { z } from "zod";

export const imageOptionsSchema = z.object({
  mode: z.enum(["general", "detailed", "question"]),
  detail: z.enum(["short", "standard", "detailed"]),
  language: z.enum(["auto", "zh-CN", "en"]),
}).strict();

export const imageRunFieldsSchema = z.object({
  question: z.string().trim().max(2000).default(""),
  saveHistory: z.enum(["true", "false"]).transform((value) => value === "true"),
  options: z.string().transform((value, context) => { try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: "custom", message: "图片分析选项无效。" }); return z.NEVER; } }).pipe(imageOptionsSchema),
  sourceAssetId: z.string().uuid().optional(),
}).superRefine((value, context) => { if (value.options.mode === "question" && !value.question) context.addIssue({ code: "custom", path: ["question"], message: "针对问题回答模式需要填写问题。" }); });

export type ImageAnalysisOptions = z.infer<typeof imageOptionsSchema>;
