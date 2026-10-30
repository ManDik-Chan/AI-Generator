import { afterEach, expect, it, vi } from "vitest";
import { createInternalRegistryProject } from "./internal";

afterEach(() => vi.unstubAllEnvs());
it("keeps internal entry disabled by default", async () => {
  vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "");
  await expect(createInternalRegistryProject("invalid", { slug: "example" })).rejects.toThrow("disabled");
});
it("rejects caller-supplied ownership before contacting Auth", async () => {
  vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true");
  await expect(createInternalRegistryProject("invalid", { slug: "example", ownerId: "forged" })).rejects.toThrow();
});
