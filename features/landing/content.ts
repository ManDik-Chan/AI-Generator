/*
 * Landing page copy (Chinese + English).
 *
 * Positioning: AI-Generator is a privacy-first project platform. Developers showcase
 * their work, publish immutable versions and offer capabilities under explicit
 * authorization; the built-in AI Hub (Chat, Personas, Memory, Tools, Agent) is the first
 * live module. Copy keeps capability status honest: the AI Hub is live, the Registry and
 * publishing are in development, BYOK and remote runs are planned. Sample projects and
 * the demo workspace are labelled as such on their own pages.
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
    showcase: { tag: string; title: Pair; cta: string; catalog: Pair; head: Pair; claims: { text: string; meta: string; status: string; ok: boolean }[] };
    lab: { tag: string; title: Pair; cta: string; catalog: Pair; prompt: string; status: string; meta: string };
    publish: { tag: string; title: Pair; cta: string; catalog: Pair; nodes: string[]; lead: Pair };
    privacy: { tag: string; title: Pair; cta: string; catalog: Pair; cards: { name: string; desc: string; chips: Pair }[] };
    hub: { tag: string; title: Pair; cta: string; catalog: Pair; user: string; persona: string; intro: string; points: string[] };
  };
  about: { meta: [string, string, string]; text: string; news: string; cards: { title: string; meta: string; href: string }[] };
  features: {
    label: string;
    explore: { tag: string; title: string; styles: string; go: string };
    hub: { tag: string; title: string; avatars: string; go: string };
    demos: { tag: string; title: string; items: { name: string; meta: string }[]; runtimes: string; chips: [string, string]; go: string };
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
    title: "AI-Generator — 隐私优先的项目平台",
    description: "AI-Generator：隐私优先的项目平台。展示你的研究与作品，发布不可变版本，在明确授权下提供可运行的能力；内置的 AI Hub 已经上线。",
  },
  preloader: ["AI-Generator", "隐私优先的项目平台"],
  header: {
    home: "AI-Generator 首页",
    mainNav: "主导航",
    links: [
      { href: "/explore", label: "探索" },
      { href: "/demos", label: "Demo" },
      { href: "/docs", label: "开发者" },
      { href: "/platform/hub", label: "AI Hub" },
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
      { href: "/explore", label: "探索项目" },
      { href: "/demos", label: "运行 Demo" },
      { href: "/docs", label: "开发者文档" },
      { href: "/platform", label: "演示工作台" },
      { href: "/platform/hub", label: "AI Hub" },
      { href: "/platform/connections", label: "连接与授权" },
    ],
    register: "注册账号",
  },
  hero: { lines: ["展你所作，", "守你所藏。"], foot: ["隐私优先的项目平台", "展示 · 发布 · 受控运行 · AI Hub"], scroll: "向下滚动" },
  chapters: {
    label: "平台能力",
    hint: "继续滚动",
    index: "Private by design",
    showcase: {
      tag: "项目",
      title: ["每个项目，", "一页完整的成果"],
      cta: "探索项目",
      catalog: ["探索目录", "公开项目一览"],
      head: ["体数据三维重建 · v0.3.0", "已发布"],
      claims: [
        { text: "阈值分割与连通域去噪", meta: "声明 · 源码中可定位", status: "源码已实现", ok: true },
        { text: "学习型分割模型", meta: "声明 · 权重与实验待核验", status: "仅有文档", ok: false },
        { text: "分割精度", meta: "没有可复现实验，不发布数值", status: "未发布", ok: false },
      ],
    },
    lab: {
      tag: "实验室",
      title: ["两个可运行的 Demo，", "参数由你来改"],
      cta: "打开 Demo",
      catalog: ["神经网络训练场", "在你的浏览器里训练"],
      prompt: "120 个城市 · 2-opt + Or-opt",
      status: "服务端求解中",
      meta: "真实执行 · 无需登录",
    },
    publish: {
      tag: "发布",
      title: ["先有契约，", "再有版本与运行"],
      cta: "校验 Manifest",
      catalog: ["开发者文档", "手册 · API · Manifest"],
      nodes: ["Manifest 校验", "资产已批准", "独立审核", "版本封存"],
      lead: ["已发布", "v1.0.0 · 不可变"],
    },
    privacy: {
      tag: "隐私",
      title: ["可见性、数据与授权，", "分开治理"],
      cta: "连接与授权",
      catalog: ["数据去向", "每次运行前告知"],
      cards: [
        { name: "项目可见性", desc: "私有 · 不公开列出 · 公开", chips: ["项目层", "可切换"] },
        { name: "你的数据", desc: "输入与结果只属于你", chips: ["用户层", "不随项目公开"] },
        { name: "运行授权", desc: "逐项授权，随时撤销", chips: ["能力层", "可撤销"] },
      ],
    },
    hub: {
      tag: "AI Hub",
      title: ["内置的 AI Hub，", "对话、记忆与工具已上线"],
      cta: "进入 AI Hub",
      catalog: ["Agent 编排", "Planner 与 Worker · 开发中"],
      user: "帮我把这周的实验记录整理成三个重点。",
      persona: "研究助理",
      intro: "好的，整理为三点（参考了 1 条已确认记忆）：",
      points: ["阈值从 0.5 调到 0.42 后掩膜更完整", "合成样例 v0.3.0 已发布", "下一步：补充模型卡的限制说明"],
    },
  },
  about: {
    meta: ["AI-Generator®", "Platform", "2026"],
    text: "AI-Generator 正在成为一个隐私优先的项目平台：研究、算法、工具与 AI 应用，都可以在这里拥有一页完整的成果、一组不可变的版本和一份如实的证据清单。对话、人格、记忆与工具组成的 AI Hub，是平台内置、已经上线的第一个模块。",
    news: "发展方向",
    cards: [
      { title: "项目 Registry：草稿、独立审核、不可变版本与可撤回发布", meta: "开发中 · 数据模型与权限验收中", href: "/platform/projects" },
      { title: "连接与授权：自带模型凭据（BYOK）与逐项能力授权", meta: "规划中 · 先完成安全设计", href: "/platform/connections" },
    ],
  },
  features: {
    label: "从这里开始",
    explore: { tag: "项目", title: "探索公开项目", styles: "项目类别", go: "去探索" },
    hub: { tag: "AI Hub", title: "内置 AI Hub", avatars: "专属人格", go: "进入" },
    demos: {
      tag: "Demo",
      title: "亲手运行，看它真实执行",
      items: [
        { name: "路线优化求解器", meta: "服务端执行 · 事件流实时进度" },
        { name: "神经网络训练场", meta: "浏览器执行 · 数据不离开设备" },
      ],
      runtimes: "同一套运行状态",
      chips: ["服务端", "浏览器"],
      go: "去运行",
    },
  },
  index: {
    label: "平台地图",
    rows: [
      { href: "/explore", word: "探索" },
      { href: "/platform/projects", word: "项目" },
      { href: "/demos", word: "Demo" },
      { href: "/docs", word: "开发者" },
      { href: "/platform/connections", word: "授权" },
      { href: "/platform/hub", word: "AI Hub" },
    ],
  },
  forest: {
    name: "AI-Generator",
    role: "隐私优先的项目平台",
    copy: [
      "公开一个项目，不等于公开使用者的数据；项目作者也不能因为“是作者”就读取任何人的输入、结果或凭据。",
      "人格 Prompt 只在服务端拼装，长期记忆在你确认后才写入，生成的图片保存在私有存储中——这些规则从 AI Hub 延续到整个平台。",
    ],
    quote: ["“好的平台让作品站到台前，", "把边界留在使用者手里，", "只做被允许做的事。”"],
    link: "查看连接与授权",
    panel: {
      title: "数据边界",
      rows: [["项目可见性", "由作者决定"], ["你的数据", "仅你可见"], ["运行授权", "逐项可撤销"], ["模型凭据", "不交给作者"]],
    },
  },
  process: {
    label: "工作方式",
    composer: { persona: "新建项目", input: "排序算法对照实验" },
    workers: { labels: ["契约", "资产", "审核", "封存"], lead: "发布 · v1.0.0" },
    history: [["运行 run_7Hq2", "成功 · 38 秒"], ["授权 · 空气质量摘要", "可撤销"], ["结果", "仅你可见"]],
    steps: [
      ["写下你的项目", "名称、类别与可见性；Manifest 随输入生成，并在浏览器里按契约校验。"],
      ["审核后发布", "独立审核人检查草稿与资产，通过后封存为不可变版本，再由发布人发布。"],
      ["授权后运行", "使用者逐项授权能力；运行异步执行，结果只属于发起的人。"],
    ],
  },
  closing: {
    title: ["把作品带到台前，", "把边界握在手里。"],
    lead: ["进入你的工作台", "使用邮箱登录，或先浏览演示工作台。"],
    field: "前往登录",
    small: ["还没有账号？", "注册", " · 演示工作台无需登录。"],
  },
  footer: {
    cols: [
      { title: "平台", links: [{ href: "/explore", label: "探索项目" }, { href: "/demos", label: "运行 Demo" }, { href: "/docs", label: "开发者文档" }, { href: "/platform", label: "演示工作台" }, { href: "/platform/projects", label: "项目 · 开发中" }, { href: "/platform/connections", label: "连接与授权 · 规划中" }] },
      { title: "AI Hub", links: [{ href: "/chat", label: "AI 对话" }, { href: "/personas", label: "专属人格" }, { href: "/memories", label: "长期记忆" }, { href: "/tools", label: "AI 工具" }] },
      { title: "账户", links: [{ href: "/workspace", label: "进入工作台" }, { href: "/account", label: "账户与隐私" }, { href: "/login", label: "登录" }, { href: "/register", label: "注册" }] },
    ],
    site: "站点",
    bottom: ["© 2026 AI-Generator", "隐私优先 · 展示 · 发布 · 受控运行"],
  },
  fab: "快速开始对话",
  runtime: {
    bubbles: ["v1.0.0 已发布", "Manifest 校验通过", "run.status · SUCCEEDED", "帮我总结这份实验记录", "仅成员可见", "授权：仅本次"],
    chips: [["项目", "体数据三维重建"], ["Demo", "路线优化 · 真实运行"], ["授权", "可撤销"], ["版本", "v0.3.0"], ["AI Hub", "已上线"], ["运行", "SUCCEEDED"]],
  },
};

const en: LandingCopy = {
  meta: {
    title: "AI-Generator — A privacy-first home for projects",
    description: "AI-Generator is a privacy-first project platform: showcase research and work, publish immutable versions, and offer capabilities only under explicit authorization. The built-in AI Hub is live.",
  },
  preloader: ["AI-Generator", "Privacy-first project platform"],
  header: {
    home: "AI-Generator home",
    mainNav: "Main navigation",
    links: [
      { href: "/explore", label: "Explore" },
      { href: "/demos", label: "Demos" },
      { href: "/docs", label: "Developers" },
      { href: "/platform/hub", label: "AI Hub" },
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
      { href: "/explore", label: "Explore projects" },
      { href: "/demos", label: "Run the demos" },
      { href: "/docs", label: "Developer docs" },
      { href: "/platform", label: "Demo workspace" },
      { href: "/platform/hub", label: "AI Hub" },
      { href: "/platform/connections", label: "Connections" },
    ],
    register: "Create account",
  },
  hero: { lines: ["Show what you make,", "keep what you hold."], foot: ["A privacy-first project platform", "Showcase · Publish · Run · AI Hub"], scroll: "Scroll down" },
  chapters: {
    label: "Platform capabilities",
    hint: "Keep scrolling",
    index: "Private by design",
    showcase: {
      tag: "Projects",
      title: ["One project,", "one complete page"],
      cta: "Explore projects",
      catalog: ["Directory", "Every public project"],
      head: ["Volume reconstruction · v0.3.0", "Published"],
      claims: [
        { text: "Threshold segmentation", meta: "Claim · traceable in source", status: "In source", ok: true },
        { text: "Learned segmentation model", meta: "Claim · weights not verified", status: "Docs only", ok: false },
        { text: "Segmentation accuracy", meta: "No reproducible experiment yet", status: "Unpublished", ok: false },
      ],
    },
    lab: {
      tag: "Lab",
      title: ["Two runnable demos,", "your parameters"],
      cta: "Open the demos",
      catalog: ["Neural network", "Trains in your browser"],
      prompt: "120 cities · 2-opt + Or-opt",
      status: "Solving on the server",
      meta: "Real execution · no login",
    },
    publish: {
      tag: "Publish",
      title: ["Contract first,", "then versions and runs"],
      cta: "Validate a manifest",
      catalog: ["Developer docs", "Guide · API · Manifest"],
      nodes: ["Manifest check", "Assets approved", "Review passed", "Version sealed"],
      lead: ["Published", "v1.0.0 · immutable"],
    },
    privacy: {
      tag: "Privacy",
      title: ["Visibility, data and grants,", "governed separately"],
      cta: "Connections",
      catalog: ["Data destinations", "Disclosed before each run"],
      cards: [
        { name: "Project visibility", desc: "Private · Unlisted · Public", chips: ["Project", "Switchable"] },
        { name: "Your data", desc: "Inputs and results stay yours", chips: ["User", "Never made public"] },
        { name: "Run grants", desc: "Per capability, revocable", chips: ["Capability", "Revocable"] },
      ],
    },
    hub: {
      tag: "AI Hub",
      title: ["A built-in AI Hub,", "chat, memory and tools live"],
      cta: "Open AI Hub",
      catalog: ["Agent orchestration", "Planner and workers · in development"],
      user: "Turn this week’s lab notes into three key points.",
      persona: "Research assistant",
      intro: "Sure, three points (using 1 confirmed memory):",
      points: ["Threshold 0.42 gives a fuller mask than 0.5", "Synthetic sample v0.3.0 is published", "Next: add limits to the model card"],
    },
  },
  about: {
    meta: ["AI-Generator®", "Platform", "2026"],
    text: "AI-Generator is becoming a privacy-first project platform: research, algorithms, tools and AI apps each get a complete page, immutable versions and an honest list of evidence. The built-in AI Hub of chat, personas, memory and tools is the first module, and it is already live.",
    news: "What’s next",
    cards: [
      { title: "Project registry: drafts, independent review, immutable versions, revocable releases", meta: "In development · access review", href: "/platform/projects" },
      { title: "Connections: bring your own model key and per-capability grants", meta: "Planned · security design first", href: "/platform/connections" },
    ],
  },
  features: {
    label: "Start here",
    explore: { tag: "Projects", title: "Explore public projects", styles: "Categories", go: "Explore" },
    hub: { tag: "AI Hub", title: "The built-in AI Hub", avatars: "Personas", go: "Open" },
    demos: {
      tag: "Demos",
      title: "Run it yourself, for real",
      items: [
        { name: "Route optimizer", meta: "Runs on the server · live event stream" },
        { name: "Neural network", meta: "Runs in your browser · data stays on device" },
      ],
      runtimes: "One run lifecycle",
      chips: ["Server", "Browser"],
      go: "Run",
    },
  },
  index: {
    label: "Platform map",
    rows: [
      { href: "/explore", word: "Explore" },
      { href: "/platform/projects", word: "Projects" },
      { href: "/demos", word: "Demos" },
      { href: "/docs", word: "Developers" },
      { href: "/platform/connections", word: "Grants" },
      { href: "/platform/hub", word: "AI Hub" },
    ],
  },
  forest: {
    name: "AI-Generator",
    role: "Privacy-first project platform",
    copy: [
      "Publishing a project never publishes its users’ data, and being the author never grants access to anyone’s inputs, results or keys.",
      "Persona prompts are assembled on the server, memory is saved only after you confirm it, generated images stay private — rules that now extend from the AI Hub to the whole platform.",
    ],
    quote: ["“A good platform puts the work in front and leaves the boundaries with the people using it.”"],
    link: "Connections & grants",
    panel: {
      title: "Data boundaries",
      rows: [["Project visibility", "Set by the author"], ["Your data", "Only you"], ["Run grants", "Revocable"], ["Model keys", "Never shared"]],
    },
  },
  process: {
    label: "How it works",
    composer: { persona: "New project", input: "Sorting lab" },
    workers: { labels: ["Contract", "Assets", "Review", "Seal"], lead: "Published · v1.0.0" },
    history: [["Run run_7Hq2", "Succeeded · 38s"], ["Grant · Air quality", "Revocable"], ["Result", "Only you"]],
    steps: [
      ["Describe the project", "Name, category and visibility; the manifest is generated and validated in your browser."],
      ["Review, then publish", "An independent reviewer checks the draft and its assets before it is sealed as an immutable version."],
      ["Grant, then run", "Users grant each capability; runs are asynchronous and results belong to whoever started them."],
    ],
  },
  closing: {
    title: ["Put the work in front,", "keep the boundaries yours."],
    lead: ["Open your workspace", "Log in with email, or browse the demo workspace first."],
    field: "Go to log in",
    small: ["No account yet? ", "Sign up", " · The demo workspace needs no login."],
  },
  footer: {
    cols: [
      { title: "Platform", links: [{ href: "/explore", label: "Explore projects" }, { href: "/demos", label: "Run the demos" }, { href: "/docs", label: "Developer docs" }, { href: "/platform", label: "Demo workspace" }, { href: "/platform/projects", label: "Projects · in development" }, { href: "/platform/connections", label: "Connections · planned" }] },
      { title: "AI Hub", links: [{ href: "/chat", label: "AI chat" }, { href: "/personas", label: "Personas" }, { href: "/memories", label: "Long-term memory" }, { href: "/tools", label: "AI tools" }] },
      { title: "Account", links: [{ href: "/workspace", label: "Open the workspace" }, { href: "/account", label: "Account & privacy" }, { href: "/login", label: "Log in" }, { href: "/register", label: "Sign up" }] },
    ],
    site: "Site",
    bottom: ["© 2026 AI-Generator", "Privacy-first · Showcase · Publish · Run"],
  },
  fab: "Start a chat",
  runtime: {
    bubbles: ["v1.0.0 published", "Manifest valid", "run.status · SUCCEEDED", "Summarize these lab notes", "Members only", "Grant: this run only"],
    chips: [["Project", "Volume reconstruction"], ["Demo", "Route optimizer · live"], ["Grant", "Revocable"], ["Version", "v0.3.0"], ["AI Hub", "Live"], ["Run", "SUCCEEDED"]],
  },
};

export const landingCopy: Record<LandingLang, LandingCopy> = { zh, en };
