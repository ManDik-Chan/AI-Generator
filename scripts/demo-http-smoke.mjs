// Real business endpoints, no browser and no mocked Provider. Local disposable DB only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const require = createRequire(import.meta.url);
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const local = (value) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
  const base = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3029";
  assert(local(base) && local(process.env.DATABASE_URL) && local(process.env.DIRECT_URL) && local(process.env.NEXT_PUBLIC_SUPABASE_URL), "Smoke refuses non-local app/database/Auth targets");
  assert.equal(process.env.DEMO_DISPOSABLE_DATABASE, "true", "Explicit disposable DB confirmation required");
  assert(!local(process.env.AI_BASE_URL) && !/mock|playwright/i.test(process.env.AI_MODEL ?? ""), "Real remote Provider required");
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = new PrismaClient({ log: [] });
  const cookies = new Map();
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...cookies].map(([name,value]) => ({name,value})), setAll: (items) => items.forEach(({name,value}) => cookies.set(name,value)) },
  });
  const email = `demo-${randomUUID()}@example.test`, password = `D!${randomUUID()}a9`;
  let userId;
  const request = (path, body, signedIn = true) => fetch(base + path, {
    redirect: "manual", signal: AbortSignal.timeout(180000),
    headers: { ...(body ? {"Content-Type":"application/json"} : {}), ...(signedIn ? {Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join("; ")} : {}) },
    ...(body ? { method:"POST", body:JSON.stringify(body) } : {}),
  });
  const stream = async (path, body) => {
    const response = await request(path, body);
    assert.equal(response.status,200, `${path} HTTP ${response.status}`);
    assert(response.headers.get("content-type")?.includes("text/event-stream"));
    const text = await response.text();
    const events = text.split(/\r?\n\r?\n/).filter(Boolean).map(block => ({event:block.match(/^event: (.+)$/m)?.[1], data:JSON.parse(block.match(/^data: (.+)$/m)?.[1] ?? "null")}));
    assert(!events.some(e => e.event === "error"), `${path} stream failed`);
    assert(events.some(e => e.event === "done"), `${path} missing completion`);
    const output = events.filter(e=>e.event==="delta").map(e=>e.data.text).join("");
    assert(output.trim(), "Missing streamed text");
    console.log(JSON.stringify({path,events:events.map(e=>e.event),output}));
    return {events,output};
  };
  try {
    assert.equal((await request("/api/chat", {content:"unauthorized"},false)).status,401);
    assert.equal((await request("/chat",undefined,false)).status,307);
    const created = await service.auth.admin.createUser({email,password,email_confirm:true});
    assert(!created.error && created.data.user, "Disposable user creation failed");
    userId = created.data.user.id;
    await db.profile.upsert({where:{id:userId},create:{id:userId,email,displayName:"Runtime demo smoke",memoryEnabled:false},update:{}});
    // Submit the rendered Next.js server-action form over HTTP, including its
    // bound action state. This exercises the application's signIn/ensureProfile.
    const loginPage = await request("/login",undefined,false);
    assert.equal(loginPage.status,200,"Login page unavailable");
    const loginHtml = await loginPage.text();
    const form = new FormData();
    const decode = (value) => value.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
    for (const input of loginHtml.match(/<input\b[^>]*type="hidden"[^>]*>/g) ?? []) {
      const name = input.match(/\bname="([^"]*)"/)?.[1];
      if (name) form.append(decode(name),decode(input.match(/\bvalue="([^"]*)"/)?.[1] ?? ""));
    }
    assert([...form.keys()].some(key=>key.startsWith("$ACTION_")),"Login server action missing");
    form.set("email",email); form.set("password",password); form.set("next","/chat");
    const signed = await fetch(base+"/login",{method:"POST",body:form,redirect:"manual",headers:{Origin:base},signal:AbortSignal.timeout(30000)});
    assert.equal(signed.status,303,"Application password sign-in failed");
    for (const cookie of signed.headers.getSetCookie()) {
      const pair = cookie.split(";",1)[0], separator = pair.indexOf("=");
      cookies.set(pair.slice(0,separator),pair.slice(separator+1));
    }
    assert(cookies.size,"Application did not issue session cookies");
    const chat = await stream("/api/chat",{content:"Give two practical benefits of server-sent events in Chinese."});
    const conversationId = chat.events.find(e=>e.event==="conversation")?.data.conversationId;
    assert(conversationId,"Conversation ID missing");
    const messages = await db.message.findMany({where:{conversationId},orderBy:{createdAt:"asc"}});
    assert(messages.some(m=>m.role==="ASSISTANT" && m.status==="COMPLETE" && m.content===chat.output),"Persisted answer mismatch");
    for (let i=0;i<2;i++) {
      const reload = await request("/api/chat/bootstrap?personas=0");
      assert.equal(reload.status,200);
      assert((await reload.text()).includes(conversationId),"History not restored");
    }
    const history = await request(`/chat/${conversationId}`);
    assert.equal(history.status,200,"Authenticated history page failed");
    assert.equal((await request("/api/chat",{content:""})).status,400,"Invalid input not rejected");
    const tool = await stream("/api/tools/run",{tool:"SUMMARIZE",input:"Server-sent events stream data from a server to a client over HTTP. They support incremental AI responses without polling.",saveHistory:true,options:{length:"short",format:"bullets",language:"zh-CN"}});
    const runId = tool.events.find(e=>e.event==="start")?.data.runId;
    const run = await db.toolRun.findUnique({where:{id:runId}});
    assert(run?.status==="COMPLETE" && run.outputText===tool.output,"Tool persistence mismatch");
    assert(!(await auth.auth.refreshSession()).error,"Session refresh failed");
    assert.equal((await request("/api/chat/bootstrap?personas=0")).status,200);
    assert(!(await auth.auth.signOut()).error,"Sign-out failed");
    assert.equal((await request("/api/chat/bootstrap?personas=0")).status,401);
    console.log("PASS real chat/tool SSE, persistence, history reload, session refresh/sign-out, protected routes and invalid input (HTTP; browser UI not exercised)");
  } finally {
    try {
      if(userId) {
        const deleted = await service.auth.admin.deleteUser(userId);
        assert(!deleted.error,"Disposable account cleanup failed");
        // Auth deletion does not cascade to the application's Prisma profile.
        // Delete only this invocation's synthetic profile and its child rows.
        await db.profile.deleteMany({where:{id:userId,email}});
      }
    } finally { await db.$disconnect(); }
  }
}
main().catch((error)=>{console.error("FAIL demo HTTP smoke", error instanceof assert.AssertionError ? error.message : error?.code ?? error?.name, "(raw SDK errors withheld to protect credentials)");process.exitCode=1;});
