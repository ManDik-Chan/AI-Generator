/*
 * Landing page copy (Chinese + English).
 * Product shots illustrate real features; anything unfinished is labelled
 * "in development" instead of being shown as live.
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
  hero: { lines: Pair; foot: Pair; scroll: string; start: string; source: string };
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
    agents: { tag: string; title: Pair; cta: string; nodes: string[]; lead: Pair; catalog: Pair; badge: string };
  };
  about: { meta: Pair; text: string; news: string; cards: { title: string; meta: string; href: string }[] };
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
    title: "AI-Generator — 懂你所想，守你所藏。",
    description: "AI-Generator：面向亲朋好友的私人 AI 助手平台。对话、人格、长期记忆与创作工具，安静地连接在一起。",
  },
  preloader: ["AI-Generator", "私人 AI 工作室"],
  header: {
    home: "AI-Generator 首页",
    mainNav: "主导航",
    links: [
      { href: "/chat", label: "对话" },
      { href: "/personas", label: "助手" },
      { href: "/tools", label: "工具" },
      { href: "/memories", label: "记忆" },
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
      { href: "/chat", label: "AI 对话" },
      { href: "/personas", label: "专属人格" },
      { href: "/memories", label: "长期记忆" },
      { href: "/tools", label: "文本工具" },
      { href: "/tools/image-generate", label: "图片生成" },
      { href: "/tools/brainstorm", label: "多 Agent" },
    ],
    register: "注册账号",
  },
  hero: { lines: ["懂你所想，", "守你所藏。"], foot: ["私人 AI 助手平台", "对话 · 人格 · 记忆 · 创作"], scroll: "向下滚动", start: "开始体验", source: "查看源码" },
  chapters: {
    label: "核心能力",
    hint: "继续滚动",
    index: "Private by design",
    chat: {
      tag: "对话",
      title: ["连续对话，", "跨设备延续你的上下文"],
      cta: "开始新对话",
      user: "帮我把这周的会议纪要整理成三个重点。",
      persona: "写作搭子",
      intro: "好的，整理为三点：",
      points: ["目标对齐：本季度聚焦留存", "排期调整：设计评审提前到周三", "风险提示：接口联调依赖外部团队"],
      catalog: ["最近对话", "继续上次的话题"],
    },
    persona: {
      tag: "人格",
      title: ["为每一项任务，", "建立独立的角色与语气"],
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
      tag: "图片",
      title: ["一句话描述，", "生成属于你的画面"],
      cta: "开始创作",
      prompt: "晨雾中的玻璃温室，柔和自然光",
      status: "生成中",
      meta: "1024 × 1024 · 私有存储",
      catalog: ["图片理解", "分析截图与图表"],
    },
    agents: {
      tag: "多 Agent",
      title: ["四个 Worker 并行思考，", "一位协调者收束答案"],
      cta: "启动头脑风暴",
      nodes: ["W1 · 发散视角", "W2 · 反方质疑", "W3 · 落地路径", "W4 · 类比迁移"],
      lead: ["协调器", "综合 4 份结论"],
      catalog: ["Agent 运行", "查看运行记录"],
      badge: "开发中",
    },
  },
  about: {
    meta: ["私人 AI 工作室", "Next.js · Supabase"],
    text: "我们相信，好的 AI 不该喧宾夺主。它应该安静地待在身边，理解你的语气，记住你确认过的事，在需要时把对话、人格、记忆与创作工具连接成一条完整的工作流，并且始终把你的数据留在属于你的边界之内。",
    news: "最近更新",
    cards: [
      { title: "Chat Agent 模式：标准 4 Worker 与深度 6 Worker 编排", meta: "开发中 · 可在对话中预览", href: "/agents" },
      { title: "图片生成工作台：一句话生成，保存在私有空间", meta: "已上线", href: "/tools/image-generate" },
    ],
  },
  features: {
    label: "新近能力",
    image: { tag: "图片", title: "图片生成工作台", styles: "画面风格", go: "去创作" },
    persona: { tag: "人格", title: "专属人格", avatars: "预设头像", go: "去创建" },
  },
  index: {
    label: "完整工作空间",
    rows: [
      { href: "/chat", word: "对话" },
      { href: "/personas", word: "人格" },
      { href: "/memories", word: "记忆" },
      { href: "/tools", word: "文本" },
      { href: "/tools/image", word: "图片" },
      { href: "/tools/brainstorm", word: "Agent" },
    ],
  },
  forest: {
    name: "AI-Generator V2",
    role: "私人 AI 助手平台",
    copy: [
      "面向亲朋好友使用的私人 AI 助手平台，目标是简单、稳定、美观和易维护。",
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
      ["你来描述", "用自然语言说出任务，选择默认助手或专属人格。"],
      ["它来协作", "记忆、工具与多 Agent 在需要时自然接力。"],
      ["结果沉淀", "对话、图片与运行记录保存在私有空间，随时追溯。"],
    ],
  },
  closing: {
    title: ["简单、私密，", "长久地好用。"],
    lead: ["开启你的私人工作室", "使用邮箱登录，或创建一个新账号。"],
    field: "前往登录",
    small: ["还没有账号？", "注册", " · 你的内容按用途彼此隔离。"],
  },
  footer: {
    cols: [
      { title: "工作空间", links: [{ href: "/workspace", label: "控制中心" }, { href: "/chat", label: "AI 对话" }, { href: "/agents", label: "Agent 运行 · 开发中" }, { href: "/personas", label: "AI 助手" }, { href: "/memories", label: "长期记忆" }] },
      { title: "创作实验室", links: [{ href: "/tools", label: "文本工具" }, { href: "/tools/image", label: "图片理解" }, { href: "/tools/image-generate", label: "图片生成" }, { href: "/tools/brainstorm", label: "多 Agent 头脑风暴" }] },
      { title: "系统", links: [{ href: "/tools/history", label: "运行历史" }, { href: "/account", label: "账户与隐私" }, { href: "/login", label: "登录" }, { href: "/register", label: "注册" }] },
    ],
    site: "站点",
    bottom: ["© 2026 AI-Generator", "私有 · 安全 · 可追溯"],
  },
  fab: "快速开始对话",
  runtime: {
    bubbles: ["总结这篇文章的三个要点", "把这段话改得更口语一点", "翻译成英文，保持原来的语气", "这张图表说明了什么？", "生成一张晨雾中的玻璃温室", "帮我列一份旅行清单"],
    chips: [["人格", "写作搭子"], ["记忆", "偏好简洁回答"], ["Agent", "Worker 3/4 完成"], ["图片", "1024 × 1024"], ["工具", "翻译"], ["协调器", "汇总中"]],
  },
};

const en: LandingCopy = {
  meta: {
    title: "AI-Generator — Knows your mind, keeps your trust.",
    description: "AI-Generator: a private AI assistant platform for family and friends. Chat, personas, long-term memory and creative tools, quietly connected.",
  },
  preloader: ["AI-Generator", "Private AI studio"],
  header: {
    home: "AI-Generator home",
    mainNav: "Main navigation",
    links: [
      { href: "/chat", label: "Chat" },
      { href: "/personas", label: "Assistants" },
      { href: "/tools", label: "Tools" },
      { href: "/memories", label: "Memory" },
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
      { href: "/chat", label: "AI chat" },
      { href: "/personas", label: "Personas" },
      { href: "/memories", label: "Long-term memory" },
      { href: "/tools", label: "Text tools" },
      { href: "/tools/image-generate", label: "Image generation" },
      { href: "/tools/brainstorm", label: "Multi-agent" },
    ],
    register: "Create account",
  },
  hero: { lines: ["Knows your mind,", "keeps your trust."], foot: ["A private AI assistant platform", "Chat · Personas · Memory · Create"], scroll: "Scroll down", start: "Try it now", source: "View source" },
  chapters: {
    label: "Core features",
    hint: "Keep scrolling",
    index: "Private by design",
    chat: {
      tag: "Chat",
      title: ["Chats that follow you,", "across every device"],
      cta: "Start a chat",
      user: "Turn this week’s meeting notes into three key points.",
      persona: "Writing buddy",
      intro: "Sure, here are the three points:",
      points: ["Goals: focus on retention this quarter", "Schedule: design review moves to Wednesday", "Risk: API testing depends on another team"],
      catalog: ["Recent chats", "Pick up where you left off"],
    },
    persona: {
      tag: "Personas",
      title: ["For every task,", "its own role and voice"],
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
      tag: "Images",
      title: ["Describe it in a line,", "get an image that’s yours"],
      cta: "Start creating",
      prompt: "Glass greenhouse in morning mist, soft light",
      status: "Generating",
      meta: "1024 × 1024 · private storage",
      catalog: ["Image understanding", "Read screenshots and charts"],
    },
    agents: {
      tag: "Multi-agent",
      title: ["Four workers in parallel,", "one coordinator to decide"],
      cta: "Start brainstorming",
      nodes: ["W1 · Divergent", "W2 · Skeptic", "W3 · Practical", "W4 · Analogies"],
      lead: ["Coordinator", "Merges 4 answers"],
      catalog: ["Agent runs", "View run history"],
      badge: "In development",
    },
  },
  about: {
    meta: ["Private AI studio", "Next.js · Supabase"],
    text: "We believe good AI shouldn’t steal the show. It should stay quietly by your side, understand your tone, remember what you’ve confirmed, link chat, personas, memory and creative tools into one workflow when you need them, and always keep your data inside your own boundaries.",
    news: "Recent updates",
    cards: [
      { title: "Chat Agent mode: standard 4-worker and deep 6-worker runs", meta: "In development · preview in chat", href: "/agents" },
      { title: "Image studio: describe it once, keep it in private storage", meta: "Live", href: "/tools/image-generate" },
    ],
  },
  features: {
    label: "New capabilities",
    image: { tag: "Images", title: "Image studio", styles: "Styles", go: "Create" },
    persona: { tag: "Personas", title: "Personas", avatars: "Preset avatars", go: "Create one" },
  },
  index: {
    label: "The full workspace",
    rows: [
      { href: "/chat", word: "Chat" },
      { href: "/personas", word: "Personas" },
      { href: "/memories", word: "Memory" },
      { href: "/tools", word: "Text" },
      { href: "/tools/image", word: "Images" },
      { href: "/tools/brainstorm", word: "Agent" },
    ],
  },
  forest: {
    name: "AI-Generator V2",
    role: "Private AI assistant platform",
    copy: [
      "A private AI assistant platform for family and friends, built to be simple, stable, beautiful and easy to maintain.",
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
      ["You describe", "Say what you need in plain words, with the default assistant or a persona."],
      ["It collaborates", "Memory, tools and agents hand off to each other when needed."],
      ["Results stay", "Chats, images and run history stay in your private space, ready to revisit."],
    ],
  },
  closing: {
    title: ["Simple, private,", "and built to last."],
    lead: ["Open your private studio", "Log in with email, or create a new account."],
    field: "Go to log in",
    small: ["No account yet? ", "Sign up", " · Your content stays separated by purpose."],
  },
  footer: {
    cols: [
      { title: "Workspace", links: [{ href: "/workspace", label: "Dashboard" }, { href: "/chat", label: "AI chat" }, { href: "/agents", label: "Agent runs · in development" }, { href: "/personas", label: "AI assistants" }, { href: "/memories", label: "Long-term memory" }] },
      { title: "Creative lab", links: [{ href: "/tools", label: "Text tools" }, { href: "/tools/image", label: "Image understanding" }, { href: "/tools/image-generate", label: "Image generation" }, { href: "/tools/brainstorm", label: "Multi-agent brainstorm" }] },
      { title: "System", links: [{ href: "/tools/history", label: "Run history" }, { href: "/account", label: "Account & privacy" }, { href: "/login", label: "Log in" }, { href: "/register", label: "Sign up" }] },
    ],
    site: "Site",
    bottom: ["© 2026 AI-Generator", "Private · Secure · Traceable"],
  },
  fab: "Start a chat",
  runtime: {
    bubbles: ["Summarize this article in three points", "Make this paragraph more casual", "Translate to Chinese, keep the tone", "What does this chart show?", "A glass greenhouse in morning mist", "Make me a packing list"],
    chips: [["Persona", "Writing buddy"], ["Memory", "Prefers short answers"], ["Agent", "Worker 3/4 done"], ["Image", "1024 × 1024"], ["Tool", "Translate"], ["Coordinator", "Merging"]],
  },
};

export const landingCopy: Record<LandingLang, LandingCopy> = { zh, en };
