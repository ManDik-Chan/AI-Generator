# Phase 5A1 自动长期记忆

## 产品范围

用户只需自然聊天。当前 USER 与 ASSISTANT 消息都成功持久化为 COMPLETE 后，系统在响应结束后判断这一轮是否包含长期有用的信息，并执行 CREATE、UPDATE 或 IGNORE。`/memories` 是用户查看、修改、停用和删除 AI 记忆的控制页；手动添加保留在“更多操作”中作为高级补救入口。

本阶段不做 Embedding、向量数据库、RAG、后台队列、定时任务或多用户共享，也没有开始 Phase 5A3 或 Phase 6。

## 非阻塞流程

1. 聊天按原协议持久化 USER 与 PENDING ASSISTANT，并流式返回 delta。
2. Provider 正常结束后将 ASSISTANT 写为 COMPLETE。
3. 立即发送 SSE `done`；客户端将消息设为 complete，`finally` 恢复 Composer。
4. Route Handler 使用 Next.js `after` 注册 `extractAndPersistMemories`。
5. 后台任务自行捕获错误，只记录 requestId、userId、conversationId、sourceMessageId 和 errorCode。

停止生成、Provider ERROR、助手未成功 COMPLETE、来源 USER 被 supersede 或 `Profile.memoryEnabled=false` 时不会提取。简单问候、感谢、确认语和纯标点由本地规则过滤，不产生模型费用。每轮只有一次业务提取，不对 Provider 错误自动重试；仅 JSON 解析失败可追加一次格式修复请求。

明确的“记住 / 请记住 / 帮我记住 / 以后记得 / 记下来 / 别忘了”会分类为 INLINE_FACT 或 PREVIOUS_CONTEXT。普通提取仍只使用少量近期轮次；明确请求会额外查询当前用户、当前对话最近 30 条有效消息，并最多提供 15 条历史 USER 消息。电脑配置等同一主题应合并为一条记忆；用户确认 assistant 总结时，所有事实仍必须能追溯到更早 USER 消息。

## 模型协议与成本

继续使用 OpenAI-compatible Provider：

```env
AI_MEMORY_MODEL=
AI_MEMORY_TEMPERATURE=0.1
AI_MEMORY_MAX_OUTPUT_TOKENS=1000
AI_MEMORY_REQUEST_TIMEOUT_MS=90000
```

模型为空时回退 `AI_MODEL`。输入仅包含当前 USER、当前 ASSISTANT（只用于语境）、最近最多四个完整轮次、当前 Persona 身份和最多 20 条当前用户候选记忆。候选只公开 id、content、category、scope。

模型输出优先按纯 JSON 解析，也兼容 `json`/普通代码块及前后少量说明中的首个完整 JSON 对象，之后始终通过同一 Zod Schema。首次解析失败时只允许一次低温度 JSON 修复请求；不因其他错误重试，修复失败由 `after` 安全记录且不影响聊天。

后台诊断区分 eligibility、load_context、provider_request、provider_response、parse、repair_request、validate 和 persist。AiProviderError 日志保留 code 与 HTTP status，但不记录错误正文、用户消息、Memory、Prompt、模型输出、Key、Cookie 或 URL query。专用 memory model 404 时仅回退主模型一次；429 最多等待 2 秒重试一次；认证和超时不重试。若流在 INVALID_RESPONSE 前已有文本，继续进入 JSON 解析；完全空响应安全失败。

HTTP 400 单独映射为 `INVALID_REQUEST`，不会回退、重试、进入 JSON Repair 或写入 Memory。Provider 只从常见 JSON error 结构提取服务商 code 和最多 200 字符的脱敏 message；浏览器仍只得到通用中文错误，不接收服务商正文。

输出为最多三项严格 JSON operation：

- CREATE：没有对应候选的稳定事实；
- UPDATE：只能引用服务端候选白名单中的现有 ID；
- IGNORE：临时、不确定、敏感、重复或无长期价值内容。

只有 confidence >= 0.85 才可能写入。Zod、类别、长度、importance、凭据检测、Persona 映射、候选白名单和所有权在服务端再次验证。模型不能控制 userId、personaId、enabled、origin、sourceConversationId 或 sourceMessageId；写入 origin 固定为 AUTO_EXTRACTED。

## 内容边界

适合记忆：稳定身份、长期偏好、目标、项目、限制、习惯，以及与当前 Persona 有长期意义的关系。问候、感谢、临时页面操作、一次性写作要求、作业答案、assistant 建议、模型推断、第三方信息和凭据必须忽略。assistant 回复只帮助理解用户话语，绝不能成为用户事实来源。

基础助手 Prompt 明确平台支持长期记忆：用户要求“记住”时不会再错误声称没有能力，也不会在后台写入完成前保证成功；若当前对话找不到明确事实，则询问用户具体需要记住什么。

Prompt 用 `<current_user_message>`、`<assistant_response context_only="true">`、`<existing_memories>` 等 XML 数据边界，并转义所有特殊字符。用户内容不能改变严格 JSON 协议。

为兼容 GLM-5.2 等 OpenAI-compatible 服务，提取请求固定包含两条消息：system 只承载判断政策、安全边界和 JSON Schema，最后一条 user 承载转义后的 `<current_user_message>`、`<grounded_user_context>`、context-only assistant 和候选记忆。JSON Repair 同样使用 system 修复政策 + 最后一条 user `<invalid_output>`，不再发送 system-only 请求。

## 幂等、事务与所有权

任务开始前检查相同 `sourceMessageId + AUTO_EXTRACTED`，事务内再次检查来源 USER 仍为 COMPLETE、未 superseded、属于当前用户且总开关仍开启。CREATE 先做规范化精确去重；UPDATE 必须属于本轮候选白名单和当前用户。写入使用 Serializable 事务，不自动重试，冲突或后台失败不会影响已完成聊天。

当前 Schema 已能使用 `sourceMessageId` 和 `origin` 实现写入幂等，因此没有新增 migration，也没有修改已部署的 `20260713010000_add_memory_foundation`。

RLS 在应用层之外校验 Memory 及关联 Persona、Conversation、Message 的所有权。`prisma/rls.sql` 中每个 policy 都先 drop，可以重复执行。

## 召回与透明度

召回仍为确定性算法：当前消息与近期 USER 词项、importance、更新时间、Persona 和类别加权；默认最多 8 条、正文最多 2400 字符，整条取舍。记忆作为 XML 转义的不可信数据注入，不能覆盖安全规则、Persona 或当前请求。

浏览器只收到 `event: memory` 的 count，并在助手消息下低调显示“已参考 N 条长期记忆”。后台提取结果本阶段静默保存，不引入轮询、WebSocket 或刷新。

## 管理与删除

`/memories` 标题为“AI 记住的内容”，显示来源中文、更新时间和最近使用时间。总开关“允许 AI 使用和更新记忆”同时控制召回与自动提取；关闭不会删除数据。编辑、停用、删除和来源对话链接继续可用，内部枚举不直接展示。

彻底删除需在该页点击删除并确认。停用或关闭总开关只停止使用；删除来源对话不会自动删除 Memory。

## 聊天无闪屏

此前每轮 SSE 结束后无条件 `router.refresh()`，新对话还执行 `router.replace()`，触发 `app/chat/loading.tsx` 全屏 fallback 并重新挂载 ChatLayout。现在新对话在 `conversation` SSE 后保存客户端 conversationId，并以 `window.history.replaceState` 浅更新 URL；后续发送使用该客户端 ID。回答结束不执行 App Router 导航或刷新，route-level 全屏 loading 已移除。

## 真实验收

项目所有者需验证稳定偏好自动 CREATE、后续明确修正 UPDATE 而不冲突、临时命令与“谢谢”不保存、总开关、停止/ERROR/editLastMessage/superseded、双用户 RLS，以及连续三轮聊天无闪屏。真实 GLM-5.2 自动提取和浏览器连续聊天在本 PR 自动验证完成时仍标记为待验收，不以 mock 测试替代。
