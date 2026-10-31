# P1-B3-A 安全交接

基线为 Owner 已合并 PR #38 后的 `main@64a571834a80a05045e3c6607e59576bc5b34fcf`。独立分支 `codex/p1-b3-a-quarantine-20261031`，worktree `D:/AIGC/p1-b3-a-quarantine-20261031`。完整协议见 [私有 Quarantine 契约](../registry-b3a-quarantine-contracts.md)，本轮证据见 [验收报告](../registry-b3a-validation.md)。

本轮新增私有对象意图、源 Quarantine、候选规范化和实际字节验证证据。公开读取、公共上传、CDN、签名 URL、Release 发布开关、生产迁移与生产 Supabase 连接均未开放。旧 `getPublicRegistryRelease` 无条件拒绝保留；本轮证据没有被接入 Release 发布。

Quarantine 是 pre-Release 来源身份，不要求资产先获 Release。未来另行建立绑定具体 Release 的不可变 delivery 授权，避免批准与导入相互依赖。所有扫描结果固定 BLOCKED；规范化只是候选转换，不是完整安全净化或扫描。未来须完成可信扫描引擎、规则集、失败/超时/期限策略、敏感内容及权利审核，才能单独评审是否允许资产信任升级。

三张 private 表和两个固定 private bucket 形成独立授权边界，不扩展现有用户资产类型。source/candidate 都绑定实际字节和对象代际；相同 key 的重试复用可审计意图。事务失败保留私有意图与可能存在的对象，当前没有自动垃圾回收或跨存储事务承诺。后续运维恢复只能核对确切意图、对象及当前资格，不能按任意路径补偿删除。

本轮未触及 Claude 的前端。任何控制台状态、上传或审核接口均需根据契约另行交接；不得将旧 APPROVED 或 BLOCKED 解释为可公开分发。

仅显式命名、有 disposable marker、容器标签匹配且 loopback 绑定的本地 Supabase 可运行验收。没有加载应用 dotenv、linked project 或生产连接。遵守 `D:/AI-Generator/AGENTS.md`，本地不启动或连接浏览器；现有 required CI、Node 24、JCS、两个远端浏览器矩阵全部保留，不修改原已通过断言或门禁。

迁移只追加 `20261031095630_registry_private_quarantine`；既有 25 项 migration 字节不变。回退先关闭全部 Registry flags 并回退应用，保留来源、意图、证据和 RLS/ACL；schema 修复采用前向迁移，不能删除历史、改旧 migration、公开 bucket 或恢复对象 URL。分支 Vercel Git preview deployment 关闭，不执行部署。

最终交付独立 Draft PR，由 Owner 验收并亲自合并。完成本轮即停止，不自动开始公开读取、delivery 或 CDN 阶段。
