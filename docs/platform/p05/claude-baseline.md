# Claude 视觉基线交接

当前Claude Landing已验收的设计方向继续有效；本轮不重设计、不替换、不改首页内容和动效。源码依据是固定main tree中的 `features/landing/*`、`app/(marketing)/*`、根字体布局和相关资源，哈希见 evidence/landing-source.json；旧Lumen文档只说明Workspace/历史，不是此Landing唯一规范。

| 维度 | 真实源码位置与保护内容 |
|---|---|
| 色彩/排版 | landing.css8–27：paper #f2efea、ink #241f21、lime #e9e778、forest #0f2a24、emerald #1a8a70；app/layout.tsx11–12 Figtree400/500/600、Noto Sans SC400/500；display clamp(40px,5vw,86px)，12栏、clamp gutter/gap |
| Hero | runtime40–43 ZMIN=-2800/ZMAX=560，CSS perspective1000px；随机卡片、中心27%vw/17%vh避让；<700px降低密度；基础速度60、boost2200；不能换静态banner |
| 导航 | runtime417起菜单inert/aria-expanded/Escape，语言cookie与750ms离场；保护 /enter、/workspace 入口与双语言排版 |
| Scroll | Lenis lerp0.085，自写RAF；五章节HOLD0.3/STEP1.3，clipPath底部向上切换，进度/编号联动；CSS高度公式与JS同步 |
| Pointer | finePointer磁吸与goo；Hero相机lerp0.05，rotateX约4°/Y约6°；触屏不依赖hover |
| 响应式 | CSS754起1180/960/600断点，960以下菜单，hover:none规则；runtime700密度阈值、120ms resize debounce、移动地址栏高度处理 |
| Motion Reduction | runtime56初始化读取prefers-reduced-motion；不建Lenis/磁吸/深度推进，preloader200ms；CSS807减少animation/transition。但持续RAF、相机/scroll/footer变换仍在，回顶smooth与运行中偏好切换缺口未验证 |
| 退出清理 | runtime尾部取消RAF/timeout、监听清理、Lenis destroy；需要SPA进出实测，源码存在不等于无资源泄漏 |

静态发现不等于浏览器验收：SSR `lp is-loading`依赖JS解锁，禁JS可能遮挡；菜单未看到完整初始聚焦/焦点陷阱/恢复；reduced-motion仍可能位移。已验收设计语言不要求保留这些潜在缺陷，但修复需后续单独授权RFC/PR，本轮禁止修改。

## 可交给Claude的扩展契约

Project Showcase、Research Lab、Developer Console由Claude后续设计。只消费ReleaseDTO/受控内部DraftDTO；不自行造权限、接口、运行状态、指标或假按钮；fixture必须显式标识。P1 Research Lab只研究说明与获准栅格预览，3D/推理按钮不出现；Console外部自助写入不开放。Marketing tokens与Workspace分开，新增页面不得全局污染.lp、Hero runtime或旧AI页面。

先提供交互/视觉差异稿，Owner确认后单独实现；跨契约新增字段由Codex先修订契约与fixtures，Claude再消费。本轮没有向Claude或其他聊天派发任务。

## Golden仍缺失

没有绑定固定SHA并批准的桌面/手机截图与视频，evidence/landing-source.json不作替代。本轮没有浏览器视觉通过证据。源checkout AGENTS明确暂停浏览器自动化，当前指令没有明确恢复；因此未启动/连接浏览器或运行E2E。

未来采集需记录commit/tree、URL、语言、viewport/DPR、OS/字体、浏览器版本、JS/motion、步骤与Owner决定。320/390/430/768/1024/1440/1920，中英文、normal/reduced/noJS；先采原normal再记录退化失败；桌面/触屏视频涵盖加载→Hero→五章→footer、键盘Tab/ShiftTab/Escape、语言/菜单、离开返回。随机Hero按留白/密度/速度/遮挡/时序验收，固定随机环境或声明遮罩容差，不能把不同随机卡片位置当业务回归。

素材接收状态=MISSING，Owner sign-off=PENDING；获准后浏览器仍按AGENTS的单实例所有权/清理要求执行。
