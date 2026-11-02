import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
describe("admin surface security and completeness", () => {
  it("guards operational data and omits private content", () => {
    const data = read("features/admin/data.ts");
    expect(data).toContain("await requireAdmin()");
    expect(data).toContain("actorCapabilities: platformCapabilities(profile.role)");
    expect(data).toContain("roleChange: canChangePlatformRole(profile.role, target.role, user.id === target.id)");
    for (const model of ["profile", "conversation", "message", "memory", "generatedImage", "toolRun", "generationRun", "brainstormWorker"]) expect(data).toContain(`prisma.${model}`);
    for (const field of ["inputText: true", "outputText: true", "storagePath: true"]) expect(data).not.toContain(field);
  });
  it("locks and rereads both roles and audits changes atomically", () => {
    const action = read("features/admin/actions.ts");
    expect(action).toContain('"use server"');
    for (const fragment of ["await requireAdmin()", "FOR UPDATE", "canChangePlatformRole", "transaction.platformRoleAudit.create", 'isolationLevel: "Serializable"', "revalidatePath"]) expect(action).toContain(fragment);
  });
  it("provides users, usage, roles, system status and real operations", () => {
    const page = read("app/admin/page.tsx");
    for (const label of ["用户与角色", "运行与用量", "系统状态", "操作入口", "最近运行"]) expect(page).toContain(label);
    expect(page).toContain("<RoleControl");
    expect(page).not.toContain("暂无可管理项目");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
