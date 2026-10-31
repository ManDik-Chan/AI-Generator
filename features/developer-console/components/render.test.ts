/*
 * Server-renders every console screen in Node. Browser automation is paused for this
 * repository (AGENTS.md), so this is the check that each screen renders without throwing,
 * prints no undefined/NaN, labels its mock data, and produces the same markup on every
 * render (the mock clock is fixed until the page is interactive).
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessView } from "@/features/developer-console/components/access-view";
import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";
import type { DeskApi, Gate } from "@/features/developer-console/components/desk-kit";
import { IntegrateView } from "@/features/developer-console/components/integrate-view";
import { ReviewPanel } from "@/features/developer-console/components/pipeline-panels";
import { ReleaseDesk } from "@/features/developer-console/components/release-desk";
import { Workbench } from "@/features/developer-console/components/workbench";
import { execute, projectView } from "@/features/developer-console/mock/engine";
import { SEED_EPOCH, consoleProjectSlugs, createSeedState, projectIdFor } from "@/features/developer-console/mock/seed";
import { requiredRoles, roleLabels, rolesAllow } from "@/features/developer-console/permissions";

const base = "/platform/developer";
const render = (page: ReactElement) => renderToStaticMarkup(createElement(ConsoleProvider, null, createElement(ConsoleHeader, { base }), page));
const visibleText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");

function expectClean(html: string) {
  const text = visibleText(html);
  expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
  expect(html).toContain("Mock 数据源");
}

describe("developer console screens render on the server", () => {
  it("workbench lists every mock project and the live demos", () => {
    const html = render(createElement(Workbench, { base, projectsBase: "/platform/projects" }));
    expectClean(html);
    for (const slug of consoleProjectSlugs()) expect(html).toContain(`${base}/projects/${slug}`);
    expect(html).toContain("/demos/route-optimizer");
    expect(html).toContain("接口就绪度");
  });

  it.each(consoleProjectSlugs())("release desk for %s", (slug) => {
    const html = render(createElement(ReleaseDesk, { slug, base, projectsBase: "/platform/projects" }));
    expectClean(html);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("协议日志");
    expect(render(createElement(ReleaseDesk, { slug, base, projectsBase: "/platform/projects" }))).toBe(html); // deterministic
  });

  it("the uninitialized draft explains DRAFT_UNINITIALIZED instead of showing a form", () => {
    const html = render(createElement(ReleaseDesk, { slug: "research-notes", base, projectsBase: "/platform/projects" }));
    expect(html).toContain("草稿尚未初始化");
    expect(html).toContain("DRAFT_UNINITIALIZED");
  });

  it("a pending review shows a countdown and the self-review rule for its submitter", () => {
    const html = render(createElement(ReleaseDesk, { slug: "air-quality", base, projectsBase: "/platform/projects" }));
    expect(visibleText(html)).toMatch(/剩\s+12:00/);
    expect(html).toContain("需要「审核」角色");
    // Approve and reject share one gate, so the explanation is shown once for the pair.
    expect(html.match(/仍然发送，查看拒绝响应/g)).toHaveLength(1);
  });

  it("after approval, seal and withdraw denied for the same reason share one explanation", () => {
    const seed = createSeedState();
    const before = projectView(seed, "air-quality", "reviewer", SEED_EPOCH)!;
    const review = before.reviews[0];
    const { state, result } = execute(seed, "reviewer", { action: "DECIDE_REVIEW", projectId: projectIdFor("air-quality"), ifMatch: before.draft.etag, idempotencyKey: "render_test_approve", input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } }, SEED_EPOCH);
    expect(result.ok).toBe(true);
    const view = projectView(state, "air-quality", "reviewer", SEED_EPOCH)!;
    const roles = view.members.find((member) => member.personaId === "reviewer")!.roles;
    // Same reason text the release desk builds for a missing project role.
    const gate = (action: Parameters<DeskApi["gate"]>[0]): Gate => rolesAllow(roles, action) ? { allowed: true } : { allowed: false, reason: `需要「${requiredRoles(action).map((role) => roleLabels[role]).join("」或「")}」角色` };
    const api: DeskApi = { view, personaId: "reviewer", roles, personas: [], now: SEED_EPOCH, pending: null, last: null, markOrigin: () => {}, gate, send: async () => result, switchPersona: () => {}, personaName: (id) => id };
    const html = renderToStaticMarkup(createElement(ConsoleProvider, null, createElement(ReviewPanel, { api }))); // provider supplies the countdown clock
    expect(html).toContain("封存为 v0.2.0");
    expect(html).toContain("撤回审核");
    expect(html.match(/仍然发送，查看拒绝响应/g)).toHaveLength(1);
  });

  it("a frozen draft does not warn that its own sealed version number is taken", () => {
    const html = render(createElement(ReleaseDesk, { slug: "volume-reconstruction", base, projectsBase: "/platform/projects" }));
    expect(html).toContain("已封存");
    expect(html).not.toContain("这个版本号已被封存过");
  });

  it("integration page lists the live Demo API from its OpenAPI builder", () => {
    const html = renderToStaticMarkup(createElement(IntegrateView, { base }));
    expect(visibleText(html)).not.toMatch(/\bundefined\b|\bNaN\b/);
    expect(html).toContain("/api/demo/v1/capabilities");
    expect(html).toContain("createRun");
    expect(html).toContain('id="manifest"');
  });

  it("access page shows the DTO fields read from the merged contracts", () => {
    const html = render(createElement(AccessView, { base, connectionsHref: "/platform/connections" }));
    expectClean(html);
    for (const field of ["revision", "payload", "contentHash", "hashAlgorithm", "publishedAt"]) expect(html).toContain(field);
    expect(html).not.toMatch(/>ownerId</);
  });
});
