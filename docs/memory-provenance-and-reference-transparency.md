# Phase 5B2a：记忆核验来源与本轮引用透明度

## 产品决定与范围

本阶段固定采用：

- `LEGACY_MEMORY_RECALL = KEEP_WITH_VISIBLE_WARNING`
- `TURN_MEMORY_DISCLOSURE = LIVE_SESSION_ONLY`

5B1 以前遗留且无法证明经过用户确认的自动记忆继续按原启用、作用域和排序规则参与召回，但在 `/memories` 与本轮引用明细中始终显示“旧版自动整理，尚未复核” warning。用户可逐条标记为已核对；系统不会自动接受 Proposal、自动覆盖或自动删除正式 Memory。

本轮引用只存在于当前客户端流式会话状态。刷新、重新打开对话或 generation recovery 不从数据库重建引用明细。这是 5B2a 的有意产品边界，不是数据丢失缺陷。

本阶段没有新增引用表、审计时间线、ConflictCase、Message 字段、文件/网页 RAG、Message 向量化、知识图谱、跨用户共享或新的 Agent/Browser/Shell/Git/MCP 能力。

## `origin` 与 `verificationMethod`

两者描述不同事实：

- `origin` 表示内容的业务来源，例如手动录入、聊天消息或自动提取；现有枚举语义保持不变。
- `verificationMethod` 表示当前内容通过哪一种用户行为获得可信状态，不是高/中/低分数。

用户可见映射：

| verificationMethod | 标签 | `verifiedAt` |
| --- | --- | --- |
| `MANUAL_ENTRY` | 用户手动添加 | 必填 |
| `EXPLICIT_REQUEST` | 用户明确要求记住 | 必填 |
| `PROPOSAL_ACCEPTANCE` | 用户确认 AI 建议 | 必填 |
| `MANUAL_REVIEW` | 用户已手动核对 | 必填 |
| `LEGACY_UNREVIEWED` | 旧版自动整理，尚未复核 | 必须为 NULL |

`verification_method = LEGACY_UNREVIEWED` 与 `verified_at IS NULL` 在数据库中为双向 CHECK。模型输出与浏览器表单都不能提交这两个字段；可信服务端根据实际入口映射。启停、置顶、使用统计、`lastUsedAt` 和 Embedding 同步不会改变核验来源。

浏览器可调用的手动创建 Action 会在服务端强制使用 `origin=MANUAL` 与 `MANUAL_ENTRY`，忽略客户端尝试提供的聊天来源。`EXPLICIT_REQUEST` 只能来自服务端对用户明确命令的判定，不能通过篡改表单 `origin` 间接选择。

## Migration 与旧数据回填

独立 migration `20260727013753_add_memory_verification` 使用显式 `BEGIN` / `COMMIT`，不修改任何旧 migration：

1. `origin = MANUAL` → `MANUAL_ENTRY`，时间取 `created_at`。
2. `origin = CHAT_MESSAGE` → `EXPLICIT_REQUEST`，时间取 `created_at`。
3. `origin = AUTO_EXTRACTED` 且同 owner 存在 Accepted Proposal 指向该 Memory → `PROPOSAL_ACCEPTANCE`，时间取最新有效 Proposal 的 `resolved_at`。
4. 其余 `AUTO_EXTRACTED` → `LEGACY_UNREVIEWED`，时间为 NULL。

`(user_id, verification_method, updated_at DESC)` 支持 `/memories` 的 owner + verification 筛选。verification-only UPDATE 不属于 `bump_memory_revision` 的语义字段，因此旧数据回填和“标记为已核对”不会增加 revision。

clean、旧库增量、历史四类回填、最新 Proposal 时间和 `COMMIT` 前失败注入均在 disposable local Supabase 验证。失败回滚后 enum、column、constraint、index 与成功 migration record 均无部分残留。

## 可信写入与旧版核对

服务端写入映射如下：

- 手动 CREATE → `MANUAL_ENTRY`
- 明确命令式保存 → `EXPLICIT_REQUEST`
- Proposal 接受或编辑后接受 → `PROPOSAL_ACCEPTANCE`
- 用户手动编辑正式 Memory → `MANUAL_REVIEW`
- 用户核对旧版 Memory → `LEGACY_UNREVIEWED` 原子改为 `MANUAL_REVIEW`

Proposal 的正式 Memory 写入、`resolvedMemoryId`、`resolvedAt` 与 `ACCEPTED` 状态继续处于同一个 Serializable 事务。Memory 的 `verifiedAt` 使用同一事务决定的 `resolvedAt/now`。

`markMemoryReviewedAction` 先校验 UUID，再使用当前服务端 `userId` 和 `LEGACY_UNREVIEWED` 条件执行 owner-scoped `updateMany`。重复请求返回幂等“已经核对”；跨用户 ID 返回与不存在相同的 `NOT_FOUND`。该操作不修改内容、来源、作用域、Persona、启停或置顶，不增加 revision，也不安排 Embedding 重建。

## 本轮引用 SSE 与 UI

`event: memory` 使用版本化最小 DTO：

```ts
type ChatMemoryDisclosure = {
  version: 1;
  count: number;
  items: Array<{
    id: string;
    content: string;
    category: string;
    scope: "GLOBAL" | "PERSONA";
    verificationMethod: MemoryVerificationMethod;
  }>;
};
```

`items` 直接从最终 `selectedMemories` 映射，不重新查询、不重新排名。它沿用最终召回的最多 8 条、总正文最多 2400 字符、enabled、owner 与当前 Persona 隔离。总开关关闭或零引用时不发送 `memory` event，也不显示空面板。

DTO 不包含 topicKey、keywords、相似度、确定性/RRF 分数、Embedding、来源 Message/Conversation、Proposal ID/confidence/reasonCode 或 Provider/模型诊断。Pending、Rejected、Expired、Cancelled Proposal 不属于正式 Memory，永远不能进入列表。

客户端 reducer 把 disclosure 绑定到产生本次回答的 Assistant Message。纯已核验列表显示“本轮参考了 N 条已确认记忆”；若包含 Legacy，则改为“本轮参考了 N 条正式记忆（含旧版未复核）”，并逐条警告其不代表用户已确认。展开项显示正文、类别、全局/当前 Persona 与统一 verification 标签。

服务端仅在 Assistant Message 已成功原子落为 `COMPLETE` 后发送 disclosure，并在 `done` 之前发送。用户中止、持久化冲突、Provider 错误或流式失败路径不会发送 disclosure；客户端也只为 `complete` Assistant Message 渲染该区域。

## 安全与真相源

正式 `Memory` 仍是确定性召回、Semantic Retrieval、Hybrid RRF、Prompt、Agent compact context、使用统计和 `MemoryEmbedding` 的唯一真相源。Proposal 状态机、TTL、容量、删除行为、MemoryEmbedding 权限和现有 Memory SELECT-own/server-write RLS 均不改变。

authenticated 浏览器只能 SELECT 自己的 verification 字段，没有 Memory UPDATE grant，不能伪造 `verificationMethod` 或 `verifiedAt`。服务端所有 mutation 显式携带当前 `userId`；模型 schema 会剥离或拒绝 verification 字段。

本阶段的实现与验证只使用一次性本地 Supabase 和合成用户。未连接或修改 Production，未执行 Production migration，未读取真实用户数据或密钥，也未修改 Production 环境变量。
