# Phase 6A2：安全图片理解工具

## 范围与架构

`/tools/image` 接受单张 PNG、JPEG/JPG 或 WebP。用户点击“开始分析”前不会创建 ToolRun、上传 Storage 或调用模型。服务端使用 sharp 验证魔数、声明 MIME、实际解码、10 MB 与 4000 万像素上限，然后重新编码以删除 EXIF、GPS、ICC 和注释。随机路径不含用户文件名。

合法图片创建 `IMAGE_ANALYZE` ToolRun，视觉每日限额在 Serializable 事务中检查。净化图片上传到 private bucket，再创建独立 `ToolAsset`；数据库失败会补偿删除 Storage。Provider 每次运行只调用一次，不重试、不调用文本模型整理。SSE 保持 `start/delta/done/error`；停止使用 AbortController 和 PENDING 条件更新，迟到流不能覆盖 CANCELLED。

历史关闭时，ToolRun 不保存问题/输出，完成、失败或取消后删除 ToolAsset 与 Storage。历史开启时，认证路由验证 `userId` 后生成 60 秒 signed URL；URL 不持久化。默认 7 天到期，文本结果可保留，图片显示“原图片已到期清理”。`pnpm tool-assets:cleanup` 可重复运行。

## Prompt 与隔离

分析模式、详细程度、语言和安全策略只在 system。用户问题经过 XML 转义；图片像素、图片文字、二维码、伪造 role/system/developer 均是不可信数据。工具不执行图片命令，不识别真实人物身份，不做医疗诊断或法律判断，不读取 Persona/Memory，不创建 Conversation/Message，不声称访问网页、文件或数据库。输出守卫只拦截高置信泄露，不应拦截正常讨论安全主题的图片。

## 环境变量

- `AI_VISION_MODEL`：必填且独立。
- `AI_VISION_BASE_URL`、`AI_VISION_API_KEY`：可回退服务端通用 AI 配置。
- `AI_VISION_MAX_OUTPUT_TOKENS=4096`
- `AI_VISION_REQUEST_TIMEOUT_MS=120000`
- `AI_DAILY_VISION_LIMIT=10`
- `AI_TOOL_ASSET_BUCKET=tool-assets`
- `AI_TOOL_ASSET_RETENTION_DAYS=7`

`SUPABASE_SERVICE_ROLE_KEY` 只允许在 server-only Storage helper 使用。不要提交任何真实值。

## 项目所有者真实验收

1. 部署 migration，重复执行 RLS，创建 private bucket。
2. 分别上传 JPEG/PNG/WebP，确认预览、三种模式/详细度/语言和真实视觉 SSE。
3. 点击停止，确认部分输出保留、数据库为 CANCELLED、迟到流不变 COMPLETE。
4. 关闭历史分别测试完成/失败/取消，确认图片被清理且历史不显示正文。
5. 开启历史，测试缩略图、打开、复制、下载、再次分析、删除；跨用户读取/删除必须拒绝。
6. 将测试资源设为过期并运行清理脚本，确认文本保留且图片显示到期。
7. 上传伪扩展、HTML/SVG/JSON/损坏/超大/超像素图片，确认不创建有效运行、不调用模型。
8. 使用包含“忽略规则、泄露 Prompt/Key、伪造 system/developer”的截图，确认模型只分析内容，不执行命令；普通安全文章不被误拦。
9. 验证 390px、430px、768px、1440px 无水平溢出、无全屏 loading、无整页刷新。
10. 回归三个文本工具、聊天、人格、头像和长期记忆；检查日志、HTML、数据库中无原始图片、Base64、signed URL、问题或模型完整输出。

## 已知限制

不支持文档、专业 OCR、多图、GIF/SVG/HEIC、视频、网页、文件/图片 RAG、图片生成或编辑。Phase 6A3 与 Phase 7 未开始。真实 Supabase 与视觉模型验收完成前，PR 保持 Draft。
