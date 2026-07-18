import { z } from "zod";

import {
  AGENT_INPUT_MAX_CHARS,
  AGENT_PLAN_ASSIGNMENT_MAX_CHARS,
  AGENT_PLAN_KEY_MAX_CHARS,
  AGENT_PLAN_NAME_MAX_CHARS,
  AGENT_PLAN_OVERVIEW_MAX_CHARS,
  AGENT_PLAN_TITLE_MAX_CHARS,
} from "@/features/agents/constants";

export const agentRequestSchema = z.object({
  conversationId: z.uuid("conversationId 格式无效。").optional(),
  content: z.string().trim().min(1, "请输入消息内容。").max(AGENT_INPUT_MAX_CHARS, `消息内容不能超过 ${AGENT_INPUT_MAX_CHARS} 个字符。`),
  personaId: z.uuid("personaId 格式无效。").optional(),
  mode: z.enum(["STANDARD", "DEEP"]),
}).strict().superRefine((value, context) => {
  if (value.conversationId && value.personaId) {
    context.addIssue({ code: "custom", path: ["personaId"], message: "已有对话不能切换人格。" });
  }
});

const agentPlanWorkerSchema = z.object({
  key: z.string().min(1).max(AGENT_PLAN_KEY_MAX_CHARS).regex(/^[a-z][a-z0-9_-]*$/, "Worker key 只允许小写安全字符。"),
  name: z.string().trim().min(1).max(AGENT_PLAN_NAME_MAX_CHARS),
  title: z.string().trim().min(1).max(AGENT_PLAN_TITLE_MAX_CHARS),
  objective: z.string().trim().min(1).max(AGENT_PLAN_ASSIGNMENT_MAX_CHARS),
  expectedDeliverable: z.string().trim().min(1).max(AGENT_PLAN_ASSIGNMENT_MAX_CHARS),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  dependsOn: z.array(z.string().min(1).max(AGENT_PLAN_KEY_MAX_CHARS)).max(6),
}).strict();

export const agentPlanSchema = z.object({
  overview: z.string().trim().min(1).max(AGENT_PLAN_OVERVIEW_MAX_CHARS),
  workers: z.array(agentPlanWorkerSchema).min(1).max(6),
}).strict();
