# P1-B3-A 验收报告与证据边界

依赖门禁已核实：Owner `ManDik-Chan` 合并 PR #38，main 为 `64a571834a80a05045e3c6607e59576bc5b34fcf`，包含最终 B2-B 核心。本轮独立分支 `codex/p1-b3-a-quarantine-20261031`，不合并 main。

## 交付结果

私有 Registry bucket、不可变对象意图、Quarantine 及实际字节证据已实现。对象身份绑定项目/资产/摘要/随机 ID/Storage generation，来源与候选均实际读回；权限、对象或策略变化使重放拒绝。失败事务不留下成功验证，保留可核对的私有意图和对象；相同请求可以安全恢复。

扫描版本固定 unavailable-v1，所有结果 BLOCKED；没有 PASS、资产批准或 Release 发布效果。公开读取、CDN、公共上传、签名 URL、生产 Supabase 和部署均未开放。Claude 前端无修改。契约与剩余能力见 [Quarantine 协议](registry-b3a-quarantine-contracts.md) 和 [安全交接](handoffs/2026-10-31-codex-registry-b3-a-security.md)。

## 验证方式与记录

| 检查 | 本轮记录 |
| --- | --- |
| 本地真实安全首轮 | 11 suites / 155 passed，0 skip/TODO，包含 P1-A、B1、B2-A、B2-B 与当时 22 项 B3-A；随后补入第 23 项真实攻击验收 |
| 新增覆盖 | 23 项真实 Auth/JWT/PostgreSQL/Storage 集成测试，6 项内容与默认拒绝单元测试 |
| 非数据库单元 | 162 files / 1079 passed；集成测试另外真实执行，不以 skip 作为安全证据 |
| lint / typecheck | 通过，零 warning；后续候选仍必须通过同一 required CI |
| Prisma / docs sync / diff | schema validate、docs:sync --check、diff --check 通过 |
| Node 22 build | 通过，53 个静态页面生成成功 |
| Registry 迁移 | 全 26 项 checksum、空库、重复 deploy、历史 B1/B2-A/B2-B 数据升级、5 项 Registry 事务故障注入和 catalog/data/Storage 回滚通过 |
| 本地 security advisor | error 0；仅遗留 public.memory_keywords_valid 的 mutable search_path warning，来自既有 20260713110000 迁移；本轮新函数均固定 search_path |
| 最终候选 | 以独立 Draft PR 对应 head 的完整真实安全报告、所有 required contexts、Node 24、Python JCS 和两个远端浏览器矩阵为最终证据，不借用旧 head 状态 |

本地项目 `aig-platform-p1-final-b3a-20261031`，API/DB `127.0.0.1:60421/60422`。disposable marker、CLI status、容器 labels、端口一致性及 loopback 由现有守卫核对。没有 linked project、应用 dotenv 或生产连接；原始日志和含合成身份的诊断仅保留在 ignored test-results，不提交凭据。

中间一次最终回归误与会重建本地库的 migration clean 校验并行，导致数据库连接中断；该失败不计为通过，保留原始报告，迁移完成后串行重跑。没有调整断言、skip、权限或 required contexts 来消除失败。最终串行执行结果、fixture 与测试栈收尾状态记录在 Draft PR 验收正文。

攻击验收覆盖当前/伪造/到期 JWT，项目角色与独立动作资格、ADMIN/user_metadata 无效、跨项目 ID，bucket/path/URL/扫描结论注入，摘要/MIME/长度不符、截断图像、HTML/SVG/二进制/无效 UTF-8，输入缓冲区异步替换，private bucket 读写/签名/公开 URL 拒绝及宽松 policy 下的 restrictive 隔离，同键并发与内容冲突、撤权重放、独立验证、源及候选同字节/不同字节替换、对象删除、scanRevision/rights/policy/epoch 失效、不可变证据、真实事务 ACK 失败和末端资格自然过期。

新增迁移为 `20261031095630_registry_private_quarantine`，SHA-256 `91a91f7b21dfd78c33395077a78ee150a52fa47ec00d645108e40b1c68755edd`。既有 25 项 migration 与所有旧测试断言不变。迁移验收新增实际升级后的旧 Storage bucket、对象、policy 和 trigger 保存检查；最终 CI 必须执行该最新脚本。

本地依照 `D:/AI-Generator/AGENTS.md` 不启动或连接浏览器；远端 required 浏览器检查保留原矩阵。分支禁用 Vercel Git preview deployment。完成后仅交付 Owner 验收，不自动部署、发布或开始下一阶段。
