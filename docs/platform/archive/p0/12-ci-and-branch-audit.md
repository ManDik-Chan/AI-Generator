# P0 · 分支、CI 与合并门禁取证

> **状态**：只读审计 / INTERNAL / DESIGN-ONLY。  
> **读取时间**：2026-10-28 09:47–09:52（Asia/Singapore，UTC+08:00）；以 [脱敏证据](evidence/ci-and-branches.json) 的 collected_at 为截止快照。  
> **基线**：`main@e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`。  
> **证据等级**：Verified = 本轮 API、固定 SHA 源码或日志核实；Inferred = 由核实事实推导；Unverified = 未取得证据。历史绿灯不等于本轮重新运行，更不等于 Production 已验收。

## 1. 结论与适用范围

- **Verified**：PR #25 已于 2026-10-28 **08:43:12** 合并，当前 main 正是该 merge commit；其关联 Merge Gates 与 Security Acceptance 最终均成功。主线现有六项 required checks 由 active ruleset 实际强制，并非只有 YAML 声明。
- **Verified**：main 本身没有 check runs；其唯一 commit status 为 Vercel success。PR 测试实际检出的 synthetic merge、PR head 与 main 三者 **Git tree 完全一致**，可作为相同源码内容的既有 CI 证据。不得写成“本轮在 main 重跑全部测试”。
- **Verified gap**：`memory-verification.integration.test.ts` 存在且列于 `test:integration`，但当前安全 workflow 漏跑；unit job 中该 1 test 被跳过。这使“所有现有集成测试均已通过”不成立。
- **Unverified**：Production migration/RLS/grants、Production 与 Preview 的真实交互、真实 Provider、实例回收/kill 恢复、医学/GPU 链路均未由本轮验证；Vercel deployment success 不证明这些行为。
- **决策建议（Inferred）**：可进入 P0 规范评审；不能据此签署 Production Ready 或 P1/P4/P5 全面开放。补齐测试门禁和实际环境证据后，才判断相应阶段 GO。

来源：[PR #25](https://github.com/ManDik-Chan/AI-Generator/pull/25)、[main status](https://api.github.com/repos/ManDik-Chan/AI-Generator/commits/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/status)、[required ruleset](https://github.com/ManDik-Chan/AI-Generator/rules/19544327)。

## 2. 锁定提交与真正测试身份

| 身份 | SHA | Tree SHA | 本轮核实 |
| --- | --- | --- | --- |
| main | `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c` | `8372e935e331688d6007b3433849c8efa8f6d10e` | Verified：branch / compare API |
| PR25 head | `a0050aaf4fc16e1cadd110918c3354a29e8d99fe` | 同上 | Verified：compare API |
| CI 实际 checkout 的 PR25 merge ref | `37fe42669a706f9b3a2707691c56b7d374936950` | 同上 | Verified：job checkout 日志与 Git commit API |

工作流 step 名称写“Check out the exact PR commit”，但 `actions/checkout` 没有显式 `ref`，日志实际是 `refs/remotes/pull/25/merge`。这是合并候选测试，不是仅检出 head；这次恰好与最终 main 同树。后续每次仍须锁定实际执行 SHA、tree 和依赖环境，不能根据 step 名称推断。证据：[测试 merge commit](https://api.github.com/repos/ManDik-Chan/AI-Generator/git/commits/37fe42669a706f9b3a2707691c56b7d374936950)、[unit job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867988/job/122555908726)。

**Verified**：两个工作流只监听 `pull_request` / `workflow_dispatch`，没有 push-to-main 触发；因此 main 没有新的 Actions run 不能自动解释为失败。可引用这次同树 PR 验证，但不能外推到数据库配置与生产运行状态。[Merge Gates 源码](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/.github/workflows/merge-gates.yml#L1)、[Security Acceptance 源码](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/.github/workflows/security-acceptance.yml#L1)。

## 3. 所有远程分支

**Verified**：branch API 第 1 页 `per_page=100` 返回 23 条，已覆盖全部；PR API 返回 25 条；Actions API 返回 53 / total_count=53 条。以下 ahead / behind 为 **branch 相对固定 main** 的提交数，逐一通过 compare API 核实。behind 表示 head 是 main 的祖先，不表示文件内容一致；比较 API 对 behind 分支返回 files=[] 也不能作文件相同的证据。

| 分支 | 真实 HEAD | ahead / behind | 该 HEAD 的现存 CI/status | 匹配 PR |
| --- | --- | --- | --- | --- |
| `codex/claude-landing-delivery` | `a0050aaf4fc16e1cadd110918c3354a29e8d99fe` | 0 / 1 | 13 check runs: success; Vercel success | #25 merged |
| `codex/hotfix-profile-dropdown-placement` | `2c7f34eaf807239d418f4a955b979359f26e1832` | 0 / 75 | 无质量 check runs; Vercel failure | #14 merged |
| `codex/security-hardening-rls-usage` | `f4d3023921933d206ec0c2d84dab9e9cd4d3e3b3` | 0 / 17 | 7 check runs: success; Vercel success | #22 merged |
| `codex/v2-phase-1` | `6b5c1a2bbd6ccde30b7419b783a73731da790648` | 0 / 123 | 无质量 check runs; 无 status | #2 merged |
| `codex/v2-phase-2` | `8200362fe0c36fcec001d6180def8c1897e540a6` | 0 / 121 | 无质量 check runs; 无 status | #3 merged |
| `codex/v2-phase-3` | `6de40d7b941d7741ac1c8d4bdcedebd0ac07d8aa` | 0 / 114 | 无质量 check runs; 无 status | #4 merged |
| `codex/v2-phase-4a` | `8304e741f8d732eee6ddd853e93153368da6c75f` | 0 / 111 | 无质量 check runs; 无 status | #5 merged |
| `codex/v2-phase-4a2` | `78f649c7a446eec917f03e6d25e856de632c51b9` | 0 / 109 | 无质量 check runs; 无 status | #6 merged |
| `codex/v2-phase-4a3` | `baff9b0fd2e987f6315c0d7b57fded69c14db0b4` | 0 / 103 | 无质量 check runs; 无 status | #7 merged |
| `codex/v2-phase-5a1` | `c95083505c430f31f1aebe6b44db011c9528fa58` | 0 / 96 | 无质量 check runs; 无 status | #8 merged |
| `codex/v2-phase-5a3-1` | `960ff2dd3435923df2a01069b35f20ff71231924` | 0 / 92 | 无质量 check runs; 无 status | #9 merged |
| `codex/v2-phase-5a3-2` | `631f351829bdb4b191de14ac7bcd326769f7ebaa` | 0 / 89 | 无质量 check runs; 无 status | #10 merged |
| `codex/v2-phase-6a1` | `136d8ba1a3e5c83546d5b45c944651ef16abfd6e` | 0 / 85 | 无质量 check runs; 无 status | #11 merged |
| `codex/v2-phase-6a2` | `198e070f78eb05c8dd59622ff6056132ef8be4f6` | 0 / 81 | 无质量 check runs; 无 status | #12 merged |
| `codex/v2-phase-6a3-image-generation` | `6e3eaf329808658d2e9edf34ee98379c89c93eff` | 0 / 70 | 无质量 check runs; Vercel failure | #15 merged |
| `codex/v2-phase-6b1-design-foundation` | `ea33dd6a0fe2a83d47dd63801ac64acf916f5425` | 0 / 77 | 无质量 check runs; 无 status | #13 merged |
| `codex/v2-phase-6b2-mobile-experience` | `264238ccbdfac388de329d4d7b5038b02c093ff5` | 0 / 65 | 无质量 check runs; Vercel success | #17 merged |
| `codex/v2-phase-6b3-lumen-foundation` | `b688df1e0c3694dff96f89eb94a8f37a0d233396` | 0 / 56 | 无质量 check runs; Vercel success | #19 merged |
| `codex/v2-phase-7a1-1-agent-terminal-sync-hotfix` | `af78ef4878f57bc268853868180b26cd17443c50` | 0 / 28 | 6 check runs: success; Vercel success | #21 merged |
| `codex/v2-phase-7a1-1-agent-workers` | `22feedb722ae5ff897f587ab3a9a2a2024aa1024` | 0 / 42 | 无质量 check runs; Vercel success | #20 merged |
| `codex/v2-phase-7a1-multi-agent-brainstorm` | `e11182401d006b8819a9ee39cc1a5ba47a0df3a1` | 0 / 66 | 无质量 check runs; Vercel success | #16 merged |
| `main` | `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c` | 0 / 0 | 无质量 check runs; Vercel success | — |
| `test1` | `5b521d64bd26c57c6a004d2deac4fb97379562d3` | 1 / 135 | 无质量 check runs; 无 status | #1 open |

其中 `test1` 为 diverged（1 ahead / 135 behind），关联 PR #1 仍 open；本轮不合并或删除它。其余所有非 main 分支均为 main 祖先；PR25 分支只差最终 merge commit 且已通过 tree 对比确认同内容。旧 head 上没有 status/check runs 时，API combined status 会显示 `pending` 与 `total_count=0`，**这里记“无记录”，不视为正在排队或失败**。旧 head 的 Vercel failure 保留为历史事实，不能据此宣布当前 main 仍失败。

来源：[branch inventory](https://api.github.com/repos/ManDik-Chan/AI-Generator/branches?per_page=100&page=1)、[PR inventory](https://api.github.com/repos/ManDik-Chan/AI-Generator/pulls?state=all&per_page=100&page=1)；每个 compare/check/status 的 URL、完整结果摘要与时间见 evidence JSON。

## 4. PR 合并状态与历史文档校正

| PR | 状态（Verified） | merge SHA | 合并时间（Singapore） |
| --- | --- | --- | --- |
| [#22](https://github.com/ManDik-Chan/AI-Generator/pull/22) | merged；RLS / usage 加固 | `6082ed08c7755421f8dd119a6dff3e956f1999ce` | 2026-07-22 19:03:44 |
| [#23](https://github.com/ManDik-Chan/AI-Generator/pull/23) | merged；Memory proposal | `2a869a47d46487147ade878cb6e21defaefef62b` | 2026-07-27 01:10:18 |
| [#24](https://github.com/ManDik-Chan/AI-Generator/pull/24) | merged；Memory provenance | `2dfd48ae3c7548a79dbe56996c8fb42ec965fecf` | 2026-07-29 01:48:05 |
| [#25](https://github.com/ManDik-Chan/AI-Generator/pull/25) | merged；Claude Landing / workspace | `e33ac216bdcffc44d12d4b7315e0d6cc48decf5c` | 2026-10-28 08:43:12 |

PR #2–#25 均已 merged；#1 仍 open；完整 PR 表保存在 evidence。历史 `docs/security-audit-2026-07-22.md` 中“#21/#22 尚未合并”“main 未保护”等表述属于当时记录，已不代表当前状态；它列出的 Production 未核对事项仍需另取证，不能从“PR merged”推断数据库已落地。

PR25 初始 body 还写“830 passed / 6 failed”和未更新 E2E；最终提交已修复测试、更新部分 E2E 与 CI startup 处理。**最终源码、日志和合并 SHA 的证据优先于初始 body**。本轮不修改历史叙述。

## 5. 实际 required checks

**Verified**：ruleset `19544327 / Protect main branch`，`enforcement=active`，include=`refs/heads/main`；required-status-checks `strict=true`，integration_id 均为 GitHub Actions `15368`。同时禁止 deletion / non-fast-forward，要求 PR 与 review threads resolved；`required_approving_review_count=0`、`require_code_owner_review=false`。所以路线图的 Owner 签署是额外流程关口，不能说 GitHub 已强制 Owner 审批。可见 bypass_actors=[]，当前连接回报不可 bypass。

| Required context | PR25 head 关联的最终结果（Verified） | 证据 |
| --- | --- | --- |
| lint | success | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867988/job/122555907733) |
| typecheck | success | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867988/job/122555908482) |
| unit tests | success，836 passed / 22 skipped | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867988/job/122555908726) |
| build | success | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867988/job/122555908645) |
| authenticated Playwright | success，安全 workflow 的汇总 job | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867953/job/122560578679) |
| Supabase Security Acceptance | success，真实隔离 Supabase | [job](https://github.com/ManDik-Chan/AI-Generator/actions/runs/40608867953/job/122555153200) |

`Node 24 compatibility` 和带设备后缀的 Merge Gates E2E matrix 不是该 ruleset 中独立的 required context；不能把“存在并成功”描述成“单独被强制”。汇总 `authenticated Playwright` 用 always + needs 检查 Security Acceptance 和全部 Authenticated E2E matrix 的 result，任一不是 success 则 exit 1，不会因整个依赖 skip 自动放行。

**权限限制（Verified）**：旧 `branches/main/protection` endpoint 返回 403 Resource not accessible by integration；`rules/branches/main` 受 connector allowlist 限制返回 400。上述不影响已成功读取 ruleset 清单与详情；没有凭这两个错误推断“无保护”，也未提升权限或更改设置。

## 6. 真实验证覆盖与遗漏

| 环境 / 命令 | 既有 CI 结果（Verified） | 能证明的范围 |
| --- | --- | --- |
| Node 22 + pnpm 11.7.0，Merge Gates | lint/typecheck/build success；147 files / 836 tests passed，4 integration files / 22 tests skipped | 静态/单元；不等同于集成全通过 |
| Node 24 compatibility | attempt 2 success；相同 836 passed / 22 skipped | 额外兼容检查；曾有不稳定构建，见下一节 |
| 隔离 Supabase clean migration | rls_tables=16、policies=17、runtime_grants=12、repeat_deploy=verified | 合成隔离库的迁移与授权元数据 |
| `pnpm test:rls` | 7 passed | 真实 Auth JWT / PostgREST 攻击用例 |
| quota + proposal integration | 14 passed（5 usage + 9 proposal） | 真实 PostgreSQL 事务、并发/回滚用例 |
| clean / incremental upgrade | proposal 与 verification 的 injected failure rollback 均 verified；data_loss=0 | 小规模合成数据，无生产规模推断 |
| static gates + `prisma validate` | 147 files / 836 passed；schema valid | Prisma 结构与静态测试；不证明 live DB 无漂移 |
| Security E2E / Chromium desktop | 29 passed | 隔离服务、一次性 Auth、mock AI Provider |
| Security E2E / Chromium mobile | 26 passed / 3 skipped | 同上，3 项 desktop-only 矩阵由桌面项目覆盖 |
| Security E2E / WebKit iPhone | 26 passed / 3 skipped | 同上 |
| Merge Gates E2E / 三个项目 | 同样为 29/0、26/3、26/3 | 重复跑同一套用例，不把数量相加当更多独立覆盖 |

三个设备项目的 job IDs 与日志摘要已存 evidence。Mobile/WebKit 跳过的具体项目是桌面流式画布、完整响应式矩阵、放大字体矩阵；条件见 [public-mobile.spec.ts:27](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/tests/e2e/mobile/public-mobile.spec.ts#L27) 与 [responsive-matrix.spec.ts:29](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/tests/e2e/mobile/responsive-matrix.spec.ts#L29)。没有发现这些 job 因缺登录态跳过整套认证场景。

### CI-GAP-01 · Memory verification 的真实集成漏跑

**Verified**：[package.json:17](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/package.json#L17) 的 `test:integration` 包含三份文件；安全 workflow [94–95 行](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/.github/workflows/security-acceptance.yml#L94) 仅显式列 usage-ledger 与 memory-proposals；[104 行](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/.github/workflows/security-acceptance.yml#L104) 又排除所有 integration。unit 日志明确显示 memory-verification 的 1 test skipped，后续 job 没有再次运行它。

**Inferred impact**：RLS/迁移/浏览器已有有效证据，但不能替代这份五种 verification method、trusted path、幂等 review 与 owner isolation 的 PostgreSQL 套件。后续单独测试 PR 应在隔离库运行完整 `pnpm test:integration`，并使新增套件自动被门禁覆盖。本轮不修改工作流。

## 7. 过去失败项的当前证据

| 失败项 | 原始证据 | 当前状态与结论 |
| --- | --- | --- |
| PR25 初始 Memory proposal 6 失败 | run 40527413667 / job 122270642652：830 passed / 6 failed / 22 skipped；集中 proposal-service | **Verified fixed in tests**：fake Date 固定 snapshot 后，最终同树日志 proposal-service 11/11，836 passed。修复为确定性测试，不是删除/skip 六项断言。[源码](https://github.com/ManDik-Chan/AI-Generator/blob/e33ac216bdcffc44d12d4b7315e0d6cc48decf5c/features/memory/proposal-service.test.ts#L92) |
| Landing mobile menu selector 随 accessible name 改变而失配 | run 40530960408 / job 122284444402；desktop 28 passed / 1 failed；Security desktop 亦相同 | **Verified regression now passes**：a0050aa 改用稳定 data-menu-btn，仍断言名称/expanded/Escape/focus/跳转；最终两套 desktop 29/29，移动用例也通过 |
| 隔离 Supabase startup / registry 拉取 | 初始 job 122270643514 在 startup 失败；后续 122284444132 明确 rate limit / image pull failed | **Verified latest attempt passes**：现有同树 security 与6个 E2E 隔离启动通过，诊断脚本保留脱敏分类。**Unverified permanent fix**：不能保证公共 registry 后续不再限流 |
| Node24 next/font null TypeError | run 40608867988 attempt1 / job 122555153455，build 报 Cannot read properties of null (reading '1') | **Verified retry passes, root cause unverified**：同一SHA attempt2 job122555906053成功；无源码修复证据，不写“根因已修复” |
| July22 Agent E2E 失败 | run 29898526891，job88854087748：metadata显示 Run complete authenticated E2E失败；日志API410 | **Verified current selected cases pass / Unverified old cause**：最终同树 Agent终态/跨会话/取消等用例通过。旧日志不可读，不能补写旧失败原因 |
| July22 RLS/额度/迁移失败与旧“未合并”状态 | PR22 head f4d3023 的两套流程成功，PR已合并；本次新同树隔离安全job也通过 | **Verified isolated regression evidence**：不能证明Production已迁移或历史私有数据已修复 |

PR25 的六个提交及各次 workflow 状态已存 evidence。旧失败保留原SHA/运行身份，不把“后续绿灯”冒称对所有历史根因的独立复核。

## 8. Preview / Production 证据边界

**Verified**：PR25 head 有 Vercel success，指向 [head deployment](https://vercel.com/man-dik/ai-generator/9EiuoWB2uPe3x8yPaL28buUmzuty)；main 有 Vercel success，指向 [main deployment](https://vercel.com/man-dik/ai-generator/6bjC92UkE5Br9XbkHDz453fK7zob)。Preview Comments check 的“0 unresolved feedback”仅是评论状态，不能当视觉验收结果。

**Unverified**：本轮未对这两个部署执行真实浏览器、生产账号、真实 Provider 或 live DB 核对。CI 浏览器使用隔离 Supabase + mock Provider，无法覆盖部署域名配置、生产 grants 漂移、Storage 策略及实际费用。也不能从 SSR 文本测试通过推断无 JS 用户可穿过 preloader。视觉基线/动效录屏/reduced-motion/无JS 等专门验收仍须单独完成。

## 9. 建议门禁与不执行事项

1. **CI gap（首个独立 PR）**：完整 integration 脚本纳入隔离 Supabase job；报告通过/skip数与测试身份；保持现有required contexts并防止 suite 漏跑。修复 Node24 字体不稳定性前，至少保留首次失败与重跑证据。
2. **P0 freeze gate**：Owner 评审接口/权限/隐私与视觉规范；Owner签署状态另存决策日志，不能由模型或“0 approving reviews”替代。
3. **P1 gate**：Project Public/Private 最小授权真实测试、旧账户/URL/AI回归、已批准视觉截图与动效基线；无JS preloader风险需要明确处置。
4. **P4/P5 gate**：必须新增 kill/retry/timeout/replay/SSRF/撤销/密钥泄漏/费用边界等实际测试；现有Agent终态UI用例不证明耐久执行。
5. **发布 gate**：由获准负责人提供固定应用SHA、生产migration/grants/RLS只读快照、备份/回滚、真实部署smoke证据；隔离CI不可取代它。

**Verified scope**：本轮仅远程 GET、固定源码读取和本地设计文档写入；没有 rerun workflow、修改 GitHub required settings、操作 Production、执行 migration、创建表、合并或部署。

## 10. 本文自查

- [x] 固定 main/head/tested-merge 三种 SHA，核对 tree，纠正 checkout step 名称造成的歧义。
- [x] 所有23分支的HEAD、ahead/behind、现存check/status与匹配PR有取证；空status不误判为排队。
- [x] ruleset真实读取成功与旧保护endpoint403分别记录；Owner审批不是现有强制review。
- [x] 836单元/7RLS/14事务/E2E数分开，记录skip与memory-verification遗漏，不把重复matrix测试相加。
- [x] “重跑成功”与“根因修复”分开；Production/真实Provider/无JS/耐久性未知项未写成已通过。
- [x] evidence只保留必要仓库、CI、规则与白名单日志摘要；未落盘原始日志、凭据或无关个人资料。

