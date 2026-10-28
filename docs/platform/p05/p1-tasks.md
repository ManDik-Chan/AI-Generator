# 最小 P1 实施任务与依赖

仅供向Owner申请限定开发，不是已授权开始。分支/PR均后续单独建立。本轮仅规范文件；禁止以本表指令执行迁移、UI改动、合并、部署。

| 卡片 / 主责 | 文件/工作范围 | 依赖与验收 | 回退 |
|---|---|---|---|
| P1-00 Codex/Owner 契约冻结 | 本P0.5、公开资产政策、内部资格与角色名单、Private/Unlisted语义、P1范围 | Owner明确APPROVED；后续代码只flag关闭开发。无需先有尚未实现的Project真实测试 | CHANGES_REQUESTED则修候选，不开始业务实现 |
| P1-01 Codex CI完整性 | security-acceptance workflow与统一integration发现/执行报告；不改required settings | P1-00；真实隔离Supabase跑verification/usage/proposal，缺环境/意外skip失败，六required保留。Node24字体另调查 | 独立回退workflow，不能回退成漏测并宣称验收通过 |
| P1-02 Codex Registry | 8实体最小migration候选、复合FK/unique、authz、内部资格、默认deny RLS/GRANT | P1-00；仅开发库受控迁移，clean+incremental+旧读兼容，anon/A/B JWT/高权限服务双路径。先计划和实现后测试，开放前通过 | 关闭入口，保留表/约束与审计，不恢复危险客户端写 |
| P1-03 Codex 管理/快照 | 内部commands、DraftDTO、review/封存Version、JCS跨语言向量、幂等/CAS、发布投影 | P1-02；自审/改hash/成员撤销/双发布/响应丢失/版本冲突真实测试；SDK消费编译支持矩阵 | flag关闭、保留审核历史，禁止覆盖Version |
| P1-04 Codex 资产闭环 | 独立quarantine/curated存储、受限字节上传、净化、来源授权、no-store资产服务、删除清单 | P1-02/03；真实恶意文件/路径/跨项目/源bucket绕过/撤回/故障注入；不依赖旧Tool删除链 | 关闭资产发布和读取，保留清理清单，撤回污染release |
| P1-05 Codex 公开只读 | 目录/详情/Version文档/资产映射、SSR metadata白名单，无Draft join、非AIfixture | P1-03/04；公开/Unlisted/Private目录/缓存/OG/翻页/历史release、Draft canary和旧API兼容 | 关闭新增路由，不动Landing/Workspace |
| V1-00 Claude 基线 | 正常截图/桌面触屏视频、7宽度/双语言/JS与motion记录 | 先明确恢复浏览器授权并遵守AGENTS；绑定SHA，Owner收具体素材；不重新表决已认可设计 | 保存失败状态，不编造golden |
| V1-01 Claude 设计 | Project Showcase/Research Lab/Developer Console交互与视觉稿；按本契约、标fixture | P1-00 + V1-00；Console仅内部，Lab无GPU/3D操作；Owner批准新增页面 | 未批准不实现；不改首页 |
| V1-02 Claude + Codex 新页面集成 | Claude视觉、Codex数据/权限集成，单独PR；Landing退化修复另RFC | P1-05/V1-01；浏览器获准后键盘/触屏/7宽度/reduce/noJS及旧页面回归，Owner接受差异 | 回退新UI，不替换首页runtime |
| P1-06 Codex/复核人 总验收 | 固定SHA、完整原CI、真实JWT/RLS/Storage/并发/兼容、视觉证据 | P1-01至05 + V1-02；每个S01–S10可指证据，所有失败/skip归因，Owner另批准开放/环境操作 | 未通过持续关闭；部署/生产迁移另授权 |
| PRIV-01 Codex 独立隐私修复 | 旧Tool资产删除失败保留依据，tombstone/重试与孤儿调查计划 | 单独授权；Storage失败/DB失败/重复/并发/恢复后重试，不影响账本额度。生产扫描另批准 | 无法通过不得声称旧隐私关闭；P1不复用旧链 |

依赖：00→02→03/04→05；00→01；V00→V01→V02；01+05+V02→06。只有开发可并行，开放不得跳过依赖。PRIV-01独立优先修，不把无关全平台删除系统绑定成纯展示实现前置。

可申请Owner批准的集合：内部注册/管理、草稿版本、审核受控发布、公共只读目录/详情/文档、获准静态展示、所有权/RLS及对应测试；默认入口关闭，外部自助写入不开放。批准不解锁BYOK、任意第三方代码、Job/GPU、CTMR医学推理、未经审核发布或公开读取私人数据。

完整成员邀请/转移、Embed、multipart、通用Viewer、Remote Endpoint、Outbox、计费、KMS/SESSION、SDK公开发行留后续阶段。对外开放还需独立生产操作批准、实际部署与存储配置核验；本轮不准备自动部署行为。
