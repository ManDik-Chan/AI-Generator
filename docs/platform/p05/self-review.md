# 自查报告与最终建议

2026-10-28 · 内部 · Owner最终GO权限保留。

## 独立自查方法与发现修订

本轮没有使用子代理。初稿完成后按原11项问题与威胁逐项重读，并运行独立于应用的结构/语义检查；这是本代理第二遍自查，不冒称第三方独立审计。未操作生产数据库、迁移、环境变量、工作流/required保护、业务源码、UI、合并或部署。

| 自查点 | 发现与修订 | 复核结论 |
|---|---|---|
| 方向/阶段 | 原P0完整发布放P3，而P1需要最小闭环；本案提前内部命令，外部Portal仍后续 | 显式记录变化，Owner尚未批准 |
| 多版本矛盾 | P0与新机器契约并存可能误用 | 旧包移archive/p0，顶层README指向唯一P0.5候选，旧生成器仅历史 |
| Draft泄漏 | 旧Version强制发布时间且无DraftDTO | 独立Draft/Version/Release；外部投影只封存版本，不输入Draft；参考正反例 |
| 资产/撤回 | 直接public bucket或永久CDN缓存无法逐次撤权 | 独立curated私有origin、公开读取gate、P1 no-store；已下载不可追回如实说明 |
| 可见性/历史 | 只切current指针可能被误当撤回；回滚旧URL复活 | 明确withdrawReleaseIds、全项目收紧先撤全部release；回滚新review/new releaseId |
| 审核/权限 | 批准摘要可能与资产净化结果/目标可见性漂移 | review绑定revision/hash/digests/visibility/policy/expiry；实时角色/epoch复检 |
| 过度设计 | 通用Job/Vault/3D/Portal可能混入首版 | P1单对象静态上传/8实体，paths无运行或凭据；研究复杂性以声明/文档表示 |
| 视觉保护 | 源hash不能替代截图/录屏；AGENTS禁浏览器 | 未运行浏览器；golden明确MISSING，不改Landing，也不以旧Lumen指导 |
| 真实性 | CTMR源码/论文/LFS/模拟输出容易混称实验 | 独立四级Claim，无证据拒EXPERIMENT_VERIFIED；无真实CTMR内容许可 |
| 真实测试 | 参考函数可能被误当应用安全实现；CI成功掩盖verification漏跑 | 明确reference-only，真实DB/Storage/视觉未执行；R04/R05/R06继续OPEN |
| 资产最小字段 | 初稿APPROVED结构可能缺净化hash/size/scanRevision；读取样例只核映射ID | Schema条件required补齐；读取样例对照映射digest，增加缺hash/摘要不符拒绝例 |
| 时效与Private文档 | 初稿时效比较直接用字符串、Private文档缺净化字节读取操作 | 按带时区instant比较并测偏移时区过期；新增内部同项目净化字节GET，无源文件回退 |
| 平台请求体边界 | 初稿10MiB内部上传会再次撞现有Vercel请求/响应上限 | 查官方现行限制后缩到2MiB、图像4M像素；同步Schema/协议，较大对象和分块不提前实现 |
| RLS规范单一性 | 初稿保留“内部JWT可直读或仅DTO”的选择会推迟权限收敛 | P1统一客户端无基础表GRANT、RLS默认deny、所有读取经显式AuthZ DTO；未来直读另审 |

## 证据分层

| 类别 | 本轮结果 |
|---|---|
| 静态规范已验证 | 输入与源码基线、7份Schema metaschema（含未来路由）、OpenAPI规范、文档链接、生成一致性、限定文件变更；见 evidence |
| 契约测试已通过 | 原42结构用例复跑；新增106项用例通过（含生成/链接/源码等校验，并非106项安全测试），每例见 validation.json；仅离线参考规则 |
| 真实数据库安全测试 | **本轮未执行**；历史同tree CI的7RLS/14事务不能替代新Project安全；verification套件漏跑仍OPEN |
| 浏览器视觉验收 | **本轮未执行**，无新golden/录屏/Owner绑定签署 |
| 其他未执行 | 实际Storage/CDN/撤回/解码器故障测试、应用回归、JCS跨语言、SDK/codegen、Provider/GPU/KMS、生产核验 |

[最终完整性复核](evidence/final-audit.json)：618个原有Git blob逐字节一致；两个原checkout的HEAD/分支/status未变；机器契约重复生成摘要一致。输入/P0归档保留原始字节，局部.gitattributes阻止换行转换破坏证据哈希。

## 判定

**P0.5可供Owner审阅；有限P1 flag关闭开发可申请批准；当前P1未GO，对外开放NO-GO。** 申请对象只含内部项目管理/草稿版本/审核发布、公共只读目录/详情/文档、已批准静态成果、所有权/RLS和对应安全验收。Owner需要确认范围、内部人员与职责分离、Private/Unlisted语义、公开资产/no-store政策及视觉保护交接；本代理不代签。

实现前的规范断点R01/R02/R03/R11已形成可测试候选；运行闭环尚未实现。R04需CI独立修复与真实完整integration；R05需获准的绑定SHA视觉基线与行为验收；R06旧删除隐私风险独立优先修，新Project不得复用。真实Project双路径授权、发布并发/快照无泄漏、Storage/缓存撤回、兼容回归与视觉未通过时不得对外开放。

R07耐久任务/R08计算路由/R09凭据子调用/R10模型运行可延后且维持各自NO-GO；CTMR公开文字/资产授权仍是CTMR内容开放阻断，不阻断用合成非AIfixture做受控P1开发。生产迁移、合并、部署和对外发布必须另获Owner批准，不能由有限开发批准自动覆盖。
