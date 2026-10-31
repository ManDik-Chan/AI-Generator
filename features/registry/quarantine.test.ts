import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { normalizeRegistryBytes, SCANNER_REVISION } from "./quarantine-content";
import { stageRegistryAsset, verifyRegistryAsset } from "./quarantine";

afterEach(() => vi.unstubAllEnvs());

describe("Registry quarantine input and content boundary", () => {
  it("keeps internal commands disabled when either gate is absent", async () => {
    const input = { accessToken: "invalid", projectId: randomUUID(), idempotencyKey: "test", input: { assetId: randomUUID() } };
    for (const [internal, quarantine] of [["", ""], ["true", ""], ["", "true"]]) {
      vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", internal);
      vi.stubEnv("REGISTRY_QUARANTINE_ENABLED", quarantine);
      await expect(stageRegistryAsset(input, Buffer.from("fixture"))).rejects.toMatchObject({ code: "DISABLED" });
      await expect(verifyRegistryAsset({ accessToken: "invalid", projectId: input.projectId, input: { quarantineId: randomUUID() } }))
        .rejects.toMatchObject({ code: "DISABLED" });
    }
  });
  it("rejects caller locators and scanner verdicts before consulting Auth", async () => {
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true"); vi.stubEnv("REGISTRY_QUARANTINE_ENABLED", "true");
    const projectId = randomUUID(), assetId = randomUUID();
    for (const extra of [{ bucket: "private" }, { path: "../foreign" }, { url: "https://example.test/payload" },
      { policyRevision: 1 }, { scanOutcome: "CLEAN" }]) {
      await expect(stageRegistryAsset({ accessToken: "invalid", projectId, idempotencyKey: "test", input: { assetId, ...extra } }, Buffer.from("fixture")))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(verifyRegistryAsset({ accessToken: "invalid", projectId, input: { quarantineId: randomUUID(), ...extra } }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
  });
  it("normalizes private markdown candidates without reporting a clean scan", async () => {
    const source = Buffer.from("# Cafe\u0301\r\n\r\n[unreviewed link](https://example.test)\r\n");
    const candidate = await normalizeRegistryBytes(source, "text/markdown");
    expect(Buffer.from(candidate.bytes).toString("utf8")).toBe("# Café\n\n[unreviewed link](https://example.test)\n");
    expect(SCANNER_REVISION).toBe("unavailable-v1");
  });
  it("rejects active formats, malformed UTF-8 and binary under markdown MIME", async () => {
    for (const bytes of [Buffer.from("<svg onload='alert(1)'/>"), Buffer.from("<script>alert(1)</script>"),
      Buffer.from([0xc3, 0x28]), Buffer.from([0x00, 0x23])]) {
      await expect(normalizeRegistryBytes(bytes, "text/markdown")).rejects.toThrow();
    }
  });
  it("requires actual image format, full decode and a bounded pixel count", async () => {
    const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } }).png().toBuffer();
    await expect(normalizeRegistryBytes(png, "image/jpeg")).rejects.toThrow();
    await expect(normalizeRegistryBytes(png.subarray(0, 24), "image/png")).rejects.toThrow();
    await expect(normalizeRegistryBytes(Buffer.from("<svg/>"), "image/svg+xml")).rejects.toThrow();
    const oversized = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "black" } }).png().toBuffer();
    await expect(normalizeRegistryBytes(oversized, "image/png")).rejects.toThrow();
  });
  it("reencodes JPEG into a decoded PNG candidate and strips source metadata", async () => {
    const jpeg = await sharp({ create: { width: 2, height: 3, channels: 3, background: "blue" } })
      .withExif({ IFD0: { Copyright: "isolated metadata must be stripped" } }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const candidate = await normalizeRegistryBytes(jpeg, "image/jpeg"), metadata = await sharp(candidate.bytes).metadata();
    expect(candidate.mime).toBe("image/png");
    expect(metadata.format).toBe("png"); expect(metadata.width).toBe(2); expect(metadata.height).toBe(3);
    expect(metadata.exif).toBeUndefined();
  });
});
