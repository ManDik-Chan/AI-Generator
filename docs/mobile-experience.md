# Phase 6B2 移动端体验

## 目标与边界

Phase 6B2 建立长期共享的移动布局契约；Phase 6B2.1 进一步修复软键盘跳顶、VisualViewport 抖动、桌面固定容器滚动、首页客户端负担与动态详情批量预取。覆盖 320px 手机、常见 iPhone/Android、横屏、平板、PWA、软键盘和动态浏览器工具栏。它只调整显示与交互层，不改变 Auth、API、Provider、Prompt、数据库、RLS、每日限额、Storage 或 durable generation 语义。

## AppShell 滚动模型

820px 及以下的普通 AppShell 使用以下结构：

```text
App viewport（不滚动）
├── MobileHeader / DesktopSidebar
├── Main scroll region（页面唯一纵向滚动区）
└── MobileNavigation（固定，含安全区）
```

AppShell 高度来自 `--visual-viewport-height`，手机 Main 使用 `mobile-scroll-region`。Main 的底部 padding 等于导航高度、安全区和内容间距之和，因此最后一项不会被导航遮挡。Dialog 打开时只通过根数据属性锁定背景溢出，关闭时不主动调用 `window.scrollTo`。

821px 及以上的 Home、Tools、Persona、Memory、Account、Admin 等普通页面使用浏览器 document/body 自然滚动；Desktop Sidebar 固定在自己的 rail 内，不再把整页套进固定 VisualViewport 高度或显示粗重的全页内部滚动条。`AppShell` 通过 `scrollMode="document" | "viewport"` 明确区分两种模式，默认是 document。Chat 不使用普通 AppShell 滚动模型，仍保持固定 viewport、消息区独立滚动和底部 Composer。

Chat 使用更严格的三层结构：安全区 Header、唯一可滚动 MessageList、底部 Composer。页面本身不滚动。用户靠近底部时新内容自动跟随；主动上翻后停止强制跟随并显示“回到底部”。页面卸载、隐藏或 VisualViewport 变化不会调用业务 cancel。

## dvh、svh 与 Safe Area

根 token 先以 `100vh` 提供旧浏览器回退，再在支持时覆盖为 `100svh` 和 `100dvh`。运行时 VisualViewport 可进一步写入实际像素高度。组件只消费：

- `--app-height` / `--visual-viewport-height`
- `--safe-area-top/right/bottom/left`
- `--mobile-header-height`
- `--mobile-nav-height`
- `--composer-height`

Header、Composer、导航和 Sheet 使用 `env(safe-area-inset-*)` 的统一 token，避免刘海、灵动岛和 Home Indicator 覆盖操作区。

## VisualViewport 与软键盘

`features/mobile/use-visual-viewport.ts` 仅在客户端运行，并只在 `(max-width: 820px)` 匹配时注册监听；桌面没有 VisualViewport、window resize 或 focus 监听。resize 可以同步高度与 offset，VisualViewport scroll 只同步 offset，不持续改写 AppShell 高度。事件由单个 `requestAnimationFrame` 合并；像素变化小于 1px 时跳过 CSS 写入，不执行 React setState。页面隐藏时不更新，visible/pageshow 时只校准一次，断点切换或卸载时取消 rAF 并移除全部监听。

软键盘判定必须同时满足：当前聚焦 input/textarea/select/contenteditable、相对聚焦前 layout height 至少缩小 140px、可视高度低于 layout height 的 82%。因此仅滚动 Safari 地址栏不会被当作键盘。普通 AppShell 在确认键盘打开后隐藏底部导航；Chat 本来就隐藏主导航，Composer 随可视 viewport 保持在底部。没有 VisualViewport 时回退 `window.innerHeight`。

## Chat Composer

Composer textarea 在手机使用至少 16px 字号。内容变化后只测量自身 `scrollHeight`：从单行增长到 `min(10rem, 35dvh)`，超过后在 textarea 内部滚动。ResizeObserver 只观察 Composer 自身，用于写入 `--composer-height`；它不观察全站，也不在 scroll 事件中触发 React 渲染。

发送/停止按钮保留 44px 触控面积。Prompt 很长时 Composer 不占满屏幕；焦点进入不调用 `scrollIntoView`、`window.scrollTo` 或直接写入 document/body scrollTop，避免键盘弹出时把消息区或页面送回顶部。切后台和恢复继续沿用既有 durable generation recovery，不重启 Provider。

## Phase 6B2.1 首页与导航性能

- reading / standard / wide 内容宽度分别为 52rem / 84rem / 100rem，桌面内边距使用 `clamp(1.5rem, 3vw, 3rem)`。
- 首页主体是 Server Component；显示名与最近对话置于稳定 Suspense 边界，认证/资料请求使用 React `cache()` 做请求内去重，最近对话与 shell viewer 并行读取。
- 首页不再加载 Framer Motion；卡片交互使用 CSS 并服从 reduced-motion。生产构建首页 route size 从 45.5 kB 降到 1.59 kB，First Load JS 从 164 kB 降到 120 kB。
- 对话历史、人格列表和记忆来源等可增长详情列表使用 `prefetch={false}`；固定主导航仍保留默认预取。
- 根布局提供轻量即时导航进度，主要 route 提供尺寸稳定的 `loading.tsx`，不添加人为延迟、不全屏白闪。
- 普通桌面页使用浏览器滚动条；Chat/历史等内部滚动区使用 thin/6px、透明轨道、低对比 thumb。

## 移动导航

移动端仍是首页、对话、中心新建、助手、工具五项。320px 使用可收缩五列，标签保持单行省略，每项至少 44px。导航距四边使用 Safe Area，Main 自动补偿导航高度；键盘打开时隐藏导航，避免与输入控件叠加。

## Dialog、Sheet 与 Dropdown

共享 Dialog 使用原生 `<dialog>`：桌面居中，820px 及以下贴底成为 Sheet。面板最大高度根据 VisualViewport 和安全区计算，Header/Footer 固定在网格行，只有正文滚动；Escape、关闭按钮和背景滚动恢复保持可用。长表单在横屏和键盘打开时仍可关闭。

Dropdown 不再依赖父元素 `position:absolute`。菜单 Portal 到 `document.body`，以 trigger/VisualViewport rect 计算 fixed 坐标：保留 12px viewport padding 和 8px trigger gap；空间不足时上下翻转，左右按 start/end 对齐后夹紧。窗口、VisualViewport 或祖先滚动时重新定位，Escape/外部点击关闭。

## 内容防溢出与字体缩放

Flex/Grid 子项默认允许收缩；标题、邮箱、Prompt、UUID 和连续英文使用 `overflow-wrap:anywhere`。媒体元素最大宽度为 100%。Markdown 普通正文断行，代码块和表格只在组件内部横向滚动。页面没有使用 `body { overflow-x:hidden }` 掩盖问题。

820px 及以下的 input、textarea、select、contenteditable 计算字号至少 16px，避免 iOS 聚焦自动放大。Viewport 没有 `user-scalable=no` 或 `maximum-scale=1`，需要支持 100%、125%、150% 和 200% 缩放。主要操作至少 44 × 44 CSS px；320px 下允许按钮组纵向增长。

## 自动测试

单元/契约测试覆盖 viewport、不禁用缩放、dvh/svh、安全区、移动/桌面滚动分离、16px 表单、Composer 上限、无聚焦滚动、VisualViewport 移动端监听与清理、Portal collision、Sheet、Markdown/代码/媒体防溢出、动态 Link 预取、首页 Server Component、即时导航反馈、44px 触控与 reduced motion。

Playwright 项目：

- `chromium-desktop`：Desktop Chrome
- `chromium-mobile`：Pixel 5 设备参数
- `webkit-iphone`：iPhone 13 设备参数

公开测试无需账号：

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

受保护页面必须使用专用测试账号生成本地 storage state，并设置：

```powershell
$env:PLAYWRIGHT_AUTH_STATE="C:\path\to\auth-state.json"
pnpm test:e2e
```

storage state 包含登录凭证，不得提交。`expectNoHorizontalOverflow(page)` 同时比较 `documentElement.scrollWidth/clientWidth` 并列出越界元素，不能只检查 body。

## 验收矩阵

自动 viewport 基线覆盖 Chromium Desktop、Pixel 5 参数和 WebKit iPhone 13 参数。手动 Responsive Mode 需要检查 320×568、360×800、375×667、390×844、393×852、412×915、414×896、430×932、768×1024、820×1180、1024×768、1440×900，以及 667×375、844×390、896×414、932×430 横屏。

页面矩阵：首页、登录、注册、Chat、Persona、Memory、Tools、三个文本工具、Image Analyze、Image Generate、Brainstorm、History、Account、Admin。检查浅色/深色、reduced-motion、200% 缩放、长内容、Dialog、Dropdown、键盘打开/关闭和后台恢复。

## 真实设备验收流程

### iPhone / WebKit

1. Safari 地址栏展开与收起时检查 Header、Main 与底部控件。
2. 聚焦/失焦 Chat、Persona 和工具 textarea，检查键盘打开/关闭。
3. 横屏打开长 Dialog，滚动正文并关闭。
4. 生成中切后台再返回，确认只恢复原任务。
5. 添加到主屏幕后启动并检查 Safe Area。

### Android / Chromium

1. Chrome 地址栏变化和 Gboard 打开/关闭。
2. 横屏、后台恢复与浏览器字体放大。
3. Samsung Internet/微信内置浏览器完成核心登录、Chat 和工具路径。

自动模拟不能等同于真实软键盘、动态工具栏或 PWA。未在真实设备执行时必须报告“未真实验证”。

本次本地使用系统 Microsoft Edge 的 Playwright 驱动检查 320、360、390、430、768、1024、1366、1440、1600 和 1920px：没有水平溢出或 console error；≤768px 为固定 viewport + Main 内部滚动，≥1024px 为 document 自然滚动。官方 Playwright Chromium 包在当前网络下下载速度不足，标准 Chromium/WebKit 项目尚未完整执行；真实登录态 Chat 键盘、iOS/Android 动态工具栏和 PWA 仍必须由项目所有者复验。

## 已知限制

- iOS 后台可能暂停 JavaScript、SSE 和计时器；服务端 durable task 继续，但回前台后才查询状态并恢复画面。
- VisualViewport 在部分旧 WebView 缺失或 offset 上报不完整，此时回退 dvh/svh 与 innerHeight，无法保证像现代 Safari/Chrome 一样精确。
- 浏览器设备模拟不能完整模拟 Gboard、iOS 键盘、微信 WebView、系统字体和 Home Screen PWA。
- Tooltip 仍以轻量 CSS 呈现；关键操作不依赖 Tooltip 才能理解。
