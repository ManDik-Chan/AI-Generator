// Run only against a guarded disposable stack. This deliberately retains an OWNER
// until the isolated database is destroyed; never run against a shared database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDisposableTarget } from "./disposable-supabase.mjs";

const target = assertDisposableTarget();
const cli = join(process.cwd(), "node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--workdir", target.workdir, "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
}));
assert.equal(process.env.SUPABASE_TEST_URL, status.API_URL, "Supabase API must match inspected disposable stack");
assert(process.env.SUPABASE_TEST_ANON_KEY === status.ANON_KEY, "Anon key must match inspected disposable stack");
assert(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY === status.SERVICE_ROLE_KEY, "Service key must match inspected disposable stack");
const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY, options);
const client = () => createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_ANON_KEY, options);
const password = `Test!${randomUUID()}z9`;
try {
  const identities = [];
  for (const kind of ["owner", "user"]) {
    const email = `${kind}-${randomUUID()}@example.test`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null);
    const jwtClient = client();
    assert.equal((await jwtClient.auth.signInWithPassword({ email, password })).error, null);
    identities.push({ id: made.data.user.id, client: jwtClient });
  }
  const [owner, user] = identities;
  assert.match(owner.id, /^[0-9a-f-]{36}$/i);
  const doc = readFileSync("docs/platform-rbac-operations.md", "utf8");
  const sql = doc.match(/```sql\s*([\s\S]*?)```/)?.[1];
  assert(sql && sql.includes("<OWNER_APPROVED_AUTH_UUID>"), "Missing reviewed bootstrap script");
  const statements = sql.replace("<OWNER_APPROVED_AUTH_UUID>", owner.id).replace(/^BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
  const block = statements.match(/DO \$bootstrap\$[\s\S]*?\$bootstrap\$;/)?.[0];
  assert(block, "Missing bootstrap block");
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE");
    await tx.$executeRawUnsafe("LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE");
    await tx.$executeRawUnsafe(block);
  });
  assert.equal((await db.profile.findUniqueOrThrow({ where: { id: owner.id } })).role, "OWNER");
  assert.equal(await db.platformRoleAudit.count({ where: { targetId: owner.id, newRole: "OWNER" } }), 1);
  await assert.rejects(db.$transaction(async tx => {
    await tx.$executeRawUnsafe("LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE");
    await tx.$executeRawUnsafe("LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE");
    await tx.$executeRawUnsafe(block);
  }));
  await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
    VALUES(${user.id}::uuid,true,true,now()+interval '1 hour')`;
  const project = await db.project.create({ data: { slug: `owner-test-${randomUUID()}`, ownerId: user.id } });
  await db.projectDraft.create({ data: { projectId: project.id, updatedBy: user.id } });
  const conversation = await db.conversation.create({ data: { userId: user.id, title: "synthetic private data" } });
  const privateProject = await owner.client.from("projects").select("id").eq("id", project.id);
  assert.equal(privateProject.error, null);
  assert.deepEqual(privateProject.data, []);
  const ownProject = await user.client.from("projects").select("id").eq("id", project.id);
  assert.equal(ownProject.error, null);
  assert.equal(ownProject.data.length, 1);
  const privateDraft = await owner.client.from("project_drafts").select("id").eq("project_id", project.id);
  assert.equal(privateDraft.error, null);
  assert.deepEqual(privateDraft.data, []);
  const ownDraft = await user.client.from("project_drafts").select("id").eq("project_id", project.id);
  assert.equal(ownDraft.error, null);
  assert.equal(ownDraft.data.length, 1);
  const privateConversation = await owner.client.from("conversations").select("id").eq("id", conversation.id);
  assert.equal(privateConversation.error, null);
  assert.deepEqual(privateConversation.data, []);
  const ownConversation = await user.client.from("conversations").select("id").eq("id", conversation.id);
  assert.equal(ownConversation.error, null);
  assert.equal(ownConversation.data.length, 1);
  assert.equal(await db.projectMembership.count({ where: { projectId: project.id, subjectId: owner.id } }), 0);
  const bucket = process.env.AI_TOOL_ASSET_BUCKET;
  assert(bucket, "Configured private tool asset bucket required");
  const existingBucket = await service.storage.getBucket(bucket);
  if (existingBucket.error) assert.equal((await service.storage.createBucket(bucket, { public: false })).error, null);
  const run = await db.toolRun.create({ data: { userId: user.id, type: "IMAGE_ANALYZE", status: "COMPLETE", options: {} } });
  const assetId = randomUUID();
  const path = `${user.id}/${run.id}/${assetId}.png`;
  assert.equal((await service.storage.from(bucket).upload(path, "synthetic private asset")).error, null);
  await db.toolAsset.create({ data: { id: assetId, userId: user.id, toolRunId: run.id, storageBucket: bucket, storagePath: path,
    mimeType: "image/png", sizeBytes: 23, width: 1, height: 1, sha256: "a".repeat(64), expiresAt: new Date(Date.now() + 3600000) } });
  const ownAsset = await user.client.from("tool_assets").select("id").eq("id", assetId);
  assert.equal(ownAsset.error, null);
  assert.equal(ownAsset.data.length, 1);
  const otherAsset = await owner.client.from("tool_assets").select("id").eq("id", assetId);
  assert.equal(otherAsset.error, null);
  assert.deepEqual(otherAsset.data, []);
  assert.equal((await service.storage.from(bucket).download(path)).error, null);
  // Direct user Storage reads are also denied; the application uses an
  // authenticated server route to authorize and issue short-lived URLs.
  assert.notEqual((await user.client.storage.from(bucket).download(path)).error, null);
  assert.notEqual((await owner.client.storage.from(bucket).download(path)).error, null);
  console.info("Disposable bootstrap and OWNER JWT project/conversation/private Storage isolation verified; fixture retained for destruction.");
} finally { await db.$disconnect(); }
