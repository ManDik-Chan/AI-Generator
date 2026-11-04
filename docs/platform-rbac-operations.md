# 平台角色运维

OWNER 是平台角色，与项目 OWNER 完全独立。迁移只扩展枚举，不任命 OWNER；未绑定时 ADMIN 不能授予或撤销管理资格。切勿将服务密钥、数据库凭据或审批 UUID 放在客户端或公开环境变量中。

## 首次绑定（先在隔离数据库演练）

生产执行需要 Owner 单独批准：通过独立可信渠道核对不可猜测的 Auth UUID 与已验证邮箱、确认目标账号受 Owner 控制，并审核此脚本和演练证据。另行批准实际执行；本次任务不会操作生产。备份数据库，安排维护窗口，暂停所有应用写入及 Auth 管理操作；只有数据库高权限运维人员执行。没有经过审批的 UUID 时停止。以下事务在实例的 SQL 控制台执行，替换占位符为经批准的 UUID；不要根据邮箱查询后自动选取用户。事务锁定 Auth 和 profiles，防止并发身份删除及重复绑定。执行者应在独立受保护运维审计中保存审批、执行人和请求 ID；表中 actor_id 表示批准绑定的目标 OWNER，不表示该用户通过网页发起了操作。

```sql
BEGIN;
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
DO $bootstrap$
DECLARE
  approved_uuid uuid := '<OWNER_APPROVED_AUTH_UUID>'::uuid;
  prior_role public."Role";
  prior_role_version integer;
  bound_role_version integer;
  operation_id uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT FROM public.profiles WHERE role = 'OWNER') THEN
    RAISE EXCEPTION 'OWNER already exists';
  END IF;
  IF NOT EXISTS (SELECT FROM auth.users WHERE id = approved_uuid
    AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
    AND (banned_until IS NULL OR banned_until < now())) THEN
    RAISE EXCEPTION 'approved identity missing, unverified or disabled';
  END IF;
  SELECT role, role_version INTO STRICT prior_role, prior_role_version FROM public.profiles WHERE id = approved_uuid FOR UPDATE;
  UPDATE public.profiles SET role = 'OWNER', updated_at = now() WHERE id = approved_uuid;
  SELECT role_version INTO STRICT bound_role_version FROM public.profiles WHERE id = approved_uuid;
  IF bound_role_version <> prior_role_version + 1 THEN
    RAISE EXCEPTION 'OWNER role version did not advance';
  END IF;
  INSERT INTO public.platform_role_audits
    (id, actor_id, target_id, old_role, new_role, request_id)
  VALUES (gen_random_uuid(), approved_uuid, approved_uuid, prior_role, 'OWNER', operation_id);
  RAISE NOTICE 'bootstrap operation id: %', operation_id;
END
$bootstrap$;
COMMIT;
```

验证仅存在一个 OWNER、目标 Auth 身份仍已验证且启用、角色版本已增加、审计记录和审批记录匹配。角色版本由数据库触发器维护，不能由脚本或应用自行设置。然后用真实隔离账号验证权限矩阵及原管理员功能，再恢复应用写入。首次绑定不能重复执行。日常界面不能转移 OWNER；身份转移需另行设计和审批高安全流程。

## 恢复及回滚

生产前先验证备份可恢复及迁移工具状态。若绑定误操作或 OWNER 身份丢失，停止应用和 Auth 管理写入，保存数据库和审计快照，由 Owner 单独批准的多人复核恢复流程处理；不要让日常应用账户禁用触发器或绕过唯一索引。恢复需要数据库超级权限，需记录具体执行者、UUID、审批、每项变更并事后核对审计。触发器保护 Auth 删除、封禁和软删除，也会阻止直接删除 OWNER profile；绕过或重建这些保护必须在隔离环境先演练，并在重新开放服务前验证。当前版本不提供 OWNER 转移脚本。

从 Supabase 逻辑备份（`supabase db dump` 的 roles / schema / data 三段）恢复到新实例时，dump 不包含 `auth` 和 `storage` schema 中由迁移创建的对象。恢复后 `auth.users` 上缺少 `users_protect_platform_owner`（OWNER 身份的删除、封禁和软删除保护）以及 `on_auth_user_created`，storage 上缺少 Registry 的 RESTRICTIVE 策略和触发器。新实例的默认授权还会给应用表加上 `anon` / `authenticated` 的 REFERENCES/TRIGGER/TRUNCATE/MAINTAIN 权限，Registry 表还会加上 `service_role` 的这些权限。因此必须按以下顺序执行，且在重新开放服务前完成：

1. 按 Supabase 文档顺序在一个事务中恢复：`psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql`。
2. 用与备份迁移状态一致的 `prisma/rls.sql` 执行 `psql --single-transaction --variable ON_ERROR_STOP=1 --file prisma/rls.sql`。若备份已执行全部迁移，使用当前 `main` 的版本。若是 15 个迁移的生产 schema，使用 `f4d3023` 的版本，再执行 `prisma migrate deploy`。版本不匹配时，脚本会因缺表报错并整体回滚，不会部分生效。
3. 核对：`prisma migrate status` 无待执行迁移；`auth.users` 上存在 `users_protect_platform_owner` 与 `on_auth_user_created`；对 OWNER 执行封禁或降级会以 42501 被拒绝。最后按上文验证仅存在一个 OWNER。

`scripts/verify-rls-restore.mjs` 已在本机一次性栈上用合成数据演练“全部迁移 → 备份 → 清空 → 恢复 → `rls.sql`”。与直接迁移的数据库相比，安全目录、结构及数据指纹一致，仅有 4 处已知的等价文本差异，OWNER 保护触发器在恢复后仍然生效。尚未在托管实例上或用真实生产备份验证，详见 `docs/ci-pipeline.md`。

回滚应用前先确认旧版本无法把 OWNER 当作普通用户误操作；迁移后的 OWNER 枚举不能简单删除，历史审计也依赖该类型。优先恢复经验证的迁移前备份，并核对迁移历史和 Auth 一致性；若需保留迁移后数据，应另行设计经过演练的前向修复和审计保留方案，不能仅删除表或手动改 Prisma 迁移历史。不得把此说明当作生产执行授权。
