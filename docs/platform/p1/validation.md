# P1-A 复现与证据边界

> fbd29c4 首轮复现记录，下文“应返回非零”对应当时两个未修复用例。当前复现、Storage 配置及结果见 [本轮验证](remediation/validation.md)。

依赖版本见evidence/verification.json。仅使用本地一次性Supabase，禁止复制生产.env或项目ref；本轮未调用supabase link/db push或生产服务。

1. 从evidence/local-supabase.config.toml在独立目录建立`supabase/config.toml`，项目ID必须为`aig-platform-p1-*`且端口不占用用户服务。用固定CLI启动本地栈，不绕过health check。
2. 在任何迁移或种子前检查DB/Kong发布端口只绑定127.0.0.1；CLI默认可能绑定所有接口，需在本任务独立容器范围内处理，不能调整其他容器。记录Docker标签、配置与端口。未满足时本轮运行器拒绝继续。
3. 运行以下版本化脚本；它从明确workdir的CLI status在内存读取本地凭据，核对Docker项目标签与实际port，然后覆盖所有Prisma/Test URL为同一个本地DB。脚本不reset数据库，也不加载.env。

```powershell
node scripts/run-local-security-stage.mjs migrate D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs integration D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs all-real D:/AIGC/platform-p1-isolated-20261028
node scripts/run-local-security-stage.mjs metadata D:/AIGC/platform-p1-isolated-20261028
```

当前integration和all-real**应返回非零**，因为两个未修复的安全回归真实失败；不得改为test.fails/skip或降低断言来获得绿色。脚本只向gitignored test-results写原始结果；不要把本地凭据、JWT和原始服务日志上传到公开PR。提交的verification.json保存每例名称/状态、报告哈希、版本、迁移记录和局限。

本轮原始执行使用相同检查与子进程的本地脚本，随后整理为上述参数化版本；版本化脚本metadata已在同一真实栈运行验证。未冒称Storage/CDN或浏览器已测试。复现结束仅停止带本任务project标签的栈，不停止Docker引擎或其他用户容器；本轮保留一次性数据库卷供复查。
