# 代码索引、数据模型及API状态

> fbd29c4 首轮实施快照。当前已有私有资产删除修复及 4 个新增迁移；最新索引见 [整改实现记录](remediation/implementation.md)。下文“旧业务代码未改”等描述仅对应首轮。

## 已实现的CI整改

| 文件 | 变更与原因 |
|---|---|
| `.github/workflows/security-acceptance.yml` | 使用统一 `pnpm test:integration`，替代仅列usage/proposal的第二份名单；JWT/RLS也包含于统一入口。没有删除测试或降低required checks |
| `package.json` | test:integration指向完整执行器；test:rls仍保留独立使用 |
| `scripts/run-security-integration.mjs` | 递归发现tests/integration下全部`.test.ts`；要求本地隔离环境及明确mutation flags；强制子进程REQUIRE_SECURITY_TEST_DATABASE；逐套件/逐断言核验报告，任何失败、漏跑、skip/TODO、空报告或计数不符都失败；每次报告使用新目录防止复用旧绿灯 |
| `scripts/run-security-integration.d.mts` | 维持strict TypeScript，不关闭allowJs/strict或绕过模块类型错误 |
| `scripts/run-security-integration.test.ts` | 行为测试：未来/嵌套套件发现、漏套件、skip/pending/TODO/failed、计数异常、缺环境及远程端点拒绝；临时目录清理验证明确目标 |
| `features/memory/proposal-security-acceptance-contract.test.ts` | 原字符串断言要求package/workflow重复列Proposal文件，无法适用统一发现。改成检查实际发现Proposal、verification、RLS及工作流调用统一入口；其余迁移/E2E护栏保留，未放宽安全断言 |
| `tests/integration/tool-asset-deletion.integration.test.ts` | 新增真实PostgreSQL+Auth/JWT删除回归；Storage remover为明确的故障注入边界。保留两个失败断言以阻断不安全删除 |
| `scripts/run-local-security-stage.mjs` | 显式workdir和Docker标签/loopback/port核对；在内存获取隔离栈配置再运行迁移/真实测试；不reset、不读取生产.env，原始日志仅写ignored目录 |

CI漏测根因是工作流手写两套文件、随后静态job排除全部integration；package原有第三套verification因此从未被安全job执行。新入口实际发现并执行了该套件。远端工作流没有被本轮触发，不能写成GitHub CI已绿。

## 数据与接口实现状态

本轮在独立本地Supabase中应用17个既有版本化Prisma migration；未修改历史migration，未新增Project表、索引、RLS或GRANT。16张既有public表启用RLS。生产数据库与环境变量未接触。

**Project Registry、Draft/Version/Release、PublicationReview、Membership、ProjectAsset、Documentation、公开目录/文档/资产API均未实施。** P0.5的25个operation全部仍为候选；未添加占位路由、假成功接口或对外开关。功能尚未接入，不能把“无新增路由”冒称功能开关或AuthZ已验收。

旧业务代码未改。删除缺陷需要持久清理依据、复合所有权/路径约束和真实故障矩阵；发现新的命名空间边界缺口后依Owner要求停止受影响模块实施，先提交阻断报告。没有用单个catch/throw补丁冒称资源治理完成。

## 本机运行边界

独立Supabase project ID `aig-platform-p1-20261028`，临时配置目录 `D:/AIGC/platform-p1-isolated-20261028`；DB `127.0.0.1:55432`、API `127.0.0.1:55431`。CLI最初发布端口到所有接口，已在任何迁移/账户种子前重建本任务DB/Kong容器为loopback绑定并核对标签。没有启动网页服务。

CLI status仅在内存传给测试子进程，DATABASE_URL/DIRECT_URL/TEST_DATABASE_URL都覆盖为该临时栈；不复制任何用户.env。原始本地日志/临时运行器保留于gitignored `test-results/`，提交证据只保留脱敏摘要和断言状态。

没有执行原 `verify-security-migrations.mjs` 的reset流程：它根据cwd定位默认Supabase项目，而本轮使用显式临时workdir；在未补齐reset目标一致性校验前不冒险运行。clean迁移本身已实际成功，旧库升级/注入migration失败回滚仍需单独补验，未记通过。
