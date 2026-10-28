import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { createIntegrationPrisma,integrationDatabaseEnabled } from "./database";
import { uploadToolAsset } from "@/features/tools/image/storage";
import { cleanupExpiredToolAssets,cleanupToolRunAssets } from "@/features/tools/image/assets";
import { performDeletion,prepareToolAssetDeletion,requestDeletion,retryAssetDeletions } from "@/features/storage/deletion";
const session=vi.hoisted(()=>({getUser:async():Promise<unknown>=>{throw new Error("No real JWT session");}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth/supabase/server",()=>({createSupabaseServerClient:async()=>({auth:{getUser:session.getUser}})}));
import { GET as assetGet } from "@/app/api/tools/assets/[assetId]/route";
const enabled=integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
describe.skipIf(!enabled)("RESERVED semantics and historical private Storage acceptance",()=>{
  let db:PrismaClient,admin:SupabaseClient,a:string,b:string,clientA:SupabaseClient;
  const bucket=process.env.AI_TOOL_ASSET_BUCKET!, oldBucket="p1-retired-legacy";
  const bytes=new Uint8Array([137,80,78,71]);
  beforeAll(async()=>{
    db=createIntegrationPrisma();
    admin=createClient(process.env.SUPABASE_TEST_URL!,process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    for(const id of [bucket,oldBucket]) if((await admin.storage.getBucket(id)).error) expect((await admin.storage.createBucket(id,{public:false})).error).toBeNull();
    const password=`Test!${randomUUID()}`,email=`reserved-a-${randomUUID()}@example.test`;
    const aa=await admin.auth.admin.createUser({email,password,email_confirm:true});
    const bb=await admin.auth.admin.createUser({email:`reserved-b-${randomUUID()}@example.test`,password,email_confirm:true});
    expect(aa.error).toBeNull();expect(bb.error).toBeNull();a=aa.data.user!.id;b=bb.data.user!.id;
    await db.profile.update({where:{id:b},data:{role:"ADMIN"}});
    clientA=createClient(process.env.SUPABASE_TEST_URL!,process.env.SUPABASE_TEST_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    expect((await clientA.auth.signInWithPassword({email,password})).error).toBeNull();
    session.getUser=()=>clientA.auth.getUser();expect((await clientA.auth.getUser()).data.user?.id).toBe(a);
  },120000);
  afterAll(async()=>{
    for(const id of [a,b].filter(Boolean)) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    await db.profile.deleteMany({where:{id:{in:[a,b].filter(Boolean)}}});
    const tasks=await db.assetDeletion.findMany({where:{ownerId:{in:[a,b].filter(Boolean)},state:{in:["RESERVED","PENDING"]}}});
    // Every child has exited before teardown; no live uploader is cancelled by age.
    for(const task of tasks) {
      if(task.kind!=="TOOL_ASSET") continue;
      try { const id=await requestDeletion({...task,kind:"TOOL_ASSET"});await performDeletion(id); } catch { /* retained for audit */ }
    }
    await db.$disconnect();
  },120000);
  async function identity(owner=a){
    const run=await db.toolRun.create({data:{userId:owner,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
    const id=randomUUID();return {kind:"TOOL_ASSET" as const,ownerId:owner,resourceId:id,scopeId:run.id,bucket,path:`${owner}/${run.id}/${id}.png`};
  }
  const taskFor=(target:{bucket:string;path:string})=>db.assetDeletion.findUniqueOrThrow({where:{bucket_path:{bucket:target.bucket,path:target.path}}});
  const childArgs=(mode:string,path:string)=>["--conditions=react-server","--import","tsx","tests/integration/fixtures/reserved-upload.ts",mode,path];
  async function recover(target:Awaited<ReturnType<typeof identity>>){const id=await requestDeletion(target);await performDeletion(id);await performDeletion(id);expect((await taskFor(target)).state).toBe("COMPLETE");}
  it.each(["before","after","failure"])("retains a real reservation across %s upload termination and supports explicit idempotent recovery",async mode=>{
    const target=await identity();
    const result=spawnSync(process.execPath,childArgs(mode,target.path),{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:30000,windowsHide:true});
    expect(result.status,result.stderr).toBe(mode==="before"?73:mode==="after"?74:75);
    expect((await taskFor(target)).state).toBe("RESERVED");
    expect(await db.toolAsset.count({where:{id:target.resourceId}})).toBe(0);
    const downloaded=await admin.storage.from(bucket).download(target.path);
    if(mode==="after") expect(downloaded.error).toBeNull();else expect(downloaded.error).not.toBeNull();
    await recover(target);expect((await admin.storage.from(bucket).download(target.path)).error).not.toBeNull();
  },40000);
  it("never expires an in-flight reservation by age, and preserves a late upload until quiesced recovery",async()=>{
    const target=await identity();
    const child=spawn(process.execPath,childArgs("held",target.path),{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:["ignore","pipe","pipe","ipc"]});
    const exited=new Promise<number|null>(resolve=>child.once("exit",resolve));
    try {
      await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Held uploader not ready")),15000);child.stdout!.on("data",chunk=>{if(String(chunk).includes("RESERVATION_COMMITTED_UPLOAD_HELD")){clearTimeout(timer);resolve();}});child.once("exit",()=>{clearTimeout(timer);reject(new Error("Uploader exited before hold"));});});
      const task=await taskFor(target);await db.assetDeletion.update({where:{id:task.id},data:{createdAt:new Date("2000-01-01")}});
      await cleanupExpiredToolAssets(new Date());await retryAssetDeletions();
      expect((await taskFor(target)).state).toBe("RESERVED");
      child.send({continue:true});expect(await exited).toBe(74);
      expect((await admin.storage.from(bucket).download(target.path)).error).toBeNull();
      await recover(target);
    } finally {if(child.exitCode===null){child.kill();await exited;}}
  },40000);
  it("tracks a committed source and rejects duplicate reservation and later compensation",async()=>{
    const target=await identity();await uploadToolAsset(target.path,bytes,"image/png");
    await db.toolAsset.create({data:{id:target.resourceId,userId:a,toolRunId:target.scopeId,storageBucket:bucket,storagePath:target.path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+86400000)}});
    expect((await taskFor(target)).state).toBe("TRACKED");
    await expect(uploadToolAsset(target.path,bytes,"image/png")).rejects.toBeDefined();
    await expect(requestDeletion(target)).rejects.toMatchObject({state:"BLOCKED"});
    expect((await admin.storage.from(bucket).download(target.path)).error).toBeNull();await cleanupToolRunAssets(a,target.scopeId);
  });
  it("serializes duplicate quiesced recovery and refuses another principal's target",async()=>{
    const target=await identity();await uploadToolAsset(target.path,bytes,"image/png");
    await expect(requestDeletion({...target,ownerId:b})).rejects.toMatchObject({state:"BLOCKED"});
    const ids=await Promise.all([requestDeletion(target),requestDeletion(target)]);expect(ids[0]).toBe(ids[1]);
    await Promise.all(ids.map(id=>performDeletion(id)));expect((await taskFor(target)).state).toBe("COMPLETE");
  });
  it("keeps historical unapproved buckets blocked and prevents cross-owner legacy removal",async()=>{
    const target=await identity(b);
    expect((await admin.storage.from(oldBucket).upload(target.path,bytes,{upsert:false,contentType:"image/png"})).error).toBeNull();
    const run=await db.toolRun.create({data:{userId:a,type:"IMAGE_ANALYZE",status:"COMPLETE",options:{}}});
    await db.toolAsset.create({data:{userId:a,toolRunId:run.id,storageBucket:oldBucket,storagePath:target.path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date()}});
    await expect(cleanupToolRunAssets(a,run.id)).rejects.toMatchObject({state:"BLOCKED"});
    expect((await clientA.storage.from(oldBucket).download(target.path)).error).not.toBeNull();
    expect((await admin.storage.from(oldBucket).download(target.path)).error).toBeNull();
    // Retired-bucket bytes intentionally retained as blocked audit evidence.
  });
  it("cleans real legacy filenames distinct from asset IDs only within the authenticated owner's run",async()=>{
    const aa=await identity(),bb=await identity(b);
    for(const target of [aa,bb]) {
      target.path=`${target.ownerId}/${target.scopeId}/${randomUUID()}.png`;
      expect((await admin.storage.from(bucket).upload(target.path,bytes,{upsert:false,contentType:"image/png"})).error).toBeNull();
      await db.toolAsset.create({data:{id:target.resourceId,userId:target.ownerId,toolRunId:target.scopeId,storagePath:target.path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+86400000)}});
    }
    expect((await clientA.auth.getUser()).data.user?.id).toBe(a);
    await cleanupToolRunAssets(a,aa.scopeId);
    expect((await admin.storage.from(bucket).download(aa.path)).error).not.toBeNull();
    expect((await admin.storage.from(bucket).download(bb.path)).error).toBeNull();
    expect((await clientA.storage.from(bucket).download(bb.path)).error).not.toBeNull();
    await cleanupToolRunAssets(b,bb.scopeId);
    expect((await admin.storage.from(bucket).download(bb.path)).error).not.toBeNull();
  });
  it("withdraws new signing and restore access before cleanup, without claiming old signed URLs were revoked",async()=>{
    const target=await identity();await uploadToolAsset(target.path,bytes,"image/png");
    await db.toolAsset.create({data:{id:target.resourceId,userId:a,toolRunId:target.scopeId,storageBucket:bucket,storagePath:target.path,mimeType:"image/png",sizeBytes:4,width:1,height:1,sha256:"a".repeat(64),expiresAt:new Date(Date.now()+86400000)}});
    const context={params:Promise.resolve({assetId:target.resourceId})},request=new Request(`http://127.0.0.1/api/tools/assets/${target.resourceId}`);
    const before=await assetGet(request,context);expect(before.status).toBe(302);
    const signed=before.headers.get("location")!;expect((await fetch(signed)).status).toBe(200);
    await prepareToolAssetDeletion(a,target.scopeId);
    expect((await assetGet(request,context)).status).toBe(404);
    expect(await db.toolAsset.findFirst({where:{id:target.resourceId,userId:a,deletionRequestedAt:null}})).toBeNull();
    expect((await fetch(signed)).status).toBe(200); // existing 60s capability remains until byte cleanup/expiry
    await performDeletion((await taskFor(target)).id);
    expect((await admin.storage.from(bucket).download(target.path)).error).not.toBeNull();
    expect((await assetGet(request,context)).status).toBe(404);
  });
});
