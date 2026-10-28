"""Deterministic, documentation-only candidates. No app imports or network."""
import copy
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'contracts'
UUID = {'type': 'string', 'format': 'uuid'}
TEXT = {'type': 'string', 'minLength': 1, 'maxLength': 500}
HASH = {'type': 'string', 'pattern': '^[a-f0-9]{64}$'}
DATE = {'type': 'string', 'format': 'date-time'}
VERSION = {'type': 'string', 'pattern': r'^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'}
VIS = {'enum': ['PRIVATE', 'UNLISTED', 'PUBLIC']}
def ref(name): return {'$ref': '#/$defs/' + name}
def arr(item, maximum=100, minimum=0):
    return {'type':'array','items':item,'minItems':minimum,'maxItems':maximum,'uniqueItems':True}
def obj(props, required=None):
    return {'type':'object','additionalProperties':False,'properties':props,
            'required':list(props) if required is None else required}

D = {}
D['Claim'] = obj({'topic':TEXT, 'status':{'enum':['SOURCE_IMPLEMENTED','DOCUMENTED','EXPERIMENT_VERIFIED','PLANNED']},
    'description':TEXT,'evidenceAssetIds':arr(UUID), 'modelVersion':TEXT}, ['topic','status','description','evidenceAssetIds'])
D['Manifest'] = obj({'schemaVersion':{'const':'0.5.0'},'projectId':UUID,
    'slug':{'type':'string','pattern':'^[a-z][a-z0-9-]{2,62}$'},'version':VERSION,'name':TEXT,
    'summary':TEXT,'category':{'enum':['research','software','algorithm','web-service','ai','other']},
    'visibility':VIS,'integration':obj({'mode':{'const':'SHOWCASE'}}),
    'capabilities':arr({'enum':['documentation.read','presentation.read','static-image.read']},3,1),
    'researchClaims':arr(ref('Claim'),40)},
    ['schemaVersion','projectId','slug','version','name','summary','category','visibility','integration','capabilities','researchClaims'])
D['Metric'] = {'oneOf':[
    obj({'name':TEXT,'status':{'const':'UNPUBLISHED'}}),
    obj({'name':TEXT,'status':{'const':'REPORTED'},'value':{'type':'number'},'unit':TEXT,'dataset':TEXT,
         'protocol':TEXT,'modelVersion':TEXT,'evidenceAssetId':UUID})]}
D['Section'] = {'oneOf':[
    obj({'id':{'type':'string','pattern':'^[a-z][a-z0-9-]{0,63}$'},'kind':{'const':'MARKDOWN'},'title':TEXT,
         'body':{'type':'string','maxLength':20000},'sourceAssetIds':arr(UUID)}),
    obj({'id':{'type':'string','pattern':'^[a-z][a-z0-9-]{0,63}$'},'kind':{'const':'IMAGE'},'title':TEXT,'assetId':UUID,'alt':TEXT}),
    obj({'id':{'type':'string','pattern':'^[a-z][a-z0-9-]{0,63}$'},'kind':{'const':'BENCHMARKS'},'title':TEXT,'metrics':arr(ref('Metric'),30)})]}
D['Presentation'] = obj({'schemaVersion':{'const':'0.5.0'},'projectId':UUID,'version':VERSION,'title':TEXT,
                         'sections':arr(ref('Section'),24)})
D['Documentation'] = obj({'id':UUID,'title':TEXT,'language':{'enum':['zh','en']},'assetId':UUID})
D['DraftPayload'] = obj({'manifest':ref('Manifest'),'presentation':ref('Presentation'),
                          'documentation':arr(ref('Documentation'),30)})
D['Draft'] = obj({'id':UUID,'projectId':UUID,'revision':{'type':'integer','minimum':1},
    'state':{'enum':['DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED']},'payload':ref('DraftPayload')})
D['Version'] = obj({'id':UUID,'projectId':UUID,'version':VERSION,'snapshot':ref('DraftPayload'),
    'contentHash':HASH,'hashAlgorithm':{'const':'JCS-SHA256-v1'},'reviewId':UUID,'createdAt':DATE})
D['Release'] = obj({'schemaVersion':{'const':'0.5.0'},'projectId':UUID,'releaseId':UUID,'version':VERSION,
    'name':TEXT,'summary':TEXT,'visibility':{'enum':['PUBLIC','UNLISTED']},'publishedAt':DATE,
    'presentation':ref('Presentation'),'documentation':arr(ref('Documentation'),30),
    'researchClaims':arr(ref('Claim'),40)})
D['ProjectSummary'] = obj({'projectId':UUID,'slug':{'type':'string','pattern':'^[a-z][a-z0-9-]{2,62}$'},
    'releaseId':UUID,'version':VERSION,'name':TEXT,'summary':TEXT})
D['Catalog'] = obj({'items':arr(ref('ProjectSummary'),50),'nextCursor':{'type':['string','null'],'maxLength':500}})
D['InternalProjectSummary'] = obj({'projectId':UUID,'slug':TEXT,'name':TEXT,'visibility':VIS,
    'revision':{'type':'integer','minimum':1},'state':{'enum':['DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED']},
    'currentReleaseId':{'type':['string','null'],'format':'uuid'}})
D['InternalCatalog'] = obj({'items':arr(ref('InternalProjectSummary'),50),'nextCursor':{'type':['string','null'],'maxLength':500}})
D['VersionSummary'] = obj({'id':UUID,'projectId':UUID,'version':VERSION,'contentHash':HASH,'createdAt':DATE})
D['VersionIndex'] = obj({'items':arr(ref('VersionSummary'),50),'nextCursor':{'type':['string','null'],'maxLength':500}})
D['Review'] = obj({'id':UUID,'projectId':UUID,'draftRevision':{'type':'integer','minimum':1},
    'snapshotHash':HASH,'visibility':VIS,'decision':{'enum':['PENDING','APPROVED','REJECTED','INVALIDATED']},
    'submitterId':UUID,'reviewerId':{'type':['string','null'],'format':'uuid'},'expiresAt':DATE,
    'policyRevision':{'type':'integer','minimum':1},'assetIds':arr(UUID)})
D['AssetInput'] = obj({'sourceDigest':HASH,'expectedSize':{'type':'integer','minimum':1,'maximum':2097152},
    'mime':{'enum':['image/png','image/jpeg','image/webp','text/markdown']},
    'dataClass':{'enum':['SYNTHETIC','PUBLIC_CURATED']},'provenance':TEXT,'rightsRef':UUID,
    'rightsExpiresAt':DATE})
D['AssetMetadata'] = obj({'id':UUID,'projectId':UUID,'sourceDigest':HASH,'deliveryDigest':HASH,
    'mime':{'enum':['image/png','image/jpeg','image/webp','text/markdown']},
    'size':{'type':'integer','minimum':1,'maximum':2097152},'dataClass':{'enum':['SYNTHETIC','PUBLIC_CURATED']},
    'provenance':TEXT,'rightsRef':UUID,'rightsExpiresAt':DATE,'scanRevision':{'type':'integer','minimum':1},
    'state':{'enum':['QUARANTINED','VALIDATED','APPROVED','REJECTED','RETIRED']}},
    ['id','projectId','sourceDigest','mime','dataClass','provenance','rightsRef','rightsExpiresAt','state'])
D['AssetMetadata']['allOf']=[{'if':{'properties':{'state':{'enum':['VALIDATED','APPROVED']}}},
    'then':{'required':['deliveryDigest','size','scanRevision']}}]
D['CreateProject'] = obj({'slug':{'type':'string','pattern':'^[a-z][a-z0-9-]{2,62}$'},'name':TEXT})
D['Submit'] = obj({'snapshotHash':HASH,'targetVisibility':VIS,'targetVersionId':UUID},['snapshotHash','targetVisibility'])
D['Decision'] = obj({'snapshotHash':HASH,'decision':{'enum':['APPROVED','REJECTED']},'reasonCode':TEXT})
D['Publish'] = obj({'reviewId':UUID,'versionId':UUID,'withdrawReleaseIds':arr(UUID)})
D['Reason'] = obj({'reasonCode':TEXT})
D['RestrictVisibility'] = obj({'visibility':{'const':'PRIVATE'},'reasonCode':TEXT})
D['Receipt'] = obj({'id':UUID,'revision':{'type':'integer','minimum':1},'state':TEXT})
D['Error'] = obj({'code':{'enum':['INVALID_REQUEST','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','CONFLICT',
    'PRECONDITION_FAILED','PRECONDITION_REQUIRED','PAYLOAD_TOO_LARGE','UNSUPPORTED_MEDIA_TYPE','SEMANTIC_REJECTION',
    'RATE_LIMITED','DEPENDENCY_UNAVAILABLE','RANGE_NOT_SUPPORTED']},'message':TEXT,'requestId':UUID})
D['FutureRouting'] = obj({'stage':{'const':'FUTURE_NOT_IMPLEMENTED'},'operationClass':{'enum':['ALGORITHM','PROVIDER']},
    'compute':obj({'kind':{'const':'REGISTERED_REMOTE'},'endpointRevisionId':UUID,'operationId':{'type':'string','pattern':'^[A-Za-z][A-Za-z0-9_]{0,99}$'}}),
    'credential':{'oneOf':[obj({'kind':{'const':'NONE'}}),
        obj({'kind':{'const':'PLATFORM_PROVIDER'},'providerRef':UUID,'model':TEXT}),
        obj({'kind':{'const':'USER_CREDENTIAL'},'credentialId':UUID,'grantId':UUID,'providerRef':UUID,'model':TEXT})]}})
D['FutureRouting']['allOf']=[{'if':{'properties':{'operationClass':{'const':'ALGORITHM'}}},
    'then':{'properties':{'credential':obj({'kind':{'const':'NONE'}})}},
    'else':{'properties':{'credential':{'not':obj({'kind':{'const':'NONE'}})}}}}]

def standalone(name):
    pending=[name]; used={}
    while pending:
        n=pending.pop()
        if n in used: continue
        used[n]=copy.deepcopy(D[n])
        def walk(v):
            if isinstance(v,dict):
                if '$ref' in v: pending.append(v['$ref'].split('/')[-1])
                for x in v.values(): walk(x)
            elif isinstance(v,list):
                for x in v: walk(x)
        walk(used[n])
    return {'$schema':'https://json-schema.org/draft/2020-12/schema',
            '$id':f'urn:aig:p05:{name.lower()}:0.5.0',**ref(name),'$defs':used}

def dump(name,value):
    (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')

def rewrite(v):
    if isinstance(v,dict): return {k:(x.replace('#/$defs/','#/components/schemas/') if k=='$ref' else rewrite(x)) for k,x in v.items()}
    if isinstance(v,list): return [rewrite(x) for x in v]
    return v

def build():
    for name in ['Manifest','Presentation','Draft','Version','Release','AssetMetadata','FutureRouting']:
        dump(name.lower()+'.schema.json',standalone(name))
    schemas=rewrite({k:v for k,v in D.items() if k!='FutureRouting'})
    api={'openapi':'3.1.0','info':{'title':'AIG P1 controlled registry candidate — NOT IMPLEMENTED','version':'0.5.0'},
         'servers':[{'url':'https://aig.example.invalid'}], 'paths':{},
         'components':{'schemas':schemas,'securitySchemes':{'InternalSession':{'type':'http','scheme':'bearer',
             'description':'Supabase access token plus live server internal allowlist and project role; token alone is insufficient.'}}}}
    def operation(path,method,op,scope,response='Receipt',request=None,roles=None):
        responses={str(x):{'description':meaning,'content':{'application/json':{'schema':{'$ref':'#/components/schemas/Error'}}}} for x,meaning in [
            (400,'Malformed or unknown field'),(401,'Missing internal identity'),(403,'Authenticated internal role insufficient'),
            (404,'Unknown, private, withdrawn or wrong project'),(409,'Idempotency/version/state conflict'),
            (412,'Stale If-Match'),(413,'Body too large'),(415,'Unsupported type'),(416,'Range unsupported'),
            (422,'Semantic rejection'),(428,'Missing precondition'),(429,'Rate limited'),(503,'Dependency unavailable')]}
        responses['200']={'description':'Success; all responses including errors are no-store',
            'headers':{'Cache-Control':{'schema':{'const':'no-store'}}},
            'content':{'application/json':{'schema':{'$ref':'#/components/schemas/'+response}}}}
        if scope=='internal':
            responses['200']['headers']['ETag']={'description':'Current Project revision; use for every mutation except create', 'schema':{'type':'string','pattern':'^"[1-9][0-9]*"$'}}
        o={'operationId':op,'x-stage':'P1','x-scope':scope,'x-required-roles':roles or [],
           'security':[{'InternalSession':[]}] if scope=='internal' else [],'responses':responses,'parameters':[]}
        import re
        for p in re.findall(r'{(\w+)}',path): o['parameters'].append({'name':p,'in':'path','required':True,'schema':UUID})
        if method not in ['get','head']:
            o['parameters'].append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':16,'maxLength':128}})
            if op!='createProject': o['parameters'].append({'name':'If-Match','in':'header','required':True,'schema':{'type':'string','pattern':'^"[1-9][0-9]*"$'}})
        if request: o['requestBody']={'required':True,'content':{'application/json':{'schema':{'$ref':'#/components/schemas/'+request}}}}
        api['paths'].setdefault(path,{})[method]=o
        return o
    operation('/api/v1/projects','get','listPublicProjects','public','Catalog')['parameters']=[
        {'name':'limit','in':'query','schema':{'type':'integer','minimum':1,'maximum':50,'default':20}},
        {'name':'cursor','in':'query','schema':{'type':'string','maxLength':500}}]
    operation('/api/v1/projects/{projectId}','get','getCurrentRelease','public','Release')
    operation('/api/v1/projects/{projectId}/releases/{releaseId}','get','getRelease','public','Release')
    o=operation('/api/v1/projects/{projectId}/releases/{releaseId}/docs/{documentId}','get','getDocumentation','public','Release')
    o['responses']['200']['content']={'text/markdown':{'schema':{'type':'string','maxLength':200000}}}
    p='/internal/v1/projects'
    for path,op,response in [(p,'listInternalProjects','InternalCatalog'),(p+'/{projectId}/versions','listSealedVersions','VersionIndex')]:
        o=operation(path,'get',op,'internal',response,roles=['ACTIVE_MEMBER'])
        o['parameters'] += [{'name':'limit','in':'query','schema':{'type':'integer','minimum':1,'maximum':50,'default':20}},
                            {'name':'cursor','in':'query','schema':{'type':'string','maxLength':500}}]
    operation(p,'post','createProject','internal',request='CreateProject',roles=['INTERNAL_CREATOR'])
    operation(p+'/{projectId}/draft','get','getDraft','internal','Draft',roles=['ACTIVE_MEMBER'])
    operation(p+'/{projectId}/draft','patch','replaceDraftPayload','internal','Draft','DraftPayload',['OWNER','EDITOR'])
    operation(p+'/{projectId}/assets','post','registerAsset','internal','AssetMetadata','AssetInput',['OWNER','EDITOR'])
    o=operation(p+'/{projectId}/assets/{assetId}/content','put','uploadAssetBytes','internal','AssetMetadata',roles=['OWNER','EDITOR'])
    o['requestBody']={'required':True,'content':{'application/octet-stream':{'schema':{'type':'string','format':'binary','maxLength':2097152}}}}
    o=operation(p+'/{projectId}/assets/{assetId}/content','get','readInternalDisplayBytes','internal',roles=['ACTIVE_MEMBER'])
    o['responses']['200']['description']='Same-project internal preview of VALIDATED or APPROVED sanitized bytes only; never source storage or an arbitrary path.'
    o['responses']['200']['content']={m:{'schema':{'type':'string','format':'binary'}} for m in ['image/png','image/jpeg','image/webp','text/markdown']}
    operation(p+'/{projectId}/reviews','post','submitReview','internal',request='Submit',roles=['OWNER','EDITOR'])
    operation(p+'/{projectId}/reviews/{reviewId}','get','getReview','internal','Review',roles=['OWNER','SUBMITTER','REVIEWER','PUBLISHER'])
    operation(p+'/{projectId}/reviews/{reviewId}/decision','post','decideReview','internal',request='Decision',roles=['REVIEWER_NOT_SUBMITTER'])
    operation(p+'/{projectId}/reviews/{reviewId}/withdraw','post','withdrawReview','internal',request='Reason',roles=['OWNER','SUBMITTER'])
    operation(p+'/{projectId}/releases','post','publishRelease','internal',request='Publish',roles=['PUBLISHER'])
    operation(p+'/{projectId}/releases/{releaseId}/withdraw','post','withdrawRelease','internal',request='Reason',roles=['OWNER','PUBLISHER','SAFETY_OPERATOR'])
    operation(p+'/{projectId}/archive','post','archiveProject','internal',request='Reason',roles=['OWNER'])
    operation(p+'/{projectId}/visibility','post','restrictVisibility','internal',request='RestrictVisibility',roles=['OWNER','SAFETY_OPERATOR'])
    operation(p+'/{projectId}/assets/{assetId}/retire','post','retireAsset','internal',request='Reason',roles=['REVIEWER','SAFETY_OPERATOR'])
    operation(p+'/{projectId}/versions/{versionId}','get','getSealedVersion','internal','Version',roles=['ACTIVE_MEMBER'])
    operation(p+'/{projectId}/drafts','post','startNextDraft','internal',request='Reason',roles=['OWNER','EDITOR'])
    o=operation('/releases/{releaseId}/assets/{assetId}','get','readPublishedAsset','public')
    o['servers']=[{'url':'https://assets.aig.example.invalid'}]
    o['responses']['200']['content']={m:{'schema':{'type':'string','format':'binary'}} for m in ['image/png','image/jpeg','image/webp','text/markdown']}
    api['paths']['/releases/{releaseId}/assets/{assetId}']['head']=copy.deepcopy(o)
    head=api['paths']['/releases/{releaseId}/assets/{assetId}']['head']
    head['operationId']='headPublishedAsset';head['responses']['200'].pop('content')
    dump('p1.openapi.json',api)

if __name__=='__main__': build()
