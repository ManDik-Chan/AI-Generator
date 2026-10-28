# Marketing / Workspace 视觉保护契约

> P0 初稿，2026-10-28；待 Owner/Claude 视觉验收。  
> 锁定 `main e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`。**Verified**=源码确认，**Inferred**=保护/验收建议，**Unverified**=缺少真实画面或批准记录。

## 1. 权威与保护范围

**Verified**：当前公开页由 `app/(marketing)/page.tsx` 和 `features/landing/*` 实现，`app/(platform)/workspace/page.tsx` 是认证后的工作台。路线图称当前 Landing 已获 Owner 认可；**Unverified**：本轮未取得绑定该 SHA 的 Owner 截图/录屏签署记录，不能自行补签。

**Inferred / DRAFT**：以当前源文件和 Owner 后续选定的 golden screenshot/video 共同构成基线。Codex 本轮不编辑 UI；后续仅作契约集成，视觉变更单独 RFC/PR，Claude 实施和提供差异，Owner 审批。内容/导航变更也要复验布局与时序。

### 源码清单（Verified）

| 路径 | 职责与证据 |
|---|---|
| `app/(marketing)/page.tsx:9` | query → cookie → 中文默认语言，metadata、纸色 themeColor |
| `app/(marketing)/layout.tsx:1` | 只为 Marketing 导入 landing.css，不包 AppShell |
| `app/layout.tsx:10–12` | Figtree / Noto Sans SC 变量；字体是与旧文档不同的真实实现 |
| `features/landing/components/landing-page.tsx:81` | SSR Landing 结构、Hero、5 个 chapter、页面节奏、footer/CTA |
| `features/landing/components/landing-runtime.tsx:53` | Hero 深度、滚动、章节遮罩、Goo、指针、语言/菜单、preloader 生命周期 |
| `features/landing/components/primitives.tsx` | SVG IconSprite、逐字/循环图标/图片 primitives |
| `features/landing/art.ts` | 生成艺术图像与 fallback，不是 CTMR 结果或业务数据 |
| `features/landing/content.ts` | 中文/英文叙事；不是后台数据/Benchmark 来源 |
| `features/landing/landing.css:7` | 独立 .lp tokens、栅格、动效、断点、reduced-motion |
| `app/globals.css`、`components/layout/*` | Workspace 语义色和应用壳；仍可能通过全局字体/选择器影响 Marketing，需双向回归 |

文件 SHA256 已存 [landing-source-hashes.json](../evidence/landing-source-hashes.json)。**Verified**：hash 只证明源文件冻结；**Unverified**：不能证明同一代码在不同字体/浏览器/随机布局下视觉完全相同。

## 2. 当前视觉语言及不可静默覆盖项

| 维度 | 源码已确认（Verified） | 后续保护要求（Inferred / DRAFT） |
|---|---|---|
| 主色 | `.lp --paper #f2efea`，`--ink #241f21`，`--lime #e9e778`，forest `#0f2a24`、emerald `#1a8a70`（CSS:7–17） | 不把 Marketing 换回紫罗兰/Lumen；强调色保持局部使用 |
| 排版 | Figtree + Noto Sans SC；显示字 `clamp(40px,5vw,86px)`、紧字距、混合中文/英文（CSS:27,114） | 字体与行断位置必须做中英文桌面/手机对照 |
| 栅格 | 12 栏；gutter/gap 用 clamp；主内容偏编辑式非满屏卡片（CSS:19–22,146） | 新成果页延续节奏，可为科研 Viewer 局部提高工具密度 |
| Hero | sticky 整屏、1000px perspective、随机卡片 3D、中心标题避让（CSS:358；runtime:76–92） | 不删除/重写 Hero 或改为静态大图；中心区域不得被卡片遮挡 |
| 章节 | 5 章 sticky 叠放、从底部遮罩切换、背景视差、编号/进度联动（page:169；runtime:234–273） | 不用普通轮播替换，不改变遮罩方向/章节顺序而不说明 |
| 微交互 | 逐字翻滚、图标循环、Goo、磁吸、细线绘入、字透明渐显、footer 绘制 | 保留与 focus/触屏等价路径；具体运动约束见 motion 文档 |
| 内容真实性 | chapter 注释称 product shots 为 placeholders；mock composer/workers/history 为装饰（page:168,382） | 不当作真实运行或 CTMR 结果；真实指标缺证据时显示未发布 |
| 导航 | 桌面 nav，960px 以下 menu；语言按钮/aria-expanded | 不破坏 `/enter` 与旧平台 URL；新增 IA 单独集成验收 |

### 与旧设计文档的冲突清单

| 旧描述 | 当前真实源码 | 处理 |
|---|---|---|
| `docs/design-system.md:1` 为 Lumen；紫罗兰主操作、蓝灰画布 | Landing 为纸/墨/黄绿的 `.lp` 独立色系 | Verified 差异；旧规范保留用于历史/Workspace，不能指导重做 Landing |
| 旧文档称系统字体栈、Inter 等（design-system:38） | 根布局用 next/font Figtree 与 Noto Sans SC | Verified 差异；以固定源代码与 Owner 验收为准 |
| “Home=Lumen Hero + 工作区计数”（design-system 页面映射） | `/` 是公开 Marketing，工作区迁往 `/workspace` | Verified 差异；文档 Home 的旧语义不可覆盖公开页 |
| 旧 UI roadmap/原型可用作设计基础 | 当前 Marketing 自带 runtime + CSS + artwork | Inferred：旧 ZIP/截图只能作历史参考，不能自动成为新 golden |

## 3. 本轮发现的可访问性/退化风险

- **Verified**：SSR root 固定 `lp is-loading`，preloader 覆盖全屏；CSS:49 锁滚动，:235–241 只有 `is-loaded` 才移走遮罩；runtime:543–552 负责解锁。源码没有 noscript/CSS-only 解锁路径。**Inferred**：禁 JS、hydrate 失败或脚本受阻时页面可能永久被遮住，这是需要单独修复和验证的退化问题，不是要求保留的视觉效果。**Unverified**：本轮没有运行禁 JS 浏览器场景。
- **Verified**：reduced-motion 禁 Lenis、Hero 深度速度/磁吸/标记自旋，CSS 减少 transition/animation；但 runtime:512–518 仍调用 Hero center、章节背景、文字透明、parallax、footer 变换。**Inferred**：低动态验收需定义可接受的滚动位移，不能据 media query 存在就判通过。
- **Verified**：移动菜单 `inert`/aria-expanded/Escape 已有（runtime:417–459）；没有看到菜单打开时的 focus trap/初始焦点/关闭后焦点恢复逻辑。**Inferred**：键盘可误入背后内容，须实测后单独修复；不把缺陷列为必须复刻。
- **Verified**：Hero 布局用 Math.random，不能要求逐像素比较每张浮卡位置。**Inferred**：录屏验收比较中心留白、密度、速度、空间层级和时序；截图基线需记录固定随机环境或使用容差/遮罩。

## 4. Golden baseline 采集与签署（Inferred / DRAFT）

**Unverified**：本轮无新的 browser screenshot、录屏、设备性能数据或 Owner golden sign-off。下面是待执行清单，不是已完成记录。

| 宽度/条件 | 必须留证的画面/交互 |
|---|---|
| 320 / 390 / 430 | 首屏、菜单/语言、章节转场、中英文长文、触屏 CTA、footer；无横向溢出 |
| 768 / 1024 | 断点两侧的 12 栏重排、章节组件隐藏/保留、栅格间距 |
| 1440 / 1920 | Hero 中心留白、纵深卡片密度、chapter 对齐、footer 细线 |
| 键盘 | 从首个链接 Tab 至页尾；菜单/语言打开关闭、Escape、焦点可见、无隐藏元素陷入 |
| reduced-motion | 首屏解锁、所有内容可达、章节可阅读、不得强制平滑滚动/明显持续漂移 |
| 无 JS / hydration 失败 | 首屏与核心导航/正文可见；不得被 preloader 或 opacity/mask 永久挡住 |
| 动效视频 | 加载→Hero 稳态→加速/滚动→全部章节→footer，至少一段桌面和一段触屏录屏 |

每件素材记录 `commit/tree`、URL/语言、viewport/DPR、浏览器版本、OS/字体、motion preference、JS 状态、滚动/交互步骤、录制日期、Owner 批准状态。不得从旧目录任取截图并称其已批准。建议记录结构：

```json
{
  "commit": "e33ac216bdcffc44d12d4b7315e0d6cc48decf5c",
  "viewport": { "width": 390, "height": 844, "dpr": 3 },
  "language": "zh",
  "motion": "normal",
  "javascript": true,
  "artifact": null,
  "ownerDecision": "PENDING"
}
```

这是 **Inferred / DRAFT** 的记录格式，`artifact:null` 明确表示未采集。P1 冻结前由 Claude/Owner 补齐；Codex 不代签。
