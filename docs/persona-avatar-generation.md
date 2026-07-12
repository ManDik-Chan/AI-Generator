# Persona AI 头像生成

Phase 4A3 为已保存的 Persona 提供单张头像候选生成，不是通用图片工具。文本聊天和人格草稿继续使用原有文本 Provider；头像独立使用智谱开放平台 `glm-image`。

## 调用与成本边界

服务端向 `{AI_IMAGE_BASE_URL}/images/generations` 发送 `POST`，请求体只有 `model`、`prompt`、`size`。默认模型为 `glm-image`，默认尺寸为 `1280x1280`。`avatarPrompt` 最多 900 字符，服务端追加安全构图要求后最终 prompt 不超过 1000 字符。页面打开、保存 Persona 和生成 Persona 草稿都不会调用图片模型；只有用户明确点击“生成头像”才发起一次请求，不自动重试或并行生成。

## 安全下载与私有存储

Provider 返回的临时 URL 不稳定，也不受应用控制，因此绝不直接写入 `Persona.avatarUrl`。服务器立即下载并执行以下检查：仅 HTTPS、无 URL 凭据、拒绝 localhost、私网、link-local 和 metadata 地址；DNS 解析和每次重定向都重新检查；最多三次重定向；独立超时；流式限制 15 MB；同时校验 Content-Type 与 PNG/JPEG/WebP 魔数，拒绝 SVG、HTML 和伪装文件。

验证后的字节上传到 Supabase private bucket `persona-avatars`，路径为 `{userId}/{personaId}/{generatedImageId}.{extension}`。应用不会自动创建 bucket。项目所有者需预先创建 private bucket，建议限制 15 MB，并只允许 PNG、JPEG、WebP。

`SUPABASE_SERVICE_ROLE_KEY` 仅由带有 `server-only` 边界的 Admin Client 读取，不得使用 `NEXT_PUBLIC_`、写入日志或发送到浏览器。预览和正式头像分别通过所有权受控的应用路由生成 60 秒 signed URL：

- 候选预览：`GET /api/generated-images/:generatedImageId`
- 当前 Persona 头像：`GET /api/personas/:personaId/avatar`

## 数据职责与候选流程

- `Persona.avatarPrompt`：当前可编辑头像提示词。
- `Persona.avatarImageId`：当前正式使用的 `GeneratedImage`。
- `Persona.avatarUrl`：所有 UI 的唯一公开读取入口；AI 头像值为 `/api/personas/<id>/avatar?v=<generatedImageId>`。
- `GeneratedImage`：记录所有者、prompt、Provider、模型、Storage 路径、尺寸和创建时间。

生成 API 只创建候选 Storage 文件和 `GeneratedImage`，不会修改 Persona。用户确认“使用此头像”后，Apply API 在事务中同时验证 Persona 和候选图片所有权，再更新上述三个 Persona 字段。放弃候选会删除 Storage 与数据库记录；正在使用的图片拒绝删除。替换旧 AI 头像或切换为白名单预设头像时，先成功更新数据库，再尽力清理旧文件，清理失败不会回滚已经正确应用的新头像。

## 配置与排错

```env
AI_IMAGE_PROVIDER=zhipu-glm-image
AI_IMAGE_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_IMAGE_API_KEY=
AI_IMAGE_MODEL=glm-image
AI_IMAGE_SIZE=1280x1280
AI_IMAGE_REQUEST_TIMEOUT_MS=180000
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PERSONA_AVATAR_BUCKET=persona-avatars
```

图片 Key 和 Base URL 为空时会安全回退到 `AI_API_KEY` 与 `AI_BASE_URL`。401/403 通常表示 Key 或权限错误；404 表示模型或端点错误；429 需由用户稍后手动重试；超时可检查网络和 `AI_IMAGE_REQUEST_TIMEOUT_MS`；Storage 错误应检查 Service Role Key、private bucket 名称、MIME 与大小限制。未配置图片服务时，构建、预设头像、Persona 管理、文本聊天和 AI 人格草稿仍可使用。

## 项目所有者真实验收

1. 创建 private bucket `persona-avatars`，配置上述环境变量并运行 `pnpm db:deploy`。
2. 保存一个 Persona，在详情页点击“AI 生成头像”，确认生成前原头像不变。
3. 修改提示词、生成候选、放弃或重新生成，再点击“使用此头像”。
4. 验证列表、详情、编辑预览、聊天顶部、空状态、历史 assistant 消息与刷新后头像一致。
5. 归档 Persona 后验证仍可生成；切换到预设头像后检查 `avatarImageId` 已清空。
6. 使用另一用户确认候选和正式头像路由均不可越权读取。
7. 检查 Storage、`GeneratedImage`、Persona 三个头像字段及浏览器控制台，并确认 Git 中没有任何密钥。

当前没有可用于真实调用的 GLM-Image Key 或 Service Role Key，因此自动化测试使用 mock，真实 GLM-Image 调用和 Storage 上传需要项目所有者执行。Phase 5 尚未开始。
