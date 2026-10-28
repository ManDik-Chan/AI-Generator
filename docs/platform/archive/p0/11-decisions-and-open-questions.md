# 决策、开放问题与审批记录

> INTERNAL · DRAFT · 2026-10-28 · 所有推荐均为 **Inferred / Proposed**。用户本轮明确授权执行 P0，不等于批准 P1、生产迁移、远程运行或发布私有素材。

## 已知约束

- **Verified（用户请求/路线图）**：执行 §13.1 的只读审计与规范；保留 Landing 和旧 AI 行为；不建表、不合并、不部署。
- **Verified（源码/API）**：主线SHA、CI/rulesets、CTMR固定版本见对应审计；已发布修复与仍未验收的部署事实分开记录。
- **Unverified**：任何“Owner 已批准这套新架构/Schema/新增页面”的说法。当前审批状态一律 PENDING。

## 待 Owner 选择（进入对应阶段前解决）

| ID | 决策 | 推荐候选 | 依赖/Gate | 状态 |
|---|---|---|---|---|
| D-01 | Developer 准入 | Owner/邀请制 Beta | P1/P3 | PENDING |
| D-02 | Private 共同开发 | 明确邀请，OWNER/MAINTAINER/EDITOR/VIEWER；不做组织计费 | P2 | PENDING |
| D-03 | Key 长期保存 | P5 支持加密持久模式；会话模式须证明不持久化 | P5/KMS | PENDING |
| D-04 | 任意 Provider URL | V1禁止；只用审核Registry | P5/SSRF | PENDING |
| D-05 | 外部 GPU | 首批审核CTMR + 合成数据；无任意Worker注册 | P4/P6 | PENDING |
| D-06 | 真实医学上传 | 默认禁止，另做数据治理及安全审查 | P6之后 | PENDING |
| D-07 | 品牌/域名 | 保持 ai-mdc.com 与当前设计基底 | 独立视觉PR | PENDING |
| D-08 | 托管任意源码 | V1不开放 | P7之后 | PENDING |
| D-09 | Durable queue/workflow | Spike后选托管workflow或DB outbox+持久队列 | P4前；必须kill/replay/对账验证 | PENDING，尚无实测胜者 |
| D-10 | KMS/Secret service | 托管KMS与独立网关身份；区域/费用/轮换须评估 | P5前 | PENDING |
| D-11 | 留存/删除/备份/出境与处理者 | 每数据class明确期限、公开告知和可执行删除SLA | P2/P4 | PENDING |
| D-12 | API浏览器认证桥与CSRF | 复用现有Supabase SSR会话；新API客户端Bearer验证；不另造账户 | API冻结前；OpenAPI当前仅形式化Bearer | PENDING |
| D-13 | 下载与撤销URL语义 | Owner API鉴权下载/短期URL；需明确撤销无法收回已下载副本 | P2/P4 | PENDING |
| D-14 | 公开素材/文档边界 | CTMR作者逐项许可；审计资料保持内部；另做脱敏公开文档 | P1内容发布前 | PENDING |
| D-15 | 视觉golden与兼容补救 | 锁SHA+桌面/手机截图+录屏；Claude单独提无JS/低动态修复差异 | P0/P1视觉Gate | PENDING |

技术选型和数据策略未决不阻断本轮形成具体草案；相应实施/上线必须等决定与真实验收。避免现在要求用户一次回答所有决策。

## 审批记录（未签）

| 候选 | Owner | 结论 | 时间 / 证据 |
|---|---|---|---|
| P0文档整体、Project/权限/契约 | 待签 | PENDING | 不由模型代签 |
| Landing源码视觉基线与golden | 待签 | PENDING | 路线图说明现有视觉已认可；golden未归档 |
| P1实施范围及拆分 | 待签 | PENDING | 未开始 |
| 生产/真实数据/私有素材发布 | 待签 | PENDING | 未授权、未执行 |

Owner 可对具体候选给出 APPROVED 或 CHANGES_REQUESTED；有条件批准需附范围、条件、版本、有效期和责任人。后续若主线更新，重新锁SHA并补差异，不静默把新源码纳入本轮结论。
