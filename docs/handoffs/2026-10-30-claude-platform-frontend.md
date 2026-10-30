# 交接：AIG 平台前端产品化（Claude，2026-10-30）

> 分支 `claude/platform-frontend-20261030`，基于 `origin/codex/recruitment-final-integration-20261029`（`711d301`，包含 main `0e13d32`、招聘 Demo 与 `/platform` 预览）。
> 未合并 main，未部署 Production，未改数据库、migration、RLS、Provider 或鉴权策略。

## 1. 定位

**AI-Generator = 隐私优先的项目平台。** 开发者展示研究与作品、发布不可变版本，并在使用者明确授权后提供可运行的能力。Project 是一级实体；对话、人格、长期记忆、工具与 Agent 组成平台内置的 **AI Hub**，是第一个已经上线的模块。依据：`docs/platform/p05/inputs/AIG_Platform_Development_Roadmap_v1.0.md`（platform-p05 分支）中的产品定义与 P0.5 契约草案。

## 2. 信息架构

| 区域 | 路由 | 登录 | 数据 |
|---|---|---|---|
| 官网 | `/` | 否 | 静态文案 |
| 探索目录 | `/explore` | 否 | 示例项目 + 本站真实项目 |
| 项目展示页 | `/explore/[slug]` | 否 | 同上；私有项目 404，不公开列出的项目可访问但 `noindex` |
| 演示工作台 | `/platform/*` | 否 | 全部示例数据，每页有森林色「演示工作台」标识 |
| 工作台主页 | `/workspace` | 是 | 真实账户数据 + 示例项目条（标注演示状态） |
| 项目 | `/projects`、`/projects/new`、`/projects/[slug]` | 是 | 演示状态（Registry 未部署） |
| 开发者 | `/developer` | 是 | Manifest 校验在浏览器内真实运行；其余为契约说明 |
| 连接与授权 | `/connections` | 是 | 演示状态（BYOK 与授权在设计阶段） |
| AI Hub | `/hub` + 原有 `/chat` `/personas` `/memories` `/tools/*` `/agents` | 是 | 真实功能，未改业务逻辑 |

工作台导航：顶部药丸导航「主页 · 项目 · AI Hub · 开发者 · 探索」，AI Hub 页面下方有二级导航，⌘K 命令面板；1024px 以下为浮动底栏（主页 · 项目 · 新对话 · AI Hub · 菜单）。

## 3. 设计系统

- 工作台 Token 改为 Landing 的同一套色：纸 `#f2efea`、暖墨 `#241f21`、柠檬黄、森林绿、翡翠；深色模式为暖炭色。旧冷色墨色硬编码已替换为 Token。
- 新组件：`components/platform/`（`ArtSurface` 复用 Landing 的程序化着色器画作做项目封面、`Kicker`「标签 ↓」、`PageIntro`、`Tabs`、状态胶囊、演示说明等）。
- 动效：标题逐行上滑、内容上浮、媒体自下而上揭开、循环箭头、文字翻滚；全部尊重 `prefers-reduced-motion`。
- 共用的 `PageHeader` / `SectionHeader` 改为编辑式，现有 AI Hub 页面自动继承，未改它们的逻辑。
- 登录页左侧换成程序化画作 + 新定位文案，表单与认证流程未改。

## 4. Landing 的改动

- 视觉与动效系统（Hero 纵深卡片场、章节擦除、索引、Forest、页脚）保持原样。
- 叙事改为平台定位：Hero「展你所作，守你所藏。」（保留了已认可的第二句），五章依次为项目 / 实验室 / 发布 / 隐私 / AI Hub，About、能力卡、平台地图、Forest、流程、结尾、页脚与中英文全部同步。
- 修复已知缺陷：滚动到浅色区块时 Header 与正文重叠。做法是在固定 Header 后面加一条只模糊、不加色的渐隐带。
- 新增 6 个 Landing 图标与 5 套画作配色（仅追加，原有的未改）。

## 5. 演示状态与预留接口

- `features/platform/source.ts` 是 Explore、Projects、Developer、Connections 唯一的数据入口。现在返回 `source: "demo"` 的 fixtures；Registry（P1-B）部署后只需替换函数体，页面与 props 不变。可见性规则已经按契约实现并有单测覆盖。
- `features/platform/manifest.ts` 按 P0.5 `manifest.schema.json`（0.5.0）手写校验，新建向导和开发者控制台共用。
- `features/platform/run-lifecycle.ts`：PENDING → ACCEPTED → RUNNING → 终态，终态不可逆。项目控制台的运行模拟器在本地走这个状态机。
- 真实与示例的边界：只有 `ai-generator` 项目是真实的，它的发布记录就是 main 上合并过的 PR，文档链接指向仓库里真实存在的文件。其他项目都标注「示例项目」，指标一律「未发布」；唯一例外是排序实验的比较次数，它由页面代码当场计算。体数据实验室使用程序生成的合成数据，标注「非临床」。

## 6. 验证（2026-10-30，Node 22.23.1 / pnpm 11.7.0）

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint`（零警告） | 通过 |
| `pnpm test` | 151 文件 / 897 测试通过，51 个需数据库的集成测试照旧跳过 |
| `pnpm build` | 通过（第一次因 Google Fonts 拉取异常失败，重试通过，与此前记录一致） |
| 预渲染 HTML 静态检查 | 探索目录不含私有项目和不公开列出的项目；不公开列出的项目带 `noindex`；10/10 个演示页面带演示标识；无 `undefined`/`NaN` 输出 |

更新的单测：`design-foundation`、`navigation`、`premium-product-ui`（Token）、`mobile-performance-contract`、`home/presentation`。这些测试原本把旧设计写死在源码快照里，现在按新设计重写，原来的意图都保留了：只放真实入口、`prefetch={false}`、安全区、减少动态效果、文档滚动。新增 `features/platform/platform.test.ts`（18 项，覆盖校验器、状态机、可见性、排序与体数据）。

**未验证（按 `AGENTS.md`，浏览器自动化仍暂停）：**

- 没有打开任何浏览器、截图或运行 E2E。真实渲染、动效手感、深色模式、各断点与触屏效果需要 Owner 在 Preview 上亲自查看。
- PR #35 的第一轮 CI 中，E2E 有两类失败，已在后续提交修复，修复后的结果以 CI 为准：
  - **旧文案断言**：`public-mobile`、`responsive-matrix`、`authenticated-mobile` 仍在断言旧主页标题和旧的移动端菜单链接，已同步为新标题与新菜单。原来的「路由到受保护页面并保留 `next`」检查改用 Landing 的浮动对话入口（`/chat`）。
  - **对话入口性能**：从 `/workspace` 进入对话，输入框可用耗时 2.7 秒，超过 1.5 秒的预算。CI trace 显示，`ArtSurface` 在页面加载 40ms 后，于主线程一次性渲染全部画作（5 个色块、3 张封面，均为 1200×800），在软件 WebGL 下阻塞约 2.1 秒。现在每张画作按自身显示尺寸渲染，在空闲时间逐张执行，组件卸载后跳过。
- **字体改为本地托管**（经 Owner 同意）：第二轮 CI 中，webkit-iphone 在 `next build` 阶段因 `next/font/google` 拉取失败而中断，本地首次构建也出现过同样的错误。现在 Figtree 与 Noto Sans SC 的文件都放在 `app/fonts/`（4.8MB，SIL OFL 1.1）。
  - 文件字节与此前线上一致，`@font-face` 声明逐字保留，中文仍按 101 个分片按需下载。
  - Figtree 只保留拉丁子集，扩展拉丁字符（如 ő）改由后备字体显示。
  - 本地 Windows 构建的字体预加载清单为空，这是 Next 自身的路径判断问题，换回 Google 字体时同样如此；Linux（CI、Vercel）不受影响。详见 `app/fonts/README.md`。

## 7. 需要 Owner 决定或知悉

1. **Hero 标题**：从「懂你所想，守你所藏。」改为「展你所作，守你所藏。」。如果想保留原句，只需改 `features/landing/content.ts`。
2. **Skills**：Roadmap 里没有这个概念，我把它并入了项目的「能力 + 授权」，原 `/platform/skills` 预览已删除。
3. **受保护路由前缀**：`lib/auth/return-path.ts` 增加了 `/hub`、`/projects`、`/developer`、`/connections`，使用的是现有的登录跳转，没有放宽任何规则。
4. **Preview 环境的登录**：公开页面与 `/platform` 演示工作台不需要账户。登录后页面依赖 Preview 环境变量指向哪个 Supabase/数据库，这一点此前的记录里写的是「未核实」。
5. **合并策略**：本分支包含整个集成分支。如果 Owner 选择逐个合并来源 PR，需要先合并它们，再 rebase 本分支。

## 8. 最短验收路径

1. 打开 Preview 的 `/`，滚过 Hero 与五章，切换 EN。
2. 打开 `/explore`，进入「体数据三维重建」，看实验室（拖动点云，调整阈值）；再进入「排序算法对照实验」，看实验室与基准表。
3. 打开 `/platform`（演示工作台），依次看项目 → 某个项目控制台（运行模拟、设置）→ 新建项目向导 → 开发者（改动 Manifest）→ 连接与授权（撤销授权）→ AI Hub。
4. 在手机宽度重复第 3 步，检查底栏和菜单。
5. 如果 Preview 能登录：`/workspace` 的真实数据，以及原有对话、记忆、工具在新外壳里是否正常。
