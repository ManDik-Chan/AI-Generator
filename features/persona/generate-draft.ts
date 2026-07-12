import { parseGeneratedPersona, toClientPersonaDraft } from "@/features/persona/generation";

export async function generatePersonaDraftWithRepair(
  generate: (repair?: { error: string; raw: string }) => Promise<string>,
) {
  const first = await generate();
  try { return toClientPersonaDraft(parseGeneratedPersona(first)); }
  catch (error) {
    const repaired = await generate({ error: error instanceof Error ? error.message : "Schema invalid", raw: first });
    try { return toClientPersonaDraft(parseGeneratedPersona(repaired)); }
    catch { throw new Error("AI 返回的人格格式不完整，请重新生成。"); }
  }
}
