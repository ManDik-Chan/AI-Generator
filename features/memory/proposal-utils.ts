import { createHash } from "node:crypto";

import {
  normalizeMemoryContent,
  normalizeMemoryKeywords,
} from "@/features/memory/security";

export const MEMORY_PROPOSAL_TTL_DAYS = 30;
export const MEMORY_PROPOSAL_REJECTION_COOLDOWN_DAYS = 30;

interface MemoryProposalFingerprintInput {
  action: "CREATE" | "UPDATE";
  scope: "GLOBAL" | "PERSONA";
  personaId?: string | null;
  targetMemoryId?: string | null;
  topicKey?: string | null;
  content: string;
  keywords: string[];
}

export interface MemoryProposalDedupeInput extends MemoryProposalFingerprintInput {
  sourceMessageId: string;
  targetMemoryRevision?: number | null;
}

function hash(parts: string[]) {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function proposalIdentity(input: MemoryProposalFingerprintInput) {
  return input.targetMemoryId
    ? `memory:${input.targetMemoryId}`
    : `topic:${normalizeMemoryContent(input.topicKey ?? "")}`;
}

function canonicalFact(input: MemoryProposalFingerprintInput) {
  return [
    input.action,
    input.scope,
    input.scope === "PERSONA" ? input.personaId ?? "" : "GLOBAL",
    proposalIdentity(input),
    normalizeMemoryContent(input.content),
    ...normalizeMemoryKeywords(input.keywords).map(normalizeMemoryContent),
  ];
}

function canonicalSuppressionFact(input: MemoryProposalFingerprintInput) {
  return [
    input.scope,
    input.scope === "PERSONA" ? input.personaId ?? "" : "GLOBAL",
    `subject:${normalizeMemoryContent(input.topicKey ?? input.targetMemoryId ?? "")}`,
    normalizeMemoryContent(input.content),
    ...normalizeMemoryKeywords(input.keywords).map(normalizeMemoryContent),
  ];
}

export function buildMemoryProposalDedupeKey(input: MemoryProposalDedupeInput) {
  return hash([
    input.sourceMessageId,
    `target-revision:${input.targetMemoryRevision ?? ""}`,
    ...canonicalFact(input),
  ]);
}

export function buildMemoryProposalSuppressionKey(input: MemoryProposalFingerprintInput) {
  return hash(canonicalSuppressionFact(input));
}

export function getMemoryProposalExpiry(now = new Date()) {
  return new Date(now.getTime() + MEMORY_PROPOSAL_TTL_DAYS * 86_400_000);
}

export function getMemoryProposalRejectionCutoff(now = new Date()) {
  return new Date(
    now.getTime() - MEMORY_PROPOSAL_REJECTION_COOLDOWN_DAYS * 86_400_000,
  );
}
