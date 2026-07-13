# AI-Generator 视觉设计系统

## 品牌原则

AI-Generator 是“高级、安静、可信、私人化的 AI 工作空间”。界面优先帮助用户理解任务和数据边界，不用虚假统计、夸张渐变、满屏玻璃拟态或无意义动画制造科技感。视觉辨识来自成熟的翡翠主色、克制的层次、精确排版和稳定交互。

## 语义 Token

所有颜色定义在 `app/globals.css`，页面不得写死主题色。核心 Token 包含 `background`、`foreground`、`surface`、`surface-raised`、`surface-subtle`、`overlay`、`primary`、`primary-hover`、`primary-subtle`、`secondary`、`accent`、`muted`、`border`、`border-strong`、`success`、`warning`、`destructive`、`info`、`focus-ring` 及对应 foreground/subtle 值。

浅色使用温和灰白背景，深色使用深炭灰；卡片依赖背景层级和边框，只有悬浮面板、Dialog 和 Popover 使用明显阴影。状态必须同时具备文字或图标，不能只靠颜色。

## 排版、间距与形状

- `text-display`：首页主叙事。
- `text-page-title`：页面唯一主标题。
- `text-section-title`：内容分区。
- `text-card-title`：卡片与小面板标题。
- `text-body` / `text-supporting`：正文与辅助说明。
- `text-label` / `text-caption`：表单标签和紧凑元信息。

使用系统字体栈，保证离线构建。正文默认舒展行高，长内容限制阅读宽度。圆角分为 `control`、`card`、`overlay`、`display`；阴影分为 `soft`、`raised`、`overlay`。常规间距以 4px 倍数为基础。

## 动效

控件 hover 约 140ms，面板进入约 220ms。只使用轻微透明度、颜色和 2–8px 位移，不让卡片大幅跳动，不伪造进度。`prefers-reduced-motion` 会关闭非必要动画和顺滑滚动。

## 页面宽度

- `reading`：账号、设置、长表单，最大约 48rem。
- `standard`：普通管理页，最大约 64rem。
- `wide`：首页、工具和复杂列表，最大约 90rem。
- `full`：聊天等沉浸式界面。

`AppShell` 负责桌面侧栏、移动顶栏、底部导航、安全区和页面宽度。业务页面不要自行重建全局导航。

## 组件规则

共享组件位于 `components/ui`：Button、Input/Textarea/Select/Field、Surface、PageHeader、SectionHeader、EmptyState、StatusBanner、Skeleton、Dialog/ConfirmDialog、Dropdown/Popover、Tooltip、Badge、SegmentedControl、Avatar、Divider 和 Toast。组件支持 `className`、键盘访问、清晰焦点和 aria 属性，不绑定业务。

Button 的默认层级只留给页面主操作；secondary/outline 用于次操作，ghost 用于低层级操作，destructive 只用于明确破坏行为。表单错误靠近字段或表单显示，并通过 `aria-describedby`/`role=alert` 关联。

## 明暗主题

主题支持浅色、深色和跟随系统，偏好保存到 `localStorage`。根布局在 hydration 前执行小型内联脚本设置 `.dark`、`data-theme` 和 `color-scheme`，减少首屏闪烁；无 JavaScript 时保留浅色可读基线。桌面侧栏、移动顶栏、认证页和账号页均提供入口。

## 无障碍

所有交互元素保留 `focus-visible`，icon-only 按钮必须提供 `aria-label`，移动触控目标至少 44px。Dialog 使用原生焦点约束与 Escape 行为；状态信息具备 role 和文字。常规文本、边框和状态色以 WCAG AA 为目标，最终仍需真实浏览器与辅助技术验收。
