/*
 * OpenAPI 3.1 description of the Demo Runtime API, generated from the same zod schemas
 * the handlers validate with. docs/developer/openapi.json is this document serialised
 * (`pnpm docs:openapi`); a unit test fails when the two drift apart.
 */
import { z } from "zod";

import { capabilityDescriptorSchema } from "@/features/demos/runtime/capability";
import { apiErrorSchema } from "@/features/demos/runtime/errors";
import { runRequestSchema } from "@/features/demos/runtime/handlers";
import { runSchemaFor, runStatusSchema } from "@/features/demos/runtime/run";
import { routeInputSchema, routeOutputSchema, routeProgressSchema } from "@/features/demos/route-optimizer/schema";
import { examples } from "@/features/demos/runtime/openapi-examples";

type Json = Record<string, unknown>;

const REF = (id: string) => ({ $ref: `#/components/schemas/${id}` });

/** Strip generator noise and make tuples exact, recursively. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (key === "$schema" || key === "$id") continue;
    out[key] = tidy(value);
  }
  if (out.format === "date-time") delete out.pattern;
  if (out.maximum === Number.MAX_SAFE_INTEGER) delete out.maximum;
  if (out.minimum === Number.MIN_SAFE_INTEGER) delete out.minimum;
  if (Array.isArray(out.prefixItems) && out.items === undefined) {
    out.items = false;
    out.minItems = out.prefixItems.length;
  }
  return out;
}

function componentSchemas() {
  const run = runSchemaFor(routeOutputSchema);
  const capabilityList = z.object({ object: z.literal("list"), data: z.array(capabilityDescriptorSchema) }).strict();
  const runRequest = runRequestSchema.extend({ input: routeInputSchema }).describe("Run request. `input` must match the input schema of the chosen capability; the only server capability today is route-optimizer.solve.");
  const statusEvent = run.describe("`event: run.status` — the whole Run after every transition; the last one is terminal");
  const progressEvent = z.object({ runId: z.string(), data: routeProgressSchema }).strict().describe("`event: run.progress` — capability-defined progress, at most every 60 ms");

  const inputs = z.registry<{ id: string }>();
  inputs.add(routeInputSchema, { id: "RouteOptimizerInput" });
  inputs.add(runRequest, { id: "RunRequest" });

  const outputs = z.registry<{ id: string }>();
  outputs.add(runStatusSchema, { id: "RunStatus" });
  outputs.add(routeOutputSchema, { id: "RouteOptimizerOutput" });
  outputs.add(run, { id: "Run" });
  outputs.add(apiErrorSchema, { id: "Error" });
  outputs.add(capabilityDescriptorSchema, { id: "CapabilityDescriptor" });
  outputs.add(capabilityList, { id: "CapabilityList" });
  outputs.add(routeProgressSchema, { id: "RouteOptimizerProgress" });
  outputs.add(statusEvent, { id: "RunStatusEvent" });
  outputs.add(progressEvent, { id: "RunProgressEvent" });

  const uri = (id: string) => `#/components/schemas/${id}`;
  const a = z.toJSONSchema(inputs, { uri, io: "input", unrepresentable: "any" }).schemas;
  const b = z.toJSONSchema(outputs, { uri, io: "output", unrepresentable: "any" }).schemas;
  return tidy({ ...b, ...a }) as Json;
}

const errorResponse = (description: string, example: keyof typeof examples.errors, headers?: Json) => ({
  description,
  ...(headers ? { headers } : {}),
  content: { "application/json": { schema: REF("Error"), example: examples.errors[example] } },
});

const requestIdHeader = { description: "Unique id of this request; quote it when reporting a problem", schema: { type: "string", format: "uuid" } };
const noStore = { description: "Every response, including errors, is no-store", schema: { type: "string", const: "no-store" } };
const rateHeaders = {
  "RateLimit-Limit": { description: "Runs allowed per window for this client (per function instance)", schema: { type: "integer" } },
  "RateLimit-Remaining": { description: "Runs left in the current window", schema: { type: "integer" } },
  "RateLimit-Reset": { description: "Seconds until a slot frees up", schema: { type: "integer" } },
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "AI-Generator Demo Runtime API",
      version: "1.0.0",
      summary: "Public, rate-limited API behind the two runnable demos.",
      description: [
        "Status: **demo**. Implemented and publicly reachable, no account needed, no API key. It is not the production Registry API:",
        "the Registry, Grants, BYOK credentials and the asynchronous 202 + polling run contract are design contracts that are not deployed (see /docs/status).",
        "",
        "Runs execute synchronously within one request. Send `Accept: text/event-stream` to receive the run lifecycle and progress as Server-Sent Events.",
        "Limits are enforced per function instance and are best effort: 20 runs per 60 s and 2 concurrent runs per client, a 64 KiB body and a 5 s run deadline.",
      ].join("\n"),
      license: { name: "Source available in the AI-Generator repository", url: "https://github.com/ManDik-Chan/AI-Generator" },
    },
    servers: [{ url: "/", description: "The site serving this document" }],
    tags: [
      { name: "capabilities", description: "Discover what can run and how" },
      { name: "runs", description: "Execute a server capability" },
      { name: "meta", description: "This document" },
    ],
    paths: {
      "/api/demo/v1/capabilities": {
        get: {
          operationId: "listCapabilities",
          tags: ["capabilities"],
          summary: "List capabilities",
          description: "Both demo capabilities: route-optimizer.solve (execution: server) and neural-network.train (execution: browser).",
          responses: {
            "200": { description: "Capability descriptors", headers: { "X-Request-Id": requestIdHeader, "Cache-Control": noStore }, content: { "application/json": { schema: REF("CapabilityList") } } },
          },
        },
      },
      "/api/demo/v1/capabilities/{capabilityId}": {
        get: {
          operationId: "getCapability",
          tags: ["capabilities"],
          summary: "Get one capability",
          parameters: [{ name: "capabilityId", in: "path", required: true, schema: { type: "string", examples: ["route-optimizer.solve"] } }],
          responses: {
            "200": { description: "Capability descriptor with input and output JSON Schema", headers: { "X-Request-Id": requestIdHeader }, content: { "application/json": { schema: REF("CapabilityDescriptor") } } },
            "404": errorResponse("Unknown capability", "notFound"),
          },
        },
      },
      "/api/demo/v1/runs": {
        post: {
          operationId: "createRun",
          tags: ["runs"],
          summary: "Run a server capability",
          description: [
            "Validates the input, executes the capability and returns the terminal Run (`200`).",
            "A run that executed always returns 200, whatever its status: SUCCEEDED, TIMED_OUT (with a partial `output` when the capability supplied one), FAILED or CANCELLED. HTTP errors mean no run was executed.",
            "With `Accept: text/event-stream` the response is a stream of `run.status` events (schema RunStatusEvent) and `run.progress` events (schema RunProgressEvent); the stream ends after the terminal `run.status`.",
          ].join("\n\n"),
          parameters: [
            { name: "Accept", in: "header", required: false, schema: { type: "string", enum: ["application/json", "text/event-stream"], default: "application/json" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: REF("RunRequest"),
                examples: {
                  instance: { summary: "Let the server generate 120 clustered cities", value: examples.requests.instance },
                  points: { summary: "Send your own points", value: examples.requests.points },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The run executed. Inspect `status`.",
              headers: { "X-Request-Id": requestIdHeader, "X-Run-Id": { description: "Id of the run", schema: { type: "string" } }, "Cache-Control": noStore, ...rateHeaders },
              content: {
                "application/json": { schema: REF("Run"), example: examples.run },
                "text/event-stream": {
                  schema: { type: "string", description: "Server-Sent Events: run.status (RunStatusEvent) and run.progress (RunProgressEvent)" },
                  example: examples.sse,
                },
              },
            },
            "400": errorResponse("Malformed JSON, wrong envelope or input outside the schema", "invalid"),
            "404": errorResponse("Unknown capability", "notFound"),
            "413": errorResponse("Body larger than 64 KiB", "tooLarge"),
            "415": errorResponse("Content-Type is not application/json", "mediaType"),
            "422": errorResponse("Valid shape but not executable (browser capability, startIndex ≥ number of points)", "semantic"),
            "429": errorResponse("Too many runs in the window, or too many concurrent runs", "rateLimited", {
              "Retry-After": { description: "Seconds to wait", schema: { type: "integer" } },
              ...rateHeaders,
            }),
            "500": errorResponse("Unexpected server error; nothing about the input is echoed", "internal"),
          },
          "x-sse-events": { "run.status": REF("RunStatusEvent"), "run.progress": REF("RunProgressEvent") },
        },
      },
      "/api/demo/v1/openapi.json": {
        get: {
          operationId: "getOpenApiDocument",
          tags: ["meta"],
          summary: "This OpenAPI document",
          responses: { "200": { description: "OpenAPI 3.1 document", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
    components: { schemas: componentSchemas() },
    "x-aig-status": "demo",
  };
}
