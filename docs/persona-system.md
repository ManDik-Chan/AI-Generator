# Persona 人格核心系统

> Phase 4A3 已实现原有头像扩展点：`avatarPrompt` 保存可编辑提示词，`avatarImageId` 指向正式使用的 `GeneratedImage`，`avatarUrl` 保存稳定的应用内私有读取路由。列表、详情、编辑预览、聊天顶部、空状态和 assistant 消息仍只读取 `Persona.avatarUrl`，不感知 GLM-Image、bucket 或 signed URL。详见 `docs/persona-avatar-generation.md`。

用户侧将软删除表达为“移至回收站”：详情页三点菜单打开非原生确认对话框，成功后进入 `/personas` 并显示提示；`/personas/trash` 仅查询当前用户 `archivedAt != null` 的 Persona 并支持恢复。底层不物理删除 Persona、Conversation、Message 或 GeneratedImage。回收站 Persona 仍保留历史对话身份与头像，但 Chat Composer 和服务端 Chat API 都会阻止新消息，恢复后沿用原 `conversation.personaId`。

## Phase 4A 边界

Phase 4A 实现用户私有 Persona：手动管理、对话绑定、AI 可编辑草稿和 GLM-Image 单张头像。长期记忆、RAG、通用图片工具、公开市场、分享和导入导出均不在本阶段。

Phase 4A1 完成人格基础；Phase 4A2 增加自然语言生成“可编辑草稿”。生成成功不会自动保存，最终仍复用同一 PersonaForm、Zod Schema 和创建 Action。AI 返回的 `systemPrompt`、`avatarUrl` 或额外字段不会进入草稿。

Phase 4A2 产生 provider-agnostic 的 `avatarPrompt`；Phase 4A3 将其持久化，并仅在用户明确操作时调用图片 API、上传 private Storage 和创建 `GeneratedImage` 候选。

## 字段与验证

- 名称：必填，1–40 字符。
- 简介：可选，最多 200 字符。
- 身份、性格、说话方式、擅长领域、greeting：各最多 1000 字符；性格必填。
- 高级补充指令：可选输入，最多 4000 字符。
- `systemPrompt` 保存时必须非空；高级指令留空时由 `buildPersonaSystemPrompt()` 根据结构化字段本地生成，不调用 AI。
- 头像只允许 `/public/personas` 中 12 个白名单 SVG 路径；加载失败或未选择时使用名称首字渐变回退。
- 人格列表、详情、编辑预览、聊天顶部、空对话和每条助手消息统一读取 `Persona.avatarUrl` 并复用 `PersonaAvatar` 回退；聊天组件不判断头像存储位置或生成供应商。

所有字段在客户端提供体验校验，Server Action 和聊天 API 仍执行独立服务端校验。用户文本按普通 React 文本渲染，不启用原始 HTML。

## Prompt 构建

`features/persona/prompt.ts` 负责表单保存与预览使用的纯函数 Prompt。`lib/ai/prompts/persona-assistant.ts` 只在服务端把 Persona 合并到聊天 system message，顺序为：

1. 默认助手基础安全与准确性规则。
2. 人格名称、身份、性格、表达方式和擅长领域。
3. 人格高级补充指令。
4. 不泄露系统 Prompt/配置、不伪造事实、不声称拥有不存在工具的输出约束。

Persona 内容不会拼入 user message，也不会返回前端，且不能覆盖基础规则。

## 对话绑定

新对话可通过 `/chat?personaId=<UUID>` 选择人格。第一条请求由服务端验证 Persona 属于当前用户且未归档，然后保存到现有 `Conversation.personaId`。

已有对话始终从数据库读取 Persona；客户端不能通过重新提交 personaId 切换。这样可以保证历史 Prompt、消息含义和刷新后的行为一致。Persona 关系异常缺失时安全回退默认助手，并只记录不含 Prompt 或密钥的结构化日志。

greeting 只在新对话空状态显示，不创建数据库 Message，也不发送给模型。

## 归档与恢复

“删除人格”统一为软归档：

- 归档设置 `archivedAt=now()`，不删除 Persona、Conversation 或 Message，也不清空 `personaId`。
- 归档人格从活跃列表和新对话选择器移除。
- 已绑定的历史对话继续显示并使用原人格，同时显示轻量“已归档”标识。
- 恢复设置 `archivedAt=null`，重新进入活跃列表和选择器。
- 已归档人格仍允许查看和编辑。

## 数据隔离

列表、详情、编辑、归档和恢复的 Prisma 条件都显式包含 `userId`。聊天 API 同时验证会话和 Persona 所有者，不允许其他用户通过 URL、personaId 或请求体访问人格。日志不记录 Cookie、Token、密钥或完整 systemPrompt。

## Migration 与真实验收

Migration：`20260712153000_add_persona_greeting_archived_at`，新增 `greeting`、`archived_at` 和活跃/归档列表索引。

Codex 环境只执行 schema validate、自动测试和无密钥构建，不声明真实数据库部署成功。项目所有者需要执行：

```bash
pnpm db:deploy
```

然后使用真实 Supabase 和 GLM-5.2 验证人格 CRUD、归档恢复、对话绑定、刷新一致性、归档历史对话和默认助手回归。

### 助手消息头像验收

1. 选择带头像的 Persona 开始对话，确认顶部和空状态头像一致。
2. 发送消息，确认 PENDING、流式输出、COMPLETE 或 ERROR 的助手消息左侧始终使用同一 Persona 头像。
3. 刷新、停止生成、继续发送以及编辑最后一条消息重新提交后，确认头像保持。
4. 归档 Persona 后打开历史对话，确认仍显示原 Persona 头像。
5. 新建默认助手对话，确认消息仍显示默认 Bot。

未来 AI 头像只需要上传到受控位置并更新 `Persona.avatarUrl`；人格页面与聊天组件不需要再次区分图片来源或重构头像渲染。
