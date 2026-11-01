import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectShowcase } from "@/features/platform/components/showcase";
import { getPublicProject } from "@/features/platform/source";
import { comparisonTable } from "@/features/platform/sorting";
import { ExperimentView } from "@/features/research/components/experiment-view";
import { ExperimentReplay } from "@/features/research/components/experiment-replay";
import { ResearchIndex } from "@/features/research/components/research-index";
import { ResearchProjectView } from "@/features/research/components/research-project-view";
import { researchProjects } from "@/features/research/fixtures";
import { experimentSegment, RESEARCH_FIXTURE_LABEL } from "@/features/research/labels";
import { compareOutcomes, formatResult, replayKinds, replaySpecs, runReplay, scanTwoOpt, withinTolerance, type ReplayOutcome } from "@/features/research/replays";
import { requirementIds } from "@/features/research/requirements";
import {
  experimentHref,
  experimentParams,
  getExperiment,
  getResearchProject,
  linkedShowcaseProject,
  listExperimentSummaries,
  referenceOutcome,
  researchHrefForShowcase,
} from "@/features/research/source";

const root = process.cwd();
const entities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#x27;": "'", "&amp;": "&" };
const visibleText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&(?:lt|gt|quot|#x27|amp);/g, (entity) => entities[entity]);
const allExperiments = researchProjects.flatMap((project) => project.experiments.map((experiment) => ({ project, experiment })));

describe("research fixtures", () => {
  it("uses unique project slugs, claim ids and experiment ids", () => {
    const slugs = researchProjects.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const experimentIds = allExperiments.map(({ experiment }) => experiment.id);
    expect(new Set(experimentIds).size).toBe(experimentIds.length);
    for (const id of experimentIds) expect(id).toMatch(/^[A-Z]+-\d{2}$/);
    for (const project of researchProjects) {
      const claimIds = project.claims.map((claim) => claim.id);
      expect(new Set(claimIds).size).toBe(claimIds.length);
      for (const id of claimIds) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("links every experiment to claims of its own project", () => {
    for (const { project, experiment } of allExperiments) {
      expect(experiment.claimIds.length, experiment.id).toBeGreaterThan(0);
      for (const id of experiment.claimIds) expect(project.claims.map((claim) => claim.id), experiment.id).toContain(id);
    }
  });

  it("keeps status, replay, criterion and pending reasons consistent", () => {
    for (const { experiment } of allExperiments) {
      const { status, id } = experiment;
      if (status === "REPRODUCIBLE") {
        expect(experiment.replay, id).toBeDefined();
        expect(experiment.site, id).toBe("browser");
        expect(experiment.criterion, id).toBeTruthy();
        expect(["exact", "tolerance"], id).toContain(experiment.reproducibility.level);
        expect(experiment.pending, id).toBeUndefined();
      } else {
        expect(experiment.replay, id).toBeUndefined();
      }
      if (status === "TEST_COVERED") {
        expect(experiment.site, id).toBe("ci");
        expect(experiment.reproducibility.level, id).toBe("tests");
        expect(experiment.reproducibility.command, id).toMatch(/^pnpm vitest run /);
        expect(experiment.evidence.some((item) => item.kind === "test"), id).toBe(true);
      }
      if (status === "PLANNED" || status === "BLOCKED") {
        expect(experiment.reproducibility.level, id).toBe("none");
        expect(experiment.pending?.reason, id).toBeTruthy();
        expect(experiment.pending?.requires.length, id).toBeGreaterThan(0);
        for (const requirement of experiment.pending?.requires ?? []) expect(requirementIds, id).toContain(requirement);
        expect(["server", "gpu"], id).toContain(experiment.site);
      }
    }
  });

  it("states the same claims, statuses and provenance as the linked Showcase project", () => {
    for (const project of researchProjects) {
      expect(project.showcaseSlug, project.slug).toBeDefined();
      const showcase = getPublicProject(project.showcaseSlug!).data;
      expect(showcase, project.slug).toBeDefined();
      expect(project.provenance).toBe(showcase!.provenance);
      const research = project.claims.map((claim) => [claim.topic, claim.status]).sort();
      const published = showcase!.claims.map((claim) => [claim.topic, claim.status]).sort();
      expect(research).toEqual(published);
    }
  });

  it("cites evidence and code that exist in this repository", () => {
    const evidence = researchProjects.flatMap((project) => [...project.claims.flatMap((claim) => claim.evidence), ...project.experiments.flatMap((experiment) => experiment.evidence)]);
    for (const item of evidence) {
      if (item.availability !== "open") {
        expect(item.ref, item.label).toBeUndefined();
        continue;
      }
      expect(item.ref, item.label).toBeTruthy();
      if (item.kind === "doc") {
        expect(item.ref).toMatch(/^\/docs\//);
        continue;
      }
      const path = join(root, item.ref!);
      expect(existsSync(path), item.ref).toBe(true);
      // A cited test is named by its title (or describe block) as written in the file.
      if (item.kind === "test") expect(readFileSync(path, "utf8"), item.label).toContain(item.label.replace(/ 测试组$/, ""));
    }
    for (const { experiment } of allExperiments) {
      for (const entry of experiment.environment.entry) {
        const path = join(root, entry.path);
        expect(existsSync(path), entry.path).toBe(true);
        expect(readFileSync(path, "utf8"), `${entry.path} exports ${entry.symbol}`).toMatch(new RegExp(`export (?:async )?(?:function|class|const) ${entry.symbol}\\b`));
      }
    }
  });

  it("records dependency versions that match package.json", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { engines: { node: string }; devDependencies: Record<string, string> };
    const expected: Record<string, string> = { TypeScript: pkg.devDependencies.typescript, Vitest: pkg.devDependencies.vitest, "Node.js": pkg.engines.node };
    for (const { experiment } of allExperiments) {
      for (const dependency of experiment.environment.dependencies) {
        if (dependency.name in expected) expect(dependency.version, `${experiment.id} ${dependency.name}`).toBe(expected[dependency.name]);
      }
    }
  });

  it("only links PUBLIC Showcase projects, both ways", () => {
    for (const project of researchProjects) {
      expect(getPublicProject(project.showcaseSlug!).data?.visibility).toBe("PUBLIC");
      expect(researchHrefForShowcase(project.showcaseSlug!)).toBe(`/research/${project.slug}`);
    }
    expect(researchHrefForShowcase("ai-generator")).toBeUndefined();
    expect(researchHrefForShowcase("research-notes")).toBeUndefined();
  });
});

describe("replay harnesses", () => {
  it.each(replayKinds)("%s is deterministic and passes every check at the reference seed", (kind) => {
    const first = runReplay(kind);
    const second = runReplay(kind);
    expect(second).toEqual(first);
    expect(first.checks.length).toBeGreaterThan(0);
    expect(first.checks.every((check) => check.pass)).toBe(true);
    const comparison = compareOutcomes(first, second);
    expect(comparison).toMatchObject({ comparable: true, valuesAgree: true, checksAgree: true });
    for (const row of first.rows) for (const column of first.columns) expect(Number.isFinite(row.values[column.key])).toBe(true);
  });

  it.each(replayKinds)("%s still meets its criterion on other seeds", (kind) => {
    for (const seed of [1, 42, 99_999]) expect(runReplay(kind, seed).checks.every((check) => check.pass), `${kind} seed ${seed}`).toBe(true);
  });

  it("rejects seeds outside the documented range", () => {
    for (const kind of replayKinds) {
      const [min, max] = replaySpecs[kind].seedRange;
      expect(() => runReplay(kind, min - 1)).toThrow(RangeError);
      expect(() => runReplay(kind, max + 1)).toThrow(RangeError);
      expect(() => runReplay(kind, 1.5)).toThrow(RangeError);
    }
  });

  it("counts the same comparisons as the Showcase benchmark table", () => {
    const outcome = runReplay("sorting-comparisons");
    const table = comparisonTable(64, 2026);
    expect(outcome.rows.map((row) => outcome.columns.map((column) => row.values[column.key]))).toEqual(table.map((row) => row.counts));
  });

  it("finds an improving 2-opt move on a crossed tour and none on a convex one", () => {
    const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const d = new Float64Array(16);
    square.forEach(([x1, y1], i) => square.forEach(([x2, y2], j) => { d[i * 4 + j] = Math.hypot(x1 - x2, y1 - y2); }));
    expect(scanTwoOpt([0, 2, 1, 3], d, 4)).toMatchObject({ checked: 2, improving: 1 });
    expect(scanTwoOpt([0, 1, 2, 3], d, 4)).toMatchObject({ checked: 2, improving: 0 });
  });

  it("marks values outside tolerance and changed verdicts", () => {
    const reference = runReplay("route-bound");
    const shifted: ReplayOutcome = structuredClone(reference);
    shifted.rows[0].values.orOpt *= 1 + 1e-6;
    const comparison = compareOutcomes(reference, shifted);
    expect(comparison.valuesAgree).toBe(false);
    expect(comparison.cells[`${reference.rows[0].key}:orOpt`]).toBe(false);
    expect(comparison.cells[`${reference.rows[0].key}:bound`]).toBe(true);

    const flipped: ReplayOutcome = structuredClone(reference);
    flipped.checks[0].pass = false;
    expect(compareOutcomes(reference, flipped)).toMatchObject({ valuesAgree: true, checksAgree: false });

    const reshaped: ReplayOutcome = { ...structuredClone(reference), rows: reference.rows.slice(1) };
    expect(compareOutcomes(reference, reshaped).comparable).toBe(false);
  });

  it("applies exact, relative and absolute tolerances", () => {
    expect(withinTolerance(303, 303, { kind: "exact" })).toBe(true);
    expect(withinTolerance(303, 304, { kind: "exact" })).toBe(false);
    expect(withinTolerance(1000, 1000 + 1e-7, { kind: "relative", value: 1e-9 })).toBe(true);
    expect(withinTolerance(1000, 1000.01, { kind: "relative", value: 1e-9 })).toBe(false);
    expect(withinTolerance(3e-8, 4e-8, { kind: "absolute", value: 5e-7 })).toBe(true);
    expect(withinTolerance(Number.NaN, 1, { kind: "absolute", value: 1 })).toBe(false);
  });

  it("formats integers, fixed values and scientific notation", () => {
    expect(formatResult(11025, { format: "int" })).toBe("11,025");
    expect(formatResult(8901.303, { format: "fixed", digits: 1 })).toBe("8,901.3");
    expect(formatResult(15.2924, { format: "percent", digits: 2 })).toBe("15.29");
    expect(formatResult(3.5168e-11, { format: "sci", digits: 2 })).toBe("3.52 × 10⁻¹¹");
    expect(formatResult(Number.NaN, { format: "int" })).toBe("—");
  });
});

describe("research pages", () => {
  it("renders the index with every project and experiment, labelled as fixture data", () => {
    const html = renderToStaticMarkup(createElement(ResearchIndex));
    const text = visibleText(html);
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(text).toContain(RESEARCH_FIXTURE_LABEL);
    for (const project of researchProjects) {
      expect(text).toContain(project.title);
      expect(html).toContain(`href="/research/${project.slug}"`);
    }
    for (const summary of listExperimentSummaries()) {
      expect(text).toContain(summary.id);
      expect(html).toContain(`href="${summary.href}"`);
    }
  });

  it.each(researchProjects.map((project) => [project.slug, project] as const))("%s renders its claim ledger and experiment records", (slug, project) => {
    const html = renderToStaticMarkup(createElement(ResearchProjectView, { project, showcase: linkedShowcaseProject(project) }));
    const text = visibleText(html);
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(html).toContain(`href="/explore/${project.showcaseSlug}"`);
    for (const claim of project.claims) {
      expect(html).toContain(`id="claim-${claim.id}"`);
      expect(text).toContain(claim.topic);
    }
    for (const experiment of project.experiments) expect(html).toContain(`href="${experimentHref(slug, experiment.id)}"`);
    if (project.provenance === "sample") expect(text).toContain("示例项目");
  });

  it.each(allExperiments.map(({ project, experiment }) => [`${project.slug}/${experiment.id}`, project, experiment] as const))("%s renders an honest record", (_path, project, experiment) => {
    const html = renderToStaticMarkup(createElement(ExperimentView, { project, experiment, showcase: linkedShowcaseProject(project) }));
    const text = visibleText(html);
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(text).toContain(experiment.title);
    for (const step of experiment.method) expect(text).toContain(step);
    for (const parameter of experiment.parameters) expect(text).toContain(parameter.value);
    for (const entry of experiment.environment.entry) expect(text).toContain(entry.symbol);
    expect(text).toContain(`${experiment.protocol.version} · ${experiment.protocol.defined}`);

    const reference = referenceOutcome(experiment);
    if (reference) {
      expect(text).toContain("参考结果 · 构建时计算");
      expect(text).toContain("在本机运行");
      for (const row of reference.rows) for (const column of reference.columns) expect(text).toContain(formatResult(row.values[column.key], column));
      for (const check of reference.checks) expect(text).toContain(check.label);
    } else {
      // No reference result: no result table, no replay, no numbers to misread.
      expect(html).not.toContain("<table");
      expect(text).not.toContain("在本机运行");
      expect(text).not.toContain("参考结果 · 构建时计算");
    }
    if (experiment.status === "TEST_COVERED") expect(text).toContain(experiment.reproducibility.command!);
    if (experiment.pending) {
      expect(text).toContain("没有结果");
      for (const id of experiment.pending.requires) expect(text).toContain(id);
    }
  });

  it("starts the browser replay idle, without running anything during render", () => {
    const experiment = getExperiment("sorting-lab", "sort-01")!.experiment;
    const html = renderToStaticMarkup(createElement(ExperimentReplay, { kind: experiment.replay!, reference: referenceOutcome(experiment)! }));
    expect(visibleText(html)).toContain("尚未运行");
    expect(html).not.toContain("<table");
  });

  it("never offers a server run: no forms posting anywhere, no API links, no network code", () => {
    const pages = [
      renderToStaticMarkup(createElement(ResearchIndex)),
      ...researchProjects.map((project) => renderToStaticMarkup(createElement(ResearchProjectView, { project, showcase: linkedShowcaseProject(project) }))),
      ...allExperiments.map(({ project, experiment }) => renderToStaticMarkup(createElement(ExperimentView, { project, experiment, showcase: linkedShowcaseProject(project) }))),
    ];
    for (const html of pages) {
      expect(html).not.toMatch(/<form[^>]*\saction=/i);
      expect(html).not.toMatch(/method="post"/i);
      expect(html).not.toMatch(/href="\/api\//);
    }
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) sources.push(readFileSync(path, "utf8"));
      }
    };
    walk(join(root, "features/research"));
    walk(join(root, "app/research"));
    for (const source of sources) expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|EventSource|new Worker|["'`]\/api\//);
  });

  it("serves only known projects and experiments", () => {
    expect(experimentParams()).toHaveLength(allExperiments.length);
    for (const { slug, experiment } of experimentParams()) {
      expect(experiment).toBe(experiment.toLowerCase());
      expect(getExperiment(slug, experiment)).toBeDefined();
    }
    expect(getExperiment("route-optimizer", "ROUTE-01")).toBeUndefined();
    expect(getExperiment("route-optimizer", experimentSegment("SORT-01"))).toBeUndefined();
    expect(getResearchProject("research-notes").data).toBeUndefined();
    expect(getResearchProject("not-a-project").data).toBeUndefined();
  });

  it("links the Showcase project page to its research record only when one exists", () => {
    const route = getPublicProject("route-optimizer").data!;
    const withLink = renderToStaticMarkup(createElement(ProjectShowcase, { project: route, related: [], researchHref: "/research/route-optimizer" }));
    expect(withLink).toContain('href="/research/route-optimizer"');
    expect(withLink).toContain("研究记录");
    expect(renderToStaticMarkup(createElement(ProjectShowcase, { project: route, related: [] }))).not.toContain("研究记录");
  });
});
