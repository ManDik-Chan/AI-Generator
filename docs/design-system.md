# AI-Generator Premium 视觉设计系统

## 视觉基准

项目所有者提供的 `AI-Generator Premium Rework` 高保真静态原型是 Phase 6B 的主要视觉基准。生产实现不会复制原型的 HTML、单体 CSS 或 DOM 脚本，而是把其视觉语言拆成 React 组件、Tailwind 语义 Token、真实 Next.js 路由和真实数据查询。

Phase 6B1 第一次自由设计方向未通过项目所有者视觉验收；当前实现已按批准原型返工，等待第二次真实视觉验收。原型压缩包只用于本地比对，没有提交到仓库或放入 `public`。

## 品牌语言

产品定位是“高级、安静、私人化的 AI Studio”。浅色具有温暖纸张感，深色使用深炭背景；翡翠绿负责链接、状态、焦点和视觉中心，藏蓝、暖金、淡紫只作为少量辅助。主操作使用深墨色，不用大面积绿色把界面变成普通后台模板。

品牌标志使用原型的双星 SVG，副标题统一为 `Personal AI Studio`。产品 UI 不展示 Phase、开发信息、假快捷键或不存在的功能。

## 原型 Token 到生产 Token

| 原型颜色 | 生产语义 | 浅色 | 深色 |
| --- | --- | --- | --- |
| `--bg` | `background` | `#f4f1ea` | `#101415` |
| `--bg-2` | `background-subtle` | `#ece8df` | `#161b1b` |
| `--panel` | `surface` + 透明度 | 半透明暖白 | 半透明深炭 |
| `--panel-strong` | `surface-raised` | `#fffefa` | `#1b2121` |
| `--panel-muted` | `surface-muted` | `#efede7` | `#202727` |
| `--ink` | `foreground` | `#151a20` | `#f5f7f5` |
| `--muted` | `muted-foreground` | `#697078` | `#a5adab` |
| `--jade` | `primary` | `#128969` | `#39c49b` |
| `--jade-2` | `primary-hover` / 高光 | `#35b893` | `#70dbbc` |
| `--jade-soft` | `primary-subtle` | `#dff2eb` | `#193a31` |
| `--night` | `secondary` | `#17253b` | 浅藏蓝前景 |
| `--gold` | `accent-gold` | `#cc8e38` | 调亮暖金 |

状态色仍使用 `success`、`warning`、`destructive`、`info` 和对应 subtle/foreground。边框以低透明度使用，避免所有卡片都出现明显灰框。

## 形状、阴影与排版

- 控件圆角约 14px，对应 `rounded-control`。
- 普通卡片约 22px，对应 `rounded-card`。
- Hero 与大型展示面板约 34px，对应 `rounded-display`。
- `shadow-soft` 用于轻卡片，`shadow-raised` 用于 hover，`shadow-overlay` 只用于 Hero、Dialog 和重点浮层。
- 首页展示标题使用紧凑字距与约 0.99 行高；页面、章节、卡片、正文、辅助文字和 Kicker 均有独立层级。
- 使用系统字体栈，保持无外部字体的离线构建能力。

## 氛围与动效

纸张点阵、局部网格、绿色/淡紫 Aurora、AI Core、双轨道和能力标签全部使用 CSS/SVG；它们不接收指针事件、不依赖外部图片，也不影响布局。移动端缩小视觉中心，保留辨识度。

页面只做轻微淡入上移，卡片 hover 小幅抬升，轨道与 Aurora 缓慢运动。`prefers-reduced-motion` 会关闭旋转、漂浮和明显位移，并把非必要过渡缩至最低。

## 应用外壳

- 1181px 以上桌面侧栏为 272px；821–1180px 收窄为 230px。
- 820px 及以下使用 68px 半透明移动顶栏和悬浮底部导航。
- 移动底栏包含首页、对话、中央新建、助手、工具，全部是真实 Next.js 路由。
- 侧栏读取真实 Profile 显示名、头像和角色；无显示名时使用自然回退，ADMIN 才显示系统管理入口。
- 页面内容宽度分为 reading、standard、wide、full；首页在 1440px 视口为 1089px，在 1920px 上限为 1180px。

## 共享组件

`components/ui` 提供 Button、Input/Textarea/Select/Field、Surface、PageHeader、SectionHeader、EmptyState、StatusBanner、Skeleton、Dialog/ConfirmDialog、Dropdown/Popover、Tooltip、Badge、SegmentedControl、Avatar、Divider 和 Toast。

共享组件只表达视觉、状态和无障碍契约，不绑定业务。Button 默认主操作使用 foreground/background 反转；翡翠色主要服务于状态、链接、焦点和图标。Avatar 支持受控真实地址，加载失败或缺失时回退为名称首字。

## 主题与无障碍

浅色、深色和跟随系统继续保存到 `localStorage`。根布局在 hydration 前设置 `.dark`、`data-theme` 和 `color-scheme`，避免主题首屏闪烁。主题切换可在桌面侧栏看到完整三态选择，手机和认证页使用紧凑入口。

所有交互控件保留翡翠色 `focus-visible`，icon-only 操作提供 `aria-label`，移动触控区域至少 44px。状态不能只靠颜色表达；Dialog、表单错误、Toast 和加载状态保留语义角色。
