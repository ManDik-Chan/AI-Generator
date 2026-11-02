import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { SOCIAL_IMAGE, SOCIAL_IMAGE_PATHS, socialImage, socialImageAlt } from "@/features/seo/social-image";

const PUBLIC = join(__dirname, "../../public");

describe("share-card images", () => {
  it.each(["zh", "en"] as const)("serves the %s card as a 1200x630 baseline-compatible JPEG within share size budgets", async (lang) => {
    const file = join(PUBLIC, SOCIAL_IMAGE_PATHS[lang]);
    const bytes = readFileSync(file);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const info = await sharp(bytes).metadata();
    expect(info).toMatchObject({ format: "jpeg", width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height, space: "srgb" });
    expect(info.hasAlpha).toBe(false);
    // WhatsApp and some chat apps drop previews above ~300 KB; Twitter/X allows 5 MB.
    expect(statSync(file).size).toBeLessThan(300 * 1024);
  });

  it("lives under public/og, outside middleware and any session", () => {
    for (const path of Object.values(SOCIAL_IMAGE_PATHS)) expect(path).toMatch(/^\/og\/[a-z0-9-]+\.jpg$/);
  });

  it("describes exactly the words drawn on the card", () => {
    expect(socialImageAlt("zh")).toBe("AI-Generator：展你所作，守你所藏。隐私优先的项目平台。");
    expect(socialImageAlt("en")).toBe("AI-Generator: Show what you make, keep what you hold. A privacy-first project platform.");
    expect(socialImage("en")).toEqual({ url: SOCIAL_IMAGE_PATHS.en, alt: socialImageAlt("en"), width: 1200, height: 630, type: "image/jpeg" });
  });
});
