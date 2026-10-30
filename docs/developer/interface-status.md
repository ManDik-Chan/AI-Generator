# 接口清单

哪些已经实现、哪些只是设计契约，以及下一阶段需要谁做什么。本清单与 [API Reference](/docs/api) 使用同一套状态标记；更新任何接口时请同步这里。

更新日期：2026-10-31 · Demo 与文档已随 PR #36 合并 main，Registry P1-B1 已随 PR #29 合并；P1-B2-A 在本分支实现内部库协议，默认关闭、无 HTTP 路由。本轮不授权生产迁移或部署。

## 已实现

| 状态 | 接口或模块 | 位置 | 验证 |
| --- | --- | --- | --- |
| `status:demo` | `GET /api/demo/v1/capabilities` | `app/api/demo/v1/capabilities/route.ts` | 单元测试；本地 `next start` + HTTP 冒烟 |
| `status:demo` | `GET /api/demo/v1/capabilities/{capabilityId}` | `app/api/demo/v1/capabilities/[capabilityId]/route.ts` | 同上 |
| `status:demo` | `POST /api/demo/v1/runs`（JSON 与 SSE） | `app/api/demo/v1/runs/route.ts`、`features/demos/runtime/handlers.ts` | 同上；覆盖 200/400/404/413/415/422/429、超时、取消 |
| `status:demo` | `GET /api/demo/v1/openapi.json` | `app/api/demo/v1/openapi.json/route.ts` | swagger-parser 校验 OpenAPI 3.1；与仓库副本逐字一致 |
| `status:demo` | 能力 `route-optimizer.solve` | `features/demos/route-optimizer/` | 置换、长度、下界、2-opt 局部最优、确定性 |
| `status:demo` | 能力 `neural-network.train`（浏览器） | `features/demos/neural-network/` | 数值梯度检验、三种优化器收敛、协议全部分支 |
| `status:implemented` | 运行执行器 `executeRun` 与 `RunContext` | `features/demos/runtime/executor.ts` | 成功、失败脱敏、非法输出、超时保护、取消 |
| `status:implemented` | 能力描述符 `aig.capability/0.1` | `features/demos/runtime/capability.ts` | zod 校验；示例能力通过 |
| `status:implemented` | 浏览器协议 `aig.worker/1` | `features/demos/neural-network/protocol.ts` | 入站校验、生命周期、取消、重配置、发散、超时 |
| `status:implemented` | 运行状态机 | `features/platform/run-lifecycle.ts` | 既有测试 + 两个运行时共用 |
| `status:implemented` | P0.5 Manifest 校验器与 CLI | `features/platform/manifest.ts`、`scripts/manifest-validate.ts` | 既有测试；与 JSON Schema 副本的枚举一致性测试 |
| `status:internal` | Registry P1-B1 八实体、RLS/GRANT、内部资格与创建函数（已合并 main） | `prisma/schema.prisma`、`features/registry/internal.ts` | B1 隔离验收记录见 `docs/registry-validation.md`；默认关闭，无 HTTP 路由，生产操作另行授权 |
| `status:internal` | Registry P1-B2-A 八个 server-only 函数：Draft 头/DTO/Review 读取、编辑、提交、撤审、独立决策、Version 封存（本分支实现） | `features/registry/protocol.ts` | 实际验收见 `docs/registry-b2a-validation.md`；双 flag 默认关闭，无 HTTP；会话/动作/项目定权、CAS、幂等与审核事务 |
| `status:implemented` | P1-B2-A 严格 DraftDTO / VersionDTO、语义校验与 `JCS-SHA256-v1` | `features/registry/contracts.ts`、`features/registry/canonical.ts` | 同份 B2-A 验收记录；ReleaseDTO 仅有边界 schema，不代表公开投影或发布功能已实现 |
| `status:internal` | 本站对话、工具、人格、记忆、Agent 接口 | `app/api/*` | 既有测试；本轮未修改 |

## Demo 专用的取舍

这些是为了让 Demo 在 Vercel 上稳定、低成本运行而做的有意简化，正式接口需要替换：

| 取舍 | 现状 | 正式方案（待实现） |
| --- | --- | --- |
| 同步执行 | 运行在一次请求内完成（≤ 5 s），可选 SSE | `202 Accepted` + `runId`，持久任务存储、轮询或订阅 |
| 内存限流 | 单个函数实例内计数，尽力而为 | 共享计数（Vercel Firewall 规则或 KV），按身份与项目配额 |
| 无认证 | 公开、按 IP 限流 | 身份 + Grant；匿名调用仅限明确公开的能力 |
| 能力静态注册 | `features/demos/runtime/registry.ts` 中硬编码两个能力 | Registry 中审核过的能力登记，绑定不可变版本 |
| 浏览器能力用 Worker | 与页面同源的 Web Worker，属于计算隔离而非安全沙箱 | L1：独立 origin 的 iframe 沙箱、CSP、严格的 postMessage 校验 |
| 无持久化 | 输入与结果不保存 | 用户数据按资源定权、可删除、默认不公开 |

## 设计契约，尚未实现

| 状态 | 接口 | 依赖 | 建议负责 |
| --- | --- | --- | --- |
| `status:design` | Registry 公开读取 `GET /api/v1/projects…`（4 个） | B2-B 发布协议、资产授权闭环与白名单投影；B2-A 不公开内部 Draft/Version | Codex |
| `status:design` | Registry 内部 HTTP 命令 `/internal/v1/projects…`（21 个） | B2-A 已实现内部 Draft/Review/Version 库，尚未接入 HTTP；路由认证、限流及字节解码等仍需实现 | Codex |
| `status:design` | B2-B Release 的 publish / withdraw / rollback | 当前授权与资产新鲜性、发布状态机、幂等与失效投影；B2-A 的撤审/Version 封存不构成这些命令 | Codex |
| `status:design` | 资产上传、净化与独立 origin 读取 | 存储隔离、净化器 | Codex |
| `status:design` | 异步运行 `POST /api/v1/projects/{projectId}/runs`（202）、`GET /api/v1/runs/{runId}`、取消 | 持久队列、超时与回调签名 | Codex |
| `status:design` | Grant：安装、授权、撤销 | 身份与授权服务 | Codex |
| `status:design` | Credential / BYOK | KMS、AEAD、轮换、出站控制、SSRF 防护 | Codex |
| `status:design` | L1 受控嵌入 | 独立 origin、iframe sandbox、消息协议安全评审 | Codex + Claude（界面） |
| `status:design` | 第三方能力注册 | Registry + 能力审核 + L2 适配器 | Codex |

## 下一阶段的接入点

正式接口上线时，前端与文档只需要替换以下位置：

- `features/platform/source.ts`：探索目录与项目页的数据源（已为 Registry 预留，返回 `source: "demo"`）。
- `features/demos/runtime/registry.ts`：从 Registry 读取已审核的能力，而不是硬编码。
- `features/demos/runtime/handlers.ts`：`handleCreateRun` 改为写入任务存储并返回 `202`；`executeRun` 可原样用作 Worker 端的执行器。
- `features/demos/runtime/rate-limit.ts`：替换为共享存储的实现，接口（`take` / `acquire`）保持不变。
- 本目录下的 Markdown 与 `openapi.json`：把对应行的状态从 `status:design` 改为 `status:implemented`，并补充正式路径。
