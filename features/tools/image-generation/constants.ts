export const IMAGE_GENERATION_PROMPT_MAX_CHARS = 900;
export const IMAGE_GENERATION_PAGE_SIZE = 20;

export const IMAGE_GENERATION_STYLES = {
  AUTO: {
    label: "自动",
    suffix: "保持主题清晰，构图完整，不添加文字、水印或标志。",
  },
  PHOTOREALISTIC: {
    label: "写实摄影",
    suffix: "写实摄影质感，自然光影，细节可信，不添加文字、水印或标志。",
  },
  ILLUSTRATION: {
    label: "精致插画",
    suffix: "精致插画风格，色彩和谐，轮廓清晰，不添加文字、水印或标志。",
  },
  ANIME: {
    label: "动漫风格",
    suffix: "高质量动漫插画风格，画面干净，角色与场景细节清晰，不添加文字、水印或标志。",
  },
  CINEMATIC: {
    label: "电影质感",
    suffix: "电影级构图与光影，氛围明确，细节丰富，不添加文字、水印或标志。",
  },
  THREE_D: {
    label: "三维艺术",
    suffix: "高质量三维艺术风格，材质与空间层次清晰，不添加文字、水印或标志。",
  },
} as const;

export type ImageGenerationStyle = keyof typeof IMAGE_GENERATION_STYLES;
