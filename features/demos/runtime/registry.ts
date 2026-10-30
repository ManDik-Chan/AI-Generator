/*
 * The capabilities served by the demo runtime. Server capabilities can be run through
 * POST /api/demo/v1/runs; browser capabilities are listed with their worker protocol
 * and are rejected by the run endpoint (they execute on the visitor's device).
 */
import { z } from "zod";

import { CAPABILITY_SCHEMA, describeServerCapability, jsonSchemaOf, type CapabilityDescriptor, type ServerCapability } from "@/features/demos/runtime/capability";
import { metricsSchema, sessionConfigSchema, trainInputSchema, MAX_RUN_MS } from "@/features/demos/neural-network/protocol";
import { routeOptimizerCapability } from "@/features/demos/route-optimizer/capability";

export const serverCapabilities: Record<string, ServerCapability> = {
  [routeOptimizerCapability.descriptor.id]: routeOptimizerCapability as ServerCapability,
};

export const NEURAL_CAPABILITY_ID = "neural-network.train";

const neuralInput = z
  .object({
    session: sessionConfigSchema.describe("Sent with session.configure"),
    run: trainInputSchema.describe("Sent with run.start"),
  })
  .strict();

export const neuralNetworkDescriptor: CapabilityDescriptor = {
  schema: CAPABILITY_SCHEMA,
  id: NEURAL_CAPABILITY_ID,
  project: "neural-network",
  version: "1.0.0",
  title: "浏览器内神经网络训练",
  summary: "在访客的浏览器里用反向传播训练一个小型全连接网络，实时显示决策边界与训练/测试损失；数据不离开设备。",
  execution: "browser",
  transports: ["worker"],
  dataFlow: "none",
  status: "demo",
  limits: { maxInputBytes: 16 * 1024, defaultDeadlineMs: MAX_RUN_MS, maxDeadlineMs: MAX_RUN_MS },
  inputSchema: jsonSchemaOf(neuralInput, "input"),
  outputSchema: jsonSchemaOf(metricsSchema, "output"),
  sourcePath: "features/demos/neural-network",
  docsPath: "/docs/guide#浏览器运行时",
};

export function listCapabilities(): CapabilityDescriptor[] {
  return [...Object.values(serverCapabilities).map(describeServerCapability), neuralNetworkDescriptor];
}

export function findCapability(id: string): CapabilityDescriptor | undefined {
  return listCapabilities().find((capability) => capability.id === id);
}
