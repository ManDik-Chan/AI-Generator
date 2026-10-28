# 威胁模型与测试矩阵

信任边界：外部访客、内部编辑者、不可信文档/字节、审核与发布服务、数据库高权限连接、隔离源存储和展示存储。内部编辑仍是不可信内容来源；高权限Prisma绕过RLS时显式AuthZ不能省略。

## 数据库候选控制（不执行SQL）

8实体默认deny；P1对所有客户端JWT（包括内部人员）不授基础表SELECT或mutation，不通过PostgREST暴露草稿、资产存储路径或review。内部和外部读取都走对应服务白名单DTO；RLS保持默认拒绝，不能把服务端高权限绕过RLS当作授权通过。内部所有操作需internal资格与成员两条件，用户A不能枚举B项目。移除资格/成员实时生效，不依赖过期JWT claim。未来若开放客户端直读属于新权限变更，须另行审核。

所有暴露schema表启RLS（私有schema亦建议）；GRANT与RLS分别验证，默认public函数EXECUTE必须撤销。无需SECURITY DEFINER的方案优先；若例外须非暴露schema、固定search_path、最小权限、明确auth.uid检查与审计。视图默认不作安全边界，需要security_invoker或直接撤销公开访问。UPDATE若未来开放必须USING+WITH CHECK且不能改owner。不得使用用户可编辑metadata授权。[Supabase RLS官方说明](https://supabase.com/docs/guides/database/postgres/row-level-security)。

| 逻辑记录 | anon/普通authenticated | 内部成员JWT直接DB | 高权限服务 |
|---|---|---|---|
| Project / Membership | 无基础表GRANT，不能枚举或写入 | 无GRANT，内部目录也经服务DTO | 同项目授权；资格配置不由项目成员自助写 |
| Draft / Version / Documentation | 默认deny | 无GRANT，内部预览经服务DTO | 每次AuthZ+revision+复合FK；公开只读API不读取Draft |
| Asset基础记录 / Review / 清理清单 | 默认deny | 无基础记录GRANT，避免storageRef和审核私人信息 | 服务端最小职责；审核与上传身份分开，公开仅白名单映射 |
| Release基础记录 | 默认deny | 无GRANT，经内部安全DTO | 外部只返回PUBLISHED的获准投影，读取仍复检可见性/撤回 |

P1不新增客户端可读DB view；纯服务DTO避免视图无意绕过RLS。真实数据库验收要分别记录对象权限拒绝、启RLS后的默认拒绝、角色/schema/function默认权限和高权限服务的同项目正负例，不把仅一个403当作所有层都已验收。

## 验收用例与真实证据要求

| ID / 威胁 | 必测负例 | 本轮证据 | P1实现/开放门禁 |
|---|---|---|---|
| S01 BOLA/私有泄漏 | A猜B project/draft/doc/asset；匿名带JWT访问Private公共路由；slug/OG/sitemap/分页计数 | 离线project/asset/projection用例 | 真实API与anon/A/B JWT直接PostgREST双路径，404、无内容/计数/缓存串读 |
| S02 草稿穿透 | 已发布后编辑Draft放canary，公开详情/历史Docs/SSR/meta只能旧快照 | 参考projection无Draft输入；额外DB字段不序列化 | 在真实数据库分离草稿/Version，抓响应及构建产物检查canary；禁止动态fallback |
| S03 发布提权/竞态 | external/EDITOR直接publish、自审、过期审批、撤成员、改hash/revision、两个publish并发 | 参考语义拒绝与state模型 | 真实事务/CAS/unique冲突、重试body不同409、响应丢失同receipt；过期JWT不保权 |
| S04 资产注入 | B资产挂A、未净化源、过期许可、hash变更、未知mode/viewer/capability | 离线引用/权利/digest/结构拒绝 | 真FK/映射约束与发布事务，所有入口一致拒绝；来源授权逐资产可追踪 |
| S05 恶意文件/路径 | ..、%2e、双编码、绝对盘符/UNC/symlink、伪mime、polyglot、超大像素、无Content-Length流 | 规范约束；未执行解码器 | 单对象字节/CPU/内存限额，清理隔离上传，无跨项目路径覆盖 |
| S06 XSS/外联 | HTML/script/SVG/Markdown图片/危险URL、reference link、实体/编码绕过 | 保守参考拒绝例，非真实sanitizer | AST白名单+sanitizer+浏览器行为，文档不外联，不脚本执行，无任意remote fetch |
| S07 缓存撤回 | Public→Private，release撤回，asset下线，HEAD/Range、直接origin、客户端/边缘故障 | 离线读取条件；no-store政策 | 真CDN配置/头/请求流量证据；撤回后新请求拒绝，原始origin拒绝；不承诺追回已下载 |
| S08 清理依据丢失 | Storage失败后DB继续删、DB失败后重复删、并发删除/对象缺失 | 旧源码缺陷复核；新规范tombstone | Project真实故障注入与重试；旧Tool链独立修复，未关闭不复用 |
| S09 兼容回归 | Auth/Chat/Persona/Memory/Tools/Agent、SSE、旧URL/额度 | 本轮旧源码零修改；历史CI分开 | 原有lint/typecheck/unit/build/prisma+完整integration/RLS+获准E2E，全记录失败/skip |
| S10 视觉可达性 | preload无JS、reduce切换、menu焦点/触屏滚动、随机Hero | 仅源码hash/参数 | Claude正常golden与单独退化修复RFC；浏览器授权后才能执行 |
| S11 未来执行/BYOK | arbitraryURL/脚本/Key读取、票据重放、子调用越权、未知费用 | P1路径无这些入口 | P4/P5独立真实SSRF/kill/fence/撤销/KMS/预算验收；持续NO-GO |
| S12 CTMR误标 | 圆mask当真模型、LFS当权重、上游论文当实测、PLY默认公开 | P0固定证据与合成表示校验 | 作者许可、可信模型包/干净环境/合成几何，CTMR真实推理不属P1 |

schema级测试证明字段和参考语义边界，不能证明SQL/Storage/XSS/CDN实现。每项真实验收记录 SHA/tree、环境隔离标识、工具版本、退出码、pass/fail/skip、请求/断言脱敏证据和复验人。禁止用生产库破坏性测试。

## CI当前结论

本轮只读重新获取main、最近20次run、active ruleset及最后Security job元数据，见 evidence/current-ci.json。当前main仍同P0，最新两workflow成功：40608867988 / 40608867953，head=a0050aa；P0日志已证明实际checkout merge tree同main。没有本轮rerun，不冒称main新测。

六required contexts保持：lint、typecheck、unit tests、build、authenticated Playwright、Supabase Security Acceptance；ruleset19544327 active，approval count=0，不等于Owner已批准。未修改保护。

原P0日志：836单元pass/22skip，7 RLS、14事务；安全E2E桌面29pass，移动/WebKit26pass+3有理由设备skip。相同设备另一workflow重复运行不叠加覆盖。**memory-verification真实DB套件仍漏跑**：package.json17有三套，workflow94–95只两套且104排除integration。本轮重读源码确认，无修复。

历史失败分类保留：Memory fake-date六例及menu selector后续修复有源码与通过日志；Supabase registry拉取限流是环境阻断，后续成功非永久根治；Node24字体首次失败同SHA重跑成功，根因未知；旧Agent日志410无法补写根因。与P0记录无新增源码差异，本轮未下载所有历史日志重做全面审计。

CI整改作为有限P1开发的首个独立任务，完整回归验收前必须关闭；不得删除/skip安全测试、放宽断言或required保护来换绿色。
