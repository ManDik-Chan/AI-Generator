/*
 * Generates the share-card images in public/og (Open Graph / Twitter, 1200x630 JPEG).
 *
 *   node --import tsx scripts/generate-og-images.ts
 *
 * The card reuses the login page's brand panel: forest ground, the landing "agents"
 * artwork at 70% under a forest veil, the paper wordmark and the lime headline from the
 * landing hero. Text is drawn with the site's own font files (app/fonts, decoded from
 * WOFF2); a child process renders with a fontconfig that sees only those files, so no
 * installed system font can substitute and the output is the same on every machine.
 * Only words already on the landing page are drawn. Rename the output files (and
 * SOCIAL_IMAGE_PATHS) when the artwork changes, because platforms cache by URL.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { ART_PALETTES } from "../features/landing/art";
import type { LandingLang } from "../features/landing/content";
import { SOCIAL_IMAGE, SOCIAL_IMAGE_PATHS, socialImageText } from "../features/seo/social-image";
import { SITE_HOST, SITE_NAME } from "../lib/site";
import { woff2ToTtf } from "./og/woff2";

const ROOT = resolve(__dirname, "..");
const FONT_DIR = join(ROOT, "app/fonts");
const LANGS: LandingLang[] = ["zh", "en"];
const { width: W, height: H } = SOCIAL_IMAGE;

// Landing tokens (features/landing/landing.css).
const FOREST = "#0f2a24";
const PAPER = "#f2efea";
const LIME = "#e9e778";
const SPARK = "M32 13c1.8 10.5 7.5 16.2 18 18-10.5 1.8-16.2 7.5-18 18-1.8-10.5-7.5-16.2-18-18 10.5-1.8 16.2-7.5 18-18Z";

/* ------------------------------------------------------------ fonts */

/** The Noto Sans SC slices (Google Fonts unicode-range files) covering `text`. */
function notoSlicesFor(text: string): string[] {
  const css = readFileSync(join(FONT_DIR, "noto-sans-sc.css"), "utf8");
  const faces = [...css.matchAll(/src:url\("\.\/(noto-sans-sc\/[^"]+\.woff2)"\)[^;]*;unicode-range:([^}]+)\}/g)].map(([, file, ranges]) => ({
    file,
    ranges: ranges.split(",").map((range) => {
      const value = range.trim().replace(/^u\+/i, "");
      if (value.includes("?")) return [parseInt(value.replace(/\?/g, "0"), 16), parseInt(value.replace(/\?/g, "f"), 16)];
      const [from, to] = value.split("-");
      return [parseInt(from, 16), parseInt(to ?? from, 16)];
    }),
  }));
  const files = new Set<string>();
  for (const char of new Set(text.replace(/[\x00-\x7f]/g, ""))) {
    const code = char.codePointAt(0) ?? 0;
    const face = faces.find(({ ranges }) => ranges.some(([from, to]) => code >= from && code <= to));
    if (!face) throw new Error(`No Noto Sans SC slice covers ${JSON.stringify(char)}`);
    files.add(face.file);
  }
  return [...files];
}

/* ------------------------------------------------------------ artwork */

const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function hash(x: number, y: number) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}

function fbm(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 6; i++) {
    v += a * noise(x, y);
    [x, y] = [1.6 * x - 1.2 * y, 1.2 * x + 1.6 * y];
    a *= 0.5;
  }
  return v;
}

/**
 * CPU port of the landing fragment shader (features/landing/art.ts), rendered at 3:2 and
 * cropped to the card like the site's `background-size: cover`. Returns RGB floats.
 */
function renderArtwork(): Float64Array {
  const pal = ART_PALETTES.agents;
  const [A, B, C, D] = pal.c.map(rgb);
  const rw = W;
  const rh = Math.round((W * 2) / 3);
  const top = Math.floor((rh - H) / 2);
  const out = new Float64Array(W * H * 3);
  for (let row = 0; row < H; row++) {
    const fy = rh - (row + top) - 0.5; // gl_FragCoord.y grows upwards
    for (let col = 0; col < W; col++) {
      const fx = col + 0.5;
      const uvx = fx / rw;
      const uvy = fy / rh;
      const px = ((fx - 0.5 * rw) / rh) * pal.scale + pal.seed * 1.37;
      const py = ((fy - 0.5 * rh) / rh) * pal.scale + pal.seed * 0.73;
      const qx = fbm(px, py);
      const qy = fbm(px + 5.2, py + 1.3);
      const rx = fbm(px + pal.warp * qx + 1.7, py + pal.warp * qy + 9.2);
      const ry = fbm(px + pal.warp * qx + 8.3, py + pal.warp * qy + 2.8);
      const f = fbm(px + pal.warp * rx, py + pal.warp * ry);
      const tB = smoothstep(0.12, 0.82, f);
      const tC = smoothstep(0.35, 1.05, Math.hypot(qx, qy)) * 0.85;
      const tD = smoothstep(0.55, 0.95, rx) * 0.7;
      const shade = 0.84 + 0.28 * smoothstep(0, 1, uvy);
      const glow = smoothstep(0.45, 0.92, f) ** 3 * 0.12;
      const dx = uvx - 0.5;
      const dy = uvy - 0.5;
      const vignette = 1 - (dx * dx + dy * dy) * 0.55;
      const grain = (hash(fx + pal.seed * 17, fy + pal.seed * 17) - 0.5) * 0.035;
      for (let k = 0; k < 3; k++) {
        let c = mix(A[k], B[k], tB);
        c = mix(c, C[k], tC);
        c = mix(c, D[k], tD);
        c = (c * shade + glow) * vignette + grain;
        out[(row * W + col) * 3 + k] = Math.min(1, Math.max(0, c));
      }
    }
  }
  return out;
}

/** Login brand panel ground: forest, artwork at 70%, then the 160deg forest veil (.55 -> .92 at 70%). */
function renderGround(): Buffer {
  const art = renderArtwork();
  const forest = rgb(FOREST);
  const angle = (160 * Math.PI) / 180;
  const [ux, uy] = [Math.sin(angle), -Math.cos(angle)];
  const length = Math.abs(W * ux) + Math.abs(H * uy);
  const pixels = Buffer.alloc(W * H * 3);
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const t = (((col + 0.5 - W / 2) * ux + (row + 0.5 - H / 2) * uy) / length) + 0.5;
      const veil = 0.55 + 0.37 * Math.min(1, Math.max(0, t / 0.7));
      for (let k = 0; k < 3; k++) {
        const ground = mix(forest[k], art[(row * W + col) * 3 + k], 0.7);
        pixels[(row * W + col) * 3 + k] = Math.round(mix(ground, forest[k], veil) * 255);
      }
    }
  }
  return pixels;
}

/* ------------------------------------------------------------ type */

const escapeXml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function typeLayer(lang: LandingLang): string {
  const { headline, tagline } = socialImageText(lang);
  const pad = 72;
  const zh = lang === "zh";
  const head = zh
    ? { family: "Noto Sans SC", size: 116, lead: 1.03, tracking: -0.04, first: 284 }
    : { family: "Figtree", size: 92, lead: 1.04, tracking: -0.045, first: 286 };
  const lines = headline
    .map((line, i) => `<text x="${pad - (zh ? 4 : 5)}" y="${(head.first + i * head.size * head.lead).toFixed(1)}">${escapeXml(line)}</text>`)
    .join("");
  const footFamily = zh ? "Noto Sans SC" : "Figtree";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g fill="${PAPER}">
    <path d="${SPARK}" transform="translate(${pad} 56) scale(${36 / 38}) translate(-13 -12)"/>
    <text x="${pad + 46}" y="86" font-family="Figtree" font-weight="600" font-size="34" letter-spacing="${(-0.04 * 34).toFixed(2)}">${SITE_NAME}<tspan dx="2" dy="-15" font-size="13" font-weight="500" letter-spacing="0">®</tspan></text>
  </g>
  <g fill="${LIME}" font-family="${head.family}" font-weight="500" font-size="${head.size}" letter-spacing="${(head.tracking * head.size).toFixed(2)}">${lines}</g>
  <rect x="${pad}" y="522" width="${W - pad * 2}" height="1.5" fill="${PAPER}" fill-opacity=".18"/>
  <text x="${pad}" y="574" fill="${PAPER}" fill-opacity=".78" font-family="${footFamily}" font-weight="400" font-size="24">${escapeXml(tagline)}</text>
  <text x="${W - pad}" y="574" fill="${PAPER}" fill-opacity=".62" font-family="Figtree" font-weight="500" font-size="22" text-anchor="end">${SITE_HOST}</text>
</svg>`;
}

/* ------------------------------------------------------------ stages */

async function render(fontconfigReady: string) {
  if (!fontconfigReady) throw new Error("render stage must run under the isolated fontconfig");
  const { default: sharp } = await import("sharp");
  const ground = renderGround();
  for (const lang of LANGS) {
    const type = await sharp(Buffer.from(typeLayer(lang))).png().toBuffer();
    const output = join(ROOT, "public", SOCIAL_IMAGE_PATHS[lang]);
    mkdirSync(resolve(output, ".."), { recursive: true });
    const info = await sharp(ground, { raw: { width: W, height: H, channels: 3 } })
      .composite([{ input: type }])
      // Baseline (not progressive) JPEG: the most widely supported form among preview fetchers.
      .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, trellisQuantisation: true, overshootDeringing: true, quantisationTable: 3 })
      .toFile(output);
    console.info(`${SOCIAL_IMAGE_PATHS[lang]}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KiB`);
  }
}

function prepareAndSpawn() {
  const drawn = LANGS.map((lang) => {
    const { headline, tagline } = socialImageText(lang);
    return [...headline, tagline].join("");
  }).join("");
  const work = mkdtempSync(join(tmpdir(), "aig-og-"));
  try {
    const fonts = join(work, "fonts");
    mkdirSync(fonts);
    writeFileSync(join(fonts, "figtree.ttf"), woff2ToTtf(readFileSync(join(FONT_DIR, "figtree-latin.woff2"))));
    for (const file of notoSlicesFor(drawn)) {
      writeFileSync(join(fonts, file.split("/").pop()!.replace(/\.woff2$/, ".ttf")), woff2ToTtf(readFileSync(join(FONT_DIR, file))));
    }
    const config = join(work, "fonts.conf");
    const slash = (path: string) => path.replace(/\\/g, "/");
    writeFileSync(config, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n  <dir>${slash(fonts)}</dir>\n  <cachedir>${slash(join(work, "cache"))}</cachedir>\n</fontconfig>\n`);
    const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], "--render"], {
      stdio: "inherit",
      env: { ...process.env, FONTCONFIG_FILE: config, AIG_OG_FONTCONFIG: config },
    });
    if (child.status !== 0) throw new Error(`render stage failed (${child.status ?? child.signal})`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--render")) await render(process.env.AIG_OG_FONTCONFIG ?? "");
  else prepareAndSpawn();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
