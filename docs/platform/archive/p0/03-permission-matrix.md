# AuthZ Matrix 与资源隔离

> INTERNAL · DRAFT · **Inferred / Proposed**。本矩阵没有修改现有 Role enum 或线上授权。

## 角色

平台 USER/ADMIN 沿用现有身份；Developer 是项目创建资格，不是全库特权。项目成员角色为 OWNER、MAINTAINER、EDITOR、VIEWER；OWNER 通过受控转移操作变更，不能由普通编辑传入。MAINTAINER 可发布已审核版本，EDITOR 可编辑 Draft，VIEWER 只能读已授权内容。平台公开发布审核权单独受控。

| 操作 | 访客 | 已登录非成员 | 项目成员 | 项目 Owner | Platform Admin | 受控服务身份 |
|---|---|---|---|---|---|---|
| 发现 Public 已发布项目 | 允许 | 允许 | 允许 | 允许 | 允许 | 按职责 |
| 读 Unlisted 已发布链接 | 允许，不列目录 | 允许 | 允许 | 允许 | 允许 | 按职责 |
| 读 Private / Draft | 404 | 404 | VIEWER+ 在本项目 | 允许 | 无默认权限 | 有限审核凭证 |
| 改 Draft / 文档 | 拒绝 | 拒绝 | EDITOR+ | 允许 | 无默认编辑权 | 校验服务不持有编辑权 |
| 发布 / 下架版本 | 拒绝 | 拒绝 | MAINTAINER+，需审核 | 需审核 | 可审查/停用公开发布，留审计 | 发布任务专用身份 |
| 邀请 / 移除成员 | 拒绝 | 拒绝 | MAINTAINER 仅下级，不可增 OWNER | 允许，转移另走流程 | 无默认权 | 邀请令牌仅一次/过期 |
| 创建自己的 Installation / Grant | 拒绝 | 有项目访问且能力被允许 | 同左 | 同左 | 同左 | 不能替用户默认同意 |
| 执行能力 | 拒绝（V1） | 当前访问 + 自有有效授权 + 配额 | 相同条件 | 相同条件 | 相同条件 | 仅代表绑定主体/版本/attempt |
| 读/取消/删除运行与私有 Artifact | 拒绝 | 仅资源 Owner | 不能读使用者数据 | 不能读使用者数据 | 无默认私有正文权 | 工作任务的最小临时权限 |
| 读 Credential 元数据 / 撤销 | 拒绝 | 仅自己 | 仅自己 | 仅自己 | 无默认权 | Vault 身份仅按需 |
| 读明文 Key | 拒绝 | 不提供读取接口 | 拒绝 | 拒绝 | 拒绝 | 仅网关短期解密 |
| 授予公开分享 | 拒绝 | 自有非敏感资源，单独授权 | 不能替使用者分享 | 同左 | 不代用户分享 | 审核复制到公开资产区 |

## 统一决策顺序

1. 服务端验证身份；先判 Project 当前可见性/停用状态，再判版本为可访问的不可变版本。
2. 读权限不等于运行权限。检查有效 Installation、ProjectGrant 的 subject/version/capability/scope/audience/expiry、未撤销和当前成员状态。
3. BYOK 额外验证 Credential owner/status 与 CredentialGrant；后台子步骤逐项计入 scope 和预算。
4. Run/Artifact 的 owner 来自会话或已签任务身份，不信任 request.userId；联合键校验项目、版本、输入资产同属授权主体。
5. 每次执行、重试、回调提交、下载签名和分享均重验；撤销提升 authzEpoch，使旧 lease/callback 无法公开结果。已完成自有结果的读取按留存策略处理，不因 project 作者可见而开放。

## 数据库策略提案

新表默认不向 anon/authenticated 授权；需要直读的最小表/View 单独 SELECT + RLS，其余经服务层 DTO。公开只读投影也要明确 grants 和 `security_invoker`，不能把内部表裸露给目录。凭据载荷、outbox、步骤、回调去重、审计无客户端 GRANT。Owner/Member/Grant/Run 不能由 authenticated 直接 mutation。匿名 public read 只暴露审核过的 published projection。

真实测试必须同时覆盖 PostgREST 的普通 JWT 与服务端高权限连接；仅测试 Prisma where 不能证明 Data API 安全，仅测试 RLS 不能证明 server AuthZ 安全。Supabase 官方区分 [GRANT 对象权限与 RLS 行权限](https://supabase.com/docs/guides/api/securing-your-api)，两层需同时验收。

## 必拒绝案例

猜测 Private slug/id（统一 404）、Public 项目作者读 A 用户 Run、A 使用 B 的 Credential、用户通过 PATCH role/grant/status 自提权、篡改版本和 artifactId、过期邀请、撤销后重试/迟到回调、UNLISTED 进入公共搜索/站点地图、私有输入通过公开项目详情被序列化。
