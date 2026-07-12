import { parseGeneratedPersona, toClientPersonaDraft } from "@/features/persona/generation";

export async function generatePersonaDraftWithRepair(
  generate: (repair?: { error: string; raw: string }) => Promise<string>,
  onProgress?: (stage: "validating" | "repairing") => void,
) {
  const first = await generate();
  onProgress?.("validating");
  try { return toClientPersonaDraft(parseGeneratedPersona(first)); }
  catch (error) {
    onProgress?.("repairing");
    const repaired = await generate({ error: error instanceof Error ? error.message : "Schema invalid", raw: first });
    onProgress?.("validating");
    try { return toClientPersonaDraft(parseGeneratedPersona(repaired)); }
    catch { throw new Error("AI 返回的人格格式不完整，请重新生成。"); }
  }
}
