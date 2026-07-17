import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("admin surface security and completeness", () => {
  it("reads real operational data without selecting prompts, outputs or storage paths", () => {
    const data = read("features/admin/data.ts");
    for (const model of ["profile", "conversation", "message", "memory", "generatedImage", "toolRun", "generationRun", "brainstormWorker"]) {
      expect(data).toContain(`prisma.${model}`);
    }
    expect(data).not.toContain("inputText: true");
    expect(data).not.toContain("outputText: true");
    expect(data).not.toContain("storagePath: true");
  });

  it("keeps role changes behind server admin checks and last-admin protection", () => {
    const action = read("features/admin/actions.ts");
    expect(action).toContain('"use server"');
    expect(action).toContain("await requireAdmin()");
    expect(action).toContain("parsed.data.profileId === user.id");
    expect(action).toContain('where: { role: "ADMIN" }');
    expect(action).toContain('isolationLevel: "Serializable"');
    expect(action).toContain("revalidatePath");
  });

  it("provides users, usage, roles, system status and real operations", () => {
    const page = read("app/admin/page.tsx");
    for (const label of ["用户与角色", "运行与用量", "系统状态", "操作入口", "最近运行"]) expect(page).toContain(label);
    expect(page).toContain("<RoleControl");
    expect(page).not.toContain("暂无可管理项目");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
