# Phase 5B1：可信长期记忆提案层

## 核心边界

`MemoryProposal` 是模型建议，不是已保存的长期记忆。普通隐式自动提取只能创建 `PENDING` Proposal；在用户确认前，它不会：

- 进入聊天 Prompt、Persona Prompt 或 Agent compact context；
- 参与确定性、语义或 Hybrid RRF 召回；
- 增加正式 Memory 数量、`useCount` 或 `lastUsedAt`；
- 创建 `MemoryEmbedding` 或进入向量回填；
- 覆盖、停用或删除任何正式 Memory。

正式 `Memory` 仍是召回的唯一真相源。只有明确面向助手的命令式“请记住、以后请记得、别忘了、把……记下来”支持即时正式保存；疑问、否定、自述、第三方引用和无法可靠分类的表达一律进入 Proposal。即时保存与 Proposal 接受共用 `persistTrustedMemoryChange` 的 Schema、凭据检测、所有权、容量、精确去重和 Serializable 事务边界。所有 CREATE 先锁 Profile 行，再在同一事务执行容量 count 与 INSERT。

本阶段不包含文件、网页或图片 RAG，不向量化 Message，不增加外部 Provider，不提供批量接受，也不包含 Browser、Shell、Git、MCP 或 Vibe Coding。

## 数据模型

独立 migration：`20260724120000_add_trusted_memory_proposals`。

`MemoryProposal` 保存：

- owner、GLOBAL/PERSONA 作用域和 Persona；
- CREATE/UPDATE 动作与 PENDING/ACCEPTED/REJECTED/EXPIRED/CANCELLED 状态；
- UPDATE 的 `targetMemoryId`、创建建议时的 `targetMemoryUpdatedAt` 与 `targetMemoryRevision`；
- 建议内容、类别、重要度、`topicKey`、`keywords`、置信度和原因码；
- 来源 Conversation 与 USER Message；
- 接受后的 `resolvedMemoryId`、`resolvedAt`；
- 30 天到期时间；
- 服务端 SHA-256 重放 `dedupeKey` 与拒绝抑制 `suppressionKey`。

`(userId, dedupeKey)` 唯一。重放指纹包含来源 USER Message、动作、作用域/Persona、目标 Memory 版本或 topic、NFKC/大小写/空白/标点规范化 content 和稳定排序 keywords，因此相同后台任务不会重复写入，不同事实仍可来自同一消息。`suppressionKey` 不含 sourceMessageId；用户拒绝后 30 天内，后续消息的等价建议也被抑制。同批模型输出会在 INSERT 前再次去重。

Profile 删除 Cascade Proposal。来源 Conversation/Message 删除时只由复合 FK 的受控 `SET NULL` 清除来源。Persona 继续使用所有权复合 FK 和 Restrict。目标与最终 resolved Memory 使用只清空 Memory ID 的复合所有权 FK：删除目标会先把仍为 PENDING 的 UPDATE Proposal 原子转为 CANCELLED，再将 `targetMemoryId` 置空；删除已接受的正式 Memory 会将 `resolvedMemoryId` 置空，但 Proposal 保持 ACCEPTED 审计状态。

数据库复合 FK 永久保证 Proposal 与 Persona、Conversation、Message、目标 Memory、最终 Memory 属于同一用户。`validate_memory_proposal` 额外要求 INSERT 来源是同一 Conversation 中 role=USER、status=COMPLETE、未 superseded 的 Message，目标 scope/Persona 和 revision 快照一致，并禁止普通 UPDATE 替换来源或目标快照。聊天正常编辑把来源 USER Message 写为 superseded 时，同一数据库事务自动取消其 PENDING Proposal；已处理 Proposal 保留来源审计。普通 UPDATE 仍不能替换或伪造来源。`bump_memory_revision` 在正式 Memory 的语义字段变化时由数据库单调递增版本，并拒绝单独伪造 revision。

数据库只允许新 Proposal 为 PENDING，随后单向进入 ACCEPTED、REJECTED、EXPIRED 或 CANCELLED。转入 ACCEPTED 时必须写入同 owner `resolvedMemoryId`；正式 Memory 后续被用户删除时，该 ID 可由 FK 置空而 ACCEPTED 审计状态保持不变。其他终态禁止有 resolution Memory。`resolvedAt` 不得早于 `createdAt`，`expiresAt` 必须等于 `createdAt + 30 days`（仅允许数据库时间精度误差）。

## 自动提取

`extractAndPersistMemoryProposals` 保留既有 eligibility、总开关、USER/ASSISTANT COMPLETE、superseded、Provider、JSON Repair、置信度、原因码、凭据检测、USER 证据、Persona 映射、候选白名单、topic 和 keywords 校验。

普通隐式事实在 Serializable 事务中只执行 `memoryProposal.createMany({ skipDuplicates: true })`。CREATE 在建议创建时命中当前正式 Memory 的同一 topic，才转换为带 `updatedAt + revision` 快照的 UPDATE，用户可以看到当前目标与建议内容对照。

明确记忆请求仍在同一个后台完成链路中调用可信正式写入函数；事务提交后，Route 才对返回的正式 Memory ID 安排 embedding 同步。隐式 Proposal 返回空 `memoryIds`，因此不会调用 embedding 生命周期。

SSE `done` 先发送，提取失败只记录 requestId、owner/source ID、阶段与错误类型等脱敏诊断，不记录 Prompt、用户正文、模型输出或密钥。

## 可信服务端操作

Server Actions：

- `acceptMemoryProposalAction`
- `acceptEditedMemoryProposalAction`
- `rejectMemoryProposalAction`

所有查询和写入均显式带当前 `userId`，不能只依赖 RLS。

### 接受 CREATE

事务内重新检查 PENDING、到期时间、总开关、编辑内容 Schema、凭据、Persona/来源所有权、容量、精确重复和 topic 治理。成功创建正式 Memory，或按既有治理更新同 topic Memory，然后原子写入 ACCEPTED、`resolvedMemoryId` 与 `resolvedAt`。重复点击返回已有结果，不重复写入。

### 接受 UPDATE

事务内要求目标存在、属于当前用户、仍启用、scope/Persona 一致，并且当前 `revision` 与 Proposal 快照完全相同。`updatedAt` 保留为审计快照，不再承担跨 JavaScript/PostgreSQL 精度的唯一并发判断。任何手动编辑、启停或并发变化都会返回：

> 原记忆已发生变化，请重新检查后再确认。

Proposal 保持 PENDING。若目标被用户删除，数据库会原子转为 CANCELLED 并清空目标 ID，绝不降级为 CREATE，也不能重新接受或恢复 Memory。

### 编辑后接受

浏览器只能提交 content、category、scope、personaId、importance、topicKey、keywords。Zod 使用 strict object 拒绝 userId、action、status、来源、置信度、快照或 resolution 字段伪造；编辑结果重新经过完整正式写入验证。

### 拒绝与过期

只有 owner 的 PENDING Proposal 能原子变为 REJECTED；重复拒绝幂等。拒绝不修改正式 Memory，也不创建 embedding。超过 `expiresAt` 的 Proposal 会在处理时变为 EXPIRED，不能接受。

总开关关闭后仍可查看或拒绝 Proposal，但禁止接受，提示先开启长期记忆。

## RLS 与权限

`memory_proposals` 启用 RLS。`authenticated` 仅获得 SELECT，并只能读取 `user_id = auth.uid()`：

- 无 INSERT policy/grant；
- 无 UPDATE policy/grant；
- 无 DELETE policy/grant；
- 所有创建、接受、编辑后接受和拒绝均由可信服务端执行。

`prisma/rls.sql` 是灾难恢复基线，可在所有 versioned migrations 应用后重复执行。migration 和基线都撤销 browser mutation privilege。

## 管理页

`/memories` 明确分为：

- “AI 建议记住”：待确认 Proposal；
- “已确认的正式记忆”：唯一召回真相源。

Proposal 卡片显示 CREATE/UPDATE、建议内容、类别、作用域、Persona、来源、创建/到期日期和友好置信度。UPDATE 在 390px/430px 等窄屏上下排列，`md` 起才使用两列。页面无批量接受；成功接受后 Proposal 从待确认区移除并出现在正式列表。

Pending Proposal 不计入容量，不显示语义索引状态。

## migration 顺序与环境

全新 disposable PostgreSQL/Supabase 按目录顺序执行所有 migration。旧库从最后已部署 migration 前滚到：

1. `20260722120000_security_hardening_rls_usage`
2. `20260722160000_strengthen_usage_idempotency`
3. `20260724120000_add_trusted_memory_proposals`
4. 可选重复执行最新 `prisma/rls.sql` 恢复安全基线

不得修改已经执行过的 migration。数据库验收只允许 disposable、明确标记为非 Production 的环境；缺少该环境时，普通单元测试可明确 skipped，Security Acceptance 必须 fail-closed。

本实现未连接或修改 Production，未读取真实用户数据或真实密钥。
