export const TOOL_INPUT_MAX_CHARS = 20_000;
export const TOOL_OUTPUT_MAX_CHARS = 40_000;
export const TOOL_HISTORY_PAGE_SIZE = 20;

export const TOOL_LABELS = {
  SUMMARIZE: "文本总结",
  REWRITE: "改写润色",
  TRANSLATE: "多语言翻译",
  IMAGE_ANALYZE: "图片分析",
  IMAGE_GENERATE: "AI 图片创作",
  BRAINSTORM: "多 Agent 头脑风暴",
} as const;

export const TOOL_PATHS = {
  SUMMARIZE: "/tools/summarize",
  REWRITE: "/tools/rewrite",
  TRANSLATE: "/tools/translate",
  IMAGE_ANALYZE: "/tools/image",
  IMAGE_GENERATE: "/tools/image-generate",
  BRAINSTORM: "/tools/brainstorm",
} as const;

export const LANGUAGE_LABELS = {
  auto: "自动检测",
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
} as const;
