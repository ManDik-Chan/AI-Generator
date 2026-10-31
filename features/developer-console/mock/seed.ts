/*
 * MOCK seed for the developer console. Every record here is sample data.
 *
 * The four projects are the viewer-owned samples of features/platform/fixtures.ts, so names,
 * versions and release history agree with the demo project pages. Each one starts at a
 * different point of the pipeline:
 *
 *   sorting-lab            1.0.0 released · 0.9.0 withdrawn · next draft 1.1.0 being edited
 *   air-quality            0.1.0 released (UNLISTED) · 0.2.0 submitted, waiting for a reviewer
 *   volume-reconstruction  0.3.0 released · 0.2.0 superseded · 0.1.0 withdrawn · draft frozen
 *   research-notes         PRIVATE · the empty B1 draft, never edited (DRAFT_UNINITIALIZED)
 *
 * Time is a fixed mock clock (SEED_EPOCH) so server and client render the same markup.
 */
import { contentHash, mockUuid } from "@/features/developer-console/content-hash";
import type { ConsolePersona, ConsoleRole, ConsoleVisibility, DraftPayload, VersionDTO } from "@/features/developer-console/model";
import { HASH_ALGORITHM, POLICY_REVISION, REVIEW_TTL_MS, iso, type MockState, type StoredDraft, type StoredProject, type StoredRelease, type StoredReview } from "@/features/developer-console/mock/engine";

/** 2026-10-31 09:00 Beijing time. */
export const SEED_EPOCH = Date.UTC(2026, 9, 31, 1, 0, 0);
const minutes = (n: number) => n * 60 * 1000;
const days = (n: number) => n * 24 * 60 * 60 * 1000;

export const personas: ConsolePersona[] = [
  { id: "you", name: "你", note: "当前开发者，四个示例项目的所有者" },
  { id: "coauthor", name: "示例协作者", note: "排序实验的编辑，可修改草稿" },
  { id: "reviewer", name: "示例审核人", note: "独立审核人；在体数据项目里也负责发布" },
  { id: "guest", name: "示例访客成员", note: "只读成员，什么都不能改" },
];

export const DEFAULT_PERSONA = "you";

interface PayloadSpec {
  slug: string;
  version: string;
  name: string;
  summary: string;
  category: DraftPayload["manifest"]["category"];
  visibility: ConsoleVisibility;
  overview: string;
  metrics?: string[];
  claim?: { topic: string; status: "SOURCE_IMPLEMENTED" | "DOCUMENTED" | "PLANNED"; description: string };
}

export const projectIdFor = (slug: string) => mockUuid(`project:${slug}`);

/** A DraftPayload that satisfies draftPayloadSchema (checked in engine.test.ts). No asset references. */
export function buildPayload(spec: PayloadSpec): DraftPayload {
  const projectId = projectIdFor(spec.slug);
  const sections: DraftPayload["presentation"]["sections"] = [
    { id: "overview", kind: "MARKDOWN", title: "概览", body: spec.overview, sourceAssetIds: [] },
  ];
  if (spec.metrics?.length) {
    sections.push({ id: "benchmarks", kind: "BENCHMARKS", title: "基准", metrics: spec.metrics.map((name) => ({ name, status: "UNPUBLISHED" as const })) });
  }
  return {
    manifest: {
      schemaVersion: "0.5.0", projectId, slug: spec.slug, version: spec.version, name: spec.name, summary: spec.summary,
      category: spec.category, visibility: spec.visibility, integration: { mode: "SHOWCASE" },
      capabilities: ["presentation.read", "documentation.read"],
      researchClaims: spec.claim ? [{ ...spec.claim, evidenceAssetIds: [] }] : [],
    },
    presentation: { schemaVersion: "0.5.0", projectId, version: spec.version, title: spec.name, sections },
    documentation: [],
  };
}

interface HistoryEntry {
  spec: PayloadSpec;
  sealedAt: number;
  /** Release lifecycle of this version, if it was released. */
  released?: { at: number; withdrawnAt?: number; intent?: "PUBLISH" | "ROLLBACK" };
}

interface ProjectSpec {
  slug: string;
  name: string;
  members: Record<string, ConsoleRole[]>;
  history: HistoryEntry[];
  /** Id of the history entry whose release is current, by version string. */
  current?: string;
  /** The active draft after the history. */
  draft:
    | { kind: "frozen" }
    | { kind: "uninitialized"; createdAt: number }
    | { kind: "editing"; spec: PayloadSpec; revision: number; createdAt: number }
    | { kind: "in-review"; spec: PayloadSpec; revision: number; createdAt: number; submittedAt: number; submitter: string };
}

function buildProject(spec: ProjectSpec): StoredProject {
  const id = projectIdFor(spec.slug);
  const drafts: StoredDraft[] = [];
  const reviews: StoredReview[] = [];
  const versions: VersionDTO[] = [];
  const releases: StoredRelease[] = [];
  let revision = 1;
  let epoch = 1;

  spec.history.forEach((entry, index) => {
    const payload = buildPayload(entry.spec);
    const hash = contentHash(payload);
    const draftId = mockUuid(`seed-draft:${spec.slug}:${index}`);
    const reviewId = mockUuid(`seed-review:${spec.slug}:${index}`);
    // Seeded history: edit (rev 2) → submit (rev 3) → seal (rev 4).
    drafts.push({ id: draftId, revision: 4, state: "PUBLISHED", payload, createdAt: entry.sealedAt - days(2) });
    reviews.push({
      id: reviewId, draftId, draftRevision: 3, authzEpoch: epoch, contentHash: hash, visibility: entry.spec.visibility,
      submitterId: "you", reviewerId: "reviewer", decision: "APPROVED", decidedAt: entry.sealedAt - minutes(5), policyRevision: POLICY_REVISION,
      expiresAt: entry.sealedAt - minutes(12) + REVIEW_TTL_MS, createdAt: entry.sealedAt - minutes(12),
    });
    const versionId = mockUuid(`seed-version:${spec.slug}:${index}`);
    versions.push({ id: versionId, projectId: id, version: entry.spec.version, snapshot: payload, contentHash: hash, hashAlgorithm: HASH_ALGORITHM, reviewId, createdAt: iso(entry.sealedAt) });
    if (entry.released) {
      releases.push({
        id: mockUuid(`seed-release:${spec.slug}:${index}`), versionId, contentHash: hash, visibilityAtApproval: entry.spec.visibility,
        publishedAt: entry.released.at, withdrawnAt: entry.released.withdrawnAt ?? null, intent: entry.released.intent ?? "PUBLISH",
      });
      revision += entry.released.withdrawnAt ? 2 : 1;
    }
  });

  const currentIndex = spec.history.findIndex((entry) => entry.spec.version === spec.current);
  const current = currentIndex >= 0 ? releases.find((release) => release.versionId === versions[currentIndex].id) : undefined;
  const visibility: ConsoleVisibility = current ? current.visibilityAtApproval : "PRIVATE";
  // Going from PRIVATE to the released visibility advanced the epoch once. Sealed reviews
  // keep the epoch they were bound to; only the open review below must match the current one.
  if (visibility !== "PRIVATE") epoch += 1;

  const draft = spec.draft;
  if (draft.kind === "uninitialized") {
    drafts.push({ id: mockUuid(`seed-draft:${spec.slug}:active`), revision: 1, state: "DRAFT", payload: null, createdAt: draft.createdAt });
  } else if (draft.kind === "editing") {
    drafts.push({ id: mockUuid(`seed-draft:${spec.slug}:active`), revision: draft.revision, state: "DRAFT", payload: buildPayload(draft.spec), createdAt: draft.createdAt });
  } else if (draft.kind === "in-review") {
    const payload = buildPayload(draft.spec);
    const draftId = mockUuid(`seed-draft:${spec.slug}:active`);
    drafts.push({ id: draftId, revision: draft.revision, state: "IN_REVIEW", payload, createdAt: draft.createdAt });
    reviews.push({
      id: mockUuid(`seed-review:${spec.slug}:active`), draftId, draftRevision: draft.revision, authzEpoch: epoch, contentHash: contentHash(payload),
      visibility: draft.spec.visibility, submitterId: draft.submitter, reviewerId: null, decision: "PENDING", decidedAt: null,
      policyRevision: POLICY_REVISION, expiresAt: draft.submittedAt + REVIEW_TTL_MS, createdAt: draft.submittedAt,
    });
  }

  return {
    id, slug: spec.slug, name: spec.name, visibility, authzEpoch: epoch, revision, currentReleaseId: current?.id ?? null,
    members: spec.members, drafts, reviews, invalidations: {}, versions, requests: [], releases, receipts: {},
  };
}

const sortingSpec = (version: string, summary: string, overview: string): PayloadSpec => ({
  slug: "sorting-lab", version, name: "排序算法对照实验", summary, category: "algorithm", visibility: "PUBLIC", overview,
  metrics: ["比较次数", "运行时间"],
  claim: { topic: "比较次数计数", status: "SOURCE_IMPLEMENTED", description: "三种算法共用同一个比较计数器，结果由页面代码当场计算。" },
});

const volumeSpec = (version: string, overview: string): PayloadSpec => ({
  slug: "volume-reconstruction", version, name: "体数据三维重建", summary: "在浏览器里用合成体数据演示分割与三维重建流程。非临床，不处理真实医学影像。",
  category: "research", visibility: "PUBLIC", overview, metrics: ["Dice 系数", "单例推理时延"],
  claim: { topic: "合成数据", status: "DOCUMENTED", description: "全部输入由程序生成，不含任何真实影像。" },
});

const airSpec = (version: string, overview: string): PayloadSpec => ({
  slug: "air-quality", version, name: "城市空气质量摘要", summary: "输入城市与日期，返回空气质量摘要。数据去向写在最前面。",
  category: "web-service", visibility: "UNLISTED", overview,
  claim: { topic: "数据来源", status: "DOCUMENTED", description: "开发者说明了上游公开数据源，平台尚未核验。" },
});

export function createSeedState(): MockState {
  const t = SEED_EPOCH;
  const projects = [
    buildProject({
      slug: "sorting-lab", name: "排序算法对照实验",
      members: { you: ["OWNER", "EDITOR"], coauthor: ["EDITOR"], reviewer: ["REVIEWER"], guest: ["VIEWER"] },
      history: [
        { spec: sortingSpec("0.9.0", "插入、归并与快速排序的比较次数对照（预览）。", "预览版：三种算法在三种输入分布上的比较次数。"), sealedAt: t - days(9), released: { at: t - days(9) + minutes(30), withdrawnAt: t - days(7) } },
        { spec: sortingSpec("1.0.0", "插入、归并与快速排序在四种输入分布上的比较次数对照。", "新增大量重复值分布与逐步可视化；比较次数由页面代码当场计算。"), sealedAt: t - days(1), released: { at: t - days(1) + minutes(20) } },
      ],
      current: "1.0.0",
      draft: { kind: "editing", revision: 2, createdAt: t - days(1) + minutes(40), spec: sortingSpec("1.1.0", "插入、归并、快速排序与堆排序在四种输入分布上的比较次数对照。", "计划加入堆排序，并给出每种分布下的最坏情况说明。") },
    }),
    buildProject({
      slug: "air-quality", name: "城市空气质量摘要",
      members: { you: ["OWNER", "EDITOR"], reviewer: ["REVIEWER"], guest: ["VIEWER"] },
      history: [
        { spec: airSpec("0.1.0", "展示接口说明与数据去向。远程 API（L2）尚未开放，本版本只包含展示内容。"), sealedAt: t - days(30), released: { at: t - days(30) + minutes(15) } },
      ],
      current: "0.1.0",
      draft: { kind: "in-review", revision: 3, createdAt: t - days(1), submittedAt: t - minutes(3), submitter: "you", spec: airSpec("0.2.0", "补充异步任务的状态说明与授权范围。Manifest 0.5.0 只接受 SHOWCASE，远程调用仍在规划中。") },
    }),
    buildProject({
      slug: "volume-reconstruction", name: "体数据三维重建",
      members: { you: ["OWNER", "EDITOR"], reviewer: ["REVIEWER", "PUBLISHER"], guest: ["VIEWER"] },
      history: [
        { spec: volumeSpec("0.1.0", "首个版本：数据说明不完整，审核后撤回。"), sealedAt: t - days(35), released: { at: t - days(35) + minutes(10), withdrawnAt: t - days(33) } },
        { spec: volumeSpec("0.2.0", "补充模型卡与适用范围、限制说明。"), sealedAt: t - days(14), released: { at: t - days(14) + minutes(10) } },
        { spec: volumeSpec("0.3.0", "交互实验室：三平面切片、掩膜叠加与点云三维预览。"), sealedAt: t - days(3), released: { at: t - days(3) + minutes(10) } },
      ],
      current: "0.3.0",
      draft: { kind: "frozen" },
    }),
    buildProject({
      slug: "research-notes", name: "研究笔记工作区",
      members: { you: ["OWNER"] },
      history: [],
      draft: { kind: "uninitialized", createdAt: t - days(3) },
    }),
  ];
  return { projects, qualified: Object.fromEntries(personas.map((persona) => [persona.id, true])), seq: 0 };
}

/** First valid payload for a project whose draft was never edited. */
export function initialPayloadFor(slug: string, name: string): DraftPayload {
  return buildPayload({
    slug, version: "0.0.1", name, summary: "私有项目：只有成员可见。", category: "other", visibility: "PRIVATE",
    overview: "把一个长期问题的资料、对话和结论放在一起。",
  });
}

/** Slugs that have a release desk; used for static params and 404s. */
export const consoleProjectSlugs = (): string[] => createSeedState().projects.map((project) => project.slug);
export const consoleProjectName = (slug: string) => createSeedState().projects.find((project) => project.slug === slug)?.name;
