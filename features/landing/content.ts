/*
 * Landing page copy (Chinese + English).
 * Product positioning: a unified AI workspace platform. Copy must keep the
 * capability status honest: Chat / Personas / Memory / Tools are live,
 * Agent mode and Projects are in development, Skills are planned.
 * Platform links point at the public, read-only /platform preview.
 */

export type LandingLang = "zh" | "en";

export function isLandingLang(value: unknown): value is LandingLang {
  return value === "zh" || value === "en";
}

export const LANG_COOKIE = "aig-lang";

type Pair = [string, string];

export interface LandingCopy {
  meta: { title: string; description: string };
  preloader: Pair;
  header: {
    home: string;
    mainNav: string;
    links: { href: string; label: string }[];
    login: string;
    langLabel: string;
    langCurrent: string;
    menuOpen: string;
    menuClose: string;
    menu: string;
    close: string;
  };
  menu: { label: string; links: { href: string; label: string }[]; register: string };
  hero: { lines: Pair; foot: Pair; scroll: string };
  chapters: {
    label: string;
    hint: string;
    index: string;
    chat: { tag: string; title: Pair; cta: string; user: string; persona: string; intro: string; points: string[]; catalog: Pair };
    persona: { tag: string; title: Pair; cta: string; cards: { name: string; desc: string; chips: Pair }[]; catalog: Pair };
    memory: {
      tag: string; title: Pair; cta: string; head: Pair; accept: string; decline: string; confirmed: string;
      items: { text: string; meta: string }[]; confirmedItem: { text: string; meta: string }; catalog: Pair;
    };
    image: { tag: string; title: Pair; cta: string; prompt: string; status: string; meta: string; catalog: Pair };
    agents: { tag: string; title: Pair; cta: string; nodes: string[]; lead: Pair; catalog: Pair };
  };
  about: { text: string; news: string; cards: { title: string; meta: string; href: string }[] };
  features: {
    label: string;
    image: { tag: string; title: string; styles: string; go: string };
    persona: { tag: string; title: string; avatars: string; go: string };
  };
  index: { label: string; rows: { href: string; word: string }[] };
  /** quote: one entry per forced line break (English lets the browser balance a single line). */
  forest: { name: string; role: string; copy: Pair; quote: string[]; link: string; panel: { title: string; rows: Pair[] } };
  process: {
    label: string;
    composer: { persona: string; input: string };
    workers: { labels: [string, string, string, string]; lead: string };
    history: Pair[];
    steps: Pair[];
  };
  closing: { title: Pair; lead: Pair; field: string; small: [string, string, string] };
  footer: { cols: { title: string; links: { href: string; label: string }[] }[]; site: string; bottom: Pair };
  fab: string;
  runtime: { bubbles: string[]; chips: Pair[] };
}

const zh: LandingCopy = {
  meta: {
    title: "AI-Generator — 统一 AI 工作平台",
    description: "AI-Generator：统一 AI 工作平台。Workspace 汇集 Projects、Agent 与 Skills，Chat、Persona、Memory 与 Tools 共享同一套身份与数据边界。",
  },
  preloader: ["AI-Generator", "统一 AI 工作平台"],
  header: {
    home: "AI-Generator 首页",
    mainNav: "主导航",
    links: [
      { href: "/platform", label: "平台" },
      { href: "/platform/projects", label: "项目" },
      { href: "/platform/agent", label: "Agent" },
      { href: "/platform/skills", label: "Skills" },
    ],
    login: "登录",
    langLabel: "切换语言",
    langCurrent: "中文",
    menuOpen: "打开菜单",
    menuClose: "关闭菜单",
    menu: "菜单",
    close: "关闭",
  },
  menu: {
    label: "移动端导航",
    links: [
      { href: "/platform", label: "平台总览" },
      { href: "/platform/projects", label: "项目" },
      { href: "/platform/agent", label: "Agent" },
      { href: "/platform/skills", label: "Skills" },
      { href: "/chat", label: "AI 对话" },
      { href: "/tools", label: "AI 工具" },
    ],
    register: "注册账号",
  },
  hero: { lines: ["懂你所想，", "守你所藏。"], foot: ["统一 AI 工作平台", "工作台 · 项目 · Agent · Skills"], scroll: "向下滚动" },
  chapters: {
    label: "平台能力",
    hint: "继续滚动",
    index: "Private by design",
    chat: {
      tag: "对话",
      title: ["对话是工作台的入口，", "上下文跨设备延续"],
      cta: "开始新对话",
      user: "帮我把这周的会议纪要整理成三个重点。",
      persona: "写作搭子",
      intro: "好的，整理为三点：",
      points: ["目标对齐：本季度聚焦留存", "排期调整：设计评审提前到周三", "风险提示：接口联调依赖外部团队"],
      catalog: ["最近对话", "继续上次的话题"],
    },
    persona: {
      tag: "人格",
      title: ["每项任务一个人格，", "角色、语气与边界各自独立"],
      cta: "管理助手",
      cards: [
        { name: "写作搭子", desc: "润色、提纲与表达", chips: ["温和", "简洁"] },
        { name: "代码审查员", desc: "只说重点，不绕弯子", chips: ["严谨", "直接"] },
        { name: "旅行规划师", desc: "行程、预算与清单", chips: ["热情", "细致"] },
      ],
      catalog: ["12 款预设头像", "创建新人格"],
    },
    memory: {
      tag: "记忆",
      title: ["只记住", "你确认过的事"],
      cta: "管理记忆",
      head: ["记忆提案", "2 条待确认"],
      accept: "接受",
      decline: "拒绝",
      confirmed: "已确认",
      items: [
        { text: "偏好分点、简洁的回答", meta: "来自 3 天前的对话 · 30 天内有效" },
        { text: "计划 11 月去京都旅行", meta: "来自昨天的对话 · 30 天内有效" },
      ],
      confirmedItem: { text: "常用语言：中文", meta: "来源：明确要求记住" },
      catalog: ["来源可追溯", "逐条核对记忆"],
    },
    image: {
      tag: "工具",
      title: ["工具接入同一工作台，", "一句话生成你的画面"],
      cta: "开始创作",
      prompt: "晨雾中的玻璃温室，柔和自然光",
      status: "生成中",
      meta: "1024 × 1024 · 私有存储",
      catalog: ["图片理解", "分析截图与图表"],
    },
    agents: {
      tag: "Agent",
      title: ["Agent 拆解任务，", "Worker 并行、协调器收束"],
      cta: "启动头脑风暴",
      nodes: ["W1 · 发散视角", "W2 · 反方质疑", "W3 · 落地路径", "W4 · 类比迁移"],
      lead: ["协调器", "综合 4 份结论"],
      catalog: ["Agent 模式 · 开发中", "查看运行编排"],
    },
  },
  about: {
    text: "AI-Generator 正在从私人助手成长为统一的 AI 工作平台：Workspace 是唯一入口，Projects 组织目标与资料，Agent 拆解并执行任务，Skills 让能力可以复用；Chat、Persona、Memory 与 Tools 作为基础能力，共享同一套身份、权限与数据边界。",
    news: "发展方向",
    cards: [
      { title: "Projects：以项目组织对话、资料、Agent 运行与产物", meta: "开发中 · 数据模型与权限验收中", href: "/platform/projects" },
      { title: "Skills：把常用能力封装为可复用、可授权的模块", meta: "规划中 · 可浏览演示预览", href: "/platform/skills" },
    ],
  },
  features: {
    label: "已上线能力",
    image: { tag: "图片", title: "图片生成工作台", styles: "画面风格", go: "去创作" },
    persona: { tag: "人格", title: "专属人格", avatars: "预设头像", go: "去创建" },
  },
  index: {
    label: "AI Hub · 平台基础能力",
    rows: [
      { href: "/platform/chat", word: "对话" },
      { href: "/platform/personas", word: "人格" },
      { href: "/platform/memory", word: "记忆" },
      { href: "/platform/tools", word: "工具" },
      { href: "/platform/tools#image", word: "图片" },
      { href: "/platform/agent", word: "Agent" },
    ],
  },
  forest: {
    name: "AI-Generator V2",
    role: "统一 AI 工作平台",
    copy: [
      "从私人 AI 助手出发，成长为统一的 AI 工作平台：一个工作台承载项目、Agent、Skills 与日常 AI 能力。",
      "人格 Prompt 只在服务端拼装；长期记忆在你确认后才会写入；生成的图片保存在私有存储中。",
    ],
    quote: ["“好的 AI 应该安静地", "待在身边，在需要时出现，", "只记住你允许它记住的事。”"],
    link: "查看账户与隐私",
    panel: {
      title: "数据边界",
      rows: [["对话", "仅你可见"], ["人格 Prompt", "只在服务端"], ["长期记忆", "确认后写入"], ["生成图片", "私有存储"]],
    },
  },
  process: {
    label: "工作方式",
    composer: { persona: "写作搭子", input: "帮我把会议纪要整理成三点…" },
    workers: { labels: ["发散", "质疑", "落地", "类比"], lead: "协调器 · 汇总中" },
    history: [["图片生成", "已完成 · 可下载"], ["翻译 · 保持语气", "已完成"], ["多 Agent 头脑风暴", "已恢复"]],
    steps: [
      ["你来描述", "在工作台用自然语言说出任务，选择默认助手或专属人格。"],
      ["它来协作", "记忆、工具与 Agent 按需接力；Skills 将把常用能力封装成可复用模块。"],
      ["结果沉淀", "对话、图片与运行记录保存在私有空间；Projects 将按项目归档它们。"],
    ],
  },
  closing: {
    title: ["简单、私密，", "长久地好用。"],
    lead: ["进入你的 AI 工作台", "使用邮箱登录，或创建一个新账号。"],
    field: "前往登录",
    small: ["还没有账号？", "注册", " · 你的内容按用途彼此隔离。"],
  },
  footer: {
    cols: [
      { title: "平台预览", links: [{ href: "/platform", label: "平台总览" }, { href: "/platform/projects", label: "项目 · 开发中" }, { href: "/platform/agent", label: "Agent · 开发中" }, { href: "/platform/skills", label: "Skills · 规划中" }, { href: "/workspace", label: "进入工作台" }] },
      { title: "AI Hub", links: [{ href: "/chat", label: "AI 对话" }, { href: "/personas", label: "专属人格" }, { href: "/memories", label: "长期记忆" }, { href: "/tools", label: "AI 工具" }] },
      { title: "系统", links: [{ href: "/tools/history", label: "运行历史" }, { href: "/account", label: "账户与隐私" }, { href: "/login", label: "登录" }, { href: "/register", label: "注册" }] },
    ],
    site: "站点",
    bottom: ["© 2026 AI-Generator", "Lumen Interface · 私有 · 安全"],
  },
  fab: "快速开始对话",
  runtime: {
    bubbles: ["总结这篇文章的三个要点", "把这段话改得更口语一点", "翻译成英文，保持原来的语气", "这张图表说明了什么？", "生成一张晨雾中的玻璃温室", "帮我列一份旅行清单"],
    chips: [["人格", "写作搭子"], ["记忆", "偏好简洁回答"], ["Agent", "Worker 3/4 完成"], ["图片", "1024 × 1024"], ["工具", "翻译"], ["协调器", "汇总中"]],
  },
};

const en: LandingCopy = {
  meta: {
    title: "AI-Generator — A unified AI workspace",
    description: "AI-Generator: a unified AI workspace platform. One workspace brings together Projects, Agent and Skills, while Chat, Personas, Memory and Tools share one identity and data boundary.",
  },
  preloader: ["AI-Generator", "Unified AI workspace"],
  header: {
    home: "AI-Generator home",
    mainNav: "Main navigation",
    links: [
      { href: "/platform", label: "Platform" },
      { href: "/platform/projects", label: "Projects" },
      { href: "/platform/agent", label: "Agent" },
      { href: "/platform/skills", label: "Skills" },
    ],
    login: "Log in",
    langLabel: "Change language",
    langCurrent: "EN",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    menu: "Menu",
    close: "Close",
  },
  menu: {
    label: "Mobile navigation",
    links: [
      { href: "/platform", label: "Platform overview" },
      { href: "/platform/projects", label: "Projects" },
      { href: "/platform/agent", label: "Agent" },
      { href: "/platform/skills", label: "Skills" },
      { href: "/chat", label: "AI chat" },
      { href: "/tools", label: "AI tools" },
    ],
    register: "Create account",
  },
  hero: { lines: ["Knows your mind,", "keeps your trust."], foot: ["A unified AI workspace", "Projects · Agent · Skills · Chat"], scroll: "Scroll down" },
  chapters: {
    label: "Platform capabilities",
    hint: "Keep scrolling",
    index: "Private by design",
    chat: {
      tag: "Chat",
      title: ["Chat opens the workspace,", "context follows you"],
      cta: "Start a chat",
      user: "Turn this week’s meeting notes into three key points.",
      persona: "Writing buddy",
      intro: "Sure, here are the three points:",
      points: ["Goals: focus on retention this quarter", "Schedule: design review moves to Wednesday", "Risk: API testing depends on another team"],
      catalog: ["Recent chats", "Pick up where you left off"],
    },
    persona: {
      tag: "Personas",
      title: ["One persona per task,", "each with its own voice"],
      cta: "Manage assistants",
      cards: [
        { name: "Writing buddy", desc: "Editing, outlines, wording", chips: ["Gentle", "Concise"] },
        { name: "Code reviewer", desc: "Straight to the point", chips: ["Rigorous", "Direct"] },
        { name: "Trip planner", desc: "Routes, budgets, checklists", chips: ["Warm", "Thorough"] },
      ],
      catalog: ["12 preset avatars", "Create a persona"],
    },
    memory: {
      tag: "Memory",
      title: ["It only remembers", "what you’ve confirmed"],
      cta: "Manage memory",
      head: ["Memory proposals", "2 to review"],
      accept: "Accept",
      decline: "Decline",
      confirmed: "Confirmed",
      items: [
        { text: "Prefers short, bulleted answers", meta: "From a chat 3 days ago · valid 30 days" },
        { text: "Planning a Kyoto trip in November", meta: "From yesterday’s chat · valid 30 days" },
      ],
      confirmedItem: { text: "Preferred language: Chinese", meta: "Source: asked to remember" },
      catalog: ["Traceable sources", "Review memories one by one"],
    },
    image: {
      tag: "Tools",
      title: ["Tools in the same workspace,", "an image from one line"],
      cta: "Start creating",
      prompt: "Glass greenhouse in morning mist, soft light",
      status: "Generating",
      meta: "1024 × 1024 · private storage",
      catalog: ["Image understanding", "Read screenshots and charts"],
    },
    agents: {
      tag: "Agent",
      title: ["Agents split the task,", "workers run, a lead decides"],
      cta: "Start brainstorming",
      nodes: ["W1 · Divergent", "W2 · Skeptic", "W3 · Practical", "W4 · Analogies"],
      lead: ["Coordinator", "Merges 4 answers"],
      catalog: ["Agent mode · in development", "View orchestration"],
    },
  },
  about: {
    text: "AI-Generator is growing from a private assistant into a unified AI workspace: one Workspace as the entry point, Projects to organize the work, Agents to carry it out and Skills to reuse it, with Chat, Personas, Memory and Tools as a shared, private foundation.",
    news: "What’s next",
    cards: [
      { title: "Projects: organize chats, files, agent runs and outputs by project", meta: "In development · data model and access review", href: "/platform/projects" },
      { title: "Skills: package everyday capabilities as reusable, permissioned modules", meta: "Planned · browsable preview", href: "/platform/skills" },
    ],
  },
  features: {
    label: "Live today",
    image: { tag: "Images", title: "Image studio", styles: "Styles", go: "Create" },
    persona: { tag: "Personas", title: "Personas", avatars: "Preset avatars", go: "Create one" },
  },
  index: {
    label: "AI Hub · the platform foundations",
    rows: [
      { href: "/platform/chat", word: "Chat" },
      { href: "/platform/personas", word: "Personas" },
      { href: "/platform/memory", word: "Memory" },
      { href: "/platform/tools", word: "Tools" },
      { href: "/platform/tools#image", word: "Images" },
      { href: "/platform/agent", word: "Agent" },
    ],
  },
  forest: {
    name: "AI-Generator V2",
    role: "Unified AI workspace platform",
    copy: [
      "Started as a private AI assistant, now growing into a unified AI workspace: one place for projects, agents, skills and everyday AI work.",
      "Persona prompts are assembled only on the server; long-term memory is saved only after you confirm it; generated images stay in private storage.",
    ],
    quote: ["“Good AI stays quietly by your side, shows up when needed, and remembers only what you allow.”"],
    link: "Account & privacy",
    panel: {
      title: "Data boundaries",
      rows: [["Chat", "Only you"], ["Persona prompt", "Server only"], ["Long-term memory", "After you confirm"], ["Generated images", "Private storage"]],
    },
  },
  process: {
    label: "How it works",
    composer: { persona: "Writing buddy", input: "Turn the meeting notes into three points…" },
    workers: { labels: ["Diverge", "Question", "Ground", "Compare"], lead: "Coordinator · merging" },
    history: [["Image generation", "Done · download"], ["Translate · keep tone", "Done"], ["Multi-agent brainstorm", "Resumed"]],
    steps: [
      ["You describe", "Say what you need in the workspace, with the default assistant or a persona."],
      ["It collaborates", "Memory, tools and agents hand off when needed; Skills will package them as reusable modules."],
      ["Results stay", "Chats, images and run history stay in your private space; Projects will file them by project."],
    ],
  },
  closing: {
    title: ["Simple, private,", "and built to last."],
    lead: ["Open your AI workspace", "Log in with email, or create a new account."],
    field: "Go to log in",
    small: ["No account yet? ", "Sign up", " · Your content stays separated by purpose."],
  },
  footer: {
    cols: [
      { title: "Platform preview", links: [{ href: "/platform", label: "Overview" }, { href: "/platform/projects", label: "Projects · in development" }, { href: "/platform/agent", label: "Agent · in development" }, { href: "/platform/skills", label: "Skills · planned" }, { href: "/workspace", label: "Open the workspace" }] },
      { title: "AI Hub", links: [{ href: "/chat", label: "AI chat" }, { href: "/personas", label: "Personas" }, { href: "/memories", label: "Long-term memory" }, { href: "/tools", label: "AI tools" }] },
      { title: "System", links: [{ href: "/tools/history", label: "Run history" }, { href: "/account", label: "Account & privacy" }, { href: "/login", label: "Log in" }, { href: "/register", label: "Sign up" }] },
    ],
    site: "Site",
    bottom: ["© 2026 AI-Generator", "Lumen Interface · Private · Secure"],
  },
  fab: "Start a chat",
  runtime: {
    bubbles: ["Summarize this article in three points", "Make this paragraph more casual", "Translate to Chinese, keep the tone", "What does this chart show?", "A glass greenhouse in morning mist", "Make me a packing list"],
    chips: [["Persona", "Writing buddy"], ["Memory", "Prefers short answers"], ["Agent", "Worker 3/4 done"], ["Image", "1024 × 1024"], ["Tool", "Translate"], ["Coordinator", "Merging"]],
  },
};

export const landingCopy: Record<LandingLang, LandingCopy> = { zh, en };
