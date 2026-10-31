// Registry migration proof. No .env, remote URLs or unlabelled containers.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename } from "node:path";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertDisposableTarget, bindDisposableLoopback } from "./disposable-supabase.mjs";

const root = process.cwd(), target = assertDisposableTarget();
const name = "20261028135224_project_registry_foundation";
const lastB1Migration = "20261030120001_registry_sealing_qualification";
const lastB2aMigration = "20261030174407_registry_draft_review_commands";
const lastB2bMigration = "20261031054426_registry_release_commands";
const migrationsRoot = join(root, "prisma/migrations");
const migrations = readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const boundary = migrations.indexOf(name);
assert(boundary >= 0, "Registry foundation migration is required");
assert.equal(new Set(migrations.map(migration => migration.split("_")[0])).size, migrations.length, "Duplicate migration timestamp");
const mainPrefix = migrations.slice(0, boundary), registrySuffix = migrations.slice(boundary);
const require = createRequire(import.meta.url), cli = require.resolve("prisma/build/index.js");
const supabase = join(root, "node_modules/supabase/dist/supabase.js");
function run(args) {
  const result = spawnSync(process.execPath, args, { env: process.env, cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, "Migration process failed; credential-bearing output suppressed");
}
async function reset() {
  assertDisposableTarget();
  run([supabase, "db", "reset", "--local", "--no-seed", "--workdir", target.workdir]);
  await bindDisposableLoopback(target.workdir);
}
async function snapshot(db) {
  const tables = await db.$queryRaw`SELECT schemaname,tablename FROM pg_tables
    WHERE schemaname IN ('public','registry_private') AND tablename<>'_prisma_migrations' ORDER BY schemaname,tablename`;
  const data = [];
  for (const { schemaname,tablename } of tables) {
    assert(/^[a-z_]+$/.test(schemaname) && /^[a-z_]+$/.test(tablename));
    const relation = `${schemaname}.${tablename}`;
    // Additive B2-B provenance columns must not change any preexisting bytes.
    // Compare every old column, then assert those new columns stay NULL below.
    const row = relation === "public.project_releases" ? "(to_jsonb(t)-'authorization_id'-'published_by')" : "to_jsonb(t)";
    data.push(...await db.$queryRawUnsafe(`SELECT '${relation}' AS name,count(*)::int AS count,md5(string_agg(${row}::text,E'\n' ORDER BY ${row}::text)) AS digest FROM ${relation} t`));
  }
  return data;
}
async function assertPreservedData(db, before) {
  const names = new Set(before.map(row => row.name));
  assert.deepEqual((await snapshot(db)).filter(row => names.has(row.name)), before);
}
async function seedB1Registry(db) {
  // Data-preservation fixtures only, not authentication evidence. Real Auth
  // issuance/JWT/session/RLS behavior is exercised by the integration suites.
  // All writes use the inspected disposable database, with no other API target.
  await db.$transaction(async tx => {
    const owner = randomUUID(), reviewer = randomUUID(), digest = "a".repeat(64);
    for (const subject of [owner,reviewer]) {
      await tx.$executeRaw`INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES(${subject}::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
          ${`${subject}@example.test`},'{}'::jsonb,'{}'::jsonb,statement_timestamp(),statement_timestamp())`;
      await tx.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
        VALUES(${subject}::uuid,true,true,statement_timestamp()+interval '1 hour')`;
    }
    const project = await tx.project.create({ data: { slug: `migration-${randomUUID()}`, ownerId: owner } });
    await tx.projectMembership.create({ data: { projectId: project.id, subjectId: reviewer, roles: ["REVIEWER"] } });
    const draft = await tx.projectDraft.create({ data: { projectId: project.id, updatedBy: owner } });
    const asset = await tx.projectAsset.create({ data: { projectId: project.id, sourceDigest: digest, mime: "text/markdown", size: 10,
      dataClass: "CURATED", storageRef: `private/${randomUUID()}`, provenance: {}, rightsRef: "migration-fixture" } });
    await tx.projectAsset.update({ where: { id: asset.id }, data: { state: "VALIDATED", deliveryDigest: digest } });
    await tx.projectAsset.update({ where: { id: asset.id }, data: { state: "APPROVED" } });
    await tx.projectDocumentation.create({ data: { projectId: project.id, draftId: draft.id, title: "preserve draft document",
      language: "en", assetId: asset.id, contentHash: digest } });
    const submitted = await tx.projectDraft.update({ where: { id: draft.id }, data: { state: "IN_REVIEW" } });
    const current = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const review = await tx.publicationReview.create({ data: { projectId: project.id, draftId: draft.id, draftRevision: submitted.revision,
      authzEpoch: current.authzEpoch, snapshotHash: digest, visibility: "PRIVATE", assetDigestSet: [], submitterId: owner,
      policyRevision: 1, expiresAt: new Date(Date.now()+3600000) } });
    await tx.publicationReview.update({ where: { id: review.id }, data: { decision: "APPROVED", reviewerId: reviewer, decidedAt: new Date() } });
    const version = await tx.projectVersion.create({ data: { projectId: project.id, version: "1.0.0", snapshot: {}, contentHash: digest, reviewId: review.id } });
    await tx.projectDocumentation.create({ data: { projectId: project.id, versionId: version.id, title: "preserve sealed document",
      language: "en", assetId: asset.id, contentHash: digest } });
    const release = await tx.projectRelease.create({ data: { projectId: project.id, versionId: version.id, contentHash: digest,
      visibilityAtApproval: "PRIVATE", publishedAt: new Date() }, select: { id: true } });
    await tx.project.update({ where: { id: project.id }, data: { currentReleaseId: release.id } });
  });
  console.info("Seeded all eight B1 entities plus qualification/Auth subjects before the B2 upgrade");
}
async function seedB2aProtocol(db) {
  const [fixture] = await db.$queryRaw`SELECT p.id AS project_id,p.owner_id,d.id AS draft_id,d.revision,r.id AS review_id,p.authz_epoch
    FROM public.projects p JOIN public.project_drafts d ON d.project_id=p.id
      JOIN public.publication_reviews r ON r.draft_id=d.id ORDER BY p.id LIMIT 1`;
  assert(fixture, "Preserved B1 fixture required for B2-A upgrade proof");
  await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
    VALUES(${fixture.owner_id}::uuid,'READ_DRAFT',true,clock_timestamp()+interval '1 hour')`;
  await db.$executeRaw`INSERT INTO registry_private.command_receipts(project_id,actor_id,idempotency_key,action,body_hash,expected_revision,authz_epoch,result)
    VALUES(${fixture.project_id}::uuid,${fixture.owner_id}::uuid,'migration-preserve-b2a','EDIT_DRAFT',${"b".repeat(64)},${fixture.revision},${fixture.authz_epoch},'{"fixture":"preserve-b2a"}'::jsonb)`;
  await db.$executeRaw`INSERT INTO registry_private.review_invalidations(review_id,project_id,actor_id,reason)
    VALUES(${fixture.review_id}::uuid,${fixture.project_id}::uuid,${fixture.owner_id}::uuid,'WITHDRAWN')`;
  console.info("Seeded B2-A action, immutable receipt and review invalidation before B2-B upgrade");
}
async function seedB2bProtocol(db) {
  // Upgrade fixtures exercise the final B2-B schema with its SQL guards intact.
  // They never provision a real operator or enable a publication service flag.
  await db.$transaction(async tx => {
    const [legacy] = await tx.$queryRaw`SELECT p.id,p.owner_id,m.subject_id AS reviewer_id,p.current_release_id
      FROM public.projects p JOIN public.project_memberships m ON m.project_id=p.id AND m.subject_id<>p.owner_id
      WHERE p.current_release_id IS NOT NULL ORDER BY p.id LIMIT 1`;
    assert(legacy, "Legacy Release fixture required for B2-B upgrade proof");
    for (const [subject,action] of [[legacy.owner_id,"REQUEST_RELEASE"],[legacy.owner_id,"WITHDRAW_RELEASE"],[legacy.reviewer_id,"APPROVE_RELEASE"]]) {
      await tx.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
        VALUES(${subject}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    }
    const digest = "c".repeat(64), project = await tx.project.create({ data: { slug: `b2b-preserve-${randomUUID()}`, ownerId: legacy.owner_id } });
    await tx.projectMembership.create({ data: { projectId: project.id, subjectId: legacy.reviewer_id, roles: ["REVIEWER"] } });
    const draft = await tx.projectDraft.create({ data: { projectId: project.id, updatedBy: legacy.owner_id } });
    const submitted = await tx.projectDraft.update({ where: { id: draft.id }, data: { state: "IN_REVIEW" } });
    const current = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const review = await tx.publicationReview.create({ data: { projectId: project.id, draftId: draft.id, draftRevision: submitted.revision,
      authzEpoch: current.authzEpoch, snapshotHash: digest, visibility: "PRIVATE", assetDigestSet: [], submitterId: legacy.owner_id,
      policyRevision: 1, expiresAt: new Date(Date.now()+3600000) } });
    await tx.publicationReview.update({ where: { id: review.id }, data: { decision: "APPROVED", reviewerId: legacy.reviewer_id, decidedAt: new Date() } });
    const version = await tx.projectVersion.create({ data: { projectId: project.id, version: "1.0.0", snapshot: { manifest: { visibility: "PRIVATE" } },
      contentHash: digest, reviewId: review.id } });
    const [request] = await tx.$queryRaw`INSERT INTO registry_private.release_requests
      (project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,policy_revision,intent,requester_id,expires_at)
      VALUES(${project.id}::uuid,${version.id}::uuid,${digest},'PRIVATE','[]'::jsonb,${current.authzEpoch},${current.revision},1,'PUBLISH',
        ${legacy.owner_id}::uuid,clock_timestamp()+interval '10 minutes') RETURNING id`;
    await tx.$executeRaw`INSERT INTO registry_private.release_approvals(project_id,request_id,reviewer_id)
      VALUES(${project.id}::uuid,${request.id}::uuid,${legacy.reviewer_id}::uuid)`;
    await tx.$executeRaw`INSERT INTO registry_private.release_receipts(project_id,actor_id,idempotency_key,action,body_hash,authz_epoch,result)
      VALUES(${project.id}::uuid,${legacy.owner_id}::uuid,'migration-preserve-b2b','REQUEST_RELEASE',${digest},${current.authzEpoch},'{"fixture":"preserve-b2b"}'::jsonb)`;
    await tx.$executeRaw`INSERT INTO registry_private.release_withdrawals(release_id,project_id,actor_id)
      VALUES(${legacy.current_release_id}::uuid,${legacy.id}::uuid,${legacy.owner_id}::uuid)`;
    await tx.project.update({ where: { id: legacy.id }, data: { currentReleaseId: null, visibility: "PRIVATE" } });
  });
  console.info("Seeded B2-B request, independent approval, withdrawal and receipt before B3-A upgrade");
}
async function storageSnapshot(db) {
  const buckets = await db.$queryRaw`SELECT id,to_jsonb(b) AS row FROM storage.buckets b ORDER BY id`;
  const objects = await db.$queryRaw`SELECT id,to_jsonb(o) AS row FROM storage.objects o ORDER BY id`;
  const policies = await db.$queryRaw`SELECT schemaname,tablename,policyname,roles::text[] AS roles,cmd,qual,with_check,permissive
    FROM pg_policies WHERE schemaname='storage' ORDER BY tablename,policyname`;
  const triggers = await db.$queryRaw`SELECT t.tgrelid::regclass::text AS relation,t.tgname,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND NOT t.tgisinternal ORDER BY relation,t.tgname`;
  return { buckets,objects,policies,triggers };
}
async function seedStorageBytes() {
  // Match the inspected disposable gateway before using even a test service
  // key. Never send privileged credentials to an environment-supplied remote.
  const url = new URL(process.env.SUPABASE_TEST_URL ?? ""), key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  const gateway = JSON.parse(execFileSync("docker",["inspect",`supabase_kong_${target.project}`],{encoding:"utf8",windowsHide:true}))[0];
  const bindings = gateway.HostConfig.PortBindings?.["8000/tcp"];
  assert(key && url.protocol==="http:" && url.hostname==="127.0.0.1" && !url.username && !url.password
    && gateway.Config.Labels?.["com.supabase.cli.project"]===target.project && gateway.State.Running
    && bindings?.length && bindings.every(binding => binding.HostIp==="127.0.0.1" && binding.HostPort===url.port),
  "Storage byte fixture requires the inspected loopback disposable gateway");
  const client = createClient(url.origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(resource,init)=>fetch(resource,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)})}});
  const bucket = `p1-storage-upgrade-${randomUUID()}`, path = `${randomUUID()}/upgrade-fixture.txt`;
  const bytes = Buffer.from("Preserve preexisting private object bytes across every Registry migration.\n","utf8");
  const created = await client.storage.createBucket(bucket,{public:false,fileSizeLimit:1024,allowedMimeTypes:["text/plain"]});
  assert(!created.error,"Private Storage upgrade fixture bucket creation failed");
  const uploaded = await client.storage.from(bucket).upload(path,bytes,{contentType:"text/plain",upsert:false,cacheControl:"0"});
  assert(!uploaded.error,"Real Storage upgrade fixture upload failed");
  const fixture = {client,bucket,path,digest:createHash("sha256").update(bytes).digest("hex"),size:bytes.length};
  await assertStorageBytes(fixture);
  return fixture;
}
async function assertStorageBytes(fixture) {
  const downloaded = await fixture.client.storage.from(fixture.bucket).download(fixture.path);
  assert(!downloaded.error && downloaded.data,"Preexisting private Storage object could not be downloaded");
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  assert.equal(bytes.length,fixture.size,"Registry migration changed preexisting private object size");
  assert.equal(createHash("sha256").update(bytes).digest("hex"),fixture.digest,"Registry migration changed preexisting private object bytes");
}
async function catalogSnapshot(db) {
  // Preserve existing ACLs, RLS/policies, constraints, types, routines and
  // triggers as well as legacy data when any Registry transaction fails.
  const [result] = await db.$queryRaw`
    SELECT jsonb_agg(c ORDER BY c.kind,c.name,c.definition) AS catalog FROM (
      SELECT 'schema' AS kind,nspname AS name,coalesce(nspacl::text,'') AS definition
        FROM pg_namespace WHERE nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'relation',n.nspname||'.'||c.relname,
        jsonb_build_object('kind',c.relkind,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)::text
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(c.oid)||':'||convalidated::text
        FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname IN ('public','registry_private')
      UNION ALL
      SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,
        jsonb_build_object('roles',roles,'cmd',cmd,'qual',qual,'check',with_check,'permissive',permissive)::text
        FROM pg_policies WHERE schemaname IN ('public','registry_private')
      UNION ALL
      SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
        pg_get_functiondef(p.oid)||':'||coalesce(p.proacl::text,'')
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','registry_private') AND p.prokind IN ('f','p')
      UNION ALL
      SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','registry_private') AND NOT t.tgisinternal
      UNION ALL
      SELECT 'enum',n.nspname||'.'||t.typname,string_agg(e.enumlabel,',' ORDER BY e.enumsortorder)
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
        WHERE n.nspname IN ('public','registry_private') GROUP BY n.nspname,t.typname
    ) c`;
  return result.catalog;
}
async function verifyMigrations(db, expected) {
  const applied = await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at
    FROM public._prisma_migrations ORDER BY migration_name`;
  assert.deepEqual(applied.map(migration => migration.migration_name), expected);
  for (const migration of applied) {
    assert(migration.finished_at && !migration.rolled_back_at, "Every migration must be applied exactly once");
    assert.equal(migration.checksum, createHash("sha256").update(readFileSync(join(migrationsRoot,migration.migration_name,"migration.sql"))).digest("hex"));
  }
}
const temporary = mkdtempSync(join(tmpdir(), "aig-registry-migrations-"));
try {
  await reset();
  const schema = join(temporary, "prisma/schema.prisma");
  mkdirSync(join(temporary, "prisma"));
  cpSync("prisma/schema.prisma", schema);
  cpSync("prisma/migrations", join(temporary, "prisma/migrations"), { recursive: true,
    filter: source => {
      const entry = relative(migrationsRoot, resolve(source)).split(/[\\/]/)[0];
      return !entry || entry === "migration_lock.toml" || mainPrefix.includes(entry);
    } });
  run([cli, "migrate", "deploy", "--schema", schema]);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const userId = randomUUID();
    await db.profile.create({ data: { id: userId, email: `${userId}@example.test` } });
    const persona = await db.persona.create({ data: { userId, name: "historical", personality: "fixture", systemPrompt: "fixture" } });
    const conversation = await db.conversation.create({ data: { userId, personaId: persona.id, title: "historical" } });
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: "preserve historical chat" } });
    await db.toolRun.create({ data: { userId, type: "SUMMARIZE", options: {}, outputText: "historical output" } });
    await db.memory.create({ data: { userId, content: "historical memory", category: "fixture", verificationMethod: "MANUAL_ENTRY", verifiedAt: new Date() } });
    await verifyMigrations(db, mainPrefix);
    const storageFixture = await seedStorageBytes(), populatedStorage = await storageSnapshot(db);
    assert(populatedStorage.objects.length>0 && populatedStorage.objects.some(object => object.row.bucket_id===storageFixture.bucket && object.row.name===storageFixture.path),
      "Storage preservation proof requires a preexisting real object");
    const expected = [...mainPrefix];
    let seededB1 = false, seededB2a = false, seededB2b = false;
    for (const migration of registrySuffix) {
      if (migration > lastB1Migration && !seededB1) {
        await seedB1Registry(db);
        seededB1 = true;
      }
      if (migration > lastB2aMigration && !seededB2a) {
        await seedB2aProtocol(db); seededB2a = true;
      }
      if (migration > lastB2bMigration && !seededB2b) {
        await seedB2bProtocol(db); seededB2b = true;
      }
      const before = await snapshot(db);
      const beforeCatalog = await catalogSnapshot(db);
      const beforeStorage = await storageSnapshot(db);
      const sql = readFileSync(join(migrationsRoot, migration, "migration.sql"), "utf8");
      assert(/^BEGIN;/m.test(sql) && /COMMIT;\s*$/.test(sql), "Registry migrations must be explicitly transactional");
      const failed = spawnSync("docker", ["exec", "-i", `supabase_db_${target.project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
        input: sql.replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;\n"), encoding: "utf8", windowsHide: true,
      });
      assert.notEqual(failed.status, 0); assert(failed.stderr.includes("division by zero"));
      assert.deepEqual(await catalogSnapshot(db), beforeCatalog, "Failed Registry migration changed schema or permissions");
      assert.deepEqual(await storageSnapshot(db),beforeStorage,"Failed Registry migration changed Storage identities, policies or triggers");
      await assertPreservedData(db, before);
      const afterStorage = await storageSnapshot(db);
      for (const kind of ["buckets","objects"]) {
        const previous = new Set(beforeStorage[kind].map(row => row.id));
        assert.deepEqual(afterStorage[kind].filter(row => previous.has(row.id)),beforeStorage[kind],"Registry migration changed preexisting Storage identities");
      }
      await verifyMigrations(db, expected);
      cpSync(join(migrationsRoot,migration), join(temporary,"prisma/migrations",migration), { recursive: true });
      run([cli, "migrate", "deploy", "--schema", schema]);
      expected.push(migration);
      await verifyMigrations(db, expected);
      await assertPreservedData(db, before);
      const appliedStorage = await storageSnapshot(db);
      for (const kind of ["buckets","objects"]) {
        const previous = new Set(beforeStorage[kind].map(row => row.id));
        assert.deepEqual(appliedStorage[kind].filter(row => previous.has(row.id)),beforeStorage[kind],"Applied Registry migration changed preexisting Storage identities");
      }
      for (const [kind,identity] of [["policies",row => `${row.tablename}.${row.policyname}`],["triggers",row => `${row.relation}.${row.tgname}`]]) {
        const previous = new Set(beforeStorage[kind].map(identity));
        assert.deepEqual(appliedStorage[kind].filter(row => previous.has(identity(row))),beforeStorage[kind],"Applied Registry migration changed preexisting Storage policy or trigger definitions");
      }
      await assertStorageBytes(storageFixture);
      if (migration > lastB2aMigration) {
        const [legacy] = await db.$queryRaw`SELECT count(*)::int AS count FROM public.project_releases
          WHERE authorization_id IS NOT NULL OR published_by IS NOT NULL`;
        assert.equal(legacy.count,0,"B2-B must not fabricate fresh authorization for legacy Release rows");
      }
      console.info(`Registry incremental + injected transaction rollback passed: ${migration}`);
      console.info(`Preserved prefix data snapshot: ${createHash("sha256").update(JSON.stringify(before)).digest("hex")}`);
    }
    const removed = await storageFixture.client.storage.from(storageFixture.bucket).remove([storageFixture.path]);
    assert(!removed.error,"Private Storage upgrade fixture object cleanup failed");
    const deleted = await storageFixture.client.storage.deleteBucket(storageFixture.bucket);
    assert(!deleted.error,"Private Storage upgrade fixture bucket cleanup failed");
  } finally { await db.$disconnect(); }
  await reset();
  run([cli, "migrate", "deploy"]); run([cli, "migrate", "deploy"]);
  const clean = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    const [row] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname IN ('projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews') AND relrowsecurity`;
    assert.equal(row.count, 8);
    const [privateTables] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class
      WHERE relnamespace='registry_private'::regnamespace
        AND relname IN ('operator_actions','command_receipts','review_invalidations','release_requests','release_approvals','release_withdrawals','release_receipts') AND relrowsecurity
        AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')`;
    assert.equal(privateTables.count, 7, "Private command tables must have RLS and no client privileges");
    const [seedless] = await clean.$queryRaw`SELECT
      (SELECT count(*) FROM registry_private.operator_actions)+
      (SELECT count(*) FROM registry_private.command_receipts)+
      (SELECT count(*) FROM registry_private.review_invalidations)+
      (SELECT count(*) FROM registry_private.release_requests)+
      (SELECT count(*) FROM registry_private.release_approvals)+
      (SELECT count(*) FROM registry_private.release_withdrawals)+
      (SELECT count(*) FROM registry_private.release_receipts) AS count`;
    assert.equal(seedless.count, 0n, "Command tables must not provision privileges or records on install");
    const [byteEvidence] = await clean.$queryRaw`SELECT count(*)::int AS count FROM pg_class
      WHERE relnamespace='registry_private'::regnamespace AND relname IN ('asset_object_intents','asset_quarantine','asset_verifications') AND relrowsecurity
        AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')`;
    assert.equal(byteEvidence.count,3,"Byte evidence and intent tables must have RLS and no client privileges");
    const [noByteSeeds] = await clean.$queryRaw`SELECT (SELECT count(*) FROM registry_private.asset_object_intents)+(SELECT count(*) FROM registry_private.asset_quarantine)+
      (SELECT count(*) FROM registry_private.asset_verifications) AS count`;
    assert.equal(noByteSeeds.count,0n,"Install must not fabricate byte or scan evidence");
    const registryBuckets = await clean.$queryRaw`SELECT id,public,file_size_limit FROM storage.buckets
      WHERE id IN ('registry-quarantine-v1','registry-candidates-v1') ORDER BY id`;
    assert.equal(registryBuckets.length,2);
    assert(registryBuckets.every(bucket => !bucket.public && Number(bucket.file_size_limit)===2097152),"Registry buckets must be private and bounded");
    await verifyMigrations(clean, migrations);
    console.info(`Registry clean install + repeat deploy + eight RLS tables + all ${migrations.length} migration checksums passed`);
  } finally { await clean.$disconnect(); }
} finally {
  const path = resolve(temporary), parent = resolve(tmpdir());
  assert(relative(parent,path) && !relative(parent,path).startsWith("..") && basename(path).startsWith("aig-registry-migrations-"));
  rmSync(path, { recursive: true, force: true });
}
