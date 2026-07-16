# Phase 6A3：通用 AI 图片生成工作台

## 状态

当前实现位于 Draft PR。自动验证完成后，仍需项目所有者在真实 Supabase 与 GLM-Image 环境验收；本阶段不得描述为已完成真实联调。

## 产品范围

`/tools/image-generate` 提供单图文生图工作台：用户输入 1–900 字符的画面描述，选择自动、写实摄影、精致插画、动漫、电影质感或三维艺术风格，然后显式点击开始。每次运行只调用一次图片 Provider、只生成一张图片，不自动重试，也不调用额外文本模型整理 Prompt。

页面提供真实阶段进度、已用时间、停止生成、私有预览、下载、再次创作、分页画廊与删除。停止后不保存半成品；服务端只允许 `PENDING` 运行写为 `COMPLETE`，迟到结果不能覆盖 `CANCELLED`。页面不使用 `router.refresh()` 或全屏 loading。

## 数据与私有资源

- 新 migration：`20260716190000_add_image_generation_tool`。
- `ToolType` 新增 `IMAGE_GENERATE`。
- `GeneratedImageKind` 区分 `PERSONA_AVATAR` 与 `TOOL_GENERATION`。
- 工具图片通过 `toolRunId + userId` 绑定同一用户的 `ToolRun`；一条运行最多一张图片。
- Persona 头像继续使用原 `GeneratedImage` 入口，并显式限定 `PERSONA_AVATAR`，不会被工具图片误用。
- 工具图片保存到 private bucket，默认 `generated-images`。对象路径使用用户 UUID、图片 UUID 与服务端检测扩展名，不使用用户可控文件名。
- 数据库不保存图片 Base64、远程临时 URL 或 signed URL。
- `GET /api/generated-images/:id` 每次验证所有权，再生成短时 signed URL 并重定向；下载使用同一认证入口。
- 删除会清理 Storage 对象和对应 ToolRun；保存失败执行 Storage 补偿清理。

Service Role Storage 操作不信任数据库元数据。共享 server-only 解析器先按 `kind` 从服务端配置推导唯一可信 Bucket，再验证数据库 Bucket 完全一致；Path 必须使用当前 `userId` 作为第一段、符合 Persona 三段或工具两段格式，并拒绝前导 `/`、`..`、反斜杠、空字节、百分号编码和非 PNG/JPEG/WebP 扩展名。签名和删除函数只接收验证后的可信 Target，不再接收任意 bucket/path 字符串。伪造记录返回安全的 404，不签名、不删除，也不记录完整 Path。

`generated_images` 的 authenticated RLS 只保留 select-own。浏览器不能直接 INSERT、UPDATE 或 DELETE；创建、应用与删除全部经过 trusted server Prisma/Route Handler，以保持数据库、Storage、Persona kind 和 ToolRun 所有权一致。复合外键继续约束 ToolRun 与 GeneratedImage 的 `userId`。

## Provider、安全下载与 Prompt 边界

业务层复用 provider-agnostic `ImageProvider`、Registry、GLM-Image OpenAI-compatible 实现和 Phase 4A3 安全下载器。下载器保持 HTTPS、DNS/保留地址、重定向、15 MB、Content-Type、PNG/JPEG/WebP 魔数和 MIME mismatch 检查，不放宽 SSRF 防护。

风格是服务端白名单，用户描述被 XML 转义后放入 `<user_image_description>` 不可信数据边界。描述中的 system/developer、密钥索取或越权命令只属于待创作数据。日志不得包含 Prompt、完整临时 URL、query、signed URL、API Key、Authorization、Cookie、Service Role Key 或图片字节。

## 独立限额

`AI_DAILY_IMAGE_GENERATION_LIMIT` 默认 5。合法请求在 Serializable 事务创建 `IMAGE_GENERATE/PENDING` ToolRun 时计数，因此 COMPLETE、ERROR、CANCELLED 都计数，参数非法或服务未配置时不计数。普通用户达到上限后被阻止；ADMIN 保留豁免但显示当天真实用量。此限额不消耗聊天、文本工具或图片分析额度。

## 环境变量与部署

```env
AI_IMAGE_PROVIDER=zhipu-glm-image
AI_IMAGE_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_IMAGE_API_KEY=
AI_IMAGE_MODEL=glm-image
AI_IMAGE_SIZE=1280x1280
AI_IMAGE_REQUEST_TIMEOUT_MS=180000
AI_DAILY_IMAGE_GENERATION_LIMIT=5
SUPABASE_GENERATED_IMAGE_BUCKET=generated-images
```

在 Supabase 手动创建 private `generated-images` bucket，不得设为 public。Service Role Key 只存在于 `server-only` Storage 模块。随后部署 migration，并重新执行最新版 `prisma/rls.sql`。未配置图片 Key、bucket 或真实数据库时，应用仍须可以生产构建，其他模块不受影响。

## 项目所有者真实验收

1. 部署 migration，重复执行最新版 RLS，并创建 private bucket。
2. 普通用户生成一张图片，确认准备、生成、下载、校验、上传、保存阶段，且只有一条 ToolRun 与一条工具 GeneratedImage。
3. 验证预览、下载、复制原始描述、再次创作、分页历史和删除；跨用户读取/删除及伪造 Bucket/Path 必须失败。
4. 生成中停止，确认 ToolRun 为 CANCELLED、无图片记录和 Storage 残留，迟到流不能改为 COMPLETE。
5. 验证普通用户默认 5 次限额；ADMIN 不受阻止且显示真实已使用次数。
6. 使用包含伪造 system/developer、密钥索取和越权命令的描述，确认只作为图片描述数据处理，日志与响应不泄露配置。
7. 在 390、430、768、1440px 及浅色/深色主题检查无水平溢出、长描述换行、画廊和确认弹窗可用。
8. 回归 Persona 头像、图片分析、文本工具、聊天、人格和长期记忆。

## 已知限制

不包含图片编辑、局部重绘、多图、批量生成、视频、专业 OCR、文件/网页/图片 RAG、公开分享、永久公开 URL 或自动重试。Phase 7 未开始。
