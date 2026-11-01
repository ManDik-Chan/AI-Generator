# P1-AUTH-A 验证记录

2026-11-01，Windows，Node 22.23.1，pnpm 11.7.0。

**实现验收提交：`46a09ee0e1c7a4af61ca97c4d1d638e67f8d8219`**，基于 main `ba0692f`。该记录的后续提交只增加验收文档，不改变被测试的实现、测试或配置。推送前再次 fetch，main 未变化。

| 检查 | 最终结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，依赖和锁文件未改 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过，零警告 |
| `pnpm test`，不带数据库环境 | 179 文件 / 1314 测试通过；13 个真实集成套件 / 179 测试按既有机制跳过，由下项独立完成 |
| `node scripts/run-local-security-stage.mjs integration D:/AIGC/p1-auth-a-isolated-20261101` | 调用既有严格集成 runner，13 suites / 179 tests 全通过，0 failed / pending / TODO，无跳过 |
| 新增真实 Auth 集成 | 9/9；使用生产 Server Client、真实 Supabase SDK/Auth/PostgreSQL，仅模拟 Next 请求 Cookie 边界 |
| `pnpm build` | 最终通过，包含 Prisma 生成、Next 编译、类型/Lint 检查和静态生成；登录及受保护页面保持动态 |
| 客户端 JS bundle 扫描 | `.next/static` 中无 `SUPABASE_SERVICE_ROLE_KEY`、`registry_private`、`PrismaClient`、`node:crypto`、`internal_operators` |
| `git diff --check` | 通过 |
| 本地浏览器 / Playwright / 截图 | 未执行：AGENTS.md 保留 Owner 的本地浏览器暂停规则 |
| 远程 CI | 推送后由原门禁运行，当前未授予通过结论 |

真实 Auth 覆盖：首次正常登录、跨请求恢复、Cookie 生命周期建模重开、两种模式的真实刷新 Token 轮换、无效凭据、撤销及撤销后的刷新失败、JWT 尚有效时的服务端 not_after 到期、退出后晚到 Cookie 不恢复、失败再登录保持退出状态、成功再登录清除旧分块、伪造 Cookie/偏好、并发导航和旧标签页拒绝访问。

定向单元测试覆盖表单输出、登录/注册/退出动作、PKCE 回调、登录恢复安全目标、Middleware 刷新 Cookie/缓存响应头、Cookie 模式与删除、浏览器 adapter 和 SessionSync 生命周期。Node 模拟不构成实际浏览器验收。

新增 `tests/e2e/mobile/auth-session.spec.ts` 的 5 个浏览器候选用例由既有 Chromium desktop/mobile 与 WebKit iPhone 矩阵执行；没有调整工作流、门禁、跳过条件或现有断言。用例只访问守卫后的 loopback 环境、使用独立合成账号并登记敏感值给既有产物清理器。尚未运行，不能声称通过。原生密码保存/自动填充、真实 profile 关闭重开及视觉/键盘/读屏等待验收项见主交接文档。

## 隔离与清理

- 专属项目：`aig-platform-p1-final-auth-a-20261101`；工作目录 `D:/AIGC/p1-auth-a-isolated-20261101`。
- 使用现有 disposable marker、容器 label 和 loopback 端口检查；没有 linked production 项目。
- 26 项迁移 checksum 匹配，验收后合成账号 0。
- 结束时仅对该项目执行 `stop --no-backup`；该项目容器、volume、network 均为 0。未关闭 Docker Desktop 或操作其他任务资源。
- 原始报告位于忽略目录 `test-results/security-integration-XE4Got/report.json`；只提交本摘要，不提交凭据、环境或原始敏感产物。

## 验证中出现的问题

首次全量安全集成中，已有 Registry quarantine 并发校验测试在 `Promise.all` 处出现 `RegistryProtocolError: CONFLICT`，178/179 通过；没有修改 Registry 或测试断言。停止并行探测后原样全量复跑，179/179 通过。最终报告中 Auth 套件运行时间晚于其最后一次测试编辑，包含旧分块清理断言。

一次 Build 的 Prisma 预生成与数据库集成并行，在 Windows 上因已加载的 query_engine DLL 发生 `EPERM`。等待集成进程退出后串行执行 `pnpm typecheck` 与完整 `pnpm build`，均通过。没有修改构建步骤或依赖来绕过。

## 安全边界与协作

未访问生产 Supabase，未使用 Owner 的账号凭据，未修改 RLS、注册权限、服务端 Session 有效期、生产环境变量或 GitHub 分支保护；未合并 main、未部署。分支在 `vercel.json` 的 deploymentEnabled 中显式为 false。

#44 分支和 Registry / Developer Console / Research Lab 业务代码未修改。共同 Browser Client、requireUser 和 live shell 会话挂载的变化与 #44 的后续浏览器验收需求记录于 [主交接](2026-11-01-p1-auth-a.md)。
