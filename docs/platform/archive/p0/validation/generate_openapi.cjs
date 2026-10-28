// Documentation authoring helper only; never used by application runtime.
const fs = require('node:fs');
const path = require('node:path');
const ref = n => ({ $ref: `#/components/schemas/${n}` });
const obj = (properties, required = Object.keys(properties)) => ({ type:'object', additionalProperties:false, required, properties });
const str = (maxLength=200) => ({ type:'string', minLength:1, maxLength });
const uuid = {type:'string',format:'uuid'};
const date = {type:'string',format:'date-time'};
const en = (...values) => ({type:'string',enum:values});
const arr = (items,maxItems=100) => ({type:'array',items,maxItems});
const json = schema => ({'application/json':{schema}});
const response = (schema, description='Success') => ({description,content:json(schema)});
const errorRef = {$ref:'#/components/responses/Error'};
const pathParam = name => ({name,in:'path',required:true,schema:name==='version'?str(80):uuid});
const schema = {
  Error: obj({code:str(100),message:str(500),requestId:str(100)}),
  Project: obj({id:uuid,slug:str(63),name:str(120),visibility:en('PRIVATE','UNLISTED','PUBLIC'),summary:{type:'string',maxLength:500},currentVersionId:uuid},['id','slug','name','visibility','summary']),
  ProjectPage: obj({items:arr(ref('Project'),50),nextCursor:{type:['string','null'],maxLength:500}}),
  Version: obj({id:uuid,projectId:uuid,version:str(80),manifestHash:{type:'string',pattern:'^[a-f0-9]{64}$'},presentationHash:{type:'string',pattern:'^[a-f0-9]{64}$'},publishedAt:date}),
  Installation: obj({id:uuid,projectId:uuid,status:en('ACTIVE','REVOKED')}),
  GrantRequest: obj({versionId:uuid,capability:str(100),scope:ref('Scope'),audience:str(100),expiresAt:date}),
  Scope: obj({inputClasses:arr(en('SYNTHETIC','PUBLIC_CURATED'),2),maxRuns:{type:'integer',minimum:1,maximum:1000},maxPlatformUnits:{type:'integer',minimum:1,maximum:100000}},['inputClasses','maxRuns','maxPlatformUnits']),
  Grant: obj({id:uuid,installationId:uuid,versionId:uuid,capability:str(100),audience:str(100),scope:ref('Scope'),expiresAt:date,status:en('ACTIVE','REVOKED','EXPIRED')}),
  ExecutionSelection: {oneOf:[obj({mode:{const:'PLATFORM'}}),obj({mode:{const:'BYOK'},credentialId:uuid,credentialGrantId:uuid,model:str(200)})]},
  JsonValue: {oneOf:[{type:'string',maxLength:16384},{type:'number'},{type:'boolean'},{type:'null'},arr(ref('JsonValue'),32),{type:'object',maxProperties:32,additionalProperties:ref('JsonValue')}]},
  RunRequest: {...obj({versionId:uuid,grantId:uuid,capability:str(100),parameters:{type:'object',maxProperties:32,additionalProperties:ref('JsonValue')},inputMode:en('READY','UPLOAD'),inputAssetIds:{...arr(uuid,32),uniqueItems:true},execution:ref('ExecutionSelection')}),allOf:[{if:{properties:{inputMode:{const:'UPLOAD'}}},then:{properties:{inputAssetIds:{maxItems:0}}}}]},
  InputFinalize: obj({inputAssetIds:{...arr(uuid,32),minItems:1,uniqueItems:true}}),
  Run: obj({id:uuid,projectId:uuid,versionId:uuid,state:en('PENDING','ACCEPTED','RUNNING','SUCCEEDED','FAILED','CANCELLED','TIMED_OUT'),inputMode:en('READY','UPLOAD'),inputsSealed:{type:'boolean'},revision:{type:'integer',minimum:1},statusUrl:{type:'string',pattern:'^/api/v1/runs/[0-9a-f-]+$'},createdAt:date,cancelRequestedAt:date,errorCode:str(100),artifacts:arr(ref('Artifact'),32)},['id','projectId','versionId','state','inputMode','inputsSealed','revision','statusUrl','createdAt']),
  Artifact: obj({id:uuid,runId:uuid,mimeType:str(100),sizeBytes:{type:'integer',minimum:0},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},visibility:{const:'OWNER_ONLY'},expiresAt:date}),
  UploadRequest: obj({mimeType:en('image/png','application/octet-stream','model/gltf-binary'),sizeBytes:{type:'integer',minimum:1,maximum:104857600},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}),
  UploadIntent: obj({id:uuid,artifactId:uuid,transport:en('SIGNED_PUT','MULTIPART'),expiresAt:date,uploadUrl:{type:'string',format:'uri'},requiredHeaders:{type:'object',additionalProperties:{type:'string'},maxProperties:10}},['id','artifactId','transport','expiresAt','uploadUrl','requiredHeaders']),
  UploadComplete: obj({artifactId:uuid,parts:arr(obj({partNumber:{type:'integer',minimum:1,maximum:10000},etag:str(200)}),10000)},['artifactId']),
  UploadStatus: obj({artifactId:uuid,state:en('UPLOADED','SCANNING','APPROVED','REJECTED')}),
  CredentialRequest: obj({providerRef:{type:'string',pattern:'^[a-z][a-z0-9-]{2,79}$'},label:str(80),secret:{type:'string',minLength:1,maxLength:8192,writeOnly:true},mode:en('PERSISTENT','SESSION')}),
  Credential: obj({id:uuid,providerRef:str(80),label:str(80),fingerprint:str(80),status:en('ACTIVE','REVOKED','EXPIRED'),mode:en('PERSISTENT','SESSION'),expiresAt:date},['id','providerRef','label','fingerprint','status','mode']),
  CredentialGrantRequest: obj({projectVersionId:uuid,capability:str(100),audience:str(100),models:arr(str(200),20),expiresAt:date}),
  CredentialGrant: obj({id:uuid,credentialId:uuid,projectVersionId:uuid,status:en('ACTIVE','REVOKED','EXPIRED'),expiresAt:date}),
  Callback: obj({eventId:uuid,runId:uuid,attempt:{type:'integer',minimum:1},fence:{type:'integer',minimum:1},sequence:{type:'integer',minimum:1},state:en('ACCEPTED','RUNNING','SUCCEEDED','FAILED','CANCELLED'),outputArtifactIds:arr(uuid,32)},['eventId','runId','attempt','fence','sequence','state'])
};
// Embed draft schemas so API validation never follows external URLs.
for (const [name,file] of [['Manifest','06-project-manifest.schema.json'],['Presentation','08-presentation.schema.json']]) {
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  const prefix=`#/components/schemas/${name}`;
  const rewrite = value => {
    if(Array.isArray(value)) return value.map(rewrite);
    if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([k])=>!['$id','$schema'].includes(k)).map(([k,v])=>[k,k==='$ref'&&typeof v==='string'&&v.startsWith('#/')?prefix+v.slice(1):rewrite(v)]));
    return value;
  };
  schema[name]=rewrite(source);
}
const paths={};
function op(route,method,id,stage,summary,result,{body,publicRead=false,code='200',extraParams=[],description=''}={}) {
  const parameters=[...Array.from(route.matchAll(/\{([^}]+)\}/g),m=>pathParam(m[1])),...extraParams];
  const responses={[code]:result?response(ref(result)): {description:'No content'},'400':errorRef,'401':errorRef,'403':errorRef,'404':errorRef,'409':errorRef,'413':errorRef,'429':errorRef,'503':errorRef};
  const operation={operationId:id,summary,description:`PROPOSED ONLY. ${description}`,tags:[stage], 'x-stage':stage,parameters,responses};
  if(publicRead) operation.security=[{}, {SupabaseBearer:[]}];
  if(body) operation.requestBody={required:true,content:json(ref(body))};
  if(method!=='get'&&id!=='handleCallback') operation['x-browser-csrf']='Existing Supabase SSR cookie support requires a reviewed Origin/CSRF bridge; not frozen in P0.';
  if(!paths[route]) paths[route]={};
  paths[route][method]=operation;
  return operation;
}
const idem={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:200}};
op('/projects','get','listProjects','P1','Discover only PUBLIC published projects','ProjectPage',{publicRead:true,extraParams:[{name:'cursor',in:'query',schema:str(500)},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:50,default:20}}],description:'Private workspaces use a separately authorized query; this discovery endpoint never lists UNLISTED.'});
op('/projects/{projectId}','get','getProject','P1','Read published public/link content or authorized private project','Project',{publicRead:true,description:'Unauthorized or unknown resources return identical 404. No user runs, credentials, drafts or internal endpoints in public DTO.'});
op('/projects/{projectId}/versions/{version}','get','getVersion','P1','Read an authorized immutable version','Version',{publicRead:true});
op('/projects/{projectId}/versions/{version}/manifest','get','getManifest','P3','Read curated manifest snapshot','Manifest',{publicRead:true,description:'Expose only curated declarative content; endpointRef cannot be resolved into credentials or internal addresses.'});
op('/projects/{projectId}/versions/{version}/presentation','get','getPresentation','P1','Read reviewed presentation snapshot','Presentation',{publicRead:true});
op('/projects/{projectId}/installations','post','createInstallation','P2','Install for authenticated caller','Installation',{code:'201',extraParams:[idem],description:'No userId accepted; repeated installation returns existing caller installation without widening grants.'});
op('/installations/{id}/grants','post','createGrant','P2','Explicitly consent to a version and capability','Grant',{body:'GrantRequest',code:'201',extraParams:[idem]});
op('/grants/{grantId}','delete','revokeGrant','P2','Revoke caller grant and invalidate new steps',null,{code:'204',description:'Idempotent; old attempts cannot submit new visible output. Remote requests may still consume resources.'});
op('/projects/{projectId}/runs','post','createRun','P4','Persist a run, reservation and outbox atomically','Run',{body:'RunRequest',code:'202',extraParams:[idem],description:'Only approved synthetic test adapters in P4. Return 202 after commit. Same key+same request returns same run; changed request => 409. Validate parameters against immutable capability inputSchema. READY freezes approved assets at creation (may be empty for parameter-only tasks); UPLOAD requires explicit inputs/finalize before dispatch. Body limit proposal: 64 KiB and nesting depth 16.'});
op('/runs/{runId}/inputs/finalize','post','finalizeInputs','P4','Atomically seal the complete approved input set','Run',{body:'InputFinalize',code:'202',extraParams:[idem],description:'Owner only. After current owner authorization, look up idempotency record BEFORE first-execution preconditions: same key+hash returns current authorized Run view even after ACCEPTED/terminal. First execution requires PENDING+UPLOAD. Check all assets APPROVED and bound to subject/capability. Seal RunInput/inputSetHash/inputsSealedAt and ready outbox in one transaction. Changed set or already sealed with different inputs => 409. Upload completions alone never dispatch.'});
op('/runs/{runId}','get','getRun','P4','Owner-only run status','Run',{description:'Cache-Control: no-store. Return no private data for project authors or admins by default.'});
op('/runs/{runId}/cancel','post','cancelRun','P4','Request cancellation and persist intent','Run',{code:'202',description:'Idempotent. Repeated/terminal requests return current view; 202 does not claim GPU computation has stopped.'});
op('/runs/{runId}/artifacts/upload-intents','post','createUploadIntent','P4','Allocate owner-scoped quarantine upload','UploadIntent',{body:'UploadRequest',code:'201',extraParams:[idem],description:'Allowed only while run PENDING, inputMode=UPLOAD and not sealed. 100 MiB is a proposed ceiling, not verified platform support; multipart negotiation and part URLs require P4 spike. No raw bytes pass through this API.'});
op('/runs/{runId}/artifacts/upload-completions','post','completeUpload','P4','Verify transport completion and schedule scan','UploadStatus',{body:'UploadComplete',code:'202',description:'Verify stored metadata and checksum server-side; reject foreign artifact, unexpected type, expired intent and changed inputs. No dispatch before APPROVED.'});
op('/runs/{runId}/artifacts/{artifactId}','get','getArtifact','P4','Read owner-scoped artifact metadata','Artifact',{description:'Never expose storageKey; authenticated download transport is deliberately not frozen until revocation/signed URL tests pass.'});
op('/credentials','get','listCredentials','P5','List only caller credential metadata',null).responses['200']=response(arr(ref('Credential'),50));
op('/credentials','post','createCredential','P5','Bind a provider credential to caller','Credential',{body:'CredentialRequest',code:'201',extraParams:[idem],description:'TLS only; secret writeOnly; disable request-body logging; approved provider only. SESSION mode uses separately proven volatile storage and expiresAt, never a durable queue.'});
op('/credentials/{credentialId}','delete','revokeCredential','P5','Revoke and schedule payload destruction',null,{code:'204'});
op('/credentials/{credentialId}/grants','post','createCredentialGrant','P5','Grant narrow proxy use without revealing the key','CredentialGrant',{body:'CredentialGrantRequest',code:'201',extraParams:[idem]});
op('/credential-grants/{grantId}','delete','revokeCredentialGrant','P5','Revoke caller credential delegation',null,{code:'204'});
const callback=op('/internal/adapters/{endpointId}/callbacks','post','handleCallback','P4','Accept authenticated, deduplicated adapter event',null,{body:'Callback',code:'204',extraParams:[{name:'X-AIG-Timestamp',in:'header',required:true,schema:{type:'integer',minimum:0}},{name:'X-AIG-Signature',in:'header',required:true,schema:{type:'string',pattern:'^v1=[a-f0-9]{64}$'}}],description:'Private ingress. endpointId selects immutable registry revision. HMAC-SHA256 over timestamp + dot + exact raw body; 300-second skew proposal. Persist receipt sequence/fence and CAS run lastCallbackSequence within attempt; next sequence only, out-of-order => 409/retry. Same eventId+bodyHash replay is idempotent; same sequence different eventId is rejected. Check current authorization before commit. URL possession is not authentication.'});
callback.security=[{AdapterSignature:[]}];
paths['/internal/adapters/{endpointId}/callbacks'].post.parameters.find(p=>p.name==='endpointId').schema={type:'string',pattern:'^[a-z][a-z0-9-]{2,79}$'};
const doc={openapi:'3.2.1',info:{title:'AIG Platform — P0 Draft / Not Implemented',version:'0.1.0-draft',description:'INTERNAL. All operations are proposals. Bearer authentication describes future API clients. Browser uses existing Supabase SSR sessions; bridging/CSRF must be frozen and tested before implementation. No new browser cookie/auth system is introduced by this document.'},servers:[{url:'/api/v1',description:'Proposed prefix only; no deployment is asserted.'}],security:[{SupabaseBearer:[]}],tags:['P1','P2','P3','P4','P5'].map(name=>({name,description:'Not available until stage approval and gates pass.'})),paths,components:{securitySchemes:{SupabaseBearer:{type:'http',scheme:'bearer',bearerFormat:'Supabase access token',description:'Verify issuer, signature, expiration and current subject; service_role is forbidden as user identity.'},AdapterSignature:{type:'apiKey',in:'header',name:'X-AIG-Signature',description:'HMAC raw body and timestamp, plus endpoint revision and replay checks. This is not a user Provider key.'}},schemas:schema,responses:{Error:response(ref('Error'),'Sanitized error; never return raw provider messages, keys, stack traces or connection strings.')}}};
fs.writeFileSync(path.join(__dirname,'..','07-api-contract.openapi.yaml'),JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({paths:Object.keys(paths).length,operations:Object.values(paths).reduce((n,p)=>n+Object.keys(p).length,0),schemas:Object.keys(schema).length}));
