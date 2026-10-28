# 测试及证据边界

精确 SHA、计数、逐套件/逐例状态、原始报告哈希与数据库元数据见 [verification.json](evidence/verification.json)。历史失败证据保留在上级 evidence，不回写。

| 验证层 | 本轮证据 |
|---|---|
| 静态/结构 | 原 P0 42 例原断言只读重跑通过；只覆盖 JSON Schema/OpenAPI 结构，不证明发布、RLS、Storage 或未来能力可上线 |
| 单元/mock/API 契约 | 全量 Vitest 中包含，见机器报告；恶意 key 与状态语义有新增用例，两个既有 mock service 测试只适配持久层 mock |
| 真实数据库/JWT | 6 套 42 项全部通过；全部 `tests/integration/*.test.ts` 自动发现；PostgreSQL、Supabase Auth/PostgREST、RLS、实际事务与两个不同权限账户；无 skip/TODO |
| 真实 Storage | 新套件 16 例：实际上传/下载/删除三类私有对象、用户隔离、故障、重试、级联、并发及旧 bucket 授权；Storage HTTP 503 是对 SDK fetch 边界的受控注入，其他网络调用真实 |
| 全量 / lint / typecheck | 同一隔离环境全部 Vitest 903 通过 / 0 失败 / 0 跳过；42 项真实集成，其余 861 项含单元/mock/静态契约。Lint 零警告、TypeScript strict 通过 |
| 迁移 | 从原 17 个迁移追加 4 个至 21 个，全部实际应用、校验和匹配；复合 FK 已验证、清理表 RLS 开启且 authenticated CRUD grants 均无 |
| 未执行 | 旧 reset verifier 的 clean/incremental 故障回滚、远端固定 SHA CI、Node 24/build job、浏览器/E2E/视觉、生产或 CDN 撤回、真实 Provider/GPU/BYOK |

原 `tool-asset-deletion.integration.test.ts` 字节保持与 fbd29c4 一致，四个原测试及所有断言均保留，包括原两个失败用例。Storage HTTP 故障仍需保留源及持久任务；DB 确认失败使用仅针对专用任务 ID 的隔离触发器，finally/afterAll 删除；子进程在真实 Storage 成功后以 73 退出模拟进程死亡，不能把此预期退出当测试 skip。

初期新增测试出现过 CJS 入口、夹具关联及重复删除调用顺序错误；同时发现级联未晋升 TRACKED 和附着/补偿竞争，均修正后再跑。已有迁移实际应用后不改其字节，用后续迁移修订。共享 DB 的并行套件曾使无关配额事务都被 SSI 中止，统一执行器改为套件串行，原 Promise.all 并发攻击/断言保留。最后全量结果以机器证据为准，不只摘录成功轮次。

## 隔离复现

只允许 project `aig-platform-p1-*` 的专用本地目录，DB/Kong 必须绑定 127.0.0.1。Storage 应启用；本轮配置与实际端口保存在机器证据。运行器在任何数据操作前核对 Docker 标签、运行状态、端口与 CLI status，覆盖全部 Prisma/Test/Supabase URL 指向同一局部栈，不读取应用 .env。

```powershell
node scripts/run-local-security-stage.mjs migrate D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs integration D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs all-real D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs cleanup D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs metadata D:/AIGC/platform-p1-isolated-20261028
pnpm lint
pnpm typecheck
```

cleanup 模式是实际维护程序，不是 reset。生产环境禁止借用本轮脚本执行。原始日志只保留于 ignored `test-results/`；提交报告不包含 JWT、连接串或密钥。故意损坏的合成记录产生 BLOCKED，明确保留；维护扫描对此报告失败计数，不能称全部删除成功。三类专用 bucket 的剩余对象数与账户清理结果单独记录。

浏览器未运行源于 [原工作区约束](D:/AI-Generator/AGENTS.md)："在用户再次明确授权恢复之前，不得启动或连接浏览器……或执行浏览器/E2E/视觉测试。" 本轮未申请或取得恢复授权，因此没有触发远端工作流或打开网页。
