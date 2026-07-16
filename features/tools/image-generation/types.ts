import type { ImageGenerationStyle } from "@/features/tools/image-generation/constants";

export interface GeneratedToolImageDto {
  id: string;
  previewUrl: string;
  downloadUrl: string;
  prompt: string;
  style: ImageGenerationStyle;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface ImageGenerationUsageDto {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}
