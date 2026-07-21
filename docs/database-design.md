# 数据库设计

## 约定

- PostgreSQL 由 Supabase 托管，Prisma 负责应用层 schema 与迁移。
- 主键使用 UUID，时间使用 `timestamptz`，数据库字段采用 snake_case。
- 所有用户数据实体都保存 `user_id` 并建立索引。
- 删除用户数据优先级联；高风险审计数据另行设计，不在核心版本过度建设。

## 核心实体

### User/Profile

Supabase `auth.users` 是身份源。应用层 `Profile` 保存 `id`（等于 auth user id）、display_name、avatar_url、role、created_at、updated_at。角色为 `ADMIN | USER`。

### Persona

- id, user_id
- name, avatar_url, description
- personality, identity, speaking_style, expertise
- system_prompt
- created_at, updated_at

约束：用户内名称可重复，但列表默认按更新时间排序；system_prompt 只由服务端模板生成/校验。

### Conversation

- id, user_id, persona_id（可空）
- title
- created_at, updated_at

索引：`(user_id, updated_at desc)`。删除会话级联删除 Message。

### Message

- id, conversation_id
- role：`SYSTEM | USER | ASSISTANT | TOOL`
- content（text）
- status：`PENDING | COMPLETE | ERROR`
- provider, model（可空，用于追踪）
- created_at

索引：`(conversation_id, created_at)`。消息所有权通过 Conversation 关联验证。

### Memory

- id, user_id
- content, category
- importance（1..5）
- source_conversation_id（可空）
- enabled
- created_at, updated_at

索引：`(user_id, enabled, importance)`。自动提取先进入待确认流程，不静默保存敏感信息。

### GeneratedImage

- id, user_id
- prompt, provider, model
- storage_path, width, height
- created_at

只保存对象存储路径，不持久化公开 URL。

### AppSetting / ModelConfig

仅管理员可修改。ModelConfig 保存 provider、model、capabilities、enabled 和非敏感参数；API Key 仍来自部署环境或密钥管理服务，不写入普通配置表。

## 所有权与 RLS

Supabase 表启用 RLS。除 Profile 的白名单资料列外，authenticated 对应用数据表只能读取 `user_id = auth.uid()` 的行；Persona、Conversation、Memory、Message、ToolRun、Generation/Brainstorm/Agent 状态、Embedding、GeneratedImage 与 UsageLedger 的 mutation 全部只走可信服务端。服务端仍做授权校验，RLS 是第二道防线而不是唯一防线。管理员能力通过受保护的服务端路径执行，不向浏览器暴露 service role key。

## 迁移顺序

1. Profile 与角色枚举
2. Persona
3. Conversation 与 Message
4. Memory
5. GeneratedImage、ModelConfig 与 AppSetting

实际 Prisma schema 在 Phase 2 创建，并以 Supabase 连接池与直连迁移 URL 分离配置。
