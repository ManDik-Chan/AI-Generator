/*
 * Client-side validator for the P0.5 project manifest (schemaVersion "0.5.0").
 * It implements the published JSON Schema rules by hand so the Developer console can
 * check a manifest instantly, without sending it anywhere. Errors mirror the schema;
 * warnings are editorial advice that the schema itself does not enforce.
 */

export const MANIFEST_SCHEMA_VERSION = "0.5.0";
export const MANIFEST_CATEGORIES = ["research", "software", "algorithm", "web-service", "ai", "other"] as const;
export const MANIFEST_VISIBILITIES = ["PRIVATE", "UNLISTED", "PUBLIC"] as const;
export const MANIFEST_CAPABILITIES = ["documentation.read", "presentation.read", "static-image.read"] as const;
export const CLAIM_STATUSES = ["SOURCE_IMPLEMENTED", "DOCUMENTED", "EXPERIMENT_VERIFIED", "PLANNED"] as const;

const REQUIRED = ["schemaVersion", "projectId", "slug", "version", "name", "summary", "category", "visibility", "integration", "capabilities", "researchClaims"] as const;
const CLAIM_REQUIRED = ["topic", "status", "description", "evidenceAssetIds"] as const;
const CLAIM_KEYS = [...CLAIM_REQUIRED, "modelVersion"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9-]{2,62}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export interface ManifestIssue {
  path: string;
  level: "error" | "warning";
  message: string;
}

export interface ManifestResult {
  ok: boolean;
  issues: ManifestIssue[];
  /** Present when the input parsed as a JSON object. */
  manifest?: Record<string, unknown>;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function checkText(issues: ManifestIssue[], path: string, value: unknown, max = 500) {
  if (typeof value !== "string") return void issues.push({ path, level: "error", message: "必须是字符串。" });
  if (value.trim().length < 1) return void issues.push({ path, level: "error", message: "不能为空。" });
  if (value.length > max) issues.push({ path, level: "error", message: `不能超过 ${max} 个字符。` });
}

function checkUnique(issues: ManifestIssue[], path: string, values: unknown[]) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) issues.push({ path: `${path}[${index}]`, level: "error", message: "与前面的项重复。" });
    seen.add(key);
  });
}

function checkClaim(issues: ManifestIssue[], claim: unknown, index: number) {
  const path = `researchClaims[${index}]`;
  if (!isObject(claim)) return void issues.push({ path, level: "error", message: "每条声明必须是对象。" });
  for (const key of Object.keys(claim)) {
    if (!(CLAIM_KEYS as readonly string[]).includes(key)) issues.push({ path: `${path}.${key}`, level: "error", message: "契约不允许的字段。" });
  }
  for (const key of CLAIM_REQUIRED) {
    if (!(key in claim)) issues.push({ path: `${path}.${key}`, level: "error", message: "缺少必填字段。" });
  }
  if ("topic" in claim) checkText(issues, `${path}.topic`, claim.topic);
  if ("description" in claim) checkText(issues, `${path}.description`, claim.description);
  if ("modelVersion" in claim) checkText(issues, `${path}.modelVersion`, claim.modelVersion);
  if ("status" in claim && !(CLAIM_STATUSES as readonly unknown[]).includes(claim.status)) {
    issues.push({ path: `${path}.status`, level: "error", message: `必须是 ${CLAIM_STATUSES.join(" / ")} 之一。` });
  }
  if ("evidenceAssetIds" in claim) {
    const ids = claim.evidenceAssetIds;
    if (!Array.isArray(ids)) issues.push({ path: `${path}.evidenceAssetIds`, level: "error", message: "必须是数组。" });
    else {
      if (ids.length > 100) issues.push({ path: `${path}.evidenceAssetIds`, level: "error", message: "最多 100 个证据资产。" });
      ids.forEach((id, i) => {
        if (typeof id !== "string" || !UUID.test(id)) issues.push({ path: `${path}.evidenceAssetIds[${i}]`, level: "error", message: "必须是 UUID。" });
      });
      checkUnique(issues, `${path}.evidenceAssetIds`, ids);
      if (claim.status === "EXPERIMENT_VERIFIED" && ids.length === 0) {
        issues.push({ path: `${path}.evidenceAssetIds`, level: "warning", message: "“实验已验证”的声明应附带至少一个证据资产，否则审核时会被要求补充。" });
      }
    }
  }
}

export function validateManifest(input: string): ManifestResult {
  const issues: ManifestIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "无法解析";
    return { ok: false, issues: [{ path: "$", level: "error", message: `不是有效的 JSON：${detail}` }] };
  }
  if (!isObject(parsed)) return { ok: false, issues: [{ path: "$", level: "error", message: "Manifest 必须是一个 JSON 对象。" }] };
  const m = parsed;

  for (const key of Object.keys(m)) {
    if (!(REQUIRED as readonly string[]).includes(key)) issues.push({ path: key, level: "error", message: "契约不允许的字段（additionalProperties: false）。" });
  }
  for (const key of REQUIRED) {
    if (!(key in m)) issues.push({ path: key, level: "error", message: "缺少必填字段。" });
  }

  if ("schemaVersion" in m && m.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", level: "error", message: `当前只接受 "${MANIFEST_SCHEMA_VERSION}"。` });
  }
  if ("projectId" in m && (typeof m.projectId !== "string" || !UUID.test(m.projectId))) {
    issues.push({ path: "projectId", level: "error", message: "必须是 UUID，由平台在创建项目时分配。" });
  }
  if ("slug" in m && (typeof m.slug !== "string" || !SLUG.test(m.slug))) {
    issues.push({ path: "slug", level: "error", message: "小写字母开头，只含小写字母、数字和连字符，长度 3–63。" });
  }
  if ("version" in m && (typeof m.version !== "string" || !SEMVER.test(m.version))) {
    issues.push({ path: "version", level: "error", message: "必须是 MAJOR.MINOR.PATCH 形式的语义化版本，例如 1.0.0。" });
  }
  if ("name" in m) checkText(issues, "name", m.name);
  if ("summary" in m) {
    checkText(issues, "summary", m.summary);
    if (typeof m.summary === "string" && m.summary.trim().length > 0 && m.summary.trim().length < 12) {
      issues.push({ path: "summary", level: "warning", message: "摘要过短，探索目录中可能难以理解项目用途。" });
    }
  }
  if ("category" in m && !(MANIFEST_CATEGORIES as readonly unknown[]).includes(m.category)) {
    issues.push({ path: "category", level: "error", message: `必须是 ${MANIFEST_CATEGORIES.join(" / ")} 之一。` });
  }
  if ("visibility" in m && !(MANIFEST_VISIBILITIES as readonly unknown[]).includes(m.visibility)) {
    issues.push({ path: "visibility", level: "error", message: "必须是 PRIVATE / UNLISTED / PUBLIC 之一。" });
  }
  if ("integration" in m) {
    const integration = m.integration;
    if (!isObject(integration)) issues.push({ path: "integration", level: "error", message: "必须是对象，例如 { \"mode\": \"SHOWCASE\" }。" });
    else {
      for (const key of Object.keys(integration)) {
        if (key !== "mode") issues.push({ path: `integration.${key}`, level: "error", message: "契约不允许的字段。" });
      }
      if (!("mode" in integration)) issues.push({ path: "integration.mode", level: "error", message: "缺少必填字段。" });
      else if (integration.mode !== "SHOWCASE") {
        const later = integration.mode === "REMOTE_API" || integration.mode === "EMBED";
        issues.push({ path: "integration.mode", level: "error", message: later ? "P0.5 只接受 SHOWCASE；受控嵌入（L1）与远程 API（L2）尚未开放。" : "必须是 \"SHOWCASE\"。" });
      }
    }
  }
  if ("capabilities" in m) {
    const caps = m.capabilities;
    if (!Array.isArray(caps)) issues.push({ path: "capabilities", level: "error", message: "必须是数组。" });
    else {
      if (caps.length < 1) issues.push({ path: "capabilities", level: "error", message: "至少声明 1 项能力。" });
      if (caps.length > 3) issues.push({ path: "capabilities", level: "error", message: "最多声明 3 项能力。" });
      caps.forEach((cap, index) => {
        if (!(MANIFEST_CAPABILITIES as readonly unknown[]).includes(cap)) {
          issues.push({ path: `capabilities[${index}]`, level: "error", message: `必须是 ${MANIFEST_CAPABILITIES.join(" / ")} 之一。` });
        }
      });
      checkUnique(issues, "capabilities", caps);
    }
  }
  if ("researchClaims" in m) {
    const claims = m.researchClaims;
    if (!Array.isArray(claims)) issues.push({ path: "researchClaims", level: "error", message: "必须是数组（可以为空）。" });
    else {
      if (claims.length > 40) issues.push({ path: "researchClaims", level: "error", message: "最多 40 条声明。" });
      claims.forEach((claim, index) => checkClaim(issues, claim, index));
      checkUnique(issues, "researchClaims", claims);
      if (m.category === "research" && claims.length === 0) {
        issues.push({ path: "researchClaims", level: "warning", message: "科研项目建议至少列出一条声明，并如实标注其验证状态。" });
      }
    }
  }

  return { ok: !issues.some((issue) => issue.level === "error"), issues, manifest: m };
}

/** A complete, valid example used to seed the editor. */
export const exampleManifest = `{
  "schemaVersion": "0.5.0",
  "projectId": "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  "slug": "sorting-lab",
  "version": "1.0.0",
  "name": "排序算法对照实验",
  "summary": "对比三种排序算法在四种输入分布下的比较次数。",
  "category": "algorithm",
  "visibility": "PUBLIC",
  "integration": { "mode": "SHOWCASE" },
  "capabilities": ["documentation.read", "presentation.read"],
  "researchClaims": [
    {
      "topic": "比较次数统计",
      "status": "EXPERIMENT_VERIFIED",
      "description": "比较器计数，结果可在浏览器中复现。",
      "evidenceAssetIds": ["0b6e3f9a-1c2d-4e5f-9a8b-7c6d5e4f3a2b"]
    }
  ]
}`;

/** Build a manifest from the new-project wizard's fields (always schema 0.5.0, SHOWCASE). */
export function buildManifest(fields: {
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  category: string;
  visibility: string;
  capabilities: string[];
}) {
  return JSON.stringify(
    {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      projectId: fields.projectId,
      slug: fields.slug,
      version: "0.1.0",
      name: fields.name,
      summary: fields.summary,
      category: fields.category,
      visibility: fields.visibility,
      integration: { mode: "SHOWCASE" },
      capabilities: fields.capabilities,
      researchClaims: [],
    },
    null,
    2,
  );
}

/** Derive a slug from a project name; non-Latin names fall back to a neutral prefix. */
export function slugify(name: string) {
  const ascii = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  if (/^[a-z][a-z0-9-]{2,62}$/.test(ascii)) return ascii;
  return ascii ? `project-${ascii}`.slice(0, 63) : "";
}
