export interface ImageGenerationRequest { prompt: string; size: string; signal?: AbortSignal }
export interface ImageGenerationResult { remoteUrl: string; provider: string; model: string; width: number; height: number }
export interface ImageProvider { generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> }
