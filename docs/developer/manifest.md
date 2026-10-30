# Manifest 与能力描述符

项目用 **Manifest** 描述自己是什么，用 **能力描述符** 描述自己能运行什么。两者分开版本化：Manifest 遵循 P0.5 Registry 契约 `0.5.0`（设计契约，Registry 尚未部署）；能力描述符 `aig.capability/0.1` 已在两个 Demo 中实现。

## 项目 Manifest（P0.5）

`status:implemented` 校验器（`features/platform/manifest.ts`、`pnpm manifest:validate`、本页在线校验）已实现。`status:design` 提交 Manifest 的 Registry 尚未部署。

JSON Schema：`docs/developer/contracts/manifest.schema.json`（JSON Schema 2020-12，复制自 P0.5 契约，单元测试保证与校验器的枚举一致）。

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `schemaVersion` | 是 | 固定 `"0.5.0"`；其他值一律拒绝，不做自动迁移 |
| `projectId` | 是 | UUID，由平台在创建项目时分配 |
| `slug` | 是 | `^[a-z][a-z0-9-]{2,62}$`，用于页面地址 `/explore/{slug}` |
| `version` | 是 | 语义化版本 `MAJOR.MINOR.PATCH` |
| `name` / `summary` | 是 | 1–500 个字符 |
| `category` | 是 | `research` / `software` / `algorithm` / `web-service` / `ai` / `other` |
| `visibility` | 是 | `PRIVATE`（仅成员）/ `UNLISTED`（不进目录，持链接可见）/ `PUBLIC` |
| `integration` | 是 | `{ "mode": "SHOWCASE" }`；P0.5 只接受展示型接入 |
| `capabilities` | 是 | 1–3 项，不重复：`documentation.read` / `presentation.read` / `static-image.read` |
| `researchClaims` | 是 | 0–40 条声明，可为空数组 |

每条研究声明：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `topic` / `description` | 是 | 1–500 个字符 |
| `status` | 是 | `SOURCE_IMPLEMENTED` / `DOCUMENTED` / `EXPERIMENT_VERIFIED` / `PLANNED` |
| `evidenceAssetIds` | 是 | 0–100 个不重复的 UUID；`EXPERIMENT_VERIFIED` 应至少有一个 |
| `modelVersion` | 否 | 1–500 个字符 |

不允许任何额外字段（`additionalProperties: false`）。校验器另外给出不阻断的编辑建议，例如摘要过短、科研项目没有声明。

示例（`examples/manifest/manifest.json`）：

<!-- example: examples/manifest/manifest.json -->
```json
{
  "schemaVersion": "0.5.0",
  "projectId": "3d6f9a2b-7c41-4e8d-9b2a-5f0e1c7d8a96",
  "slug": "route-optimizer",
  "version": "1.0.0",
  "name": "路线优化求解器",
  "summary": "为一组城市求尽量短的闭合路线，并用最小生成树给出下界。",
  "category": "algorithm",
  "visibility": "PUBLIC",
  "integration": { "mode": "SHOWCASE" },
  "capabilities": ["documentation.read", "presentation.read"],
  "researchClaims": [
    {
      "topic": "2-opt 局部最优",
      "status": "SOURCE_IMPLEMENTED",
      "description": "2-opt、Or-opt 与模拟退火的结果都经过 2-opt 打磨，单元测试逐对检查没有可改进的交换。",
      "evidenceAssetIds": ["8a1c4e2f-6b3d-4f7a-9c5e-0d2b1a3f4e6c"]
    }
  ]
}
```

### 在线校验

在下面直接修改，校验只在你的浏览器中进行，不会上传。

<!-- widget: manifest-validator -->

## 能力描述符

`status:implemented` `aig.capability/0.1` 描述一项可运行的能力。平台自己的两个 Demo 通过 `GET /api/demo/v1/capabilities` 公开它们的描述符；第三方注册能力需要 Registry，`status:design`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | `"aig.capability/0.1"` | 契约版本 |
| `id` | string | 点分 id，如 `route-optimizer.solve`；规则 `^[a-z][a-z0-9-]{1,40}(\.[a-z][a-z0-9-]{1,40}){1,3}$` |
| `project` | string | 所属项目的 slug，规则同 Manifest |
| `version` | semver | 能力实现的版本 |
| `title` / `summary` | string | 1–80 / 1–300 个字符 |
| `execution` | `server` / `browser` | 在平台服务端执行，或在访客浏览器执行 |
| `transports` | array | `http-json`、`http-sse`（服务端）或 `worker`（浏览器） |
| `dataFlow` | `none` / `platform` / `developer` | 输入的去向：不离开浏览器 / 平台处理且不保存 / 交给项目运营方 |
| `status` | `demo` / `live` / `design` | 能力的上线状态 |
| `limits` | object | `maxInputBytes`、`defaultDeadlineMs`、`maxDeadlineMs`，可选 `rateLimit`、`concurrentRunsPerClient` |
| `inputSchema` / `outputSchema` | JSON Schema | 由实现中的 zod 契约生成，与运行时校验完全一致 |
| `sourcePath` / `docsPath` | string | 实现所在的仓库路径、文档所在的网站路径 |

服务端能力不需要手写描述符：`describeServerCapability(capability)` 从 `defineServerCapability` 的定义生成（见[开发者手册](/docs/guide#最小接入示例)）。浏览器能力的描述符见 `features/demos/runtime/registry.ts`。

## 两者的关系

```text
Manifest（项目是什么）            能力描述符（项目能运行什么）
  slug ──────────────────────────── project
  version                           version（能力自己的版本）
  integration.mode = SHOWCASE       execution = server | browser
  capabilities = *.read             inputSchema / outputSchema / limits / dataFlow
```

P0.5 的 Manifest 只覆盖展示型接入（L0）。可运行能力将来通过 Registry 中经过审核的能力登记与 Manifest 绑定（P0.5 的 `futurerouting.schema.json` 描述了服务端封存的计算目的地与凭据来源）；在那之前，能力描述符是 Demo 运行时的实现契约，不进入 Manifest。

## 兼容性规则

- 未知的 `schemaVersion` 或 `schema` 一律拒绝，不静默降级。
- 新增可选字段是兼容变更；新增必填字段、收紧约束、改变语义需要新的契约版本。
- Registry 中发布的每个版本将是不可变快照：Manifest 不能随外部文件变化而悄悄扩大权限，危险能力变更需要重新审核。
