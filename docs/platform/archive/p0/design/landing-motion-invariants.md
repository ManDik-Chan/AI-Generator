# Landing 动效不可变约束与退化验收

> P0 源码基线初稿；2026-10-28；`main e33ac216bdcffc44d12d4b7315e0d6cc48decf5c`。  
> **Verified**=固定源码机制，**Inferred**=建议验收/约束，**Unverified**=本轮无实际录屏/浏览器结果。

## 1. 动效实现边界

**Verified**：主要运行时为 `features/landing/components/landing-runtime.tsx` 的 `startLanding`，搭配 `landing.css`。它使用 Lenis、自写 requestAnimationFrame、CSS transitions/keyframes、IntersectionObserver 与动态 artwork；不是仅有静态页面，也不是凭安装 GSAP 即可重写的模板。

**Inferred / DRAFT**：保护的是当前 Owner 认可的空间、节奏、反馈和内容可达性；发现的无 JS/焦点/低动态问题需单独修复。源文件修改、资源替换或文案增长都需检查时序与遮挡，业务新功能不得顺带替换核心 runtime。

## 2. 当前运动参数及保护点

| 机制 | Verified 源码参数/行为 | Inferred / DRAFT 约束 |
|---|---|---|
| preloader | runtime:534 最短 normal 1600ms、reduce 200ms；资产等待 4500ms race；finish normal 延迟 350ms；隐藏遮罩再延迟 1600ms | 保留正常模式加载节奏；资产错误不能无限等待；无 JS 必须可读；不把永久挡屏纳入 golden |
| Hero 深度 | `ZMIN=-2800`、`ZMAX=560`（:40–41）；CSS perspective=1000px；超过 ZMAX 重置至后方 | 保留前后层次、淡入淡出、卡片循环和中心排版避让 |
| 标题避让 | runtime:82–87 在 `0.27*vw × 0.17*vh` 中心留白区外尝试放置；随机位置最多 14 次 | 比较视觉遮挡率和留白，不把随机卡片像素当恒定业务数据 |
| 卡片密度 | :97–103 小于 700px 时 avatar/art/bubble/chip=7/8/3/3，桌面=12/14/6/6 | 手机保持较轻密度；调整数量/阈值必须说明性能和视觉理由 |
| Hero 加速/离场 | :151–165 基础深度速度 60、加载 boost 2200 后指数衰减；滚动速度有上限贡献；标题上移至 -14vh、缩至 0.92，shade 至 0.55 | 保留扩张/加速→滚动离场的连续感；中心标题不能突跳或被卡片穿越 |
| Pointer 微动 | :146–151 lerp 0.05，cam rotateX 最大约4°/rotateY约6°；磁吸 finePointer 且 !reduce，lerp 0.14 | 不对触屏强制依赖 hover；reduce 模式需额外复验 cam 是否仍跟 pointer |
| 平滑滚动 | :362–371 Lenis lerp 0.085、smoothWheel；loading/menu 时 stop；reduce 不建 Lenis | 保持滚动与章节同步；页面退出需 destroy；reduce 禁强制平滑 |
| 章节时序 | HOLD=0.3、STEP=1.3；CSS 章节高度 `100vh * (1+(n-1)*1.3+0.3)`；5 章 | CSS 高度和 JS 进度公式必须同步，不得单独改造成提前/滞后切换 |
| 章节遮罩 | :248–272 后续章从底部 `clipPath:inset(100%→0)`，active 在进度>0.5 切换；背景 enter 16vh/exit -8vh；编号与进度条联动 | 保留遮罩方向、层级、文字/组件入场和滚动索引连续性 |
| 文字/媒体 reveal | :374–398 IO rootMargin -10%/-8%；CSS 逐字翻滚、line、clip-path media 与发光文字 | 内容不能因快速滚动跳过永远隐藏；保留 :400–412 sweep 或等效处理 |
| 品牌/页尾 | :316–328 滚动自旋后停至90°倍数；footer 随进度 rotate/scale；CSS footer draw 与子元素延迟 | 保留页尾绘入与层次，不用无限随机旋转覆盖当前静止落点 |
| 图形资源 | :170–189 fallback → renderArt；清理 object URL | 外观变化独立验收；不能用 CTMR 指标/真实结果名义展示生成装饰图 |
| 退出/语言 | :447–455 写语言 cookie，is-leaving curtain normal 750ms；reduce 0 | 语言切换两版本都要保证布局；不丢认证回跳路径 |
| Resize/生命周期 | :490–499 120ms debounce；触屏 URL bar 仅高度变不重新 pin；:568–576 cancel RAF/timeout/listener/Lenis | SPA 进出无重复监听、孤儿 RAF、持续锁滚动或新旧 runtime 共存 |

## 3. 必须显式记录的基线缺口

### M-01 无 JS（Inferred：P1 视觉冻结前阻断）

**Verified**：`landing-page.tsx:86,90` 输出 `is-loading` 与 preloader；CSS:49 锁滚动、:120–124 标题初态移出、:126–136 reveal/media 初态隐藏；只有 runtime:546–547 切换 is-loaded。不存在 `<noscript>` 或无 JS 可见默认态。  
**Unverified**：本轮没有启动 browser 禁 JS 测试。**Inferred**：应以渐进增强修复，SSR 默认可读，再由 JS 启用动效；不应把单个遮罩隐藏当作所有内容可读的证明，需检查 opacity、clip-path、章节堆叠与标题 transform。

### M-02 reduced-motion（Inferred：需要真实行为验收）

**Verified**：CSS:807 将 animation/transition 缩短，JS 不启用 Lenis/磁吸/深度前移/品牌自旋；但帧循环 :512–518 仍调用 `updateHero`、`updateChapters`、`updateChars`、`updateParallax`、`updateMarks`。Hero pointer rotation、scroll title transform、章节背景、footer transform 仍可发生；:469 原生回顶直接使用 `behavior:"smooth"`。`reduce` 值只在初始化读取，没有 media query change listener。  
**Inferred**：后续指定 reduced-motion 为低位移、无持续漂移、保留所有阅读内容和导航，测试初次加载及运行中切换偏好；不能仅看 CSS duration 判通过。

### M-03 菜单键盘与触屏（Inferred：需浏览器负例）

**Verified**：菜单初始 inert，开关更新 aria-expanded/Escape；没有初始聚焦/focus trap/恢复焦点；reduce 下无 Lenis，`setMenu` 没有单独锁 body scroll。  
**Inferred**：实测 Tab 是否进入背景、Escape 后焦点是否回按钮、触屏菜单后方是否滚动；允许修复可访问性，须保持既有视觉转场。

## 4. Claude/Owner 录屏验收脚本（Inferred / DRAFT）

1. 记录 SHA、viewport/DPR、浏览器、语言、motion/JS 模式，页面从 0 scroll 打开；录入 0–6 秒的 preloader→Hero 过程。
2. Hero 静止观察 5 秒，指针慢扫四角，验证标题避让、卡片深度、密度、Goo/磁吸和性能；触屏用同位置 tap/scroll。
3. 以慢滚、快速滚、回滚三种节奏经过 5 章节；记录遮罩、文字、背景、组件、编号和 bar 是否一致。
4. 滚至正文、feature、forest、process、closing、footer；跳过区块后回滚，所有 reveal/media 必须可见。
5. 打开/关闭菜单和语言面板，键盘 Tab/Shift+Tab/Escape，检查焦点；切到英文重跑关键步骤。
6. 在 320/390/430/768/1024/1440/1920 宽度复验；窗口改宽、移动地址栏收展、离开/返回页面，检查锁滚动与孤儿事件。
7. reduced-motion 与禁 JS 分别独立记录；不能借用 normal 视频替代。
8. Owner 对每件 golden 标 `APPROVED/CHANGES_REQUESTED`；有意差异附理由与文件范围，Claude 视觉结果与 Codex 行为结果分别记录。

**Unverified**：以上步骤本轮均未作为浏览器验收执行，当前没有新 golden image/video。源码哈希和参数表是交接准备，不代表视觉冻结已获批准。
