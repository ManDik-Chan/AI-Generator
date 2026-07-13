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

## 项目所有者真实验收：全部通过

1. `20260713220000_add_tool_assets` migration、最新版 `prisma/rls.sql` 与 private `tool-assets` bucket 部署通过。
2. JPEG、PNG、WebP 上传、净化、预览和真实视觉模型分析通过；三种模式、三档详细程度和中英文输出通过。
3. SSE 流式输出、停止分析、部分结果保留、CANCELLED 持久化和迟到流保护通过。
4. 历史开启时缩略图、详情、复制、TXT/Markdown 下载、再次分析和删除通过。
5. 历史关闭时正文不进入普通历史，ToolAsset 与 Storage 图片在完成、失败或取消后正确清理。
6. 到期资源清理与“原图片已到期清理”状态通过。
7. 非法、损坏、伪装、超大和超像素图片均被安全拦截，不调用模型。
8. 跨用户图片读取和删除隔离通过。
9. 图片 Prompt 注入复验通过：图片文字、二维码和伪造 system/developer 内容不能取得指令权限。
10. ADMIN 显示“不限次数”和当天真实使用量；普通 USER 显示真实剩余次数并在合法运行开始后减少。
11. 390px、430px、768px、1440px 响应式通过；文本总结、改写、翻译、聊天、人格、头像和长期记忆回归通过。
12. 未发现密钥、数据库密码、用户原图、Base64、signed URL、真实用户内容进入提交或日志。

## 已知限制

不支持 PDF/DOCX/PPTX/TXT 等文档解析、专业 OCR、RAG、多图、GIF/SVG/HEIC、视频、网页、图片生成或编辑。Phase 6A3 与 Phase 7 尚未开始。PR 保持 Draft，等待项目所有者最终合并。

## 真实验收修复记录

项目所有者首次真实验收发现 ADMIN 虽然按既有策略正确豁免视觉日限额，但页面仍显示“今日剩余 10 / 10”，没有表达真实已用次数。修复后 usage 与 `start` SSE 明确返回 `unlimited`：普通 USER 继续在合法 ToolRun 创建时立即扣减并显示剩余额度；ADMIN 不受阻止，显示“管理员不限次数 · 今日已使用 X 次”，其中 X 是当天真实 `IMAGE_ANALYZE` ToolRun 数量。非法图片仍在创建 ToolRun 前被拒绝，不计数。该修复未修改数据库结构或 migration，项目所有者最终复测已通过。
