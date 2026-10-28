import { uploadToolAsset } from "@/features/tools/image/storage";
const [mode,path]=process.argv.slice(2);
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(init?.method==="POST" && url.pathname.includes(`/storage/v1/object/${process.env.AI_TOOL_ASSET_BUCKET}/`)) {
    if(mode==="before") process.exit(73);
    if(mode==="failure") return new Response(JSON.stringify({statusCode:"503",error:"Unavailable",message:"injected upload failure"}),{status:503,headers:{"Content-Type":"application/json"}});
    if(mode==="held") {
      process.stdout.write("RESERVATION_COMMITTED_UPLOAD_HELD\n");
      await new Promise<void>(resolve=>process.once("message",()=>resolve()));
    }
  }
  return actualFetch(input,init);
};
async function main(){
  try { await uploadToolAsset(path,new Uint8Array([137,80,78,71]),"image/png");process.exit(74); }
  catch(error) { if(mode==="failure") process.exit(75); throw error; }
}
main().catch(()=>process.exit(76));
