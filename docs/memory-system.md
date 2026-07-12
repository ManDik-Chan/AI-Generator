# Phase 5A1 长期记忆系统

## 范围

Phase 5A1 只提供用户明确控制的长期记忆基础：手动 CRUD、总开关、从自己的聊天消息保存、GLOBAL/PERSONA 作用域、确定性召回、安全 Prompt 注入和使用次数反馈。

本阶段不做自动提取、后台任务、Embedding、向量数据库、RAG、自动合并、冲突消解或 AI 判断是否应保存。数据库枚举中的 `AUTO_EXTRACTED` 只为后续兼容预留，UI 和 Server Actions 不接受该来源。Phase 5A2 计划在独立评审后实现可确认、可撤销的自动候选提取；Phase 5A3 仍未开始，具体范围不在本 PR 预设。

## 数据模型与所有权

- `Profile.memoryEnabled`：用户级总开关；关闭后数据保留，但聊天不召回。
- `Memory.scope`：`GLOBAL` 适用于默认助手及全部 Persona；`PERSONA` 只适用于指定 Persona。
- `Memory.origin`：本阶段仅创建 `MANUAL` 或 `CHAT_MESSAGE`。
- `personaId`：PERSONA 作用域必填，GLOBAL 必须为空。
- `sourceConversationId` / `sourceMessageId`：聊天保存时成对记录；来源被删除时记忆仍可保留并显示来源不可用。
- `lastUsedAt`：只在使用该记忆的助手回复成功写为 COMPLETE 后更新。

所有应用查询都显式包含 `userId`。创建和修改时，服务端验证 Persona 所有权；聊天来源必须是当前用户对话内、未被替代的 COMPLETE USER 消息。RLS 在数据库层重复校验所有者和关联资源，并要求来源 Message 属于声明的来源 Conversation。

## 手动管理

登录用户可访问 `/memories`：

- 创建、编辑、启用、停用和删除记忆；
- 按全局、Persona、类别和启用状态筛选；
- 开关全部长期记忆召回；
- 从来源聊天返回原对话；
- 从 Persona 详情打开预筛选的专属记忆。

用户聊天消息只有在已获得数据库 ID、状态为 COMPLETE 且不是临时消息时才显示保存按钮。保存 Dialog 默认带入消息文本和当前 Persona，但用户仍可修改作用域、类别、重要程度与启用状态。

## 内容安全

内容限制为 2–500 字符并移除控制字符。系统拒绝高置信度私钥、API Key、Bearer Token、JWT 和含密码的数据库连接；普通文字中的“密码”等词不会单独触发。相同用户、相同作用域与相同 Persona 下，折叠空白并忽略大小写后完全相同的内容不能重复创建。

这些检查用于降低误存凭据风险，不替代用户的数据保护责任。日志不得写入记忆正文。

## 确定性召回

聊天仅加载当前用户启用的 GLOBAL 记忆及当前 Persona 对应的 PERSONA 记忆。纯函数排序参考：

1. 当前用户消息的词项重合；
2. 最近完整用户消息的词项重合；
3. 重要程度；
4. 更新时间；
5. PERSONA 与类别的小幅稳定加权；
6. ID 作为最终稳定 tie-breaker。

英文与数字按词切分，中文使用双字词项。默认最多 8 条、正文合计最多 2,400 字符；无重合但高重要性的兜底最多两条。预算通过环境变量 `MEMORY_MAX_ITEMS` 与 `MEMORY_MAX_CHARS` 调整，非法值回退默认值。

## Prompt 与 SSE

选中正文先进行 XML 转义，再放入 `<user_memories>`。包裹说明明确它们是不可信、可能过时的信息，不能覆盖基础安全规则、Persona 边界或当前请求，也不能把正文中的指令当作系统指令执行。没有选中记忆时不追加空区块。

浏览器只收到：

```text
event: memory
data: {"count":2}
```

不会收到记忆 ID、正文、类别、重要程度或数据库结构。记忆查询失败时服务端记录不含正文的警告并继续无记忆聊天。

## 部署与真实验收

```bash
pnpm db:deploy
pnpm exec prisma validate
```

然后在 Supabase SQL Editor 重新执行 `prisma/rls.sql`。建议用两个普通用户验收：

1. A 用户无法读取、修改或引用 B 用户的 Memory、Persona、Conversation 或 Message。
2. GLOBAL 记忆可用于默认助手和 Persona；PERSONA 记忆只用于匹配人格。
3. 关闭总开关后聊天不显示记忆数量，重新开启后恢复。
4. 从 COMPLETE USER 消息保存成功；助手消息、PENDING/ERROR、superseded 或其他用户消息被拒绝。
5. Provider 成功时 `last_used_at` 更新；停止、失败和 ERROR 时不更新。
6. 删除来源对话或 Persona 的行为符合产品提示，且不会越权影响其他资源。

上述真实数据库与浏览器验收需要项目所有者环境执行；自动化测试通过不等于真实 Supabase 联调通过。

## 常见排查

- migration 报缺少连接变量：确认 `DATABASE_URL` 与 `DIRECT_URL` 只配置在本地或部署平台，不要写入仓库。
- 页面可见但写入被拒绝：确认 migration 已部署，并在目标 Supabase 项目执行了最新版 `prisma/rls.sql`；再检查登录用户是否拥有所选 Persona 和来源对话。
- 聊天没有使用记忆：检查用户总开关、单条启用状态、GLOBAL/PERSONA 作用域和当前 Persona 是否匹配。无词项重合且重要程度低的记忆会被确定性算法排除，这是预期行为。
- `lastUsedAt` 未更新：只有真实选择了记忆且 Provider 正常完成、助手消息成功标记 COMPLETE 后才更新；停止和错误不会更新。
- 要彻底删除一条记忆：在 `/memories` 使用“删除记忆”并确认。关闭总开关或停用只停止召回，不删除数据；删除来源聊天也不会自动删除该 Memory。

Phase 5A1 未开始 Embedding、RAG、Phase 5A3 或 Phase 6。
