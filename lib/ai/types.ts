export type AiCapability = "text" | "vision" | "image-generation";

export interface AiModelDescriptor {
  id: string;
  provider: string;
  capabilities: AiCapability[];
}
