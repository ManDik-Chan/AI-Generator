import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type PrismaClient } from "@prisma/client";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";
import { createInternalRegistryProject } from "@/features/registry/internal";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real Registry JWT/database environment required");
const tables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];
const hash = "a".repeat(64);

describe.skipIf(!enabled)("Registry PostgreSQL constraints and real Auth/PostgREST authorization", () => {
  let db: PrismaClient, service: SupabaseClient, anon: SupabaseClient;
  const actors: { id: string; client: SupabaseClient; token: string }[] = [];
  const projects: string[] = [];
  let p: string, other: string, draft: string, asset: string, review: string, version: string, release: string;
  const client = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  async function reject(action: () => Promise<unknown>) { await expect(action()).rejects.toThrow(); }
  async function qualify(id: string, create = false) {
    await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
      VALUES(${id}::uuid,true,${create},now()+interval '1 hour')`;
  }
  async function newProject(owner: string) {
    const project = await db.project.create({ data: { slug: `r-${randomUUID()}`, ownerId: owner } });
    projects.push(project.id); return project.id;
  }
  beforeAll(async () => {
    db = createIntegrationPrisma(); service = client(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!); anon = client();
    const password = `A!${randomUUID()}z9`;
    for (let i = 0; i < 3; i++) {
      const email = `registry-${randomUUID()}@example.test`;
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
      expect(made.error).toBeNull();
      const signed = client(); const session = await signed.auth.signInWithPassword({ email, password });
      expect(session.error).toBeNull();
      actors.push({ id: made.data.user!.id, client: signed, token: session.data.session!.access_token });
    }
    await qualify(actors[0].id, true); await qualify(actors[2].id, true);
    // Existing ADMIN is deliberately NOT an internal operator.
    await db.profile.update({ where: { id: actors[1].id }, data: { role: "ADMIN" } });
    p = await newProject(actors[0].id); other = await newProject(actors[2].id);
    await db.projectMembership.createMany({ data: [
      { projectId: p, subjectId: actors[2].id, roles: ["REVIEWER"] },
      { projectId: p, subjectId: actors[1].id, roles: ["VIEWER"] },
    ] });
    draft = (await db.projectDraft.create({ data: { projectId: p, updatedBy: actors[0].id } })).id;
    asset = (await db.projectAsset.create({ data: { projectId: p, sourceDigest: hash, mime: "text/markdown", size: 10,
      dataClass: "CURATED", storageRef: `private/${randomUUID()}`, provenance: {}, rightsRef: "fixture-license" } })).id;
    await db.projectAsset.update({ where: { id: asset }, data: { state: "VALIDATED", deliveryDigest: hash } });
    await db.projectAsset.update({ where: { id: asset }, data: { state: "APPROVED" } });
    await db.projectDocumentation.create({ data: { projectId: p, draftId: draft, title: "fixture", language: "en", assetId: asset, contentHash: hash } });
    await db.projectDraft.update({ where: { id: draft }, data: { state: "IN_REVIEW" } });
    const current = await db.project.findUniqueOrThrow({ where: { id: p } });
    review = (await db.publicationReview.create({ data: { projectId: p, draftId: draft, draftRevision: 2,
      authzEpoch: current.authzEpoch, snapshotHash: hash, visibility: "PRIVATE", assetDigestSet: [], submitterId: actors[0].id,
      policyRevision: 1, expiresAt: new Date(Date.now() + 3600000) } })).id;
    await db.publicationReview.update({ where: { id: review }, data: { decision: "APPROVED", reviewerId: actors[2].id, decidedAt: new Date() } });
    await db.$transaction(async tx => {
      version = (await tx.projectVersion.create({ data: { projectId: p, version: "1.0.0", snapshot: {}, contentHash: hash, reviewId: review } })).id;
      await tx.projectDocumentation.create({ data: { projectId: p, versionId: version, title: "sealed", language: "en", assetId: asset, contentHash: hash } });
    });
    release = (await db.projectRelease.create({ data: { projectId: p, versionId: version, visibilityAtApproval: "PRIVATE", contentHash: hash, publishedAt: new Date() } })).id;
  }, 60000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    // Trusted disposable-fixture cleanup only; runtime has no delete command or
    // trigger bypass. Only IDs created in THIS suite may be removed.
    if (db) {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of [...tables].reverse()) {
          const column = table === "projects" ? "id" : "project_id";
          await tx.$executeRawUnsafe(`DELETE FROM public.${table} WHERE ${column}=ANY($1::uuid[])`, projects);
        }
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
      await db.$disconnect();
    }
  });

  it("enables RLS on all eight tables and grants only authenticated SELECT", async () => {
    const rows = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; anon: boolean; service: boolean; writes: boolean }[]>(`
      SELECT relname,relrowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
      has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') AS service,
      has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') AS writes
      FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])`, tables);
    expect(rows).toHaveLength(8);
    expect(rows.every(r => r.relrowsecurity && !r.anon && !r.service && !r.writes)).toBe(true);
  });
  it("enforces version uniqueness and validates every composite project foreign key", async () => {
    await expect(db.projectVersion.create({ data: { projectId: p, version: "1.0.0", snapshot: {}, contentHash: hash, reviewId: review } })).rejects.toMatchObject({ code: "P2002" });
    const constraints = await db.$queryRawUnsafe<{ convalidated: boolean }[]>(`
      SELECT convalidated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      WHERE t.relnamespace='public'::regnamespace AND t.relname=ANY($1::text[])
      AND c.contype='f' AND cardinality(c.conkey)=2`, tables);
    // current release + review/draft + version/review + release/version +
    // documentation's draft, version and asset references.
    expect(constraints).toHaveLength(7);
    expect(constraints.every(c => c.convalidated)).toBe(true);
  });
  it("denies anon and service-role reads and writes on every Registry table", async () => {
    for (const table of tables) for (const denied of [anon, service]) {
      expect((await denied.from(table).select("*")).error).not.toBeNull();
      expect((await denied.from(table).insert({})).error).not.toBeNull();
      expect((await denied.from(table).update({ project_id: other }).eq(table === "projects" ? "id" : "project_id", p)).error).not.toBeNull();
      expect((await denied.from(table).delete().eq(table === "projects" ? "id" : "project_id", p)).error).not.toBeNull();
    }
  });
  it("allows eligible project members but hides cross-project rows and blocks all JWT writes", async () => {
    for (const table of tables) {
      const column = table === "projects" ? "id" : "project_id";
      const own = await actors[0].client.from(table).select("*").eq(column, p);
      expect(own.error).toBeNull(); expect(own.data!.length).toBeGreaterThan(0);
      const foreign = await actors[0].client.from(table).select("*").eq(column, other);
      expect(foreign.error).toBeNull(); expect(foreign.data).toEqual([]);
      expect((await actors[0].client.from(table).insert({})).error).not.toBeNull();
      expect((await actors[0].client.from(table).update(table === "projects" ? { owner_id: actors[2].id } : { project_id: other }).eq(column, p)).error).not.toBeNull();
      expect((await actors[0].client.from(table).delete().eq(column, p)).error).not.toBeNull();
    }
  });
  it("does not confer internal eligibility via ADMIN, membership or user_metadata", async () => {
    expect((await actors[1].client.auth.updateUser({ data: { internal: true, role: "PUBLISHER" } })).error).toBeNull();
    for (const table of tables) {
      const result = await actors[1].client.from(table).select("*");
      expect(result.error).toBeNull(); expect(result.data).toEqual([]);
    }
  });
  it("rechecks internal eligibility and project membership on existing unrefreshed JWTs", async () => {
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=false WHERE subject_id=${actors[0].id}::uuid`;
    expect((await actors[0].client.from("projects").select("*")).data).toEqual([]);
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=true,expires_at=now()-interval '1 second' WHERE subject_id=${actors[0].id}::uuid`;
    expect((await actors[0].client.from("projects").select("*")).data).toEqual([]);
    await db.$executeRaw`UPDATE registry_private.internal_operators SET expires_at=now()+interval '1 hour' WHERE subject_id=${actors[0].id}::uuid`;
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: p, subjectId: actors[2].id } }, data: { active: false } });
    expect((await actors[2].client.from("projects").select("*").eq("id", p)).data).toEqual([]);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: p, subjectId: actors[2].id } }, data: { active: true } });
  });
  it("creates only through verified internal Auth identity and keeps the flag closed by default", async () => {
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "");
    await reject(() => createInternalRegistryProject(actors[0].token, { slug: `r-${randomUUID()}` }));
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true");
    await reject(() => createInternalRegistryProject("invalid-token", { slug: `r-${randomUUID()}` }));
    await reject(() => createInternalRegistryProject(actors[1].token, { slug: `r-${randomUUID()}` }));
    await reject(() => createInternalRegistryProject(actors[0].token, { slug: `r-${randomUUID()}`, ownerId: actors[2].id }));
    const created = await createInternalRegistryProject(actors[0].token, { slug: `r-${randomUUID()}` });
    projects.push(created.id);
    const row = await db.project.findUniqueOrThrow({ where: { id: created.id }, include: { drafts: true, memberships: true } });
    expect(row.ownerId).toBe(actors[0].id); expect(row.visibility).toBe("PRIVATE");
    expect(row.drafts).toHaveLength(1); expect(row.memberships[0].roles).toEqual(["OWNER"]);
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=false WHERE subject_id=${actors[0].id}::uuid`;
    await reject(() => createInternalRegistryProject(actors[0].token, { slug: `r-${randomUUID()}` }));
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=true WHERE subject_id=${actors[0].id}::uuid`;
    vi.unstubAllEnvs();
  });
  it("reserves immutable non-reusable slug and ownership", async () => {
    const row = await db.project.findUniqueOrThrow({ where: { id: p } });
    await reject(() => db.project.create({ data: { slug: row.slug, ownerId: actors[0].id } }));
    await reject(() => db.project.update({ where: { id: p }, data: { slug: "new-slug" } }));
    await reject(() => db.project.update({ where: { id: p }, data: { ownerId: actors[2].id } }));
    await reject(() => db.project.delete({ where: { id: p } }));
    await reject(() => db.projectMembership.delete({ where: { projectId_subjectId: { projectId: p, subjectId: actors[0].id } } }));
    await reject(() => db.projectMembership.update({ where: { projectId_subjectId: { projectId: p, subjectId: actors[1].id } }, data: { roles: ["OWNER"] } }));
    await reject(() => db.project.update({ where: { id: p }, data: { visibility: "PUBLIC" } }));
  });
  it("rejects duplicate active drafts, frozen edits and illegal state transitions", async () => {
    await reject(() => db.projectDraft.create({ data: { projectId: p, updatedBy: actors[0].id } }));
    await reject(() => db.projectDraft.update({ where: { id: draft }, data: { manifest: { forged: true } } }));
    await reject(() => db.projectDraft.update({ where: { id: draft }, data: { state: "IN_REVIEW" } }));
    await reject(() => db.projectDraft.create({ data: { projectId: other, updatedBy: actors[0].id } }));
  });
  it("rejects forged cross-project FK references including currentRelease", async () => {
    await reject(() => db.project.update({ where: { id: other }, data: { currentReleaseId: release } }));
    await reject(() => db.projectVersion.create({ data: { projectId: other, version: "1.0.1", snapshot: {}, contentHash: hash, reviewId: review } }));
    await reject(() => db.projectRelease.create({ data: { projectId: other, versionId: version, contentHash: hash, visibilityAtApproval: "PRIVATE", publishedAt: new Date() } }));
    await reject(() => db.projectDocumentation.create({ data: { projectId: other, versionId: version, assetId: asset, contentHash: hash, title: "forged", language: "en" } }));
  });
  it("rejects self-review, stale approval, expired review and mutable review binding", async () => {
    const project = await db.project.findUniqueOrThrow({ where: { id: p } });
    const data = { projectId: p, draftId: draft, draftRevision: 2, authzEpoch: project.authzEpoch, snapshotHash: hash,
      visibility: "PRIVATE" as const, assetDigestSet: [], submitterId: actors[0].id, policyRevision: 1, expiresAt: new Date(Date.now()+3600000) };
    const pending = await db.publicationReview.create({ data });
    await reject(() => db.publicationReview.update({ where: { id: pending.id }, data: { decision: "APPROVED", reviewerId: actors[0].id, decidedAt: new Date() } }));
    await reject(() => db.publicationReview.update({ where: { id: pending.id }, data: { decision: "APPROVED", reviewerId: actors[1].id, decidedAt: new Date() } }));
    await reject(() => db.publicationReview.create({ data: { ...data, expiresAt: new Date(0) } }));
    await reject(() => db.publicationReview.update({ where: { id: review }, data: { snapshotHash: "b".repeat(64) } }));
    await reject(() => db.projectVersion.create({ data: { projectId: p, version: "1.0.1", snapshot: {}, contentHash: hash, reviewId: review } }));
  });
  it("makes versions, sealed documentation and withdrawn releases immutable", async () => {
    await reject(() => db.projectVersion.update({ where: { id: version }, data: { snapshot: { modified: true } } }));
    await reject(() => db.projectVersion.delete({ where: { id: version } }));
    const doc = await db.projectDocumentation.findFirstOrThrow({ where: { versionId: version } });
    await reject(() => db.projectDocumentation.update({ where: { id: doc.id }, data: { title: "tampered" } }));
    await reject(() => db.projectDocumentation.create({ data: { projectId: p, versionId: version, title: "late addition", language: "en", assetId: asset, contentHash: hash } }));
    await reject(() => db.projectRelease.update({ where: { id: release }, data: { contentHash: "b".repeat(64) } }));
    await db.project.update({ where: { id: p }, data: { currentReleaseId: release } });
    await reject(() => db.projectRelease.update({ where: { id: release }, data: { state: "WITHDRAWN", withdrawnAt: new Date() } }));
    await db.project.update({ where: { id: p }, data: { currentReleaseId: null } });
    await db.projectRelease.update({ where: { id: release }, data: { state: "WITHDRAWN", withdrawnAt: new Date() } });
    await reject(() => db.projectRelease.update({ where: { id: release }, data: { state: "PUBLISHED", withdrawnAt: null } }));
    await reject(() => db.project.update({ where: { id: p }, data: { currentReleaseId: release } }));
  });
  it("enforces asset scan stages, document digest/type and exact one parent", async () => {
    await reject(() => db.projectAsset.update({ where: { id: asset }, data: { state: "QUARANTINED" } }));
    await reject(() => db.projectAsset.update({ where: { id: asset }, data: { sourceDigest: "b".repeat(64) } }));
    const data = { projectId: p, title: "invalid", language: "en", assetId: asset, contentHash: hash };
    await reject(() => db.projectDocumentation.create({ data }));
    await reject(() => db.projectDocumentation.create({ data: { ...data, draftId: draft, versionId: version } }));
    await reject(() => db.projectDocumentation.create({ data: { ...data, versionId: version, contentHash: "b".repeat(64) } }));
  });
});
