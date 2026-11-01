import { describe, expect, it } from "vitest";

import type { ProjectSummaryDTO, ReleaseRecordDTO, ReleaseRequestDTO, ReviewDTO, VersionRead } from "@/features/developer-console/registry/contract";
import {
  WRITE_ACTIONS, actionLabel, draftAgreement, formatExpiry, orderProjects, orderReleases, orderRequests, orderReviews, orderVersions, reviewBinding,
} from "@/features/developer-console/registry/view";
import { ASSET_ROLES, DRAFT_ROLES, RELEASE_ROLES } from "@/features/developer-console/permissions";
import { REGISTRY_ACTION_ROLES } from "@/features/registry/read-contracts";
import { draftEtag, draftHead, draftRead, releases, requests, reviews, summary, uuid, versions } from "@/tests/fixtures/registry-console-read";

const byUuid = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

describe("Registry view ordering never trusts UUID page order", () => {
  it("orders each list by its own time field even when UUID order says the opposite", () => {
    // The fixtures are built so that UUID order is the reverse of time order.
    expect(byUuid(versions as VersionRead[]).map((item) => item.version)).toEqual(["1.1.0", "1.0.0"]);
    const older = { ...versions[1], id: uuid(1) } as VersionRead, newer = { ...versions[0], id: uuid(9) } as VersionRead;
    expect(orderVersions([older, newer]).map((item) => item.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(orderReleases([{ ...releases[1], id: uuid(1) }, { ...releases[0], id: uuid(9) }] as ReleaseRecordDTO[]).map((item) => item.publishedAt)).toEqual([releases[0].publishedAt, releases[1].publishedAt]);
    expect(orderRequests([{ ...requests[0], id: uuid(9) }, { ...requests[1], id: uuid(1) }] as ReleaseRequestDTO[]).map((item) => item.version)).toEqual(["1.0.0", "1.1.0"]);
    expect(orderReviews([{ ...reviews[1], id: uuid(1) }, { ...reviews[0], id: uuid(9) }] as ReviewDTO[]).map((item) => item.draftRevision)).toEqual([3, 1]);
    expect(orderProjects([{ ...summary, slug: "zeta-lab", id: uuid(1) }, { ...summary, slug: "alpha-lab", id: uuid(9) }] as ProjectSummaryDTO[]).map((item) => item.slug)).toEqual(["alpha-lab", "zeta-lab"]);
  });

  it("does not reorder or mutate the input", () => {
    const input = [...versions] as VersionRead[];
    const before = JSON.stringify(input);
    orderVersions(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("Registry view comparisons use only server values", () => {
  it("treats head and draft as one state only when ID, revision, ETag and hash agree", () => {
    const head = { data: draftHead as never, etag: draftEtag() };
    expect(draftAgreement(head, { data: draftRead as never, etag: draftEtag() })).toBe("same");
    expect(draftAgreement(head, { data: { ...draftRead, revision: 4 } as never, etag: draftEtag(4) })).toBe("changed");
    expect(draftAgreement(head, { data: draftRead as never, etag: draftEtag(4) })).toBe("changed");
    expect(draftAgreement(head, { data: { ...draftRead, contentHash: "e".repeat(64) } as never, etag: draftEtag() })).toBe("changed");
    expect(draftAgreement(head, { data: null, etag: null })).toBe("unknown");
  });

  it("binds a review to the current draft by hash and revision", () => {
    expect(reviewBinding(reviews[0] as ReviewDTO, draftHead as never)).toBe("current");
    expect(reviewBinding(reviews[1] as ReviewDTO, draftHead as never)).toBe("differs");
    expect(reviewBinding(reviews[0] as ReviewDTO, { ...draftHead, contentHash: null } as never)).toBe("unknown");
    expect(reviewBinding(reviews[0] as ReviewDTO, null)).toBe("unknown");
  });
});

describe("Registry view labels", () => {
  it("console role maps equal the shared Registry role map (C-4)", () => {
    const local = { ...DRAFT_ROLES, ...RELEASE_ROLES, ...ASSET_ROLES };
    expect(Object.keys(local).sort()).toEqual(Object.keys(REGISTRY_ACTION_ROLES).sort());
    for (const [action, roles] of Object.entries(REGISTRY_ACTION_ROLES)) expect([...local[action as keyof typeof local]].sort(), action).toEqual([...roles].sort());
  });

  it("labels every Registry action and lists every state-changing one as a write", () => {
    for (const action of Object.keys(REGISTRY_ACTION_ROLES) as (keyof typeof REGISTRY_ACTION_ROLES)[]) expect(actionLabel(action)).toMatch(/\S/);
    expect([...WRITE_ACTIONS].sort()).toEqual(Object.keys(REGISTRY_ACTION_ROLES).filter((action) => !action.startsWith("READ_")).sort());
  });

  it("formats qualification deadlines from minutes to days", () => {
    expect(formatExpiry(0)).toBe("已到期");
    expect(formatExpiry(-1)).toBe("已到期");
    expect(formatExpiry(30_000)).toBe("剩 1 分钟");
    expect(formatExpiry(59 * 60_000)).toBe("剩 59 分钟");
    expect(formatExpiry(90 * 60_000)).toBe("剩 1 小时 30 分");
    expect(formatExpiry(26 * 3_600_000)).toBe("剩 26 小时");
    expect(formatExpiry(72 * 3_600_000)).toBe("剩 3 天");
  });
});
