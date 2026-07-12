import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadRemoteImageSafely } from "@/lib/ai/image/download";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0]);
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
const publicLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);
const response = (bytes: Uint8Array, type?: string, extra: Record<string, string> = {}) => new Response(bytes as unknown as BodyInit, { headers: { ...(type === undefined ? {} : { "content-type": type }), ...extra } });

afterEach(() => vi.restoreAllMocks());

describe("secure remote image download", () => {
  it.each(["http://images.example/a.png", "https://user:pass@images.example/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://10.0.0.1/a.png", "https://172.16.1.1/a.png", "https://192.168.1.1/a.png", "https://169.254.169.254/latest/meta-data"])('keeps rejecting unsafe URL %s', async (url) => {
    await expect(downloadRemoteImageSafely(url, { fetcher: vi.fn(), lookup: publicLookup })).rejects.toMatchObject({ code: "UNSAFE_IMAGE", diagnostics: expect.objectContaining({ stage: expect.stringMatching(/url|dns/) }) });
  });

  it.each([["192.168.1.2"], ["198.18.0.1"], ["fe80::1"]])("returns a DNS-stage proxy error for reserved resolution %s", async (address) => {
    await expect(downloadRemoteImageSafely("https://images.example/a.png", { fetcher: vi.fn(), lookup: vi.fn().mockResolvedValue([{ address }]) })).rejects.toMatchObject({ code: "PROXY_DNS", diagnostics: { stage: "dns", hostname: "images.example", redirectCount: 0, resolvedAddressClass: "fake-ip-or-private" } });
  });

  it.each([["image/jpg", jpeg, "image/jpeg"], ["image/pjpeg", jpeg, "image/jpeg"], ["binary/octet-stream", png, "image/png"], ["application/x-octet-stream", webp, "image/webp"]])("normalizes %s and trusts the detected signature", async (type, bytes, mimeType) => {
    const fetcher = vi.fn().mockResolvedValue(response(bytes as Uint8Array, type as string));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher, lookup: publicLookup })).resolves.toMatchObject({ mimeType });
  });

  it("accepts a missing Content-Type only after JPEG signature validation", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(jpeg));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher, lookup: publicLookup })).resolves.toMatchObject({ mimeType: "image/jpeg", extension: "jpg" });
  });

  it.each(["text/html", "text/plain", "application/json", "image/svg+xml"])('rejects explicit unsafe Content-Type %s before trusting bytes', async (type) => {
    const fetcher = vi.fn().mockResolvedValue(response(png, type));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher, lookup: publicLookup })).rejects.toMatchObject({ code: "UNSAFE_IMAGE", diagnostics: expect.objectContaining({ stage: "content-type", declaredType: type }) });
  });

  it("rejects HTML hidden behind octet-stream and unknown binary signatures", async () => {
    for (const bytes of [new TextEncoder().encode("<html>bad</html>"), new Uint8Array([1, 2, 3])]) {
      const fetcher = vi.fn().mockResolvedValue(response(bytes, "application/octet-stream"));
      await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher, lookup: publicLookup })).rejects.toMatchObject({ code: "UNSAFE_IMAGE", diagnostics: expect.objectContaining({ stage: "image-signature" }) });
    }
  });

  it("keeps the 15 MB limit and reports the length stage", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(png, "image/png", { "content-length": String(16 * 1024 * 1024) }));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher, lookup: publicLookup })).rejects.toMatchObject({ code: "UNSAFE_IMAGE", diagnostics: expect.objectContaining({ stage: "content-length", declaredLength: 16 * 1024 * 1024 }) });
  });

  it("revalidates redirects and labels redirect failures", async () => {
    const unsafeRedirect = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://10.0.0.2/a.png" } }));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher: unsafeRedirect, lookup: publicLookup })).rejects.toMatchObject({ code: "UNSAFE_IMAGE", diagnostics: expect.objectContaining({ stage: "dns" }) });
    const missingLocation = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302 }));
    await expect(downloadRemoteImageSafely("https://images.example/a", { fetcher: missingLocation, lookup: publicLookup })).rejects.toMatchObject({ diagnostics: expect.objectContaining({ stage: "redirect" }) });
  });

  it("accepts supported MIME mismatch using signature and logs only safe fields", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(response(jpeg, "image/png"));
    await expect(downloadRemoteImageSafely("https://images.example/a?token=secret-value", { fetcher, lookup: publicLookup })).resolves.toMatchObject({ mimeType: "image/jpeg" });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('"stage":"mime-mismatch"'); expect(logged).toContain('"hostname":"images.example"');
    expect(logged).not.toContain("secret-value"); expect(logged).not.toContain("token="); expect(logged).not.toContain("https://");
  });
});
