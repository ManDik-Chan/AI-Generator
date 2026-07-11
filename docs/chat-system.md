# 基础聊天系统

## 功能边界

Phase 3 仅提供默认助手：新建、多轮流式聊天、历史、删除、Markdown、代码块、停止生成和持久化。不包含人格、记忆、文件、图片、搜索、语音、重新生成或模型选择 UI。

## 请求与持久化流程

1. `/api/chat` 使用 Supabase `getUser()` 验证身份。
2. Zod 校验消息类型、空白、UUID 与输入长度。
3. 按当前用户 UTC 当日 `USER` 消息数执行默认 50 次限制；`ADMIN` 不限。
4. 对话查询和删除始终同时包含 `conversationId` 与 `userId`。
5. 新对话标题由第一条消息去空白并截取 48 字符，不额外调用模型。
6. 用户消息写为 `COMPLETE`，助手消息先写为 `PENDING`。
7. 最近最多 20 条完成消息按 24,000 字符预算选择，优先保留最新内容。
8. Provider 文本增量通过统一 SSE 返回浏览器；不会逐 token 写数据库。
9. 正常结束写入完整内容和 `COMPLETE`；失败写 `ERROR`；主动停止有部分内容时写 `COMPLETE`，否则写 `ERROR`。

用户消息持久化后，即使 Provider 失败也会保留。数据库与 Provider 错误会转换成可理解的中文提示，不向浏览器返回内部结构。

## 本项目 SSE

```text
event: conversation
data: {"conversationId":"..."}

event: delta
data: {"text":"..."}

event: done
data: {"messageId":"..."}

event: error
data: {"message":"..."}
```

浏览器不解析 GLM/OpenAI 原始响应。

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
