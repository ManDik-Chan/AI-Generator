# Supabase Auth 配置

## 1. 创建 Supabase 项目

在 Supabase Dashboard 创建项目，复制 Project URL 与 anon key。数据库连接分别配置 pooled `DATABASE_URL` 和 migration 使用的 `DIRECT_URL`。

## 2. 配置本地环境

复制 `.env.example` 为 `.env.local`，填写：

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

`SUPABASE_SERVICE_ROLE_KEY` 只保留给未来受控管理任务，当前认证流程不需要，也不得传到客户端。

## 3. 初始化数据库

```bash
pnpm db:migrate
```

将 Prisma 生成的 migration 纳入 Git。随后在 Supabase SQL Editor 执行 `prisma/rls.sql`，启用用户数据 RLS、Message 关联策略以及新用户 Profile trigger。

## 4. 配置 Auth URL

本地 Site URL 使用 `http://localhost:3000`，Redirect URL 添加 `http://localhost:3000/auth/callback`。Vercel Preview 与 Production 分别添加对应 HTTPS 回调地址。

## 5. 管理员

新用户默认角色为 `USER`。首个管理员必须由项目所有者在可信数据库控制台中显式更新：

```sql
update public.profiles set role = 'ADMIN' where email = 'owner@example.com';
```

客户端不能修改 role；`/admin` 同时经过 Supabase 会话校验和服务端 Profile 角色校验。
