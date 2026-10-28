import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ai/vision/config", () => ({ getToolAssetConfig: () => ({ bucket: "tools" }) }));
vi.mock("@/lib/ai/image/config", () => ({ requireAvatarStorageConfig: () => ({ bucket: "avatars" }), requireGeneratedImageStorageConfig: () => ({ bucket: "generated" }) }));
import { validateObjectIdentity, type ObjectIdentity } from "./owned-target";
const owner = "11111111-1111-4111-8111-111111111111", scope = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333";
describe("canonical private object authorization", () => {
  const target: ObjectIdentity = { ownerId: owner, resourceId: id, scopeId: scope, kind: "TOOL_ASSET", bucket: "tools", path: `${owner}/${scope}/${id}.png` };
  it("binds all three supported resource kinds", () => {
    expect(validateObjectIdentity(target)).toBe(true);
    expect(validateObjectIdentity({ ...target, kind: "PERSONA_AVATAR", bucket: "avatars" })).toBe(true);
    expect(validateObjectIdentity({ ...target, kind: "TOOL_GENERATION", bucket: "generated", scopeId: null, path: `${owner}/${id}.webp` })).toBe(true);
  });
  it.each([`${owner}x/${scope}/${id}.png`, `${scope}/${scope}/${id}.png`, `${owner}/${id}/${id}.png`, `${owner}/../${id}.png`, `${owner}/%2e%2e/${id}.png`, `${owner}%2f${scope}/${id}.png`, `${owner}\\${scope}\\${id}.png`, `${owner}//${id}.png`, `/${owner}/${scope}/${id}.png`, `${owner}/${scope}/${id}.png?x=1`, `${owner}/${scope}/${id}.svg`, `${owner}/${scope}/${id}.png\0`])("rejects noncanonical or foreign key %s", path => {
    expect(validateObjectIdentity({ ...target, path })).toBe(false);
  });
  it("rejects a forged bucket or mismatched generated resource identity", () => {
    expect(validateObjectIdentity({ ...target, bucket: "private-other" })).toBe(false);
    expect(validateObjectIdentity({ ...target, kind: "TOOL_GENERATION", bucket: "generated", scopeId: null, path: `${owner}/${scope}.png` })).toBe(false);
    expect(validateObjectIdentity({ ...target, kind: "PERSONA_AVATAR", bucket: "avatars", path: `${owner}/${scope}/${owner}.png` })).toBe(false);
  });
});
