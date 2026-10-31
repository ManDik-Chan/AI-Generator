/*
 * What a developer can call today, what exists only as an internal library, and what is
 * still a design. Server-only data for the workbench and the integration page.
 *
 * - Live operations are read from the Demo Runtime OpenAPI builder, so they cannot drift.
 * - Registry functions are the exports of features/registry/*.ts on main (checked by a
 *   test); none of them has an HTTP route.
 * - Designed endpoints are proposals from docs/developer/interface-status.md.
 */
import { buildOpenApiDocument } from "@/features/demos/runtime/openapi";
import type { ConsoleAction } from "@/features/developer-console/model";
import type { ContractStatus } from "@/features/developer-console/permissions";

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface LiveOperation {
  method: HttpMethod;
  path: string;
  summary: string;
  operationId: string;
}

export function liveOperations(): LiveOperation[] {
  const paths = buildOpenApiDocument().paths as Record<string, Record<string, { summary?: string; operationId?: string }>>;
  return Object.entries(paths).flatMap(([path, operations]) => Object.entries(operations).map(([method, operation]) => ({
    method: method.toUpperCase() as HttpMethod, path, summary: operation.summary ?? "", operationId: operation.operationId ?? "",
  })));
}

export interface RegistryFunction {
  fn: string;
  file: string;
  action: ConsoleAction | "CREATE_PROJECT";
  contract: ContractStatus;
  detail: string;
}

export const registryFunctions: RegistryFunction[] = [
  { fn: "createInternalRegistryProject", file: "features/registry/internal.ts", action: "CREATE_PROJECT", contract: "merged", detail: "创建项目、唯一 OWNER 成员与第一份空草稿（B1）" },
  { fn: "getRegistryDraftHead", file: "features/registry/protocol.ts", action: "READ_DRAFT", contract: "merged", detail: "草稿头与强 ETag；空草稿也可读取" },
  { fn: "getRegistryDraft", file: "features/registry/protocol.ts", action: "READ_DRAFT", contract: "merged", detail: "严格 DraftDTO；空草稿返回 DRAFT_UNINITIALIZED" },
  { fn: "getRegistryReview", file: "features/registry/protocol.ts", action: "READ_DRAFT", contract: "merged", detail: "历史 decision 与当前 effectiveState" },
  { fn: "editRegistryDraft", file: "features/registry/protocol.ts", action: "EDIT_DRAFT", contract: "merged", detail: "整份替换 · If-Match · Idempotency-Key" },
  { fn: "submitRegistryDraft", file: "features/registry/protocol.ts", action: "SUBMIT_REVIEW", contract: "merged", detail: "绑定内容哈希、资产摘要、epoch 与期限" },
  { fn: "withdrawRegistryReview", file: "features/registry/protocol.ts", action: "WITHDRAW_REVIEW", contract: "merged", detail: "追加失效事实，草稿回到可编辑" },
  { fn: "decideRegistryReview", file: "features/registry/protocol.ts", action: "DECIDE_REVIEW", contract: "merged", detail: "独立审核人批准或拒绝" },
  { fn: "sealRegistryVersion", file: "features/registry/protocol.ts", action: "SEAL_VERSION", contract: "merged", detail: "原子封存不可变 Version" },
  { fn: "requestRegistryReleaseApproval", file: "features/registry/release.ts（未合并）", action: "REQUEST_RELEASE", contract: "provisional", detail: "发布或回滚申请" },
  { fn: "approveRegistryRelease", file: "features/registry/release.ts（未合并）", action: "APPROVE_RELEASE", contract: "provisional", detail: "独立批准" },
  { fn: "publishRegistryRelease", file: "features/registry/release.ts（未合并）", action: "PUBLISH_RELEASE", contract: "provisional", detail: "消费批准并切换当前指针" },
  { fn: "withdrawRegistryRelease", file: "features/registry/release.ts（未合并）", action: "WITHDRAW_RELEASE", contract: "provisional", detail: "追加撤回事实" },
  { fn: "rollbackRegistryRelease", file: "features/registry/release.ts（未合并）", action: "ROLLBACK_RELEASE", contract: "provisional", detail: "用历史 Version 创建新 Release" },
];

export interface DesignedEndpoint {
  method: HttpMethod;
  path: string;
  detail: string;
}

export const designedEndpoints: DesignedEndpoint[] = [
  { method: "GET", path: "/api/v1/projects", detail: "公开或已授权的项目列表（fail-closed 投影）" },
  { method: "GET", path: "/api/v1/projects/{projectId}", detail: "读取项目当前有效 Release" },
  { method: "GET", path: "/api/v1/projects/{projectId}/versions/{version}", detail: "读取不可变版本" },
  { method: "POST", path: "/api/v1/projects/{projectId}/installations", detail: "安装项目" },
  { method: "POST", path: "/api/v1/installations/{id}/grants", detail: "授予能力" },
  { method: "DELETE", path: "/api/v1/grants/{grantId}", detail: "撤销授权，新的运行立即被拒绝" },
  { method: "POST", path: "/api/v1/projects/{projectId}/runs", detail: "异步运行 · 202 Accepted + runId · Idempotency-Key" },
  { method: "GET", path: "/api/v1/runs/{runId}", detail: "读取运行状态" },
  { method: "POST", path: "/api/v1/runs/{runId}/cancel", detail: "取消运行" },
];
