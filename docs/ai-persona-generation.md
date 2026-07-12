# AI 生成人格草稿

## 与 Phase 4A3 的关系

Phase 4A2 只在同一次文本响应中产生 provider-agnostic 的 `avatarPrompt`，不会自动调用图片模型。Persona 保存后，Phase 4A3 才允许用户修改 prompt 并明确点击生成；图片流程不会为 prompt 再调用一次文本模型。

`POST /api/personas/generate` 现在使用 SSE 报告真实执行阶段：`preparing`、`generating`、`validating`、可选的 `repairing` 与 `drafting`，最后以 `done` 返回可编辑草稿。`repairing` 只在首次 JSON 校验失败、确实发起唯一一次修复调用时出现；正常结果仍只有一次文本模型调用。客户端使用 AbortSignal 和请求版本阻止取消后的迟到事件覆盖表单，错误不会清空描述或上一份有效草稿。

## 流程与阶段边界

Phase 4A1 提供手动 Persona 基础；Phase 4A2 只把自然语言描述转换为可编辑草稿。用户进入 `/personas/new` 后可在“手动创建”和“AI 生成”间切换。AI 成功结果填入原 PersonaForm，用户点击保存前不写入任何 Persona、Conversation 或 Message。

本阶段不实际生成头像、不上传 Supabase Storage、不创建 GeneratedImage、不开放外部头像 URL，也未开始 Phase 5。

## Provider 与配置

生成复用现有 `AiProvider.streamText()` 和 OpenAI-compatible SSE 解析；`collectGeneratedText()` 仅在服务端收集完整文本。GLM-5.2 和未来 OpenAI 使用同一代码，切换只修改：

```env
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_PERSONA_MODEL=
AI_PERSONA_TEMPERATURE=0.8
AI_PERSONA_MAX_OUTPUT_TOKENS=1800
AI_PERSONA_REQUEST_TIMEOUT_MS=90000
```

`AI_PERSONA_MODEL` 留空回退 `AI_MODEL`。构建和手动创建不要求 AI Key；未配置时 AI 模式显示友好提示。

## JSON Schema 与安全

模型只允许返回：`name`、`description`、`identity`、`personality`、`speakingStyle`、`expertise`、`greeting`、`avatarPresetId`、`avatarPrompt`。输出经过控制字符清理、首个平衡 JSON 对象提取、`JSON.parse` 和严格 Zod 字段/长度校验；额外字段被删除。

模型返回的 `systemPrompt` 和 `avatarUrl` 不会被采用。保存仍由原 Server Action 校验用户字段，并由 `buildPersonaSystemPrompt()` 构建安全 Prompt。用户描述用 `<persona_request>` 边界作为数据传递，不能修改 system 输出协议。

正常生成只调用一次。首次 JSON 无效时最多进行一次专用修复请求；第二次仍失败立即停止，不做第三次调用。avatarPrompt 与人格字段必须在同一次响应生成，不额外消耗一次模型调用。

## 头像预设与未来头像

每个本地头像具有稳定 `id/src/label/description`。模型只能建议 ID；服务端验证后映射本地 `avatarUrl`，非法或缺失 ID 使用基于人格内容的确定性回退，绝不采用模型路径、URL 或 data URI。

`avatarPrompt` 最多 1200 字符，只描述主体、视觉风格、表情、服装、背景与构图，不包含供应商、尺寸、URL、路径或 API 参数。

未来实现流程为：使用 Persona 字段与 avatarPrompt 调用图片 Provider → 获得图片字节 → 上传受控 Storage → 创建 GeneratedImage → 将永久 URL 写入 `Persona.avatarUrl`。现有人格列表、详情、预览、聊天顶部、空状态和消息头像会自动同步，无需修改聊天头像逻辑。

## 常见错误

- 401/403：检查服务端 API Key 权限。
- 404：检查 Base URL 与模型 ID。
- 429：等待限流恢复后由用户主动重试。
- 超时：检查网络和 `AI_PERSONA_REQUEST_TIMEOUT_MS`。
- JSON 错误：系统自动修复一次；仍失败会保留上一次有效草稿，用户可继续手动编辑。
- 用户取消：AbortSignal 中止请求，现有表单不被覆盖。

真实 GLM-5.2 联调需由项目所有者使用本地 `.env.local` 完成；自动测试和无密钥构建不代表真实生成通过。
