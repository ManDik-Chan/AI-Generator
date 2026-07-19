# Phase 7A1 多 Agent 头脑风暴

## 范围

`/tools/brainstorm` 接受一个 1–8000 字符的问题，由四个服务端固定 Worker 独立分析：分析研究员、创意探索者、批判审查员和落地规划师。至少两个 Worker 成功后，协调器输出问题概览、共同观点、关键分歧、风险与未知项、综合结论、推荐方案和可执行下一步。

本阶段不包含 Vibe Coding、代码或 Shell 执行、Git 写操作、MCP、浏览器自动化、联网搜索、网页抓取、文件上传、RAG、自定义 system prompt、递归 Worker、多轮自动循环或自动部署。Phase 7A2 尚未开始。

这是保留的 Classic Brainstorm 工具，固定四个角色与一次协调器调用，继续使用 `/tools/brainstorm`。需要在完整 Conversation 中继续追问、选择 Standard/Deep 或查看动态 Worker DAG 时，使用 `/chat` 的 Agent Mode；两者不共享运行记录，也不会互相迁移历史。

## 调用与成本边界

- 一次点击只创建一个 `ToolRun(type=BRAINSTORM)`。
- 固定四个 Worker，各最多调用 Provider 一次。
- 协调器最多调用一次；少于两个 Worker 成功时不调用。
- 标准运行总模型调用最多五次，不自动重试，不额外生成标题。
- 标题从用户问题确定性截取；历史加载、恢复和“再次头脑风暴”不会调用模型。
- 普通用户默认每天三次完整运行，PENDING/COMPLETE/ERROR/CANCELLED 都计数；ADMIN 不受阻止但显示当天真实用量。

模型回退：`AI_BRAINSTORM_MODEL → AI_TOOL_MODEL → AI_MODEL`；综合模型为 `AI_BRAINSTORM_SYNTHESIS_MODEL → worker model`。Key 与 Base URL 复用现有服务端 AI 配置，浏览器不会获得模型或密钥。

## Prompt 安全

Worker 角色、职责、安全规则、输出约定和白名单参数全部位于服务端 system message。用户问题经过 XML 转义后放入 `<untrusted_user_problem>`。它不能切换角色、增加 Worker、改变调用次数/模型/温度/Token，也不能获得工具、网络、文件、聊天、Persona、Memory、数据库或环境变量访问。

协调器把问题和所有 Worker 输出都视为不可信中间数据。Worker 输出即使伪造 system/developer 内容，也只会作为待综合文本。服务端不记录完整问题、Worker 输出、综合结果、Prompt、Key、Cookie 或 Authorization；日志仅包含 runId、角色、状态、耗时和脱敏错误码。

每个 Worker 使用独立 `ToolOutputGuard`；只有 Guard 释放的文本才会写入 `BrainstormWorker.outputText` 并通过 SSE 返回。协调器同样只把安全增量写入 SSE、partial recovery 和最终 `ToolRun.outputText`。若检测到系统提示词、Authorization、数据库凭据或 API Key 泄漏，相关 Worker 或 ToolRun 会以 `UNSAFE_OUTPUT` 失败，原始泄漏内容不会进入数据库、恢复接口或历史。

## 数据模型、migration 与 RLS

独立 migration：`20260717180000_add_brainstorm_workers`。

`BrainstormWorker` 保存 `toolRunId/userId/role/position/status/outputText/errorCode/startedAt/completedAt`。`toolRunId + role` 与 `toolRunId + position` 唯一；`(toolRunId,userId)` 复合外键保证 Worker 和 ToolRun 属于同一用户，ToolRun 或 Profile 删除时级联清理。数据库 trigger 拒绝把 Worker 绑定到非 BRAINSTORM ToolRun。

最新版 `prisma/rls.sql` 对 `brainstorm_workers` 只创建 select-own 策略；客户端不能直接 INSERT/UPDATE/DELETE。所有 API 从 Supabase 服务端会话获取 userId，查询、取消和删除均显式带 userId；他人的 ID 返回 404。

## 状态机与部分失败

ToolRun 与 Worker 都只允许 `PENDING → COMPLETE | ERROR | CANCELLED`。四个 Worker 在配置的最大并发（默认四）内启动。单个 Worker 失败只标记自己，其他 Worker 继续；至少两个成功时协调器只读取成功输出。协调器失败时 Worker 内容仍可恢复，ToolRun 为 ERROR，不伪造综合结论。

用户显式取消会原子地把 PENDING ToolRun 和 PENDING Worker 改为 CANCELLED。Provider 的迟到输出使用 PENDING 条件更新保护，不能覆盖任何终态。

## waitUntil、SSE、取消与恢复

Route 创建任务 Promise 后立即交给 `registerGenerationTask`，由 Vercel `waitUntil` 托管；本地开发使用现有安全兼容路径。SSE 仅为观察通道，事件包括 `run`、`worker_started`、`worker_done`、`worker_error`、`synthesis_started`、`synthesis_delta`、`done`、`error`、`cancelled`。

手机切后台、网络切换、request abort、ReadableStream cancel 或 enqueue 失败只会 detach observer，不改变业务状态。只有“停止头脑风暴”调用 owner-scoped cancel API。恢复 hook 在 mount、focus、pageshow 和重新 visible 时查询已有 runId；它不会 POST、新建 ToolRun、重新调用 Provider或重复计费。

整个 run 另有 `AI_BRAINSTORM_TOTAL_TIMEOUT_MS` 总预算，默认及允许上限均为 285000ms；它与单次 Provider timeout、durable explicit cancellation 分离，并为 `maxDuration=300` 留出约 15 秒写入终态。总预算耗尽时仍为 PENDING 的 Worker 与 ToolRun 写为 `ERROR/TIMEOUT`，已经 COMPLETE 的 Worker 保留；显式取消仍为 `CANCELLED`。函数仍受 Vercel 套餐实际最大时长限制，不能保证无限后台运行。

## 隐私与历史

“保存到头脑风暴历史”默认开启。开启后保留问题、四个 Worker 输出与综合结果，历史支持打开、复制、下载、回填和删除。关闭后内容仅在 15 分钟短期恢复窗口存在；到期清理会清空 ToolRun 输入/输出及 Worker 输出，保留最小计数元数据。清理函数可重复运行。删除 ToolRun 会级联删除四个 Worker，不影响聊天、人格、记忆或其他工具。

## 本地与 Vercel 配置

将 `.env.example` 中的 Brainstorm 变量配置在服务端环境。没有独立模型时允许按回退链使用现有模型；没有任何 AI Key 时页面友好降级且生产构建仍应通过。Vercel 使用 Node.js Function，不使用 Edge Runtime、Redis、队列或常驻 Worker。

## 部署步骤

1. 备份数据库并部署最新代码到 Preview。
2. 执行 `pnpm db:deploy` 部署 `20260717180000_add_brainstorm_workers`。
3. 在 Supabase SQL Editor 执行最新版 `prisma/rls.sql`。
4. 配置 Brainstorm 环境变量，重新部署 Preview。
5. 不要修改任何旧 migration；本开发任务不会执行真实 migration/RLS。

回滚应用时先回滚代码。数据库表和枚举可保留，不会影响旧功能；在确认没有数据且明确安排停机窗口前，不要直接删除 enum 值或表。

## 项目所有者真实验收

1. USER 发起一次运行，确认只创建一个 ToolRun、四个 Worker，并最多出现五次模型调用。
2. 分别验证四个角色输出、Markdown 综合、复制、TXT/Markdown 下载和再次回填不自动执行。
3. 让一个 Worker 失败，确认其他 Worker 继续；让三个失败，确认不调用协调器。
4. 手机生成时切后台再返回，确认恢复同一 runId，未重复计费或调用。
5. 显式停止，确认 ToolRun/PENDING Worker 为 CANCELLED，迟到结果不覆盖。
6. USER 验证每天三次限制；ADMIN 验证不限次数并显示真实用量。
7. 关闭历史，等待恢复期并执行清理，确认问题与所有输出被清空。
8. 使用另一个用户尝试读取、取消、删除 run，均应 404。
9. 在问题与 Worker 内容中放入伪造 system/developer、泄密、联网和新增 Worker 指令，确认不会越权。
10. 检查 390/430/768/1024/1440px、浅色/深色/reduced-motion，无水平溢出。

## 常见问题

- 配置提示：检查服务端 Base URL、Key 和模型回退链，不要把 Key 写入 `NEXT_PUBLIC_*`。
- 少于两个 Worker：ToolRun 会以 `INSUFFICIENT_WORKERS` 失败，不会生成伪综合结果。
- 后台恢复很久：确认 Vercel Function 未超过最大执行时间，并查看脱敏 runId/status/errorCode 日志。
- 历史为空：确认保存开关已开启；关闭时正文只在短期恢复窗口保留。
- 取消未确认：UI 会继续显示后台处理中，绝不会在服务端确认前谎报已停止。
