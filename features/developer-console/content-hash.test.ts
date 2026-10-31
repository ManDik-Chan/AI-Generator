import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalJson, contentHash, mockUuid, sha256Hex } from "@/features/developer-console/content-hash";
import { createSeedState, initialPayloadFor } from "@/features/developer-console/mock/seed";
import { canonicalize, hashSnapshot } from "@/features/registry/canonical";

const vectors = JSON.parse(readFileSync("tests/fixtures/registry-jcs-vectors.json", "utf8")) as {
  vectors: { id: string; inputText: string; canonical: string; sha256: string }[];
};

describe("browser SHA-256", () => {
  const samples = ["", "a", "abc", "排序算法对照实验", "😀 emoji", "x".repeat(55), "x".repeat(56), "x".repeat(63), "x".repeat(64), "x".repeat(65), "混合 mixed ".repeat(300)];
  it.each(samples.map((sample) => [sample.slice(0, 12), sample]))("matches node:crypto for %j", (_label, sample) => {
    expect(sha256Hex(sample)).toBe(createHash("sha256").update(sample, "utf8").digest("hex"));
  });
});

describe("browser canonical JSON matches the Registry's RFC 8785 implementation", () => {
  it.each(vectors.vectors)("golden vector $id", ({ inputText, canonical, sha256 }) => {
    expect(canonicalJson(JSON.parse(inputText))).toBe(canonical);
    expect(sha256Hex(canonical)).toBe(sha256);
  });

  it("hashes every seeded payload exactly like hashSnapshot()", () => {
    const state = createSeedState();
    const payloads = state.projects.flatMap((project) => [...project.versions.map((version) => version.snapshot), ...project.drafts.flatMap((draft) => (draft.payload ? [draft.payload] : []))]);
    payloads.push(initialPayloadFor("research-notes", "研究笔记工作区"));
    expect(payloads.length).toBeGreaterThan(6);
    for (const payload of payloads) {
      expect(canonicalJson(payload)).toBe(canonicalize(payload));
      expect(contentHash(payload)).toBe(hashSnapshot(payload));
    }
  });
});

describe("mock ids", () => {
  it("are deterministic, distinct and UUID shaped", () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(mockUuid("a")).toBe(mockUuid("a"));
    expect(mockUuid("a")).not.toBe(mockUuid("b"));
    expect(mockUuid("project:sorting-lab")).toMatch(pattern);
  });
});
