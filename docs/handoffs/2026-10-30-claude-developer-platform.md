# 交接：可运行 Demo、开发者接口规范与开发手册（Claude，2026-10-30）

> 分支 `claude/developer-platform-20261030`，基于 `origin/main` `cc123c2`（含 PR #33、#35）。
> 未合并 main，未部署 Production，未改数据库、migration、RLS、鉴权策略或 Provider 配置。三维重建项目按 Owner 要求未改动。

## 1. 交付内容

| 交付 | 位置 | 说明 |
| --- | --- | --- |
| Demo 01 路线优化求解器 | `/demos/route-optimizer` | 服务端真实求解 TSP：最近邻 / 随机构造，2-opt、Or-opt、模拟退火；MST 下界给出距最优上界；JSON 或 SSE；截止时间返回部分结果；运行中可取消；一键对比四种策略；开发者视图显示真实请求、事件流、响应与 curl |
| Demo 02 神经网络训练场 | `/demos/neural-network` | 浏览器内真实训练 MLP：五种数据集、两种特征、0–4 层 × 1–8 神经元、tanh/ReLU/sigmoid、SGD/Momentum/Adam、L2；Web Worker 执行，失败降级主线程；实时决策边界、损失曲线、网络权重图、协议消息日志 |
| Demo 索引 | `/demos` | 两个 Demo、两种接入方式对照、更多实验室入口 |
| Demo Runtime API | `/api/demo/v1/*` | `GET capabilities`、`GET capabilities/{id}`、`POST runs`（JSON / SSE）、`GET openapi.json` |
| 开发者文档 | `/docs`、`/docs/guide`、`/docs/api`、`/docs/manifest`、`/docs/status` | 网站在构建时渲染 `docs/developer/*.md`，与仓库同源；API 页含在线请求控制台，Manifest 页含在线校验器 |
| OpenAPI 3.1 | `docs/developer/openapi.json` | 由 zod 契约生成；swagger-parser 校验；与代码不一致时单测失败 |
| 示例 | `examples/` | Node 调用（JSON、SSE）、第三方风格服务端能力、Worker 驱动、P0.5 Manifest；全部由 `examples/examples.test.ts` 执行 |
| 工具 | `pnpm docs:sync`、`pnpm manifest:validate`、`pnpm demo:api-smoke` | 生成规范与示例块；本地校验 Manifest；用真实 HTTP 跑文档里的请求 |
| 官网整合 | Landing、站点页头页脚、Explore、开发者控制台 | 见第 4 节 |

## 2. 选型理由

两个 Demo 刻意代表平台的两种接入方式，而不是两个外观不同的同类示例：

- **服务端能力（路线优化）**：算法服务需要统一结果或私有实现时的形态；展示输入契约、资源限制、限流、运行状态机、事件流、截止时间与取消。计算有界（≤ 400 点、≤ 5 s），无数据库、无密钥、无外部请求，适合 Vercel Function。
- **浏览器能力（神经网络）**：零服务端成本、数据不离开设备的形态；展示消息协议、计算与界面分离、节流、降级。属于 AI 类项目，与平台定位一致。

两者共用 `features/platform/run-lifecycle.ts` 的状态机和同一份能力描述符 `aig.capability/0.1`。没有使用平台的模型 Provider：公开、无认证的 LLM 调用会暴露费用与滥用风险，违反“不把私有 API Key 放进公开 Demo”。

## 3. 代码结构

```text
features/demos/
  catalog.ts                 两个 Demo 的展示信息（与能力描述符一致，有单测）
  runtime/                   能力描述符、executeRun、HTTP 处理、限流、错误、OpenAPI 生成
  route-optimizer/           geometry · instances · solver · schema · capability · components/
  neural-network/            datasets · mlp · protocol · trainer · nn.worker · host-state · use-neural-trainer · components/
  components/                两个 Demo 共用的面板、滑块、时间线、代码标签页、折线图
features/docs/               Markdown 读取、标题锚点、示例同步、文档页组件、在线请求控制台
features/platform/demo-projects.ts   两个 Demo 在 Explore 中的真实项目条目
app/demos/ · app/docs/ · app/api/demo/v1/
docs/developer/              手册、API Reference、Manifest、接口清单、openapi.json、contracts/
examples/                    文档引用的全部示例
tests/e2e/mobile/demos.spec.ts       CI 中运行的浏览器用例（本地未运行）
```

## 4. 官网与项目展示整合

- **Landing**：Hero、章节动效与整体结构未改。页头药丸导航由「探索 · 项目 · 开发者 · AI Hub」改为「探索 · Demo · 开发者 · AI Hub」（仍为 4 项）；「实验室」章节标题改为“两个可运行的 Demo，参数由你来改”，CTA 进入 `/demos`，目录卡进入神经网络 Demo；「发布」章节 CTA 进入 `/docs/manifest`，目录卡进入 `/docs`；「从这里开始」新增一张横跨两列的 Demo 卡（两个插画 tile，路线描线动画与决策边界，遵守减少动态效果）；平台地图「实验室 → Demo」「开发者 → /docs」；移动菜单与页脚加入「运行 Demo」「开发者文档」（菜单仍为 6 项）；中英文同步。
- **站点页头（探索 / Demo / 文档页共用）**：探索 · Demo · 开发者 · 演示工作台 · AI Hub。页脚加入两个入口。
- **Explore**：新增两个真实项目 `route-optimizer`、`neural-network`（provenance real，版本 1.0.0 状态 IN_REVIEW，项目页有“等待验收”说明）；实验室标签页显示事实与进入 Demo 的入口。基准中 COMPUTED_LIVE 的标签由“浏览器内实时计算”改为“实时计算”，因为路线优化在服务端计算。
- **开发者控制台 `/platform/developer`**：顶部加入已上线的文档与 Demo 入口，并说明下方“平台 API”仍是设计契约。

## 5. 验证（2026-10-30，Node 22.23.1 / pnpm 11.7.0，Windows）

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint`（零警告） | 通过 |
| `pnpm test` | 158 文件 / 1002 测试通过；51 个需数据库的集成测试照旧跳过 |
| 其中新增 | 7 个文件 / 105 项：运行时与 API 30、路线优化 19、神经网络 24、示例 7、文档一致性 10、curl 生成 7、在线请求预设 8 |
| CI 首轮（a70d294） | 6 个 E2E 任务均只失败 `/docs/api` 一项：选择 GET「能力列表」时 `curlCommand(url, undefined)` 在渲染中抛出 `JSON.stringify(undefined).replace` 的 TypeError，页面落入错误边界（Trace 中 Chromium 与 WebKit 报错一致）。已修复为无请求体时生成 GET 命令，并补回归测试；其余 35 项在三种浏览器中通过 |
| `pnpm build` | 通过；`/demos/*`、`/docs/*`、`/explore/{route-optimizer,neural-network}` 均为静态预渲染；Worker 打包为独立 chunk |
| `pnpm demo:api-smoke`（本地 `next start`，真实 HTTP） | 12/12 通过：能力列表、404、openapi、同步运行、SSE 生命周期、截止时间 → TIMED_OUT（partial）、415、400×2、404、422、413 |
| 预渲染 HTML 静态检查 | 13 个页面 200、标题正确、无 `undefined`/`NaN`；状态标记全部渲染为徽章；在线请求与校验器组件存在；Landing 无旧的实验室链接 |
| 测试用本地服务 | 自己启动的 `next start`（PID 22632）已停止并确认端口 3061 释放 |

关键测试点：求解器结果为合法置换、从起点出发、长度与距离矩阵一致、不低于 MST、2-opt 局部最优、Or-opt 不劣于 2-opt、种子确定性；MLP 三种激活的解析梯度与数值梯度一致、三种优化器收敛；Worker 协议的非法消息、无会话、重复运行、取消、重配置、发散、超时；HTTP 层每个错误码、按实际字节计算的体积上限、限流与并发释放、客户端断开 → CANCELLED；执行器对能力异常脱敏、拦截非法输出、超时保护。

**未验证（按 `AGENTS.md`，浏览器自动化仍暂停，本轮没有启动或连接任何浏览器）**：真实渲染、动效、Canvas 与 Worker 在真实浏览器中的行为、深色模式、各断点与触屏。`tests/e2e/mobile/demos.spec.ts` 会在 PR 的 CI（chromium 桌面、chromium 移动、webkit iPhone）中运行，覆盖：Demo 索引、服务端求解与生命周期、截止时间、浏览器训练完成、文档渲染与在线请求、API 校验、Landing 入口；结果以 CI 为准。视觉与交互需要 Owner 在 Preview 上验收。

## 6. 安全边界

- Demo API 不读 Cookie、不访问数据库、不使用任何 Provider 密钥、不发起外部请求；输入只用于本次计算，不写日志。
- 严格 Schema（未知字段拒绝）；请求体按实际字节限制 64 KiB；单次运行 ≤ 5 s；`maxDuration = 15`；协作式取消；错误只含 code / message / requestId（+ issues），能力抛出的异常统一替换为 `CAPABILITY_ERROR`；所有响应 `no-store`；不发送 CORS 头。
- 限流（每客户端 60 s 20 次、并发 2；每实例并发 8）保存在单个函数实例内存中，是尽力而为的第一道防线——**这是本轮最主要的已知限制**，见第 7 节第 1 项。
- 中间件：`/demos`、`/docs`、`/api/demo` 不在受保护前缀中，不刷新会话、不读用户数据。未改 `lib/auth/return-path.ts`。
- 新增 devDependency `@apidevtools/swagger-parser@12.1.0`（仅测试用，校验 OpenAPI）；锁文件已更新。

## 7. 交给下一阶段 Codex 的事项

按优先级：

1. **全局限流**：把 `features/demos/runtime/rate-limit.ts` 的 `SlidingWindowLimiter` / `ConcurrencyGate` 换成共享存储实现（Vercel Firewall 规则或 KV 计数），接口 `take` / `acquire` 保持不变；对 `/api/demo/v1/runs` 配置平台级限流后再考虑提高配额。
2. **正式异步运行（L2）**：`handleCreateRun` 改为写入持久任务存储并返回 `202 Accepted` + `runId` / `statusUrl`；`executeRun` 可直接作为 Worker 侧执行器复用；补 `GET /api/v1/runs/{runId}`、取消、幂等键与回调签名。Run 资源与状态语义保持不变，前端只需把 SSE 换成轮询或订阅。
3. **Registry（P1）**：部署后替换 `features/platform/source.ts` 的函数体，并让 `features/demos/runtime/registry.ts` 读取审核过的能力登记；P0.5 契约合并 main 后，删除 `docs/developer/contracts/manifest.schema.json` 副本并改为引用原文件（README 中记录了来源提交与哈希）。
4. **第三方能力注册与 Grant**：以 `aig.capability/0.1` 为起点，与 P0.5 `futurerouting.schema.json` 对齐（服务端封存计算目的地与凭据来源），并加入用户授权。
5. **L1 受控嵌入**：浏览器能力目前是同源 Web Worker（计算隔离，不是安全沙箱）；第三方浏览器能力需要独立 origin 的 iframe 沙箱、CSP 与 postMessage 校验。
6. 每完成一项，同步 `docs/developer/interface-status.md` 与 API Reference 中的状态标记，并运行 `pnpm docs:sync`。

## 8. 需要 Owner 决定或知悉

1. **Landing 改动范围**：页头第二项由「项目」改为「Demo」，「从这里开始」新增横跨两列的 Demo 卡。若希望保留「项目」入口，只需改 `features/landing/content.ts` 的 `header.links`。
2. **Demo 卡与章节插画**：路线与决策边界 tile 是示意图，不是实时运行画面；实时运行只在 Demo 页面。
3. **公开配额**：20 次 / 60 s / 客户端是保守值；全局限流（第 7 节第 1 项）落地前不建议提高。
4. **源码链接**：项目页与 Demo 页的源码链接在 Vercel 上指向部署的提交（`VERCEL_GIT_COMMIT_SHA`），本地构建指向 `main`；合并前 `main` 上还没有这些文件。
5. **项目版本状态**：两个 Demo 项目的 1.0.0 标为 IN_REVIEW（等待本 PR 验收）；合并后应改为 PUBLISHED 并附 PR 链接（`features/platform/demo-projects.ts`）。

## 9. 最短验收路径

1. Preview 的 `/`：页头「Demo」「开发者」，滚到「从这里开始」看 Demo 卡；切换 EN。
2. `/demos/route-optimizer`：点「在服务端求解」，看路线随事件流变化、运行状态时间线、开发者视图；把截止时间拉到 50 ms 再求解（TIMED_OUT）；运行中点「取消运行」；点「对比四种策略」；编辑城市后求解。
3. `/demos/neural-network`：在双螺旋上训练；增删隐藏层；切换二次特征；停止与重新初始化。
4. `/docs/api`：在线请求发几个示例（含错误示例）；`/docs/guide`、`/docs/manifest`（改动 Manifest 看校验）、`/docs/status`。
5. `/explore/route-optimizer`、`/explore/neural-network` 的实验室标签页。
6. 手机宽度重复 2–4。
7. 命令行：`pnpm demo:api-smoke https://<preview 域名>`（Preview 有 Vercel 认证保护时需先登录或使用 bypass）。
