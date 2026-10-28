# AIG Platform P0.5 / P1 可执行开发任务书

日期：2026-10-28（Asia/Singapore）｜内部｜待 Owner 批准后执行

本文件是可交接任务，不表示已派发给其他聊天、已创建 PR 或批准实施。技术依据为上传 P0 包和 [独立复核报告](AIG_P0_Independent_Review.md)。

## 目标与固定范围

P1交付：Project Registry、不可变已发布版本、只读项目目录／详情／文档、受控静态成果展示、最小Public/Unlisted/Private读取隔离。至少一个非AI合成fixture证明通用性。

**建议冻结为“内部受控导入／审核发布 + 外部只读浏览”。** Developer Console写入向导、任意用户注册项目、成员邀请、执行授权、Run、Vault、第三方Embed、GPU、真实医学数据不进入P1。Owner若选择开发者自助写入，应先扩充API、审核和安全测试并重估P1，不能直接套用本任务书的缩减切片。

保留当前框架和账户体系、用户ID、旧URL、Chat/Persona/Memory/Tools/Agents API与SSE、既有额度语义；不顺带升级框架，不用旧Lumen规范替换当前Landing。每张任务卡的文件范围是建议，应在拿到真实仓库后核对。不要复制内部审计与CTMR私有内容到公开PR。

## 分工与交接规则

| 事项 | Codex主责 | Claude主责 | 最终接受者 |
|---|---|---|---|
| 数据模型、AuthZ、迁移、缓存安全、API | 设计、实现、真实负例 | 按契约消费状态，不另造权限 | Owner／安全复核人 |
| Landing视觉／动效与可访问性 | 检查契约与自动化行为测试 | 采golden、设计差异、UI实现与录屏 | Owner |
| Showcase | DTO、资产解析、语义校验、数据集成 | 排版、响应式、交互、无假能力状态 | 双方交叉检查，Owner接受 |
| CTMR内容 | 证据分级、技术审核；不造模型结果 | 仅使用获准文字／合成素材，显示证据状态 | CTMR作者＋Owner |

共享契约由Codex维护版本化文件；Claude不得自行添加字段或模拟成真实结果。Claude先用标明fixture的受控DTO完成隔离UI，接入时统一使用服务端真实DTO。跨边界变更先更新契约和样例，再分别实现；每个PR单一主责，不同时编辑同一Landing runtime。

## P0.5任务卡

### C05-01｜Codex：收敛P1范围和契约（必须先完成）

输入：P0 `00/03/05/06/07/08/10/11`、独立问题R01–R03、R11。

工作：

1. 产出 `docs/platform/p1-scope.md`，明确P1只读浏览、内部导入发布、发布者资格、最小成员读取与不支持能力。
2. 产出P1专用契约；保留未来草案的阶段标识，禁止把全部21操作一次实施。确定项目UUID与slug解析方式，公开目录只列PUBLIC已发布；UNLISTED仅直接链接访问、无目录／sitemap／站内搜索；PRIVATE未授权统一404。
3. 定义 PublishedAsset／VersionAsset 或等价结构与资产读取契约，独立于Run。字段至少覆盖id、版本关联、存储引用、hash、类型、大小、dataClass、provenance/许可证据、审核与停用状态。公开DTO不含私有路径、作者私人资料、内部端点、Run或凭据。
4. 确定版本生命周期DRAFT→REVIEWED→PUBLISHED，已发布内容不可变；公开页面只读PUBLISHED。P1不提供Draft HTTP预览；若确需预览，使用独立DTO，publishedAt允许不存在，不复用公开DTO强填值。
5. 定义内部导入／审核发布命令的执行身份、输入格式、幂等、重复version冲突、资产审核、事务与审计；维护者不能绕过批准的发布规则。导入不执行包内代码，不联网抓远程引用。
6. 定义hash规范：UTF-8、规范化JSON与算法版本；验证API嵌入Schema与源Schema生成一致。确定实际validator/codegen版本支持矩阵，3.2.1若不支持则提出兼容方案并保存契约diff，禁止无声降级。
7. 将语义校验单列：项目/版本一致、阶段mode白名单、section唯一、能力注册且SHOWCASE只读、资产归属和审核、指标证据、危险URL、未知viewer拒绝。P1不支持MESH3D/IMAGE_STACK时在发布校验拒绝，不生成空按钮。

输出：P1范围、最小ERD、OpenAPI/DTO、内部发布协议、合成fixtures、权限测试矩阵、阶段门禁与决策diff。

验收：对每个页面动作可指向一个真实只读API或内部受控命令；DOCS/图片/指标证据能从assetId解析到有权限的内容；无Run/Credential表依赖。原42例仍过，新增语义拒绝用例真实执行；不得只增加Schema字段即称闭环完成。

回退：保留草案版本，冻结失败不进入P1；不修改业务代码。需要Owner确认的最小集合是P1范围、Private/Unlisted语义、发布资格、公开资产政策与视觉保护范围。

### C05-02｜Codex：CI完整性整改（授权后独立PR）

建议范围：`.github/workflows/security-acceptance.yml`、集成测试统一入口／报告；不改required settings。

工作：在隔离Supabase内运行完整`pnpm test:integration`，覆盖usage、proposal和verification，避免维护第二份手写清单。确认实际测试发现与运行列表一致；缺隔离环境、缺套件或意外skip必须失败。保留设备专属skip理由。

验收：固定实际checkout SHA/tree、Node/pnpm、完整退出码与每套件通过/失败/skip；Memory verification真实数据库套件非skip；原六required contexts仍存在并满足；不要把两个相同E2E矩阵计成双倍独立覆盖。

Node24：另存首跑与重跑记录，定位字体异常；无根因证据不得写已修。保持当前Node22主运行栈；该调查不扩大为框架升级。

回退：回退本PR workflow；不得通过删除测试、放宽断言、屏蔽失败或改required contexts“修绿”。

### V05-01｜Claude：原视觉基线采集（UI修改前完成）

输入：固定源码SHA、`design/platform-visual-contract.md`、`landing-motion-invariants.md`。若源码已变化，先记录差异并锁新SHA，不沿用旧hash冒称相同。

工作：记录320/390/430/768/1024/1440/1920宽度、中文／英文、normal／reduced-motion／无JS；采首屏、菜单、章节、footer截图及桌面／触屏动效录屏。每件记录URL、SHA/tree、viewport/DPR、浏览器、OS/字体、motion/JS、交互脚本和时间。优先完整采正常模式，退化模式明确标失败，不能伪造通过golden。

随机Hero：测试环境控制随机或使用合理遮罩／容差；人工检查中心留白、密度、纵深、速度、遮挡和章节时序，不把随机卡片位置差异当回归。

输出：素材索引、已观察问题、Owner签署页、允许有意差异清单。Owner认可现有设计语言是既定约束；无需重新设计或重新表决整个视觉方向，签署用于绑定具体素材与SHA。

验收：所有素材可打开且元数据齐全；视频涵盖加载→Hero→五章节→footer。没有素材则标MISSING，不能用源码参数表替代。

### V05-02｜Claude主责、Codex复核：Landing退化与焦点修复（独立PR）

依赖：V05-01原正常模式基线。建议范围：`features/landing/*`、专用E2E。先交短RFC列预计视觉差异，再在获准范围实现。

工作：SSR默认正文和导航可读，JS增强加载动效；禁JS／脚本失败时遮罩、opacity、clip-path、transform和sticky章节均不能挡正文。reduced-motion禁持续漂移与强制smooth scroll，覆盖运行中偏好切换。菜单开时建立合适的焦点和背景交互约束，Escape关闭并还焦点；触屏不滚动背景。

验收：禁JS和初始化失败均可到正文／核心链接；键盘Tab/Shift+Tab/Escape完整通过；正常模式保留Hero、五章遮罩与页面节奏；SPA进出无重复RAF/监听和锁滚动。Claude提供前后截图与录屏，Codex提供自动行为断言，Owner批准有意差异。

回退：单独回退UI提交；不把无JS挡屏等缺陷作为必须保留的golden。

### C05-03｜Codex：删除隐私风险的独立补救（建议优先，不绑完整平台ERD）

输入：固定快照`features/tools/image/assets.ts`、`features/tools/actions.ts`与ToolAsset级联关系。

工作：先写Storage失败负例，证明父记录删除不能丢失对象清理依据。实现持久可重试删除清单或等价tombstone；失败保留路径／状态／attempt，用户看到待处理；完成后再清除必要元数据。不要只把catch改throw并忽略“远端已删、DB失败”的重试窗口。规定告警、重试和现有孤儿对象调查方案，生产扫描另获授权。

验收：Storage失败、DB失败、重复删除、并发删除与恢复后重试不丢依据、不跨owner；旧账本不因删除恢复额度。纯展示P1若与此无数据依赖，可独立进行；尚未关闭时不得对旧删除链作完成安全验收声明。

回退：关闭新删除入口，保留删除清单和隔离；不能回滚到丢失清理依据的行为。

### C05-04｜Codex技术核验＋Claude内容核验：CTMR L0内容包

只制作资产与声明清单，不下载／运行私有模型，不把现有PLY移为公共素材。

输出：作者批准的文字／图片／合成资产、来源与许可记录；能力表区分真实LightM源码、阈值算法、模拟mask、未提供权重、未实现HTTP API。所有Benchmark没有项目实测证据就标“未发布”，不填0、不挪用上游论文指标。

验收：每个公开文件均有作者许可和来源；模型包、真实推理、医学有效性明确未验收。许可缺失时P1使用平台自制非AI合成fixture，CTMR占位不阻塞通用Showcase。

### C05-05｜Codex：未来执行与BYOK决策包（不阻断纯展示P1）

仅形成设计／实验计划，真实Spike实施须另行授权。解决复核R07–R09：计算路由与凭据路由分离，远程服务的受限网关票据，原子预算，未知费用对账，会话凭据mode/expiry与重启失效语义。

建议P5先做持久加密模式，会话模式延后；CTMR首版推理不强制依赖BYOK或RAG。输出队列候选对照、kill/replay矩阵、KMS身份与轮换方案、撤销并发测试。没有实测就标未选择，不预设供应商胜者。

## P1实施任务卡（通过P0.5范围批准后启动）

### C1-01｜Codex：Registry模型与最小授权

依赖：C05-01获准；实现开关默认关闭。

建议范围：`prisma/schema.prisma`、新增版本化migration、`features/projects/registry`、最小`authorization`。只建Project、Version、Presentation与版本资产所需最小实体；Member只有确需Private协作读取时加入，不提前建Run/Vault全ERD。

实现：owner来自可信会话／内部命令身份；版本唯一约束、发布快照不可变与资产关系一致；默认deny、RLS和显式GRANT；高权限Prisma入口仍显式鉴权；运行数据与凭据不在公开投影。内部导入、审核、发布、停用有操作者审计。

验收：隔离库clean migration＋从固定旧schema增量升级；旧数据无损；visitor/A/B/member/admin矩阵；真实JWT绕过应用直测，服务端高权限API再测；admin无默认Private正文权限。不能只mock授权函数。

回退：关闭入口／回退应用，保留兼容表、安全约束和审计；已应用migration不改写。

### C1-02｜Codex：版本资产与安全发布语义

依赖：C1-01；与其可在同一设计评审中冻结，但提交应便于单独审查。

实现：受控审核素材进入静态版本资产集合；私有／公开交付分开，UUID不作为授权。Markdown禁raw HTML和危险URL，不默认加载远程图片／引用；内容大小／深度／文件类型有上限，防止被动访问第三方资源。P1只开放已实现renderer；缺viewer在导入时拒绝或使用明确批准的静态预览。

验收：跨版本／跨项目私有assetId引用、未经批准资产、伪造provenance、javascript/data/file URL、跟踪图、重复section和SHOWCASE执行能力全部拒绝。真实指标要求证据资产，UNPUBLISHED不带数值。公开内容停用／转Private后新请求不可从页面、资产、metadata、搜索、sitemap或缓存读到；已下载副本无法收回，政策明确说明。

回退：停用项目版本及资产投影，保留内部审计；不删除用户私有结果。

### C1-03｜Codex：只读API、缓存与兼容

依赖：C1-01/02。建议范围：`app/api/v1/projects/**`、`features/projects/presentation`与新页面数据层。

实现：目录分页只返回Public已发布；详情、版本、Presentation、静态文档／资产按P1冻结契约读取。Private未授权与不存在一致404；含私有内容的响应no-store；公开缓存明确失效触发。任何浏览器cookie写操作若P1无需求就不新增；未来SSR Cookie/Bearer桥与CSRF另正式冻结。

验收：每操作响应契约测试、匿名／A／B真实请求、列表计数和分页不泄漏；新页面HTML／RSC载荷／metadata/OG不含私有字段；停用后缓存失效通过。旧URL、Auth回跳、API/SSE与配额回归通过；禁用feature flag后旧站完整可用。

### V1-01｜Claude：Explore与Showcase界面

依赖：C05-01 DTO冻结、V05-01基线；接入前完成V05-02验收。

建议范围：新增Explore、项目详情及Presentation组件，尽量不改Landing核心runtime和Workspace外壳。基于当前纸／墨／黄绿视觉语言延伸，不用旧Lumen覆盖。

交付状态：目录空／加载／失败、项目不存在／无权限统一对外状态、未发布内容不泄露、文档缺失、指标未发布、静态演示标识。没有运行API就不展示可点击Run／Connect Key／上传按钮。fixture仅用于隔离开发且明确标记，不混入真实计数或结果。

验收：七宽度中英文、键盘和触屏、reduced-motion、无JS核心可读；截图与动效差异可追踪；非AI项目不改平台核心即可展示。新通用样式不污染Landing与旧平台页面。

回退：关闭新路由／导航入口，可单独回退新增UI，不重做主页。

### C1-04＋V1-02｜Codex与Claude：集成与阶段验收

依赖：C1-01/02/03、V1-01、CI整改。

Codex提供固定SHA和测试证据：lint、typecheck、unit、build、Prisma validate；新表对应migration、RLS/GRANT、真实JWT、服务端AuthZ及API安全负例；旧账户和AI功能兼容回归。记录实际退出码，失败／skip逐项列出，不写笼统“全绿”。

Claude提供同SHA UI证据：桌面／移动、中文／英文、正常／低动态／无JS、键盘／触屏，及Landing原视觉对照。Owner接受功能范围和有意视觉差异。

验收输出：一份traceability表，将每条P1范围映射到实现文件、测试、证据、剩余风险与接受人；固定fixture与真实内容严格区分。所有必要失败关闭后仅可判“P1隔离环境验收通过”。生产migration／部署／开放单独按固定部署版本、真实RLS与Storage策略、备份恢复、smoke和Owner批准执行。

回退演练：flag关闭，新路由停止曝光，旧账户与AI入口保持可用；新安全表与审计保留；公开缓存与素材停止交付。演练成功后再请求具体发布批准。

## 依赖顺序与完成定义

`C05-01 → Owner限定范围批准 → C1-01 → C1-02 → C1-03 → 集成验收`

`V05-01 → V05-02 → V1-01 → 集成验收`

CI整改可独立进行，P1最终验收前必须完成。删除补救独立优先处理；CTMR授权内容包可缺省为非AI合成fixture。执行/BYOK决策包留后，不成为只读P1的隐含依赖。

每个PR附：范围及不变量、实际diff、契约版本、测试SHA/tree与环境、通过／失败／skip、截图或日志索引、回滚步骤、遗留风险。Codex和Claude分别交付证据，不能互相代签；模型不代Owner批准。本轮任务结束于任务书交付，没有开始上述开发。
