import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
});

describe("admin surface security and completeness", () => {
  it("guards operational data and omits private content", () => {
    const data = read("features/admin/data.ts");
    expect(data).toContain("await requireAdmin()");
    expect(data).toContain("actor: { id: user.id, platformRole: profile.role }");
    expect(data).toContain("actorCapabilities: platformCapabilities(profile.role)");
    expect(data).toContain("roleChange: canChangePlatformRole(profile.role, target.role, user.id === target.id)");
    for (const model of ["profile", "conversation", "message", "memory", "generatedImage", "toolRun", "generationRun", "brainstormWorker"]) expect(data).toContain(`prisma.${model}`);
    for (const field of ["inputText: true", "outputText: true", "storagePath: true"]) expect(data).not.toContain(field);
  });
  it("locks and rereads both roles and audits changes atomically", () => {
    const action = read("features/admin/actions.ts");
    expect(action).toContain('"use server"');
    for (const fragment of ["await requireAdmin()", "changePlatformRole", "revalidatePath"]) expect(action).toContain(fragment);
    const service = read("features/admin/role-service.ts");
    for (const fragment of ["FOR UPDATE", 'actor?.role !== "OWNER"', "transaction.platformRoleAudit.create", "transaction.platformRoleRequest.create", 'isolationLevel: "Serializable"']) expect(service).toContain(fragment);
  });
  it("provides users, usage, roles, system status and real operations", () => {
    const page = read("app/admin/page.tsx");
    for (const label of ["用户与角色", "运行与用量", "系统状态", "操作入口", "最近运行"]) expect(page).toContain(label);
    expect(page).not.toContain("暂无可管理项目");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("renders the role directory from parsed server data and states that the audit feed is not connected", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toContain("const directory = toPlatformDirectory(overview);");
    expect(page).toContain("audit={ROLE_AUDIT_FEED_NOT_CONNECTED}");
    expect(page).toContain("directory={directory.value}");
    expect(page).not.toMatch(/RoleControl|role-control/);
    expect(existsSync("features/admin/components/role-control.tsx")).toBe(false);
    // Platform role labels and the admin entry come from the server, not from role-name checks in the page.
    expect(page).not.toMatch(/\.role === "(?:ADMIN|OWNER|USER)"/);
  });
  it("wires the role-change Server Action from /admin only, and hands it only to a role manager", () => {
    // The action is a public HTTP endpoint once any page imports it; its own transaction is the
    // security boundary. The page still hands it only to a viewer the backend lets manage roles,
    // so ADMIN and USER sessions never receive a change control.
    const page = read("app/admin/page.tsx");
    expect(page).toContain("onChangeRole={directory.value.viewer.capabilities.manageRoles ? updateAdminRoleAction : undefined}");
    const target = resolve("features/admin/actions");
    const importsAction = (path: string) => [...read(path).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].some(([, specifier]) => {
      const resolved = specifier.startsWith("@/") ? resolve(specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(path), specifier) : null;
      return resolved === target || resolved === `${target}.ts`;
    });
    // The detector itself must see a known importer (the action's own unit test).
    expect(importsAction("features/admin/actions.test.ts")).toBe(true);
    const importers = [...sources("app"), ...sources("components"), ...sources("features"), ...sources("lib")].filter(importsAction);
    expect(importers).toEqual([join("app", "admin", "page.tsx")]);
  });
  it("serves the directory loader only through the page boundary, to role managers", () => {
    // The loader is a public HTTP endpoint too. It runs the same guard and parsing as the page, and
    // the page hands it only to the viewer that also receives the role-change action.
    const loader = read("features/admin/rbac/directory-action.ts");
    expect(loader).toContain('"use server"');
    expect(loader).toContain("toPlatformDirectory(await getAdminOverview())");
    expect(read("features/admin/data.ts")).toContain("await requireAdmin()");
    const page = read("app/admin/page.tsx");
    expect(page).toContain("onLoadDirectory={directory.value.viewer.capabilities.manageRoles ? loadPlatformDirectoryAction : undefined}");
    const importers = [...sources("app"), ...sources("components"), ...sources("features"), ...sources("lib")]
      .filter((path) => /from ["']@\/features\/admin\/rbac\/directory-action["']/.test(read(path)));
    expect(importers).toEqual([join("app", "admin", "page.tsx")]);
  });
});
