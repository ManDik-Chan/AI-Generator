# Phase 5A1 自动长期记忆

## 产品范围

用户只需自然聊天。当前 USER 与 ASSISTANT 消息都成功持久化为 COMPLETE 后，系统在响应结束后判断这一轮是否包含长期有用的信息，并执行 CREATE、UPDATE 或 IGNORE。`/memories` 是用户查看、修改、停用和删除 AI 记忆的控制页；手动添加保留在“更多操作”中作为高级补救入口。

Phase 5A1 不做 Embedding、向量数据库、RAG、后台队列、定时任务或多用户共享。后续 Phase 5A3-1 已完成，但仍未引入 Embedding、向量数据库或 RAG。

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

项目所有者已于 2026-07-13 完成真实本地验收：

- Supabase migration：通过。
- 最新 RLS 脚本重复执行：通过。
- GLM-5.2 自动 CREATE：通过。
- 明确记忆请求：通过。
- PREVIOUS_CONTEXT 从当前对话更早 USER 消息提取事实：通过。
- 自动记忆后台任务不阻塞聊天：通过。
- `/memories` 查看、总开关、编辑、停用和删除：通过。
- 助手不再虚假承诺已经保存成功：通过。
- 新对话 History API 浅更新 URL：通过。
- 聊天无全屏 loading：通过。

Phase 5A1 已完成。没有 Embedding、向量数据库或 RAG。

## Phase 5A3-1：召回质量与容量治理

- `topicKey` 是服务端验证的稳定主题键；同一用户、scope、Persona 下同主题 CREATE 自动转 UPDATE。不同 Persona 或 GLOBAL/PERSONA 不互相覆盖。
- `keywords` 由模型建议并经 trim、去重、数量/长度与凭据校验，帮助“CPU”等表达召回完整电脑配置。
- 召回综合 content、keywords、topic、近期 USER、importance、pinned、Persona、更新时间、最近使用和封顶 useCount；概览意图允许选择高价值记忆。
- 同一 topicKey 每轮最多一条，topicKey 为空按规范化内容抑制重复；仍严格限制 8 条 / 2400 字符。
- 成功 COMPLETE 后只对实际注入项更新 lastUsedAt 并原子递增 useCount；停止、ERROR 和未注入项不更新。
- `/memories` 支持置顶、容量提示、从未/长期未使用/同主题重复筛选和多种排序。删除仍完全由用户确认，没有自动清理。
- `MEMORY_MAX_TOTAL` 默认 300；达到上限时 CREATE 拒绝、UPDATE 允许，不自动删除现有数据。

本阶段新增独立 `20260713110000_add_memory_governance` migration，不修改已部署的 Phase 5A1 migration。Phase 5A3-1 当时没有 Embedding、向量数据库或 RAG；后续 Phase 5A3-2 见下文。

## Phase 5A3-1 真实验收

项目所有者已于 2026-07-13 完成真实本地验收：

- Supabase migration `20260713110000_add_memory_governance`：部署通过。
- `topicKey`、`keywords`、`pinned`、`useCount` 字段：通过。
- GLM-5.2 自动记忆 CREATE 与关键词召回：通过；“我用的 CPU 是什么”可召回完整电脑配置。
- 同一对话第二次自动记忆 UPDATE：通过；RTX 5070 Ti 更新为 RTX 5080 时原 Memory ID 不变，CPU、显示器和 `topicKey` 保留，`keywords` 与 `sourceMessageId` 正确更新，不创建重复主题。
- 自动记忆与 JSON Repair 的 `thinking: disabled`：真实有效；不再出现 reasoning-only 导致的 `EMPTY_RESPONSE`。
- 置顶、取消置顶、`useCount`、`lastUsedAt`：通过；停止生成不增加使用统计。
- 容量治理：达到上限时拒绝 CREATE、允许 UPDATE，通过。
- `/memories` 响应式管理页面：通过。
- 聊天流式输出、History API 浅 URL 更新和无全屏 loading：无回归。
- 未提交 `.env`、API Key、Service Role Key 或数据库密码。

Phase 5A3-1 已完成。

## Phase 5A3-2：混合语义召回

- 原确定性排序始终保留为基础和失败兜底；语义层不会取代可信的关键词直匹配。
- Memory 的 content、category、topic 可读片段和去重 keywords 形成固定文本，并用 SHA-256 `contentHash` 判断向量是否过期。ID、所有权、来源、置顶和使用统计不进入 Embedding 文本。
- `memory_embeddings` 独立保存当前用户的 model、固定 512 维、hash 和向量；Memory/Profile 删除均 Cascade，停用只停止查询。
- 自动 CREATE/UPDATE、手动创建/编辑和重新启用后在响应完成后后台同步；hash/model/dimensions 未变化不重复调用。
- `adaptive` 只在有可用向量且确定性结果不足/无直接匹配/存在记忆意图时生成一次 query embedding；`off` 纯关键词，`always` 用于测试。
- 语义 SQL 按当前 userId、enabled、GLOBAL/当前 Persona、模型、维度、阈值过滤，默认最多 20 个候选并按余弦相似度稳定排序。
- Hybrid RRF 使用确定性 1.0、语义 0.9，并保留 pinned、importance、Persona 和稳定类别轻量加权；最后仍执行 topic 去重、8 条 / 2400 字符完整条目预算。
- Provider 配置/认证/模型/限流/超时/响应维度或 pgvector 查询失败只记录安全诊断并回退确定性结果，聊天、自动记忆和无刷新流程不受影响。
- 管理页只显示索引数量、待建立数量、模型和维度；不显示向量或相似度。

启用语义召回时，Memory 整理文本和当前问题可能发送到配置的 Embedding Provider；向量只保存在当前项目数据库，不返回浏览器、不与其他用户共享。总开关关闭时不召回、不生成 query embedding、不自动提取。删除 Memory 会同步 Cascade 删除向量。

本阶段不是外部文件 RAG：不向量化 Message，不抓取网页，不建立文件知识库，也不自动删除或批量合并历史记忆。

## Phase 5A3-2 真实验收

项目所有者已于 2026-07-13 确认 Supabase migration/vector extension、Embedding-3 512 维回填、不同表达语义召回、确定性 + `topicKey` / `keywords` + Hybrid RRF、Memory 更新后向量重建、contentHash、用户/Persona 隔离、Cascade 删除和配置失败安全降级全部通过。回填结果为 scanned 1、generated 1、failed 0。

“中央处理单元”“设备核心硬件”“负责图形运算的部件”等表达分别成功召回 CPU、完整电脑配置和显卡。390px、430px、1440px 页面与聊天流式、浅 URL、无整页刷新/全屏 loading 均通过。Phase 5A3-2 已完成；没有文件/网页 RAG 或 Message 全文向量化，Phase 6 未开始。
