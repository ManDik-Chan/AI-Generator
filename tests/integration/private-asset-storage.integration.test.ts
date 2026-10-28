import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";
import { uploadToolAsset } from "@/features/tools/image/storage";
import { uploadGeneratedImage } from "@/features/tools/image-generation/storage";
import { uploadPersonaAvatar } from "@/features/persona/avatar-storage";
import { deleteGeneratedAvatar, applyPersonaAvatar } from "@/features/persona/avatar-service";
import { deleteToolGeneratedImage } from "@/features/tools/image-generation/service";
import { cleanupToolRunAssets } from "@/features/tools/image/assets";
import { prepareToolAssetDeletion, requestDeletion, performDeletion, deletePendingObjectBytes, markGeneratedDeletion } from "@/features/storage/deletion";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
describe.skipIf(!enabled)("real private Storage deletion and recovery", () => {
  let db: PrismaClient, service: SupabaseClient, a: string, b: string, clientA: SupabaseClient;
  const bucket = process.env.AI_TOOL_ASSET_BUCKET!;
  const generated = process.env.SUPABASE_GENERATED_IMAGE_BUCKET!;
  const avatars = process.env.SUPABASE_PERSONA_AVATAR_BUCKET!;
  const bytes = new Uint8Array([137, 80, 78, 71]);
  beforeAll(async () => {
    db = createIntegrationPrisma();
    service = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const name of [bucket, generated, avatars]) {
      const existing = await service.storage.getBucket(name);
      if (existing.error) expect((await service.storage.createBucket(name, { public: false })).error).toBeNull();
    }
    const password = `Isolated!${randomUUID()}`;
    const email = `storage-a-${randomUUID()}@example.test`;
    const ca = await service.auth.admin.createUser({ email, password, email_confirm: true });
    const cb = await service.auth.admin.createUser({ email: `storage-b-${randomUUID()}@example.test`, password, email_confirm: true });
    expect(ca.error).toBeNull(); expect(cb.error).toBeNull();
    a = ca.data.user!.id; b = cb.data.user!.id;
    clientA = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await clientA.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect((await clientA.auth.getUser()).data.user?.id).toBe(a);
  }, 120_000);
  afterAll(async () => {
    await db?.$executeRawUnsafe('DROP TRIGGER IF EXISTS injected_cleanup_ack_failure ON public.asset_deletions');
    await db?.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.injected_cleanup_ack_failure()');
    for (const id of [a,b].filter(Boolean)) expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
    await db.profile.deleteMany({where:{id:{in:[a,b].filter(Boolean)}}});
    // Only this suite's synthetic objects; all deletion still uses production validation.
    const tasks = await db.assetDeletion.findMany({ where: { ownerId: { in: [a,b].filter(Boolean) }, state: { not: "COMPLETE" } } });
    for (const task of tasks) {
      if (task.state === "TRACKED" || task.state === "RESERVED") await db.assetDeletion.update({ where: { id: task.id }, data: { state: "PENDING" } });
      try { await performDeletion(task.id); } catch { /* failed cleanup remains explicit evidence */ }
    }
    await db.$disconnect();
  }, 120_000);
  async function tool(owner = a) {
    const run = await db.toolRun.create({ data: { userId: owner, type: "IMAGE_ANALYZE", status: "COMPLETE", options: {} } });
    const id = randomUUID(), path = `${owner}/${run.id}/${id}.png`;
    await uploadToolAsset(path, bytes, "image/png");
    await db.toolAsset.create({ data: { id, userId: owner, toolRunId: run.id, storageBucket: bucket, storagePath: path, mimeType: "image/png", sizeBytes: bytes.length, width: 1, height: 1, sha256: "a".repeat(64), expiresAt: new Date(Date.now()+86400000) } });
    return { id, path, runId: run.id, owner };
  }
  async function missing(path: string, name = bucket) { expect((await service.storage.from(name).download(path)).error).not.toBeNull(); }
  it("deletes A's object while retaining B's real bytes and denying ordinary JWT removal", async () => {
    const x = await tool(), y = await tool(b);
    await clientA.storage.from(bucket).remove([y.path]);
    expect((await service.storage.from(bucket).download(y.path)).error).toBeNull();
    await cleanupToolRunAssets(a,x.runId);
    await missing(x.path);
    expect((await service.storage.from(bucket).download(y.path)).error).toBeNull();
    expect(await db.toolAsset.count({ where: { id:x.id } })).toBe(0);
  });
  it("rejects raw privileged deletion without a durable authorized intent", async () => {
    const x = await tool();
    await expect(deletePendingObjectBytes(bucket,x.path)).rejects.toMatchObject({ state: "BLOCKED" });
    expect((await service.storage.from(bucket).download(x.path)).error).toBeNull();
  });
  it("retries after Storage success but DB acknowledgement failure, without deleting B", async () => {
    const x = await tool(), y = await tool(b);
    await prepareToolAssetDeletion(a,x.runId);
    const task = await db.assetDeletion.findUniqueOrThrow({ where: { bucket_path: { bucket, path:x.path } } });
    await db.$executeRawUnsafe(`CREATE FUNCTION public.injected_cleanup_ack_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${task.id}'::uuid AND NEW.state='COMPLETE' THEN RAISE EXCEPTION 'injected ack failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER injected_cleanup_ack_failure BEFORE UPDATE ON public.asset_deletions FOR EACH ROW EXECUTE FUNCTION public.injected_cleanup_ack_failure()');
    await expect(performDeletion(task.id)).rejects.toMatchObject({ state:"PENDING" });
    await missing(x.path);
    expect((await db.assetDeletion.findUniqueOrThrow({ where:{ id:task.id } })).state).toBe("PENDING");
    expect(await db.toolAsset.count({ where:{ id:x.id } })).toBe(1);
    await db.$executeRawUnsafe('DROP TRIGGER injected_cleanup_ack_failure ON public.asset_deletions');
    await db.$executeRawUnsafe('DROP FUNCTION public.injected_cleanup_ack_failure()');
    await cleanupToolRunAssets(a,x.runId);
    await performDeletion(task.id); // duplicate delivery after COMPLETE is a no-op
    expect((await service.storage.from(bucket).download(y.path)).error).toBeNull();
  });
  it("recovers after process death between Storage acknowledgement and DB acknowledgement", async () => {
    const x = await tool(); await prepareToolAssetDeletion(a,x.runId);
    const task = await db.assetDeletion.findUniqueOrThrow({ where: { bucket_path:{ bucket,path:x.path } } });
    const result = spawnSync(process.execPath,["--conditions=react-server","--import","tsx","tests/integration/fixtures/crash-deletion.ts",task.id], { cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:30000,windowsHide:true });
    expect(result.status, result.stderr).toBe(73);
    await missing(x.path);
    expect((await db.assetDeletion.findUniqueOrThrow({ where:{ id:task.id } })).state).toBe("PENDING");
    await cleanupToolRunAssets(a,x.runId);
    expect((await db.assetDeletion.findUniqueOrThrow({ where:{ id:task.id } })).state).toBe("COMPLETE");
  }, 40_000);
  it("serializes duplicate consumers and fences late row attachment/key reuse", async () => {
    const x = await tool(); await prepareToolAssetDeletion(a,x.runId);
    const task = await db.assetDeletion.findUniqueOrThrow({ where: { bucket_path:{ bucket,path:x.path } } });
    await Promise.all([performDeletion(task.id),performDeletion(task.id)]);
    await missing(x.path);
    await expect(uploadToolAsset(x.path,bytes,"image/png")).rejects.toBeDefined();
    await expect(db.toolAsset.create({ data:{ id:randomUUID(),userId:a,toolRunId:x.runId,storageBucket:bucket,storagePath:x.path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date() } })).rejects.toBeDefined();
  });
  it("recovers from competing authorized deletion requests without touching B", async () => {
    const x=await tool(), other=await tool(b);
    await Promise.allSettled([cleanupToolRunAssets(a,x.runId),cleanupToolRunAssets(a,x.runId)]);
    await cleanupToolRunAssets(a,x.runId);
    expect(await db.toolAsset.count({where:{id:x.id}})).toBe(0); await missing(x.path);
    expect((await service.storage.from(bucket).download(other.path)).error).toBeNull();
  });
  it("retains cleanup evidence on parent cascade and makes the cleanup table JWT-inaccessible", async () => {
    const x = await tool(); await db.toolRun.delete({ where:{ id:x.runId } });
    const task = await db.assetDeletion.findUniqueOrThrow({ where:{ bucket_path:{ bucket,path:x.path } } });
    expect(task.state).toBe("PENDING");
    const denied = await clientA.from("asset_deletions").select("id"); expect(denied.error).not.toBeNull();
    await performDeletion(task.id); await missing(x.path);
  });
  it("covers avatar and generated-image removal with the same durable authorization boundary", async () => {
    const persona = await db.persona.create({ data:{userId:a,name:"fixture",personality:"fixture",systemPrompt:"fixture"} });
    const id=randomUUID(), path=`${a}/${persona.id}/${id}.png`;
    await uploadPersonaAvatar(a,path,bytes,"image/png");
    await db.generatedImage.create({data:{id,userId:a,kind:"PERSONA_AVATAR",prompt:"fixture",provider:"fixture",model:"fixture",storageBucket:avatars,storagePath:path}});
    await markGeneratedDeletion(a,id);
    await expect(applyPersonaAvatar(a,persona.id,id,"fixture")).rejects.toBeDefined();
    // No apply/delete race can attach an image after its deletion tombstone.
    expect(await deleteGeneratedAvatar(a,id)).toBe("deleted"); await missing(path,avatars);
    const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_GENERATE",status:"COMPLETE",options:{}}});
    const gid=randomUUID(), gp=`${a}/${gid}.png`;
    await uploadGeneratedImage(a,gp,bytes,"image/png");
    await db.generatedImage.create({data:{id:gid,userId:a,toolRunId:run.id,kind:"TOOL_GENERATION",prompt:"fixture",provider:"fixture",model:"fixture",storageBucket:generated,storagePath:gp}});
    expect(await deleteToolGeneratedImage(a,gid)).toBe("deleted"); await missing(gp,generated);
  });
  it("keeps upload/compensation intent durable even before a source row exists", async () => {
    const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
    const id=randomUUID(), path=`${a}/${run.id}/${id}.png`;
    await uploadToolAsset(path,bytes,"image/png");
    expect((await db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket,path}}})).state).toBe("RESERVED");
    const task=await requestDeletion({kind:"TOOL_ASSET",ownerId:a,resourceId:id,scopeId:run.id,bucket,path});
    await performDeletion(task); await missing(path);
  });
  it("does not let corrupt avatar/generated references enqueue another owner's legitimate key", async () => {
    for (const kind of ["TOOL_GENERATION","PERSONA_AVATAR"] as const) {
      const id=randomUUID(), forgedId=randomUUID();
      const persona=await db.persona.create({data:{userId:b,name:"B fixture",personality:"fixture",systemPrompt:"fixture"}});
      const path=kind==="TOOL_GENERATION" ? `${b}/${id}.png` : `${b}/${persona.id}/${id}.png`;
      const name=kind==="TOOL_GENERATION" ? generated : avatars;
      const runB=kind==="TOOL_GENERATION" ? await db.toolRun.create({data:{userId:b,type:"IMAGE_GENERATE",status:"COMPLETE",options:{}}}) : null;
      const runA=kind==="TOOL_GENERATION" ? await db.toolRun.create({data:{userId:a,type:"IMAGE_GENERATE",status:"COMPLETE",options:{}}}) : null;
      // Legacy corrupt reference predates the legitimate object's reservation.
      await db.generatedImage.create({data:{id:forgedId,userId:a,kind,toolRunId:runA?.id,prompt:"corrupt fixture",provider:"fixture",model:"fixture",storageBucket:name,storagePath:path}});
      if(kind==="TOOL_GENERATION") await uploadGeneratedImage(b,path,bytes,"image/png"); else await uploadPersonaAvatar(b,path,bytes,"image/png");
      await db.generatedImage.create({data:{id,userId:b,kind,toolRunId:runB?.id,prompt:"fixture",provider:"fixture",model:"fixture",storageBucket:name,storagePath:path}});
      await expect(markGeneratedDeletion(a,forgedId)).rejects.toMatchObject({state:"BLOCKED"});
      await db.generatedImage.delete({where:{id:forgedId}}); // trigger must not promote B's task
      expect((await db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket:name,path}}})).state).toBe("TRACKED");
      expect((await service.storage.from(name).download(path)).error).toBeNull();
    }
  });
  it("retains real bytes and the source on injected Storage failure, then completes on retry", async () => {
    const x=await tool(); await prepareToolAssetDeletion(a,x.runId);
    const task=await db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket,path:x.path}}});
    const originalFetch=globalThis.fetch; let injectedRequests=0;
    const fault=vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
      const url=new URL(input instanceof Request ? input.url : String(input));
      if(url.pathname===`/storage/v1/object/${bucket}` && init?.method==="DELETE") {
        injectedRequests++;
        return new Response(JSON.stringify({statusCode:"503",error:"ServiceUnavailable",message:"INJECTED_STORAGE_OUTAGE"}),{status:503,headers:{"Content-Type":"application/json"}});
      }
      return originalFetch(input,init);
    });
    try { await expect(performDeletion(task.id)).rejects.toMatchObject({state:"PENDING"}); }
    finally { fault.mockRestore(); }
    expect(injectedRequests).toBeGreaterThan(0);
    expect((await service.storage.from(bucket).download(x.path)).error).toBeNull();
    expect(await db.toolAsset.count({where:{id:x.id}})).toBe(1);
    expect((await db.assetDeletion.findUniqueOrThrow({where:{id:task.id}})).state).toBe("PENDING");
    await performDeletion(task.id); await missing(x.path);
    expect(await db.toolAsset.count({where:{id:x.id}})).toBe(0);
  });
  it("does not turn a committed source into an upload compensation deletion", async () => {
    const x=await tool();
    await expect(requestDeletion({kind:"TOOL_ASSET",ownerId:a,resourceId:x.id,scopeId:x.runId,bucket,path:x.path})).rejects.toMatchObject({state:"BLOCKED"});
    expect((await service.storage.from(bucket).download(x.path)).error).toBeNull();
  });
  it("requires explicit historical bucket authorization for legacy source rows", async () => {
    const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
    const id=randomUUID(), path=`${a}/${run.id}/${id}.png`;
    expect((await service.storage.from(bucket).upload(path,bytes,{contentType:"image/png",upsert:false})).error).toBeNull();
    await db.toolAsset.create({data:{id,userId:a,toolRunId:run.id,storagePath:path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+86400000)}});
    const mapping=process.env.AI_TOOL_ASSET_LEGACY_BUCKET;
    delete process.env.AI_TOOL_ASSET_LEGACY_BUCKET;
    try {
      await expect(cleanupToolRunAssets(a,run.id)).rejects.toMatchObject({state:"BLOCKED"});
      expect((await service.storage.from(bucket).download(path)).error).toBeNull();
      expect(await db.toolAsset.count({where:{id}})).toBe(1);
    } finally { if(mapping===undefined) delete process.env.AI_TOOL_ASSET_LEGACY_BUCKET; else process.env.AI_TOOL_ASSET_LEGACY_BUCKET=mapping; }
    await cleanupToolRunAssets(a,run.id); await missing(path);
  });
  it("runs the independent cleanup command against durable due intents", async () => {
    const x=await tool(); await prepareToolAssetDeletion(a,x.runId);
    const child=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/cleanup-tool-assets.ts"],{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:30000,windowsHide:true});
    expect(child.status,child.stderr).toBe(0);
    expect((await db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket,path:x.path}}})).state).toBe("COMPLETE");
    expect(await db.toolAsset.count({where:{id:x.id}})).toBe(0); await missing(x.path);
  },40000);
  it("fences concurrent source attachment against upload compensation", async () => {
    const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
    const id=randomUUID(), path=`${a}/${run.id}/${id}.png`;
    await uploadToolAsset(path,bytes,"image/png");
    const [attach,compensate]=await Promise.allSettled([
      db.toolAsset.create({data:{id,userId:a,toolRunId:run.id,storageBucket:bucket,storagePath:path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+86400000)}}),
      requestDeletion({kind:"TOOL_ASSET",ownerId:a,resourceId:id,scopeId:run.id,bucket,path}),
    ]);
    expect([attach,compensate].filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const task=await db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket,path}}});
    if(attach.status==="fulfilled") {
      expect(task.state).toBe("TRACKED");
      expect((await service.storage.from(bucket).download(path)).error).toBeNull();
    } else {
      expect(task.state).toBe("PENDING"); await performDeletion(task.id); await missing(path);
      expect(await db.toolAsset.count({where:{id}})).toBe(0);
    }
  });
  it("fails closed for malformed paths and wrong buckets while preserving the other user's bytes", async () => {
    const other=await tool(b);
    for(const [badBucket,path] of [[bucket,other.path],[bucket,`${a}/../${other.path}`],[bucket,`${a}/%2e%2e/${other.path}`],["unapproved-bucket",other.path]] as const) {
      const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
      const insert=db.toolAsset.create({data:{userId:a,toolRunId:run.id,storageBucket:badBucket,storagePath:path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date()}});
      if(badBucket===bucket && path===other.path) {
        await expect(insert).rejects.toBeDefined(); // already tracked key cannot be attached twice
        expect((await service.storage.from(bucket).download(other.path)).error).toBeNull();
        continue;
      }
      const source=await insert;
      await expect(cleanupToolRunAssets(a,run.id)).rejects.toMatchObject({state:"BLOCKED"});
      expect(await db.toolAsset.count({where:{id:source.id}})).toBe(1);
      expect((await service.storage.from(bucket).download(other.path)).error).toBeNull();
    }
  });
});
