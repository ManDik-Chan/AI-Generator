import { z } from "zod";
import { BRAINSTORM_PROMPT_MAX_CHARS } from "@/features/tools/brainstorm/constants";

export const brainstormRequestSchema = z.object({
  prompt: z.string().trim().min(1, "请输入需要头脑风暴的问题。").max(BRAINSTORM_PROMPT_MAX_CHARS, `问题不能超过 ${BRAINSTORM_PROMPT_MAX_CHARS} 个字符。`),
  saveHistory: z.boolean().default(true),
}).strict();

export type BrainstormRequest = z.infer<typeof brainstormRequestSchema>;
