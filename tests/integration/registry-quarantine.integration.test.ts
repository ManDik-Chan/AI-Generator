import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";
import { RegistryProtocolError } from "@/features/registry/protocol";
import { getPublicRegistryRelease } from "@/features/registry/release";
import { stageRegistryAsset, verifyRegistryAsset } from "@/features/registry/quarantine";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real quarantine Auth/database/Storage environment required");
const quarantineBucket = "registry-quarantine-v1", candidateBucket = "registry-candidates-v1";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const markdown = Buffer.from("# Isolated Registry fixture\r\n\r\nLocal synthetic content.\r\n");
type Actor = { id: string; token: string; client: SupabaseClient; sessionId: string };
type Fixture = { projectId: string; assetId: string; bytes: Uint8Array; mime: string };
type QuarantineRow = {
  id: string; project_id: string; asset_id: string; actor_id: string; bucket: string; object_path: string;
  source_digest: string; mime: string; size: number; scan_revision: number; policy_revision: number;
  storage_object_id: string; storage_version: string;
};

describe.skipIf(!enabled)("Registry quarantine with real Auth, private Storage and byte verification", () => {
  let db: PrismaClient, service: SupabaseClient, anonymous: SupabaseClient;
  let owner: Actor, reviewer: Actor, editor: Actor, viewer: Actor, outsider: Actor, unqualified: Actor;
  const actors: Actor[] = [], projects: string[] = [];
  const client = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const access = (actor: Actor, f: Pick<Fixture, "projectId">) => ({ accessToken: actor.token, projectId: f.projectId });
  const command = (actor: Actor, f: Fixture, key = randomUUID()) => ({
    ...access(actor, f), idempotencyKey: key, input: { assetId: f.assetId },
  });
  const verify = (actor: Actor, f: Fixture, id: string) => verifyRegistryAsset({ ...access(actor, f), input: { quarantineId: id } });
  async function denied(promise: Promise<unknown>, codes: string | string[]) {
    try { await promise; throw new Error("Quarantine security boundary unexpectedly accepted the operation"); }
    catch (error) {
      expect(error).toBeInstanceOf(RegistryProtocolError);
      expect(Array.isArray(codes) ? codes : [codes]).toContain((error as RegistryProtocolError).code);
    }
  }
  async function newActor(qualified = true): Promise<Actor> {
    const email = `registry-quarantine-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error).toBeNull();
    const signed = client(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const token = login.data.session!.access_token;
    const actor = { id: made.data.user!.id, client: signed, token,
      sessionId: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id };
    actors.push(actor);
    if (qualified) {
      await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
        VALUES(${actor.id}::uuid,true,true,clock_timestamp()+interval '1 hour')`;
      for (const action of ["INGEST_ASSET", "VERIFY_ASSET"]) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
        VALUES(${actor.id}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    }
    return actor;
  }
  async function fixture(bytes: Uint8Array = markdown, mime = "text/markdown"): Promise<Fixture> {
    const p = await db.project.create({ data: { slug: `quarantine-${randomUUID()}`, ownerId: owner.id } });
    projects.push(p.id);
    // The owner also has REVIEWER for the explicit independent-reviewer test.
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: p.id, subjectId: owner.id } }, data: { roles: ["OWNER", "REVIEWER"] } });
    await db.projectMembership.createMany({ data: [
      { projectId: p.id, subjectId: reviewer.id, roles: ["REVIEWER"] },
      { projectId: p.id, subjectId: editor.id, roles: ["EDITOR"] },
      { projectId: p.id, subjectId: viewer.id, roles: ["VIEWER"] },
      { projectId: p.id, subjectId: unqualified.id, roles: ["EDITOR", "REVIEWER"] },
    ] });
    const a = await db.projectAsset.create({ data: { projectId: p.id, sourceDigest: digest(bytes), mime, size: bytes.byteLength,
      dataClass: "CURATED", storageRef: `untrusted/never-resolved/${randomUUID()}`, provenance: { fixture: "isolated" }, rightsRef: "fixture-license" } });
    return { projectId: p.id, assetId: a.id, bytes, mime };
  }
  async function row(id: string): Promise<QuarantineRow> {
    const rows = await db.$queryRaw<QuarantineRow[]>`SELECT * FROM registry_private.asset_quarantine WHERE id=${id}::uuid`;
    expect(rows).toHaveLength(1); return rows[0];
  }
  async function staged(f: Fixture) {
    const input = command(owner, f), result = await stageRegistryAsset(input, f.bytes);
    return { input, result, q: await row(result.id) };
  }
  async function evidenceCount(f: Fixture) {
    return (await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.asset_verifications WHERE project_id=${f.projectId}::uuid`)[0].count;
  }
  async function withFailure(table: "asset_quarantine" | "asset_verifications", projectId: string, work: () => Promise<void>, delay = false) {
    const suffix = randomUUID().replaceAll("-", ""), fn = `test_quarantine_${suffix}`, trigger = `registry_test_${suffix}`;
    expect(projectId).toMatch(/^[a-f0-9-]{36}$/);
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE FUNCTION registry_private.${fn}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
        BEGIN IF NEW.project_id='${projectId}'::uuid THEN ${delay ? "PERFORM pg_catalog.pg_sleep(2.5);" : "RAISE EXCEPTION 'isolated acknowledgement failure';"} END IF; RETURN NEW; END $$`);
      await tx.$executeRawUnsafe(`REVOKE ALL ON FUNCTION registry_private.${fn}() FROM PUBLIC,anon,authenticated,service_role`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER ${trigger} AFTER INSERT ON registry_private.${table} FOR EACH ROW EXECUTE FUNCTION registry_private.${fn}()`);
    });
    try { await work(); } finally {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON registry_private.${table}`);
        await tx.$executeRawUnsafe(`DROP FUNCTION registry_private.${fn}()`);
      });
    }
  }
  beforeAll(async () => {
    db = createIntegrationPrisma(); service = client(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!); anonymous = client();
    owner = await newActor(); reviewer = await newActor(); editor = await newActor();
    viewer = await newActor(); outsider = await newActor(); unqualified = await newActor(false);
    await db.profile.update({ where: { id: unqualified.id }, data: { role: "ADMIN" } });
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true"); vi.stubEnv("REGISTRY_QUARANTINE_ENABLED", "true");
    vi.stubEnv("REGISTRY_RELEASE_COMMANDS_ENABLED", "false"); vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "false");
  }, 60000);
  afterAll(async () => {
    vi.unstubAllEnvs(); if (!db) return;
    try {
      // Remove only objects under projects created by this suite, including
      // private orphan objects from deliberately failed database transactions.
      const objects = await db.$queryRaw<{ bucket_id: string; name: string }[]>`SELECT bucket_id,name FROM storage.objects
        WHERE bucket_id=ANY(${[quarantineBucket, candidateBucket]}::text[]) AND split_part(name,'/',2)=ANY(${projects}::text[])`;
      for (const bucket of [quarantineBucket, candidateBucket]) {
        const paths = objects.filter(o => o.bucket_id === bucket).map(o => o.name);
        if (paths.length) expect((await service.storage.from(bucket).remove(paths)).error).toBeNull();
      }
      // Immutable-history bypass is confined to fixture teardown, never a
      // runtime API, an authorization assertion, or a successful scan path.
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of ["asset_verifications", "asset_quarantine", "asset_object_intents"])
          await tx.$executeRawUnsafe(`DELETE FROM registry_private.${table} WHERE project_id=ANY($1::uuid[])`, projects);
        await tx.$executeRaw`DELETE FROM public.project_assets WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM public.project_memberships WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM public.projects WHERE id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
    } finally { await db.$disconnect(); }
  }, 60000);

  it("requires both independent quarantine gates while Release and public reads stay closed", async () => {
    const f = await fixture();
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_QUARANTINE_ENABLED"]) {
      vi.stubEnv(flag, "");
      try {
        await denied(stageRegistryAsset(command(owner, f), f.bytes), "DISABLED");
        await denied(verify(reviewer, f, randomUUID()), "DISABLED");
      } finally { vi.stubEnv(flag, "true"); }
    }
    const { result } = await staged(f);
    expect(result.state).toBe("QUARANTINED");
    expect(process.env.REGISTRY_RELEASE_COMMANDS_ENABLED).toBe("false");
    await denied(getPublicRegistryRelease({ projectId: f.projectId, assetId: f.assetId }), "NOT_FOUND");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
  });
  it("rejects locator, owner, policy and scan-result injection before Storage authorization", async () => {
    const f = await fixture(), input = command(owner, f);
    for (const extra of [
      { bucket: process.env.AI_TOOL_ASSET_BUCKET }, { path: `${owner.id}/private.png` }, { url: "https://example.test/payload" },
      { storageRef: "../foreign" }, { ownerId: owner.id }, { sourceDigest: digest(f.bytes) },
      { policyRevision: 1 }, { scanRevision: 1 }, { scanOutcome: "CLEAN" }, { releaseId: randomUUID() },
    ]) await denied(stageRegistryAsset({ ...input, input: { ...input.input, ...extra } }, f.bytes), "INVALID_INPUT");
    await denied(stageRegistryAsset({ ...input, bucket: quarantineBucket } as typeof input, f.bytes), "INVALID_INPUT");
    const [{ count }] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.asset_quarantine WHERE project_id=${f.projectId}::uuid`;
    expect(count).toBe(0);
  });
  it("authenticates real sessions, rejects JWT forgery and checks independent action capability", async () => {
    const f = await fixture(), input = command(owner, f);
    const [header, payload, signature] = owner.token.split("."), claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = `${header}.${Buffer.from(JSON.stringify({ ...claims, sub: reviewer.id, role: "service_role" })).toString("base64url")}.${signature}`;
    await denied(stageRegistryAsset({ ...input, accessToken: forged }, f.bytes), "AUTH_REQUIRED");
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${owner.sessionId}::uuid`;
    try { await denied(stageRegistryAsset(input, f.bytes), "AUTH_REQUIRED"); }
    finally { await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${owner.sessionId}::uuid`; }
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`;
    try { await denied(stageRegistryAsset(input, f.bytes), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`; }
  });
  it("separates member roles and ignores ADMIN and user-editable metadata", async () => {
    const f = await fixture();
    expect((await unqualified.client.auth.updateUser({ data: { internal: true, role: "OWNER", actions: ["INGEST_ASSET", "VERIFY_ASSET"] } })).error).toBeNull();
    await denied(stageRegistryAsset(command(unqualified, f), f.bytes), "FORBIDDEN");
    await denied(stageRegistryAsset(command(viewer, f), f.bytes), "NOT_FOUND");
    await denied(stageRegistryAsset(command(reviewer, f), f.bytes), "NOT_FOUND");
    const result = await stageRegistryAsset(command(editor, f), f.bytes);
    await denied(verify(editor, f, result.id), ["NOT_FOUND", "FORBIDDEN"]);
    expect((await verify(reviewer, f, result.id)).state).toBe("BLOCKED");
  });
  it("hides cross-project asset and quarantine identifiers even from qualified operators", async () => {
    const a = await fixture(), b = await fixture(), { result } = await staged(a);
    await denied(stageRegistryAsset(command(outsider, a), a.bytes), "NOT_FOUND");
    await denied(stageRegistryAsset({ ...command(owner, b), input: { assetId: a.assetId } }, a.bytes), "NOT_FOUND");
    await denied(verify(reviewer, b, result.id), "NOT_FOUND");
    await denied(verify(outsider, a, result.id), "NOT_FOUND");
    expect(await evidenceCount(a)).toBe(0); expect(await evidenceCount(b)).toBe(0);
  });
  it("binds actual input bytes, MIME and size rather than the legacy storage reference", async () => {
    const f = await fixture();
    await denied(stageRegistryAsset(command(owner, f), Buffer.from("different bytes")), "ASSET_INVALID");
    await denied(stageRegistryAsset(command(owner, f), new Uint8Array()), "ASSET_INVALID");
    await denied(stageRegistryAsset(command(owner, f), new Uint8Array(2097153)), "ASSET_INVALID");
    const mislabeled = await fixture(markdown, "image/png");
    await denied(stageRegistryAsset(command(owner, mislabeled), mislabeled.bytes), "INVALID_CONTENT");
    const truncated = await fixture(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png");
    await denied(stageRegistryAsset(command(owner, truncated), truncated.bytes), "INVALID_CONTENT");
    const wrongSize = await fixture();
    // A different valid registered size/digest is a separate fixture; production
    // metadata is immutable and the actual staging bytes must still agree.
    const asset = await db.projectAsset.create({ data: { projectId: wrongSize.projectId, sourceDigest: digest(markdown), mime: "text/markdown", size: markdown.byteLength + 1,
      dataClass: "CURATED", storageRef: `nonexistent/${randomUUID()}`, provenance: {}, rightsRef: "fixture" } });
    await denied(stageRegistryAsset(command(owner, { ...wrongSize, assetId: asset.id }), markdown), "ASSET_INVALID");
    const { q } = await staged(f);
    expect(q.bucket).toBe(quarantineBucket);
    expect(q.object_path).toBe(`q1/${f.projectId}/${f.assetId}/${q.id}/${digest(f.bytes)}`);
    const actual = await service.storage.from(quarantineBucket).download(q.object_path);
    expect(actual.error).toBeNull();
    expect(digest(new Uint8Array(await actual.data!.arrayBuffer()))).toBe(digest(f.bytes));
  });
  it("refuses active HTML, SVG, binary controls and malformed UTF-8 under markdown MIME", async () => {
    for (const bytes of [Buffer.from("<script>alert(1)</script>"), Buffer.from("<svg onload='alert(1)'/>"),
      Buffer.from([0x23, 0x00, 0x65]), Buffer.from([0xc3, 0x28])]) {
      const f = await fixture(bytes);
      await denied(stageRegistryAsset(command(owner, f), f.bytes), "INVALID_CONTENT");
      expect(await evidenceCount(f)).toBe(0);
    }
  });
  it("blocks clients from private buckets, listing, signed URLs, writes and public URLs", async () => {
    const f = await fixture(), { q } = await staged(f);
    const buckets = await db.$queryRaw<{ id: string; public: boolean }[]>`SELECT id,public FROM storage.buckets WHERE id=ANY(${[quarantineBucket, candidateBucket]}::text[])`;
    expect(buckets).toHaveLength(2); expect(buckets.every(b => !b.public)).toBe(true);
    for (const actor of [anonymous, owner.client, reviewer.client, outsider.client]) {
      expect((await actor.storage.from(q.bucket).download(q.object_path)).error).not.toBeNull();
      expect((await actor.storage.from(q.bucket).createSignedUrl(q.object_path, 60)).error).not.toBeNull();
      const listing = await actor.storage.from(q.bucket).list(`q1/${f.projectId}/${f.assetId}/${q.id}`);
      expect(listing.error !== null || listing.data?.length === 0).toBe(true);
      expect((await actor.storage.from(q.bucket).upload(`${q.object_path}-injected`, f.bytes, { contentType: f.mime })).error).not.toBeNull();
      // Delete APIs can return an empty successful result for inaccessible rows.
      await actor.storage.from(q.bucket).remove([q.object_path]);
      expect((await service.storage.from(q.bucket).download(q.object_path)).error).toBeNull();
    }
    const publicURL = service.storage.from(q.bucket).getPublicUrl(q.object_path).data.publicUrl;
    expect((await fetch(publicURL)).ok).toBe(false);
    await expect(db.$executeRaw`UPDATE storage.buckets SET public=true WHERE id=${q.bucket}`).rejects.toThrow();
  });
  it("keeps Registry buckets isolated even if another Storage policy is broadly permissive", async () => {
    const f = await fixture(), { q } = await staged(f), policy = `test_broad_${randomUUID().replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`CREATE POLICY ${policy} ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
    try {
      expect((await owner.client.storage.from(q.bucket).download(q.object_path)).error).not.toBeNull();
      expect((await owner.client.storage.from(q.bucket).upload(`${q.object_path}-injected`, f.bytes, { contentType: f.mime })).error).not.toBeNull();
      expect((await owner.client.storage.from(candidateBucket).upload(`c1/${f.projectId}/${f.assetId}/${q.id}/${randomUUID()}`, f.bytes, { contentType: f.mime })).error).not.toBeNull();
    } finally { await db.$executeRawUnsafe(`DROP POLICY ${policy} ON storage.objects`); }
  });
  it("returns the same staging receipt only after current authority and bytes are revalidated", async () => {
    const f = await fixture(), { input, result, q } = await staged(f);
    expect(await stageRegistryAsset(input, f.bytes)).toEqual(result);
    await denied(stageRegistryAsset(input, Buffer.from("changed retry bytes")), "IDEMPOTENCY_CONFLICT");
    expect((await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.asset_quarantine WHERE project_id=${f.projectId}::uuid`)[0].count).toBe(1);
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`;
    try { await denied(stageRegistryAsset(input, f.bytes), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`; }
    await denied(stageRegistryAsset(input, f.bytes), "STALE_QUARANTINE");
    expect((await service.storage.from(q.bucket).download(q.object_path)).error).toBeNull();
  });
  it("serializes duplicate staging and never promotes registration into scan approval", async () => {
    const f = await fixture(), input = command(owner, f);
    const results = await Promise.all([stageRegistryAsset(input, f.bytes), stageRegistryAsset(input, f.bytes)]);
    expect(results[0]).toEqual(results[1]);
    const a = await db.projectAsset.findUniqueOrThrow({ where: { id: f.assetId } });
    expect(a.state).toBe("QUARANTINED"); expect(a.deliveryDigest).toBeNull();
    expect(await evidenceCount(f)).toBe(0);
  });
  it("snapshots caller bytes before asynchronous Auth and Storage operations", async () => {
    const f = await fixture(), mutable = Uint8Array.from(f.bytes);
    const pending = stageRegistryAsset(command(owner, f), mutable);
    mutable.fill(88);
    const q = await row((await pending).id);
    const actual = await service.storage.from(q.bucket).download(q.object_path);
    expect(actual.error).toBeNull();
    expect(digest(new Uint8Array(await actual.data!.arrayBuffer()))).toBe(digest(f.bytes));
    expect(q.source_digest).not.toBe(digest(mutable));
  });
  it("rejects self-review and records actual bytes and a private normalized candidate while scanning defaults denied", async () => {
    const f = await fixture(), { q } = await staged(f);
    await denied(verify(owner, f, q.id), "INDEPENDENT_REVIEW_REQUIRED");
    const result = await verify(reviewer, f, q.id);
    expect(result.state).toBe("BLOCKED"); expect(result.reason).toBe("SCANNER_UNAVAILABLE");
    expect(JSON.stringify(result)).not.toMatch(/storage|bucket|path|url|digest|bytes/i);
    const rows = await db.$queryRaw<{
      outcome: string; reason: string; source_digest: string; source_size: number; source_mime: string;
      candidate_digest: string; candidate_size: number; candidate_mime: string; candidate_path: string;
      storage_object_id: string; storage_version: string; scan_revision: number; policy_revision: number; scanner_revision: string;
    }[]>`SELECT * FROM registry_private.asset_verifications WHERE project_id=${f.projectId}::uuid`;
    expect(rows).toHaveLength(1);
    const e = rows[0];
    expect(e).toMatchObject({ outcome: "BLOCKED", reason: "SCANNER_UNAVAILABLE", source_digest: digest(f.bytes), source_size: f.bytes.byteLength,
      source_mime: f.mime, storage_object_id: q.storage_object_id, storage_version: q.storage_version,
      scan_revision: q.scan_revision, policy_revision: q.policy_revision, scanner_revision: "unavailable-v1" });
    const candidate = await service.storage.from(candidateBucket).download(e.candidate_path);
    expect(candidate.error).toBeNull();
    const bytes = new Uint8Array(await candidate.data!.arrayBuffer());
    expect(digest(bytes)).toBe(e.candidate_digest); expect(bytes.byteLength).toBe(e.candidate_size);
    expect(Buffer.from(bytes).toString("utf8")).toBe(Buffer.from(f.bytes).toString("utf8").replaceAll("\r\n", "\n"));
    expect((await owner.client.storage.from(candidateBucket).download(e.candidate_path)).error).not.toBeNull();
    const asset = await db.projectAsset.findUniqueOrThrow({ where: { id: f.assetId } });
    expect(asset.state).toBe("QUARANTINED"); expect(asset.deliveryDigest).toBeNull();
    await denied(getPublicRegistryRelease({ projectId: f.projectId }), "NOT_FOUND");
  });
  it("decodes and reencodes image bytes while preserving the unconditional scan block", async () => {
    const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: { r: 22, g: 44, b: 66, alpha: 1 } } }).png().toBuffer();
    const f = await fixture(png, "image/png"), { result } = await staged(f);
    expect(await verify(reviewer, f, result.id)).toMatchObject({ state: "BLOCKED", reason: "SCANNER_UNAVAILABLE" });
    const [e] = await db.$queryRaw<{ candidate_path: string; candidate_mime: string; candidate_digest: string }[]>`SELECT candidate_path,candidate_mime,candidate_digest FROM registry_private.asset_verifications WHERE project_id=${f.projectId}::uuid`;
    const downloaded = await service.storage.from(candidateBucket).download(e.candidate_path);
    expect(downloaded.error).toBeNull();
    const bytes = Buffer.from(await downloaded.data!.arrayBuffer()), metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("png"); expect(metadata.width).toBe(3); expect(metadata.height).toBe(2);
    expect(e.candidate_mime).toBe("image/png"); expect(digest(bytes)).toBe(e.candidate_digest);
  });
  it("serializes duplicate verifiers and detects replacement of a previously blocked candidate", async () => {
    const f = await fixture(), { q } = await staged(f);
    const results = await Promise.all([verify(reviewer, f, q.id), verify(reviewer, f, q.id)]);
    expect(results[0]).toEqual(results[1]); expect(await evidenceCount(f)).toBe(1);
    const [e] = await db.$queryRaw<{ candidate_path: string; candidate_mime: string }[]>`SELECT candidate_path,candidate_mime
      FROM registry_private.asset_verifications WHERE id=${results[0].id}::uuid`;
    const downloaded = await service.storage.from(candidateBucket).download(e.candidate_path);
    expect(downloaded.error).toBeNull();
    const bytes = new Uint8Array(await downloaded.data!.arrayBuffer());
    expect((await service.storage.from(candidateBucket).remove([e.candidate_path])).error).toBeNull();
    expect((await service.storage.from(candidateBucket).upload(e.candidate_path, bytes, { contentType: e.candidate_mime })).error).toBeNull();
    await denied(verify(reviewer, f, q.id), "OBJECT_CHANGED");
    expect(await evidenceCount(f)).toBe(1);
  });
  it("denies in-place object overwrites and detects delete/recreate even with identical bytes", async () => {
    const f = await fixture(), { input, q } = await staged(f);
    expect((await service.storage.from(q.bucket).upload(q.object_path, f.bytes, { contentType: f.mime, upsert: true })).error).not.toBeNull();
    expect((await service.storage.from(q.bucket).remove([q.object_path])).error).toBeNull();
    expect((await service.storage.from(q.bucket).upload(q.object_path, f.bytes, { contentType: f.mime, upsert: false })).error).toBeNull();
    await denied(verify(reviewer, f, q.id), "OBJECT_CHANGED");
    await denied(stageRegistryAsset(input, f.bytes), "OBJECT_CHANGED");
    expect(await evidenceCount(f)).toBe(0);
  });
  it("detects replacement bytes and absent objects without generating a scan receipt", async () => {
    const f = await fixture(), { q } = await staged(f);
    expect((await service.storage.from(q.bucket).remove([q.object_path])).error).toBeNull();
    await denied(verify(reviewer, f, q.id), "OBJECT_CHANGED");
    expect((await service.storage.from(q.bucket).upload(q.object_path, Buffer.from("malicious replacement"), { contentType: f.mime })).error).toBeNull();
    await denied(verify(reviewer, f, q.id), "OBJECT_CHANGED");
    expect(await evidenceCount(f)).toBe(0);
  });
  it("invalidates quarantine on legal scan revision and authorization-epoch changes", async () => {
    const f = await fixture(), { input, q } = await staged(f);
    await db.projectAsset.update({ where: { id: f.assetId }, data: { state: "VALIDATED", deliveryDigest: digest(f.bytes), scanRevision: 2 } });
    await denied(verify(reviewer, f, q.id), "STALE_QUARANTINE");
    await denied(stageRegistryAsset(input, f.bytes), "STALE_QUARANTINE");
    const g = await fixture(), stagedG = await staged(g);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: g.projectId, subjectId: viewer.id } }, data: { active: false } });
    await denied(verify(reviewer, g, stagedG.q.id), "STALE_QUARANTINE");
    expect(await evidenceCount(f)).toBe(0); expect(await evidenceCount(g)).toBe(0);
  });
  it("refuses obsolete policy and changed rights bindings without trusting historical quarantine metadata", async () => {
    const f = await fixture(), { q } = await staged(f);
    // Simulate retained history from another policy/rights revision by inserting
    // separate immutable rows through the trusted fixture connection. No guard
    // or RLS bypass participates in these denial assertions.
    for (const [policy, rights] of [[2, null], [1, "0".repeat(64)]] as const) {
      const id = randomUUID(), key = randomUUID();
      await db.$executeRaw`INSERT INTO registry_private.asset_object_intents
        (id,project_id,asset_id,actor_id,kind,quarantine_id,idempotency_key,body_hash,authz_epoch,source_digest,mime,size,
          rights_hash,scan_revision,policy_revision,bucket,object_path)
        SELECT ${id}::uuid,project_id,asset_id,actor_id,'SOURCE',NULL,${key},body_hash,authz_epoch,source_digest,mime,size,
          coalesce(${rights}::text,rights_hash),scan_revision,${policy},bucket,
          'q1/'||project_id::text||'/'||asset_id::text||'/'||${id}||'/'||source_digest
        FROM registry_private.asset_quarantine WHERE id=${q.id}::uuid`;
      await db.$executeRaw`INSERT INTO registry_private.asset_quarantine
        (id,project_id,asset_id,actor_id,idempotency_key,body_hash,authz_epoch,source_digest,mime,size,rights_hash,
          scan_revision,policy_revision,bucket,object_path,storage_object_id,storage_version)
        SELECT ${id}::uuid,project_id,asset_id,actor_id,${key},body_hash,authz_epoch,source_digest,mime,size,
          coalesce(${rights}::text,rights_hash),scan_revision,${policy},bucket,
          'q1/'||project_id::text||'/'||asset_id::text||'/'||${id}||'/'||source_digest,storage_object_id,storage_version
        FROM registry_private.asset_quarantine WHERE id=${q.id}::uuid`;
      await denied(verify(reviewer, f, id), "STALE_QUARANTINE");
    }
    expect(await evidenceCount(f)).toBe(0);
  });
  it("rechecks verifier sessions and never reuses old blocked evidence after source deletion", async () => {
    const f = await fixture(), { q } = await staged(f);
    const result = await verify(reviewer, f, q.id);
    expect(result.reason).toBe("SCANNER_UNAVAILABLE");
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${reviewer.sessionId}::uuid`;
    try { await denied(verify(reviewer, f, q.id), "AUTH_REQUIRED"); }
    finally { await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${reviewer.sessionId}::uuid`; }
    expect((await service.storage.from(q.bucket).remove([q.object_path])).error).toBeNull();
    await denied(verify(reviewer, f, q.id), "OBJECT_CHANGED");
    expect(await evidenceCount(f)).toBe(1);
  });
  it("keeps evidence immutable and all quarantine metadata inaccessible to JWT roles", async () => {
    const f = await fixture(), { q } = await staged(f);
    await verify(reviewer, f, q.id);
    for (const table of ["asset_object_intents", "asset_quarantine", "asset_verifications"]) {
      const [boundary] = await db.$queryRaw<{ rls: boolean; anon: boolean; authenticated: boolean; service: boolean }[]>`
        SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
          has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated,
          has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') AS service
        FROM pg_class WHERE oid=${`registry_private.${table}`}::regclass`;
      expect(boundary).toEqual({ rls: true, anon: false, authenticated: false, service: false });
      for (const role of [anonymous, owner.client, service]) {
        expect((await role.schema("registry_private").from(table).select("*")).error).not.toBeNull();
        expect((await role.schema("registry_private").from(table).insert({})).error).not.toBeNull();
      }
    }
    await expect(db.$executeRaw`UPDATE registry_private.asset_quarantine SET policy_revision=2 WHERE id=${q.id}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM registry_private.asset_quarantine WHERE id=${q.id}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE registry_private.asset_verifications SET reason='BYTE_MISMATCH' WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM registry_private.asset_verifications WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE registry_private.asset_object_intents SET policy_revision=2 WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM registry_private.asset_object_intents WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
  });
  it("rolls back failed database acknowledgements, leaving only inaccessible private objects", async () => {
    const f = await fixture(), input = command(owner, f);
    await withFailure("asset_quarantine", f.projectId, async () => {
      await denied(stageRegistryAsset(input, f.bytes), ["CONFLICT", "UNAVAILABLE"]);
    });
    expect((await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.asset_quarantine WHERE project_id=${f.projectId}::uuid`)[0].count).toBe(0);
    const sourceIntents = await db.$queryRaw<{ id: string; object_path: string }[]>`SELECT id,object_path FROM registry_private.asset_object_intents
      WHERE project_id=${f.projectId}::uuid AND kind='SOURCE'`;
    expect(sourceIntents).toHaveLength(1);
    expect((await service.storage.from(quarantineBucket).download(sourceIntents[0].object_path)).error).toBeNull();
    const retried = await stageRegistryAsset(input, f.bytes), q = await row(retried.id);
    expect(q.id).toBe(sourceIntents[0].id); expect(q.object_path).toBe(sourceIntents[0].object_path);
    await withFailure("asset_verifications", f.projectId, async () => {
      await denied(verify(reviewer, f, q.id), ["CONFLICT", "UNAVAILABLE"]);
    });
    expect(await evidenceCount(f)).toBe(0);
    const candidateIntents = await db.$queryRaw<{ id: string; object_path: string }[]>`SELECT id,object_path FROM registry_private.asset_object_intents
      WHERE project_id=${f.projectId}::uuid AND kind='CANDIDATE'`;
    expect(candidateIntents).toHaveLength(1);
    expect((await service.storage.from(candidateBucket).download(candidateIntents[0].object_path)).error).toBeNull();
    expect(await verify(reviewer, f, q.id)).toMatchObject({ id: candidateIntents[0].id, state: "BLOCKED" });
    expect((await db.projectAsset.findUniqueOrThrow({ where: { id: f.assetId } })).state).toBe("QUARANTINED");
    const privateObjects = await db.$queryRaw<{ name: string; bucket_id: string }[]>`SELECT name,bucket_id FROM storage.objects
      WHERE bucket_id=ANY(${[quarantineBucket, candidateBucket]}::text[]) AND split_part(name,'/',2)=${f.projectId}`;
    for (const o of privateObjects) expect((await owner.client.storage.from(o.bucket_id).download(o.name)).error).not.toBeNull();
  });
  it("rejects natural credential expiry at the transaction tail after a slow object acknowledgement", async () => {
    const f = await fixture(), input = command(owner, f);
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '2 seconds'
      WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`;
    try {
      await withFailure("asset_quarantine", f.projectId, async () => {
        await denied(stageRegistryAsset(input, f.bytes), "FORBIDDEN");
      }, true);
      expect((await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.asset_quarantine WHERE project_id=${f.projectId}::uuid`)[0].count).toBe(0);
    } finally {
      await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '1 hour'
        WHERE subject_id=${owner.id}::uuid AND action='INGEST_ASSET'`;
    }
  }, 15000);
});
