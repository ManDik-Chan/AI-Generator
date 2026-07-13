# Phase 6A1 通用文本工具系统

## 范围

本阶段提供 `/tools`、`/tools/summarize`、`/tools/rewrite`、`/tools/translate` 与 `/tools/history`。只处理用户直接输入的文本，不上传或解析 PDF/DOCX/PPTX/图片，不做 OCR、网页抓取、搜索、文件/网页 RAG、医疗诊断、法律咨询、旅行规划或图片生成。Phase 6A2 与 Phase 7 未开始。

## 运行架构

三个工具统一调用 `POST /api/tools/run`。Route Handler 认证用户、用严格 Zod Schema 过滤工具与选项、在 Serializable 事务内检查 UTC 每日次数并创建 PENDING `ToolRun`，随后只调用一次现有 OpenAI-compatible `streamText`。工具显式传递 `thinking: disabled`，不需要 reasoning_content。

应用向浏览器发送 `start`、`delta`、`done`、`error` SSE；供应商原始 SSE 仅由共享 Provider 解析。浏览器可中断 AbortController，并向当前用户所有的 cancel route 发送取消意图。终态更新包含 `status=PENDING` 条件，所以 CANCELLED 后的迟到流不能写回 COMPLETE。页面保留已收到的部分文本，不使用全屏 loading 或 `router.refresh()`。

## ToolRun 与隐私

`ToolRun` 保存用户、工具类型、PENDING/COMPLETE/ERROR/CANCELLED、白名单 options、可选标题/输入/输出、安全 errorCode 与时间。输入最多 20,000 字符，输出最多 40,000 字符，标题最多 100 字符；Profile 删除会 Cascade。

“保存到工具历史”默认开启。关闭后数据库仍保留次数与故障诊断所需的最小元数据，但 title/inputText/outputText 均为 null，记录不会出现在普通历史中。服务端日志不记录输入、输出、Prompt、Key、Cookie 或服务商正文。工具内容不创建 Conversation/Message，不读取长期记忆、不写入 Memory、不绑定 Persona，也不触发自动记忆。

## 三个工具与 Prompt 边界

- 总结：白名单映射简短/标准/详细、段落/要点/学习笔记、跟随原文/中文/英文；要求忠实、不补充事实。
- 改写：白名单映射五种风格、三种强度和 Markdown/长度/修改说明；保持事实与不确定性，代码块默认不改。
- 翻译：白名单映射七种目标语言、源语言检测、四种语气及格式/专名/原文选项；保护数字、型号、日期、URL、Markdown 链接地址和代码块。

当前实现使用权限分层：工具类型、白名单选项、任务规则与输出契约全部位于 system message；user message 只包含由 `JSON.stringify` 生成的 `{ "data_type": "untrusted_user_supplied_text", "content": "..." }`。JSON、XML、Markdown、代码块、伪造 role/system/developer 字段和角色切换声明都只能留在 content 数据字段，XML 标签不再是唯一边界；客户端不能提交 systemPrompt、messages、role、prompt、data_type 或任意 Prompt。工具不泄露系统 Prompt、不输出内部分析、不声称访问未提供的文件或网页、不编造来源。

输出在发送 SSE 前经过有限滚动缓冲守卫；只有非常明确的 Authorization Bearer、带密码数据库连接、声称展示完整 system prompt 或真实 API Key 模式会触发 `UNSAFE_OUTPUT`，守卫不会记录原文或完整输出。

## 历史、次数与恢复

历史按用户、retainContent=true、createdAt 倒序查询，每页最多 20 条，可按工具筛选、打开、复制、继续编辑和二次确认删除。打开不重新调用模型；继续编辑通过 sessionStorage 传递正文与选项，不把长文本放入 URL。

`AI_DAILY_TOOL_LIMIT` 默认 30。PENDING、COMPLETE、ERROR、CANCELLED 都计数；非法输入不创建记录。普通用户受限，ADMIN 沿用聊天策略免于普通限制。工具次数不计入聊天消息，Embedding 也不计入工具次数。超过 15 分钟的 PENDING 在历史查询前恢复为 ERROR/TIMEOUT。

## 配置与错误

`AI_TOOL_MODEL` 为空时回退 `AI_MODEL`，API Key/Base URL 复用现有配置。温度、token、超时和次数均由服务端范围校验。错误对外归一为 CONFIGURATION、AUTHENTICATION、RATE_LIMITED、DAILY_LIMIT、INVALID_INPUT、TIMEOUT、PROVIDER_ERROR、EMPTY_RESPONSE、CANCELLED 或 UNKNOWN；不返回服务商正文。

## 项目所有者真实验收

项目所有者已确认 `20260713190000_add_tool_runs` 与最新版 RLS 成功部署。真实 GLM-5.2 的总结全部长度/形式、五种改写风格和多语言翻译通过；Markdown、URL、型号、数字与代码块保持正常。

SSE、停止后保留部分结果、CANCELLED 持久化与迟到流保护通过；复制、TXT/Markdown 下载、历史保存与关闭保存、筛选、打开、继续编辑、复制和删除均通过。UTC 每日工具限额、导航 active 状态、390px/430px/768px/1440px、无全屏 loading/整页刷新，以及聊天、人格、头像和长期记忆回归均通过。

真实 GLM-5.2 Prompt 注入复验通过：总结继续总结攻击内容，改写只改写命令文本，翻译只翻译命令文本；XML/JSON/伪造角色不能逃逸 JSON 数据边界，未泄露或编造系统信息、密钥、数据库凭据、环境变量或隐藏分析。普通讨论 Prompt 注入的安全文章不会被输出守卫误拦截。本文档不保存真实测试正文或模型原始输出。

Phase 6A1 已完成真实验收。工具仍不创建 Conversation/Message、不读取或写入长期记忆、不绑定 Persona；不包含文件上传、OCR、文件解析或 RAG。Phase 6A2 与 Phase 7 未开始。
# Phase 6A2 扩展

图片分析复用 ToolRun 的 SSE/取消/终态保护，但文件先经服务端净化，再创建计费运行。资源使用独立 ToolAsset 与 private Storage，不进入 JSON 历史。视觉次数独立于文本工具与聊天次数。详细安全、部署和验收见 `image-understanding-tool.md`。
