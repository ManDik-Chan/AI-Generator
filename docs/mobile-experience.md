# Phase 6B3 移动端与 Chat 键盘架构（项目所有者已验收）

> 状态：Draft。自动 Chromium、移动 Chromium 与 WebKit 模拟已执行；真实 iPhone Safari、Android Chrome、微信 WebView 与 PWA 仍需项目所有者验收。

## 两种明确分离的滚动模型

普通页面和 Chat 不共享键盘策略。

### 普通页面

Home、Auth、Persona、Memory、Tools、History、Account 与 Admin 在手机、平板和桌面均使用 document/body 自然滚动。`AppShell` 的 `scrollMode="document"` 只负责 Sidebar、Header、内容宽度与移动导航，不固定根高度，也不读取 VisualViewport。底部导航保持 fixed，主内容用 Safe Area 与导航高度 padding 保证最后一项可见。

浏览器可以在普通表单聚焦时执行最小必要滚动；应用不调用 `scrollIntoView`、`window.scrollTo` 或写 document `scrollTop`。Dialog/Sheet 在自己的内容区滚动，关闭后由共享 lock 计数恢复背景，不留下 body top、position fixed 或键盘数据属性。

### Chat

手机 Chat 使用独立结构：

```text
html / body（不参与 Chat 纵向滚动）
└── [data-chat-shell]（fixed 到当前 VisualViewport）
    ├── Chat Header
    ├── MessageList（唯一主滚动区）
    └── ChatComposer（正常 flex 流，位于消息区之后）
```

桌面 Chat 继续是一个受界面高度约束的工作区，包含历史 rail、消息画布和可选助手栏。Composer 不是相对 document 的 fixed 元素，历史与助手移动抽屉也只覆盖 Chat shell。

## iPhone Safari 问题根因

PR #18 基线把 `MobileViewportSync` 挂在根布局，并在所有手机路由上把 `visualViewport.height`、`offsetTop` 与键盘状态写到 `documentElement`。普通 AppShell 和 Chat 同时消费这组全局值；Chat Composer 还把自己的高度写到根节点。

Safari 聚焦 textarea 时既会调整 visual viewport，也可能平移 layout viewport。根高度在这个过程中同步缩小，导致整个页面重新布局；Safari 为保持焦点可见又移动 layout viewport，于是 Composer 被推到可视顶部，缩小后的根下方留下大面积空白。只删除 `scrollIntoView` 无法解除这组“浏览器自动聚焦滚动 + 根节点重排”的耦合。

Phase 6B3 删除了根级同步器和 `--visual-viewport-height`。普通路由不再注册 VisualViewport 监听，Composer 高度也只写到最近的 Chat shell。

## Chat VisualViewport 控制器

`features/chat/use-chat-visual-viewport.ts` 只由 `ChatLayout` 挂载，并只在 `(max-width: 820px)` 启用。控制器读取：

```text
visibleBottom = visualViewport.offsetTop + visualViewport.height
keyboardInset = max(0, layoutViewportHeight - visibleBottom)
```

然后只在 `[data-chat-shell]` 写入：

- `--chat-viewport-height`
- `--chat-viewport-top`
- `--keyboard-inset`
- `data-keyboard-open`

CSS 使用 `position: fixed`、`top: var(--chat-viewport-top)` 与 `height: var(--chat-viewport-height)` 覆盖当前可视区域。没有 VisualViewport 时回退 `innerHeight` 和 `--app-height` 的 `vh` / `svh` / `dvh` 链。

resize、scroll、focus、pageshow 与 window resize 共用单个 `requestAnimationFrame`；写入前比较像素值，小于 1 px 不写。页面 hidden 时取消待执行 frame，visible 后校准一次；断点切换或卸载时移除全部监听、取消 rAF 并清除 Chat shell 的变量。没有 React viewport state，因此键盘动画不会持续重渲染消息树。

## Composer 与消息锚点

Composer textarea：

- 手机计算字号至少 16 px，浏览器缩放保持开放；
- 从单行自动增长到 `min(10rem, 35dvh)`，之后内部滚动；
- 发送、停止和图片理解入口均保持 44 px 触控目标；
- 兼容输入法 composition，Enter/Shift+Enter 语义保持；
- 包含 Safe Area bottom；
- 不在 focus 处理器中移动页面。

Composer 的 ResizeObserver 只把 `--composer-height` 写到 Chat shell。MessageList 同时观察自己的 client size 与内容 size，并响应 Chat viewport 变化：

- 靠近底部（120 px 阈值）时，把目标保持在新的最大 `scrollTop`；
- 用户正在读历史时，保留原 reading `scrollTop`，只在新尺寸边界内夹紧；
- 流式新消息只在 follow 状态自动跟随；
- “回到底部”按钮恢复 follow；
- 键盘、Composer 和内容 ResizeObserver 不调用业务 cancel。

iOS 键盘上方的上一个/下一个/完成 accessory bar 属于 Safari 原生 UI，网页不能移除。当前结构把它视为 visual viewport 遮挡的一部分，不依赖它的具体高度。

## Safe Area、浮层与内容边界

根 Token 提供 `--safe-area-top/right/bottom/left`、移动 Header 与 Navigation 高度。Chat Header、Composer、移动导航和 Sheet 分别消费必要方向；普通页面不会因为键盘开合残留 offset。

共享 Dialog 在手机为 Bottom Sheet，正文独立滚动，Header/Footer 可达；Dropdown Portal 到 body，以 VisualViewport 边界、12 px padding 和 8 px gap 执行上下翻转与左右夹紧。Toast、菜单和操作组不依赖 hover 才可用。

全局没有用 `body { overflow-x: hidden }` 掩盖问题。Flex/Grid 子项允许收缩，媒体最大宽度为 100%，Markdown 正文断行，代码和表格只在组件内部横向滚动。

## 自动测试

公共 Playwright helper：

- `expectNoHorizontalOverflow`
- `expectSinglePrimaryScroller`
- `expectComposerInsideVisualViewport`
- `expectScrollPositionPreserved`

键盘测试可在登录态下用 mock VisualViewport 执行 height、`offsetTop`、反复开合、Composer 边界、document 不滚动和历史位置断言。纯函数测试覆盖可视高度/顶部/键盘 inset、靠底判断与历史锚点。

公开自动矩阵实际执行：

- 手机：320×568、360×800、375×667、390×844、393×852、414×896、430×932。
- 横屏：667×375、844×390、896×414、932×430。
- 平板：768×1024、820×1180、1024×768。
- 桌面：1280×720、1366×768、1440×900、1600×900、1920×1080、2560×1440。
- 额外覆盖 200% 根字体、Chromium Mobile 与 WebKit iPhone 13 模拟。

公开 Home/Auth 在上述尺寸没有页面级水平溢出或 console/page error。受保护页面测试已经覆盖 Home、Tools、Image、Image Generate、Brainstorm、History、Persona、Memory、Account、Admin 和 Chat，但没有 `PLAYWRIGHT_AUTH_STATE` 时会明确跳过，不能宣称已完成登录态 E2E。

运行：

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

登录态：

```powershell
$env:PLAYWRIGHT_AUTH_STATE="C:\path\to\auth-state.json"
pnpm test:e2e
```

Storage state 含登录凭证，不得提交。

## 真实设备验收清单

### iPhone Safari

1. 在有多屏历史消息的 Chat 聚焦 Composer，确认 Composer 位于键盘/accessory bar 上方。
2. 打开、关闭键盘至少五次并切换中英文输入，确认不跳顶、不累积 offset、不留大空白。
3. 分别在靠底和阅读历史两种位置开合键盘。
4. 收起/展开 Safari 地址栏，横竖屏切换，检查 `offsetTop`。
5. 生成中切后台再返回，确认恢复同一 run，不重复 Provider 或额度。
6. 添加到主屏幕后检查刘海与 Home Indicator。

### Android / WebView

1. Chrome + Gboard 的开合、横屏、地址栏变化与字体放大。
2. Samsung Internet、微信内置浏览器的登录、Chat、工具与 Dialog。
3. 后台恢复和附件/图片入口。

浏览器模拟不能完整模拟真实软键盘、动态工具栏、PWA 或 OEM WebView。当前真实 iPhone Safari、Android、微信 WebView、PWA 均标记为“未真实验证”。
