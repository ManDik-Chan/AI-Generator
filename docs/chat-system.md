# 基础聊天系统

## 功能边界

Phase 3 建立默认助手聊天基础；Phase 4A 增加可选 Persona 绑定；Phase 5A1 在成功回答后自动整理长期记忆。不包含任意历史消息编辑、对话分支、向量检索、文件、图片、搜索、语音、重新生成或模型选择 UI。

## 请求与持久化流程

1. `/api/chat` 使用 Supabase `getUser()` 验证身份。
2. Zod 校验消息类型、空白、UUID 与输入长度。
3. 按当前用户 UTC 当日 `USER` 消息数执行默认 50 次限制；`ADMIN` 不限。
4. 对话查询和删除始终同时包含 `conversationId` 与 `userId`。
5. 新对话标题由第一条消息去空白并截取 48 字符，不额外调用模型。
6. 用户消息写为 `COMPLETE`，助手消息先写为 `PENDING`。
7. 上下文只选择未被替代的完整问答轮次：用户与紧随其后的非空 `COMPLETE` 助手消息必须成对出现；`PENDING`、`ERROR`、空回复和孤立消息均不进入下一轮。
8. 最近完整轮次按最多 20 条、24,000 字符预算从新到旧选择，预算不足时整轮丢弃，不拆开问答；本轮新用户消息只追加一次。
9. Provider 文本增量通过统一 SSE 返回浏览器；不会逐 token 写数据库。
10. 正常结束写入完整内容和 `COMPLETE`；失败写 `ERROR`；主动停止有部分内容时写 `COMPLETE`，否则写 `ERROR`。

## Persona 对话绑定

- 新对话请求可携带当前用户的 active `personaId`；服务端验证 UUID、所有者和 `archivedAt IS NULL` 后写入 `Conversation.personaId`。
- 已有对话只从数据库关系读取 Persona，请求同时携带 `conversationId` 与 `personaId` 会被拒绝，不能通过客户端切换人格。
- 已归档 Persona 不能创建新对话，但已绑定它的历史对话仍可继续并显示“已归档”。
- Persona 不存在时安全回退默认助手；日志不包含完整 Prompt。
- greeting 只显示在空聊天页面，不写入 Message，也不进入模型上下文。
- 最终 system message 由服务端基础安全规则、人格字段、高级补充指令和输出约束组成，不把人格内容拼入用户消息。

## 最后一条用户消息编辑

- 仅当前对话最后一条未被替代的 `USER` 消息显示编辑入口；生成中点击编辑会先中止当前浏览器流。
- 服务端要求 `conversationId` 与 `editMessageId` 同时提供，并再次验证用户所有权、消息角色和“最后一条有效用户消息”约束。
- Serializable 事务把目标消息及其后仍有效的消息写入 `superseded_at`，再新增用户消息与 `PENDING` 助手消息；历史版本不覆盖、不删除。
- 编辑第一条有效用户消息会同步更新本地标题，编辑后续消息不改标题。
- 同一消息在两个页面并发编辑时，后提交者收到 `409`：“对话内容已发生变化，请刷新后重试。”
- 助手流只可把 `PENDING` 且 `superseded_at IS NULL` 的记录收尾，已被编辑替代的旧流无法迟到覆盖。
- 每日配额统计全部 `USER` 消息（包括被替代版本），因此每次编辑重提都会消耗一次额度。
- 客户端明确区分 `user-…`/`assistant-…` 临时 ID 与 `turn` 确认后的数据库 UUID；临时 ID 永远不会作为 `editMessageId` 发送。
- 慢网络下若停止编辑发生在 `turn` 前，客户端等待带对话版本的 `conversation` 事件后使用 `editLastMessage=true`；服务端在 Serializable 事务中校验所有权、对话版本和最后一个 active USER。其他标签页已改变对话时返回 409，不会误改新的消息。
- Composer 的禁用原因独立表达：真正缺少 AI 配置时显示“AI 服务尚未配置”，内联编辑时显示“正在编辑上一条消息”，取消编辑后保留并恢复原草稿。

用户消息持久化后，即使 Provider 失败也会保留。数据库与 Provider 错误会转换成可理解的中文提示，不向浏览器返回内部结构。

## 本项目 SSE

```text
event: conversation
data: {"conversationId":"...","updatedAt":"2026-07-12T12:00:00.000Z"}

event: turn
data: {"conversationId":"...","userMessageId":"...","assistantMessageId":"...","editedMessageId":"..."}

event: memory
data: {"count":2}

event: delta
data: {"text":"..."}

event: done
data: {"messageId":"..."}

event: error
data: {"message":"..."}
```

浏览器不解析 GLM/OpenAI 原始响应。

## 长期记忆注入

- 只有用户总开关开启时，聊天才查询当前用户启用的 GLOBAL 记忆和当前 Conversation Persona 对应的 PERSONA 记忆。
- 召回为本地确定性排序，默认最多 8 条、总内容最多 2,400 字符；没有 Embedding、向量数据库或额外 AI 请求。
- 记忆按不可信数据进行 XML 转义并放入服务端 system message，不能作为系统指令执行，也不能覆盖当前用户消息与 Persona 安全边界。
- 召回异常会记录不含记忆内容的结构化警告并继续无记忆聊天。
- `memory` SSE 仅返回使用条数；助手消息可显示“已参考 N 条长期记忆”，但浏览器不会收到记忆 ID、类别、重要程度或原始召回列表。
- 只有 Provider 正常完成且助手消息持久化为 COMPLETE 后才更新所选记忆的 `lastUsedAt`。
- `done` 发出后通过 Next.js `after` 安排单次自动提取；停止、Provider ERROR、superseded 消息或总开关关闭时不安排。
- 新对话收到 `conversationId` 后使用 `window.history.replaceState` 浅更新 URL；每轮结束不调用 App Router refresh/replace，不重新挂载 ChatLayout。

## Markdown 安全

- AI 内容由 `react-markdown` 与 GFM 解析，不启用原始 HTML。
- 不使用 `dangerouslySetInnerHTML`。
- 外部链接使用新窗口和 `noopener noreferrer`。
- 代码高亮由轻量、安全的 React token span 实现，代码块可滚动和复制。
- 用户消息始终按纯文本显示。

## 时间与成本边界

- “每日”以 UTC 00:00–24:00 为边界，文案会明确提示 UTC 次日恢复。
- 默认输入上限 8,000 字符、输出 4,096 tokens、20 条上下文、24,000 上下文字符。
- 不做 token 精确计费、自动摘要、向量检索或额外标题模型调用。

## 无 AI 配置

应用仍可安装、lint、typecheck 与 build。聊天页面显示管理员配置提示，输入被禁用；聊天 API 返回友好 503，不创建对话或消息，也不会返回通用 500。

## Phase 5A3-1 召回治理

- Memory content、keywords 和 topicKey 可读片段参与确定性匹配，keyword 命中高于普通内容双字词命中。
- pinned、importance、Persona、updatedAt、lastUsedAt 和封顶的对数 useCount 提供稳定加权，但不能绕过 enabled、scope 或预算。
- “你记得我什么”等概览意图可选择置顶、高重要性、最近更新或最近使用的记忆。
- 同一非空 topicKey 每轮最多注入一条；topicKey 为空时按规范化内容抑制重复。
- 助手成功 COMPLETE 后，仅对实际注入项原子增加 useCount 并更新 lastUsedAt；停止和 ERROR 不更新。
