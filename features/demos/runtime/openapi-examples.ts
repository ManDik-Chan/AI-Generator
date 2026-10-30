/*
 * Examples embedded in the OpenAPI document. The run example is a real result: a unit
 * test re-solves `requests.points` and checks tour, lengths, bound and stop reason. Ids
 * and timestamps are fixed so the generated document is stable.
 */

const requestId = "6f0c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f";
const runId = "run_593b7515-0fcd-4ae4-9483-129cf61b8b19";

export const examples = {
  requests: {
    instance: {
      capability: "route-optimizer.solve",
      input: { instance: { kind: "clustered", count: 120, seed: 7 }, improvement: "or-opt", deadlineMs: 2000 },
    },
    points: {
      capability: "route-optimizer.solve",
      input: {
        points: [[120, 80], [860, 140], [500, 520], [180, 760], [900, 880], [420, 240], [640, 700], [300, 420]],
        improvement: "or-opt",
        startIndex: 0,
      },
    },
  },
  run: {
    object: "run",
    id: runId,
    capability: "route-optimizer.solve",
    capabilityVersion: "1.0.0",
    status: "SUCCEEDED",
    createdAt: "2026-10-30T09:55:14.276Z",
    startedAt: "2026-10-30T09:55:14.276Z",
    finishedAt: "2026-10-30T09:55:14.280Z",
    durationMs: 4,
    transitions: [
      { status: "PENDING", at: "2026-10-30T09:55:14.276Z" },
      { status: "ACCEPTED", at: "2026-10-30T09:55:14.276Z" },
      { status: "RUNNING", at: "2026-10-30T09:55:14.276Z" },
      { status: "SUCCEEDED", at: "2026-10-30T09:55:14.280Z" },
    ],
    output: {
      tour: [0, 5, 1, 4, 6, 2, 3, 7],
      length: 3221.827,
      initialLength: 3716.78,
      improvement: 0.13317,
      lowerBound: 2135.978,
      gap: 0.50836,
      iterations: 205,
      appliedMoves: 4,
      passes: 4,
      stopReason: "converged",
      partial: false,
      elapsedMs: 1.1,
      convergence: [
        { at: 0.3, length: 3716.78 },
        { at: 0.8, length: 3221.827 },
      ],
    },
    error: null,
    requestId,
  },
  sse: [
    `event: run.status\ndata: {"object":"run","id":"${runId}","status":"PENDING",…}`,
    `event: run.status\ndata: {"object":"run","id":"${runId}","status":"ACCEPTED",…}`,
    `event: run.status\ndata: {"object":"run","id":"${runId}","status":"RUNNING",…}`,
    `event: run.progress\ndata: {"runId":"${runId}","data":{"phase":"two-opt","elapsedMs":0.3,"length":3716.78,"iterations":0,"tour":[0,5,1,4,2,6,3,7]}}`,
    `event: run.status\ndata: {"object":"run","id":"${runId}","status":"SUCCEEDED","output":{…},…}`,
    "",
  ].join("\n\n"),
  errors: {
    invalid: {
      code: "INVALID_REQUEST",
      message: "input 不符合该能力的输入契约。",
      requestId,
      issues: [{ path: "input.points", message: "Too big: expected array to have <=400 items" }],
    },
    notFound: { code: "NOT_FOUND", message: "没有这个能力。", requestId },
    tooLarge: { code: "PAYLOAD_TOO_LARGE", message: "请求体不能超过 65536 字节。", requestId },
    mediaType: { code: "UNSUPPORTED_MEDIA_TYPE", message: "请求体必须是 application/json。", requestId },
    semantic: {
      code: "SEMANTIC_REJECTION",
      message: "这个能力在访客的浏览器中运行，服务端不执行它。",
      requestId,
      issues: [{ path: "capability", message: "neural-network.train 的 execution 是 browser。" }],
    },
    rateLimited: { code: "RATE_LIMITED", message: "请求过于频繁：每 60 秒最多 20 次运行。", requestId },
    internal: { code: "INTERNAL_ERROR", message: "服务端出错，请稍后重试。", requestId },
  },
} as const;
