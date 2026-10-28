import assert from "node:assert/strict";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
export function validateResetUrls(env) {
  assert.equal(env.ALLOW_TEST_DATABASE_MUTATIONS, "true");
  assert.equal(env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION, "true");
  assert.equal(env.ALLOW_TEST_DATABASE_RESET, "true", "Explicit disposable reset authorization required");
  assert(env.SUPABASE_TEST_WORKDIR, "Explicit SUPABASE_TEST_WORKDIR required");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "TEST_DATABASE_URL"]) {
    assert(env[key] && loopback.has(new URL(env[key]).hostname), "Reset requires loopback database URLs");
    assert.equal(env[key], env.TEST_DATABASE_URL, "All Prisma URLs must match the disposable target");
  }
}
export function inspectWorkdir(workdir) {
  assert(workdir, "Explicit workdir required");
  const directory=realpathSync(resolve(workdir));
  const config=readFileSync(join(directory,"supabase/config.toml"),"utf8");
  const project=config.match(/^project_id\s*=\s*"([a-z0-9-]+)"/m)?.[1];
  const hosted=process.env.GITHUB_ACTIONS==="true" && process.env.RUNNER_ENVIRONMENT==="github-hosted";
  const ciProject=hosted && project==="ai-generator-security-acceptance";
  if(!ciProject) {
    assert(/^aig-platform-p1-final-[a-z0-9-]+$/.test(project??""),"Not a final-acceptance disposable project");
    const marker=json(join(directory,".p1-disposable.json"));
    assert(marker.disposable===true && marker.project===project,"Missing matching disposable marker");
  }
  assert(!existsSync(join(directory,"supabase/.temp/project-ref")),"Linked projects are forbidden");
  return {workdir:directory,project};
}
const json=file=>JSON.parse(readFileSync(file,"utf8"));
const inspect=name=>JSON.parse(execFileSync("docker",["inspect",name],{encoding:"utf8"}))[0];
export function assertDisposableTarget(env=process.env) {
  validateResetUrls(env);
  const target=inspectWorkdir(env.SUPABASE_TEST_WORKDIR);
  const root=process.cwd(), cli=join(root,"node_modules/supabase/dist/supabase.js");
  const status=JSON.parse(execFileSync(process.execPath,[cli,"status","--workdir",target.workdir,"-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],windowsHide:true}));
  assert.equal(status.DB_URL,env.TEST_DATABASE_URL,"CLI and Prisma database target mismatch");
  for(const [kind,key,port] of [["db","DB_URL","5432/tcp"],["kong","API_URL","8000/tcp"]]) {
    const container=inspect(`supabase_${kind}_${target.project}`), url=new URL(status[key]);
    const bindings=container.HostConfig.PortBindings?.[port];
    assert(container.Config.Labels?.["com.supabase.cli.project"]===target.project && container.State.Running,"Container ownership/running check failed");
    assert(loopback.has(url.hostname) && bindings?.length && bindings.every(b=>b.HostIp==="127.0.0.1" && b.HostPort===url.port),"Target must have matching loopback ports");
  }
  return target;
}
let engineApiVersion;
const request=(method,path,body)=>new Promise((resolveRequest,reject)=>{
  engineApiVersion??=execFileSync("docker",["version","--format","{{.Server.APIVersion}}"],{encoding:"utf8"}).trim();
  assert(/^\d+\.\d+$/.test(engineApiVersion),"Docker server API version required");
  const raw=body?JSON.stringify(body):"";
  const req=http.request({socketPath:process.platform==="win32"?"//./pipe/docker_engine":"/var/run/docker.sock",path:`/v${engineApiVersion}${path}`,method,headers:raw?{"Content-Type":"application/json","Content-Length":Buffer.byteLength(raw)}:{}},res=>{
    let output="";res.on("data",chunk=>output+=chunk);res.on("end",()=>res.statusCode>=200&&res.statusCode<300?resolveRequest(output?JSON.parse(output):{}):reject(new Error(`Owned container operation failed: ${res.statusCode} ${output.slice(0,500)}`)));
  });req.on("error",reject);req.end(raw);
});
export async function bindDisposableLoopback(workdir) {
  const {project}=inspectWorkdir(workdir);
  for(const kind of ["kong","db"]) {
    const name=`supabase_${kind}_${project}`, c=inspect(name);
    assert(c.Config.Labels?.["com.supabase.cli.project"]===project,"Container label mismatch");
    const bindings=Object.values(c.HostConfig.PortBindings??{}).flat();
    if(bindings.every(b=>b.HostIp==="127.0.0.1")) continue;
    for(const binding of bindings) binding.HostIp="127.0.0.1";
    // Keep the actual probe/retries; a one-second interval avoids waiting for
    // Docker's default 30-second first probe after recreating a test container.
    if(c.Config.Healthcheck) c.Config.Healthcheck.Interval=1_000_000_000;
    // Preserve DNS aliases, not a static address: Linux bridge networks created
    // without an explicit subnet reject static IPAM requests. The routed API
    // readiness check below verifies all consumers after endpoint recreation.
    const networks=Object.fromEntries(Object.entries(c.NetworkSettings.Networks).map(([n,v])=>[n,{Aliases:v.Aliases}]));
    await request("POST",`/containers/${c.Id}/stop?t=20`);
    await request("DELETE",`/containers/${c.Id}`);
    const made=await request("POST",`/containers/create?name=${name}`,{...c.Config,HostConfig:c.HostConfig,NetworkingConfig:{EndpointsConfig:networks}});
    await request("POST",`/containers/${made.Id}/start`);
    console.info(`Bound owned ${kind} container to loopback`);
  }
  const deadline=Date.now()+30_000;
  while(true) {
    const ready=["kong","db"].every(kind=>{const c=inspect(`supabase_${kind}_${project}`);return c.State.Running && (!c.State.Health || c.State.Health.Status==="healthy");});
    if(ready) break;
    assert(Date.now()<deadline,"Owned containers did not become healthy after loopback binding");
    await new Promise(resolveWait=>setTimeout(resolveWait,500));
  }
  // CLI reset recreates Auth/Storage endpoints. Kong can retain their old DNS
  // addresses even though its own health probe passes. Refresh only this
  // project's gateway, then test the real routed APIs before tests/migrations.
  const gateway=inspect(`supabase_kong_${project}`);
  assert(gateway.Config.Labels?.["com.supabase.cli.project"]===project);
  execFileSync("docker",["restart",gateway.Id],{stdio:"ignore",windowsHide:true});
  const cli=join(process.cwd(),"node_modules/supabase/dist/supabase.js");
  const readyDeadline=Date.now()+30_000;
  let lastStatus="not ready";
  while(Date.now()<readyDeadline) {
    try {
      const status=JSON.parse(execFileSync(process.execPath,[cli,"status","--workdir",workdir,"-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],windowsHide:true}));
      const codes=await Promise.all(["/auth/v1/health","/storage/v1/status","/rest/v1/"].map(async endpoint=>{
        const response=await fetch(status.API_URL+endpoint,{headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${status.ANON_KEY}`},signal:AbortSignal.timeout(1500)});return response.status;
      }));
      lastStatus=codes.join(",");
      if(codes.every(code=>code===200)){console.info("Owned routed Auth/Storage/REST health verified");return;}
    } catch { lastStatus="CLI/API not ready"; }
    await new Promise(resolveWait=>setTimeout(resolveWait,500));
  }
  throw new Error(`Owned routed APIs did not become ready: ${lastStatus}`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]!=="bind") throw new Error("Usage: node scripts/disposable-supabase.mjs bind <explicit-workdir>");
  await bindDisposableLoopback(process.argv[3]);
}
