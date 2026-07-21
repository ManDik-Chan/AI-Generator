# P0 安全加固部署与回滚

本说明适用于 migration `20260722120000_security_hardening_rls_usage` 和 `20260722160000_strengthen_usage_idempotency`。本开发任务没有连接或修改 Production，也没有执行任何 Production migration。

> **Deployment Order — 不满足下列顺序时禁止合并 PR #22。** 当前 Vercel Git 集成会在 `main` 更新后自动创建 Production deployment，而新应用会立即查询 `usage_ledger`。因此不能先合并应用再补数据库。

1. **Backup**：创建可验证恢复的数据库备份，并保存当前 grants、RLS policies、functions、triggers 与 migration 状态快照。
2. **Apply migration**：从 PR #22 最终审核 commit 检出代码，先对 Production 执行两条向后兼容 migration；本 PR 的自动化和维护者不得代替数据库负责人执行此步骤。
3. **Verify grants/RLS**：确认浏览器身份对运行状态表只有 `SELECT`，Profile 仅有三个可更新列，并确认 `usage_ledger` 的两个唯一索引存在。
4. **Run smoke tests**：使用专用合成测试账户验证 Profile 自提权失败、运行表写入失败、旧应用读取仍正常；不得使用真实用户数据。
5. **Deploy application**：上述步骤全部成功后才合并 PR #22，让 Vercel 部署应用。
6. **Run post-deploy checks**：检查新 commit、migration 状态、登录、聊天/工具 reservation、409 幂等响应、账本增量与错误率；失败时执行下方回滚。

如果组织流程不允许在合并前执行 Production migration，必须把 migration 拆成独立的数据库兼容发布，等它在 Production 验证完成后再 rebase/合并应用 PR。不要依赖 Vercel 与数据库迁移“同时完成”。

## 发布前置条件

1. 对 Preview 使用独立、已备份、禁止真实用户访问的 Supabase 项目；不要把 Production 连接串放入本地测试环境。
2. 确认 `pnpm exec prisma migrate status` 只显示新增 migration 待执行，历史 migration 文件的校验和没有变化。
3. 备份 `profiles`、`messages`、`tool_runs`、`agent_runs` 及 RLS/grants 元数据；记录当前应用 commit 和 migration 状态。
4. 对 Production 安排受控的短写入维护窗口，避免账本回填与旧应用同时创建未入账的新记录。不要在本 PR 的 CI、Preview 或开发机上连接 Production。

## Preview 部署

```bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate status
pnpm db:deploy
pnpm exec prisma migrate status
```

`pnpm db:deploy` 会通过版本化 migrations 创建并回填 `usage_ledger`，部署 Profile 列级权限、运行状态表只读 grants、RLS policies 和触发器。正常发布不得再人工粘贴 `prisma/rls.sql`；它只用于数据库恢复后的完整基准重建。

第二条 migration 把“每用户、capability、run”唯一收紧为“每用户、run”唯一。应用层另以 `(user_id, idempotency_key)` 唯一索引防止同一请求的并发或重试重复记账。两条约束都必须在应用发布前存在。

应用发布前，在 Preview 以数据库所有者执行只读核验：

```sql
select capability, count(*), sum(units) from public.usage_ledger group by capability order by capability;
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated')
order by table_name, privilege_type;
select schemaname, tablename, policyname, cmd from pg_policies where schemaname = 'public';
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'usage_ledger'
order by indexname;
```

随后使用两个专用测试用户执行 `pnpm test:rls`、`pnpm test:integration` 和带 `PLAYWRIGHT_AUTH_STATE` 的 `pnpm test:e2e`。必须实际证明：role 更新失败；运行状态写入失败；跨用户读写失败；删除历史不减少账本；并发请求不能超过限额。不要使用 Production 用户或数据。

## 增量升级注意事项

- 两条 migration 均使用显式事务；任何 SQL 失败应整体回滚。
- 回填按既有 Message、ToolRun、AgentRun 创建不可由浏览器修改的账本行，`ON CONFLICT DO NOTHING` 保证重复恢复操作不重复记账。
- 新应用必须在 migration 成功后发布，否则 Prisma Client 查询不存在的 `usage_ledger` 会失败。Vercel 的 `main` 自动 Production deployment 使这条要求成为强制发布门禁。
- Preview 验证通过后，Production 仍应安排短维护窗口：先暂停写流量，备份，再运行 migration，再发布新应用，最后恢复流量。

## 回滚

首选前向修复，不删除 `usage_ledger`，也不恢复浏览器写权限。

1. 若 migration 未开始：停止发布，不做数据库变更。
2. 若 migration 事务失败：确认 Prisma 记录与数据库对象均未部分落地，修复 SQL 后创建新的 migration；不要修改已在任何环境成功执行的 migration。
3. 若 migration 成功而应用发布失败：回滚应用 commit。旧应用仍可使用历史表；保留账本和收紧后的 grants/RLS。修复应用后重新发布。
4. 若新应用已接收请求：不得 DROP 账本或清除回填。数据库结构回退会丢失安全审计与额度事实，必须通过新的前向 migration 完成。
5. 只有在业务完全不可用且负责人明确批准时，才从预先保存的权限快照恢复；恢复旧 Message/ToolRun/Profile 写权限会重新打开 P0 漏洞，不是安全回滚。

## 合并保护

PR #22 合并前，应在 GitHub `main` ruleset/branch protection 中把 `Supabase Security Acceptance` 设为 required check，并保持 PR 必须最新。若 PR #21 尚未合并，先合并 #21，再 rebase #22，并让该 required check 在新的合并基线上重新通过。当前仓库未启用 `main` branch protection 时，不能把 CI 文件存在视为已形成门禁。

## 密钥与日志

迁移和测试输出不得包含连接串、JWT、Service Role Key、Provider Key、数据库密码、真实用户内容或 signed URL。CI 的一次性测试账户和 storage state 应由 secret 管理器注入，并在作业结束后销毁。
