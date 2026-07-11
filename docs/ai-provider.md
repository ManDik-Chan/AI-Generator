# AI Provider 与 GLM-5.2 配置

## 架构

聊天业务依赖统一 `AiProvider.streamText()` 接口。当前只有 OpenAI-compatible 实现，使用原生 `fetch` 与标准 Chat Completions SSE：

```text
Chat API -> AiProvider -> OpenAI-compatible adapter -> configured service
```

页面、数据库和 `/api/chat` 不包含智谱或 OpenAI 专属字段。服务商原始 SSE 在适配层转换为纯文本增量，浏览器只解析本项目的 `conversation`、`delta`、`done` 和 `error` 事件。

## 环境变量

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_TEMPERATURE=0.7
AI_MAX_OUTPUT_TOKENS=4096
AI_DAILY_MESSAGE_LIMIT=50
AI_MAX_INPUT_CHARS=8000
AI_REQUEST_TIMEOUT_MS=120000
```

- `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 必填，但只在真实聊天请求时读取。
- `AI_MODEL` 必须使用服务商控制台显示的准确 ID，不得根据产品名称猜测。
- `AI_API_KEY` 只能存在于 `.env.local` 或部署平台密钥变量，不能使用 `NEXT_PUBLIC_`。
- temperature 范围为 0–2；非法值回退到 0.7。
- max output tokens、每日次数、输入长度和超时均有安全默认值与范围校验。

## Base URL 规则

系统最终请求 `<API root>/chat/completions`：

1. 仅提供域名时（如 `https://service.example.com`），自动使用 `/v1/chat/completions`。
2. 路径已经是 `/v1` 时直接追加 `/chat/completions`，不会产生 `/v1/v1`。
3. 控制台提供非空的服务商专属 API 根路径时（例如某个 `/api/.../v4` 根路径），原样保留该路径并追加 `/chat/completions`。

不要把完整 `/chat/completions` 终点填入 `AI_BASE_URL`。

## GLM-5.2 本地联调

1. 从智谱控制台复制 OpenAI-compatible Base URL、准确模型 ID 和 API Key。
2. 写入本地 `.env.local`，不要提交或粘贴到日志、Issue、PR。
3. 运行 `pnpm dev` 并以已验证用户登录。
4. 在 `/chat` 验证中文增量输出、Markdown、代码块、停止、多轮与刷新持久化。
5. 验证助手消息最终为 `COMPLETE`；中断和失败不保留永久 `PENDING`。
6. 临时触发无效 Key 或限流场景时，只确认友好错误，不在截图或日志暴露凭据。

## 切换 OpenAI

只替换 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`；按需调整 temperature、token 与超时。聊天 UI、API、Provider 接口和数据库逻辑无需修改。

## 故障排查

- 401/403：Key 无效、权限不足或模型未授权。
- 404：Base URL 拼接错误或模型 ID 不存在；检查控制台准确值。
- 429：服务商限流或额度不足，稍后重试。
- 5xx/DNS：服务暂不可用或网络异常。
- 超时/提前断流：检查 `AI_REQUEST_TIMEOUT_MS` 与服务商状态。
- 页面提示未配置：检查三个必填变量是否均在运行进程中生效，然后重启开发服务器。

服务端日志只记录归一化错误代码、HTTP 状态和内部消息 ID，不记录 Key、Cookie、完整请求头或服务商原始错误正文。
