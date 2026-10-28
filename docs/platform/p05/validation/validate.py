"""Offline structure + executable specification examples; no DB/browser/app imports."""
import argparse
import copy
import hashlib
import importlib.metadata
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from reference_rules import publication_errors, project_public_release, asset_readable, catalog_visible, transition, strict_json_loads

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--p0-root',type=Path,default=ROOT.parent/'archive/p0')
parser.add_argument('--repo',type=Path,default=ROOT.parents[2])
parser.add_argument('--base',default='a0050aaf4fc16e1cadd110918c3354a29e8d99fe')
parser.add_argument('--report',type=Path,default=ROOT/'evidence/validation.json')
args=parser.parse_args()
cases=[]
def record(name,actual,expected=True):
    assert actual==expected,(name,actual,expected)
    cases.append({'name':name,'expected':expected,'result':'PASS'})
def changed(value,fn):
    v=copy.deepcopy(value);fn(v);return v
def load(name): return json.loads((ROOT/'contracts'/name).read_text(encoding='utf-8'))
schemas={n:load(n+'.schema.json') for n in ['manifest','presentation','draft','version','release','assetmetadata','futurerouting']}
for s in schemas.values(): Draft202012Validator.check_schema(s)
api=load('p1.openapi.json');validate(api)
for label,text in [('duplicate-key','{"x":1,"x":2}'),('nan','{"x":NaN}'),('infinity','{"x":Infinity}')]:
    rejected=False
    try:strict_json_loads(text)
    except ValueError:rejected=True
    record('parser/reject-'+label,rejected)
def accepts(name,value):
    return Draft202012Validator(schemas[name],format_checker=FormatChecker()).is_valid(value)

# Execute only the reviewed historical validation prefix, never its fixture/source-write suffix.
oldscript=args.p0_root/'validation/validate_contracts.py'
prefix=oldscript.read_text(encoding='utf-8').split('# Preserve examples as obvious contract fixtures',1)[0]
assert 'for name, fixture in fixtures.items()' not in prefix
ns={'__file__':str(oldscript),'__name__':'p0_readonly'}
exec(compile(prefix,str(oldscript),'exec'),ns)
assert len(ns['cases'])==42

P='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
A='33333333-3333-4333-8333-333333333333';V='44444444-4444-4444-8444-444444444444'
R='55555555-5555-4555-8555-555555555555';H='a'*64
NOW='2026-10-28T00:00:00Z';LATER='2027-10-28T00:00:00Z'
manifest={'schemaVersion':'0.5.0','projectId':P,'slug':'non-ai-fixture','version':'0.1.0','name':'Synthetic sorting research fixture',
    'summary':'Contract fixture only; no experiment or publication authorization implied.','category':'algorithm','visibility':'PUBLIC',
    'integration':{'mode':'SHOWCASE'},'capabilities':['documentation.read','presentation.read'],'researchClaims':[]}
presentation={'schemaVersion':'0.5.0','projectId':P,'version':'0.1.0','title':'Non-AI fixture','sections':[
    {'id':'overview','kind':'MARKDOWN','title':'Overview','body':'Offline contract fixture.','sourceAssetIds':[]},
    {'id':'metrics','kind':'BENCHMARKS','title':'Results','metrics':[{'name':'Runtime','status':'UNPUBLISHED'}]}]}
doc={'id':B,'title':'Technical documentation fixture','language':'en','assetId':A}
draft={'id':B,'projectId':P,'revision':2,'state':'IN_REVIEW','payload':{'manifest':manifest,'presentation':presentation,'documentation':[doc]}}
asset={'id':A,'projectId':P,'sourceDigest':H,'deliveryDigest':H,'size':10,'mime':'text/markdown','dataClass':'SYNTHETIC',
       'provenance':'Fabricated contract metadata only','rightsRef':B,'rightsExpiresAt':LATER,'state':'APPROVED','scanRevision':1}
assets={A:asset}
project={'id':P,'visibility':'PUBLIC','archived':False,'authzEpoch':2,'policyRevision':1,'candidateHash':H}
review={'projectId':P,'draftRevision':2,'snapshotHash':H,'visibility':'PUBLIC','decision':'APPROVED','reviewerId':A,'submitterId':B,
        'expiresAt':LATER,'policyRevision':1,'assetDigests':{A:H}}
actor={'internal':True,'active':True,'roles':['PUBLISHER'],'epoch':2}
record('structure/non-ai-manifest',accepts('manifest',manifest))
record('structure/draft-without-publishedAt',accepts('draft',draft))
for label,fn in [('fake-publishedAt',lambda x:x.update(publishedAt=NOW)),('owner-injection',lambda x:x.update(ownerId=A)),
                 ('storage-leak',lambda x:x.update(storageRef='private/foo'))]:
    record('structure/draft-reject-'+label,accepts('draft',changed(draft,fn)),False)
for label,fn in [('execution',lambda x:x['capabilities'].append('system.shell')),('remote',lambda x:x.update(integration={'mode':'REMOTE_API'})),
                 ('unknown-version',lambda x:x.update(schemaVersion='1.0.0')),('endpoint',lambda x:x.update(endpointUrl='http://127.0.0.1'))]:
    record('structure/manifest-reject-'+label,accepts('manifest',changed(manifest,fn)),False)
record('structure/unsupported-viewer',accepts('presentation',changed(presentation,lambda x:x['sections'].append(
    {'id':'mesh','kind':'VIEWER','viewerType':'MESH3D','assetIds':[A]}))),False)
record('structure/no-fake-unpublished-zero',accepts('presentation',changed(presentation,lambda x:x['sections'][1]['metrics'][0].update(value=0))),False)
record('structure/asset-approved-metadata',accepts('assetmetadata',asset))
record('structure/approved-asset-must-have-delivery-digest',accepts('assetmetadata',changed(asset,lambda x:x.pop('deliveryDigest'))),False)
record('structure/asset-body-limit',accepts('assetmetadata',changed(asset,lambda x:x.update(size=2097153))),False)
future={'stage':'FUTURE_NOT_IMPLEMENTED','operationClass':'ALGORITHM','compute':{'kind':'REGISTERED_REMOTE','endpointRevisionId':P,'operationId':'compute'},'credential':{'kind':'NONE'}}
record('future/algorithm-without-provider',accepts('futurerouting',future))
provider=changed(future,lambda x:x.update(operationClass='PROVIDER',credential={'kind':'USER_CREDENTIAL','credentialId':A,'grantId':B,'providerRef':P,'model':'fixture'}))
record('future/explicit-user-credential',accepts('futurerouting',provider))
record('future/no-implicit-provider',accepts('futurerouting',changed(future,lambda x:x.update(operationClass='PROVIDER'))),False)
record('future/no-key-on-algorithm',accepts('futurerouting',changed(provider,lambda x:x.update(operationClass='ALGORITHM'))),False)
record('future/no-secret-field',accepts('futurerouting',changed(provider,lambda x:x['credential'].update(secret='fixture-not-a-real-key'))),False)
record('future/no-arbitrary-endpoint',accepts('futurerouting',changed(future,lambda x:x['compute'].update(endpointUrl='https://example.invalid'))),False)
record('future/no-fallback',accepts('futurerouting',changed(future,lambda x:x.update(fallback='PLATFORM_PROVIDER'))),False)

def semantic(name,d=None,aa=None,rr=None,ac=None,pp=None,error=None):
    errors=publication_errors(d or draft,aa or assets,rr or review,ac or actor,pp or project,NOW)
    record('semantic/'+name,not errors,error is None)
    if error: assert error in errors,(name,errors,error)
semantic('non-ai-accepted')
reported=changed(draft,lambda x:x['payload']['presentation']['sections'][1]['metrics'].append(
    {'name':'Synthetic contract number','status':'REPORTED','value':1,'unit':'fixture','dataset':'synthetic','protocol':'No experiment performed; schema fixture only','modelVersion':'0.1.0','evidenceAssetId':A}))
record('structure/reported-metric-evidence',accepts('draft',reported))
semantic('reported-metric-closed-reference',d=reported)
semantic('duplicate-section',d=changed(draft,lambda x:x['payload']['presentation']['sections'].append(copy.deepcopy(presentation['sections'][0]))),error='SECTION_ID')
semantic('cross-project',d=changed(draft,lambda x:x['payload']['manifest'].update(projectId=B)),error='PROJECT')
semantic('version-mismatch',d=changed(draft,lambda x:x['payload']['presentation'].update(version='0.2.0')),error='VERSION')
semantic('cross-project-asset',aa={A:changed(asset,lambda x:x.update(projectId=B))},error='ASSET_PROJECT')
semantic('retired-asset',aa={A:changed(asset,lambda x:x.update(state='RETIRED'))},error='ASSET_STATE')
semantic('sensitive-asset',aa={A:changed(asset,lambda x:x.update(dataClass='MEDICAL_SENSITIVE'))},error='ASSET_STATE')
semantic('no-rights',aa={A:changed(asset,lambda x:x.update(rightsRef=None))},error='RIGHTS')
semantic('rights-expired',aa={A:changed(asset,lambda x:x.update(rightsExpiresAt='2020-01-01T00:00:00Z'))},error='RIGHTS')
semantic('changed-delivery-hash',aa={A:changed(asset,lambda x:x.update(deliveryDigest='b'*64))},error='ASSET_DIGEST')
semantic('missing-asset',d=changed(draft,lambda x:x['payload']['documentation'][0].update(assetId=V)),error='MISSING_ASSET')
semantic('unsupported-doc-type',aa={A:changed(asset,lambda x:x.update(mime='image/png'))},error='DOC_TYPE')
semantic('self-review',rr=changed(review,lambda x:x.update(reviewerId=B)),error='REVIEW')
semantic('stale-review',rr=changed(review,lambda x:x.update(draftRevision=1)),error='STALE_REVIEW')
semantic('visibility-expansion',rr=changed(review,lambda x:x.update(visibility='PRIVATE')),error='HASH_OR_VISIBILITY')
semantic('expired-review',rr=changed(review,lambda x:x.update(expiresAt='2020-01-01T00:00:00Z')),error='EXPIRED_REVIEW')
semantic('expiry-offset-is-instant',rr=changed(review,lambda x:x.update(expiresAt='2026-10-28T07:00:00+08:00')),error='EXPIRED_REVIEW')
semantic('stale-policy',rr=changed(review,lambda x:x.update(policyRevision=0)),error='EXPIRED_REVIEW')
semantic('revoked-publisher',ac=changed(actor,lambda x:x.update(active=False)),error='ACTOR')
semantic('external-developer',ac=changed(actor,lambda x:x.update(internal=False)),error='ACTOR')
semantic('stale-epoch',ac=changed(actor,lambda x:x.update(epoch=1)),error='STALE_AUTHZ')
semantic('archived-project',pp=changed(project,lambda x:x.update(archived=True)),error='ARCHIVED')
for label,body in [('html','<script>test</script>'),('remote-image','![x](https://example.invalid/x)'),
                   ('dangerous-url','[x](javascript:alert(1))'),('reference-link','[x][evil]')]:
    semantic(label,d=changed(draft,lambda x:x['payload']['presentation']['sections'][0].update(body=body)),error='UNSAFE_CONTENT')

ctmr=changed(draft,lambda x:x['payload']['manifest'].update(category='research',slug='research-fixture',researchClaims=[
    {'topic':'custom-model-architecture','status':'DOCUMENTED','description':'Model architecture statement; author approval pending.','evidenceAssetIds':[],'modelVersion':'unverified'},
    {'topic':'model-evaluation','status':'PLANNED','description':'No local experiment has been verified.','evidenceAssetIds':[]},
    {'topic':'mesh-output','status':'PLANNED','description':'3D artifact declaration; P1 raster preview only.','evidenceAssetIds':[]},
    {'topic':'async-inference-api','status':'PLANNED','description':'Future job interface; no executable endpoint.','evidenceAssetIds':[]}]))
record('structure/research-reference-representable',accepts('draft',ctmr))
semantic('research-reference',d=ctmr)
semantic('unbacked-experiment',d=changed(ctmr,lambda x:x['payload']['manifest']['researchClaims'][0].update(status='EXPERIMENT_VERIFIED')),error='EVIDENCE')
version={'id':V,'projectId':P,'version':'0.1.0','snapshot':copy.deepcopy(draft['payload']),'contentHash':H,
         'hashAlgorithm':'JCS-SHA256-v1','reviewId':R,'createdAt':NOW}
release={'id':R,'projectId':P,'versionId':V,'visibilityAtApproval':'PUBLIC','state':'PUBLISHED','publishedAt':NOW,'contentHash':H}
record('structure/sealed-unpublished-version',accepts('version',version))
dto=project_public_release(project,release,version)
record('projection/release-schema',accepts('release',dto))
edited_draft=changed(draft,lambda x:x['payload']['manifest'].update(name='DRAFT_CANARY'))
record('projection/new-draft-not-read',project_public_release(project,release,version)['name']!=edited_draft['payload']['manifest']['name'])
dirty=changed(version,lambda x:x.update(ownerId=A,storageRef='private/source',draft={'secret':'DRAFT_CANARY'}))
record('projection/record-fields-not-serialized',project_public_release(project,release,dirty)==dto)
record('projection/private-404',project_public_release(changed(project,lambda x:x.update(visibility='PRIVATE')),release,version) is None)
record('projection/withdrawn-404',project_public_release(project,changed(release,lambda x:x.update(state='WITHDRAWN')),version) is None)
record('projection/wrong-version-404',project_public_release(project,changed(release,lambda x:x.update(versionId=B)),version) is None)
record('projection/snapshot-digest-mismatch',project_public_release(project,changed(release,lambda x:x.update(contentHash='b'*64)),version) is None)
unlisted_project=changed(project,lambda x:x.update(visibility='UNLISTED'))
unlisted_release=changed(release,lambda x:x.update(visibilityAtApproval='UNLISTED'))
unlisted_version=changed(version,lambda x:x['snapshot']['manifest'].update(visibility='UNLISTED'))
record('projection/unlisted-direct-read',project_public_release(unlisted_project,unlisted_release,unlisted_version) is not None)
record('projection/public-leak-field-rejected',accepts('release',changed(dto,lambda x:x.update(storageRef='private/source'))),False)
record('catalog/public-listed',catalog_visible(project,release))
record('catalog/unlisted-not-listed',catalog_visible(changed(project,lambda x:x.update(visibility='UNLISTED')),release),False)
for label,pp,rr,aa,mapped in [
    ('approved',project,release,asset,{A:H}),
    ('private',changed(project,lambda x:x.update(visibility='PRIVATE')),release,asset,{A:H}),
    ('withdrawn',project,changed(release,lambda x:x.update(state='WITHDRAWN')),asset,{A:H}),
    ('cross-project',project,release,changed(asset,lambda x:x.update(projectId=B)),{A:H}),
    ('retired',project,release,changed(asset,lambda x:x.update(state='RETIRED')),{A:H}),
    ('unmapped-source',project,release,asset,{}),
    ('digest-mismatch',project,release,asset,{A:'b'*64}),
    ('expired',project,release,changed(asset,lambda x:x.update(rightsExpiresAt='2020-01-01T00:00:00Z')),{A:H})]:
    record('asset-read/'+label,asset_readable(pp,rr,aa,mapped,NOW),label=='approved')
record('state/submit',transition('DRAFT','submit')=='IN_REVIEW')
record('state/withdraw-review',transition('IN_REVIEW','withdraw')=='DRAFT')
record('state/publish-prepared',transition('IN_REVIEW','publish',True,True)=='PUBLISHED')
for label,state,approved,prepared in [('no-approval','IN_REVIEW',False,True),('copy-failure','IN_REVIEW',True,False),('draft-direct-publish','DRAFT',True,True),('archived','ARCHIVED',True,True)]:
    rejected=False
    try: transition(state,'publish',approved,prepared)
    except ValueError: rejected=True
    record('state/reject-'+label,rejected)

operations=[op for path in api['paths'].values() for method,op in path.items() if method in {'get','post','put','patch','head'}]
record('api/no-future-execution-paths',all(not re.search(r'runs|jobs|credentials|proxy|endpoint',p) for p in api['paths']))
record('api/public-read-only',all(method in {'get','head'} for p,path in api['paths'].items() if not p.startswith('/internal/') for method in path))
record('api/internal-security',all(op['security']==[{'InternalSession':[]}] for op in operations if op['x-scope']=='internal'))
record('api/operationIds-unique',len({op['operationId'] for op in operations})==len(operations))
record('api/internal-asset-preview',api['paths']['/internal/v1/projects/{projectId}/assets/{assetId}/content']['get']['x-scope']=='internal')
for name,definition in [('Manifest','manifest'),('Presentation','presentation'),('Draft','draft'),('Version','version'),('Release','release'),('AssetMetadata','assetmetadata')]:
    embedded=copy.deepcopy(api['components']['schemas'][name])
    def restore(v):
        if isinstance(v,dict): return {k:(x.replace('#/components/schemas/','#/$defs/') if k=='$ref' else restore(x)) for k,x in v.items()}
        if isinstance(v,list): return [restore(x) for x in v]
        return v
    record('generation/embedded-'+name,restore(embedded)==schemas[definition]['$defs'][name])
    record('generation/dependencies-'+name,all(restore(api['components']['schemas'][k])==v for k,v in schemas[definition]['$defs'].items()))

baseline=json.loads((ROOT/'evidence/baseline.json').read_text(encoding='utf-8'))
for section,basepath in [('inputs',ROOT),('p0Archive',args.p0_root)]:
    record('integrity/'+section,all(hashlib.sha256((basepath/x['path']).read_bytes()).hexdigest()==x['sha256'] for x in baseline[section]))
record('integrity/landing-source',all(hashlib.sha256((args.repo/x['path']).read_bytes()).hexdigest()==x['sha256']
    for x in json.loads((ROOT/'evidence/landing-source.json').read_text())['files']))

git=lambda *a: subprocess.check_output(['git','-C',str(args.repo),*a],text=True).strip()
record('source/baseline-tree',git('rev-parse',args.base+'^{tree}')=='8372e935e331688d6007b3433849c8efa8f6d10e')
changed_files=git('diff','--name-only',args.base).splitlines()
record('source/no-existing-source-diff',all(p.startswith('docs/platform/') for p in changed_files))
status=git('status','--porcelain=v1','--untracked-files=all').splitlines()
record('source/no-files-outside-docs-platform',all(line[3:].startswith('docs/platform/') for line in status))
report={'result':'PENDING_LINK_CHECK','checkedAt':datetime.now(timezone.utc).isoformat(),'scope':'Offline structural validation and executable specification examples only',
    'validators':{p:importlib.metadata.version(p) for p in ['jsonschema','openapi-spec-validator','openapi-schema-validator']},
    'p0OriginalCases':ns['cases'],'p0OriginalPassed':42,'p05Cases':cases,'p05Passed':len(cases),
    'openapi':{'version':api['openapi'],'paths':len(api['paths']),'operations':len(operations),'result':'PASS'},
    'source':{'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'trackedBaselineFiles':len(git('ls-tree','-r','--name-only',args.base).splitlines()),'existingSourceChanges':changed_files},
    'unexecuted':['application tests','new real Auth JWT/GRANT/RLS tests','storage/CDN/revocation fault tests','browser visual acceptance','JCS cross-language vectors','GPU/Provider/BYOK','production migrations/deployment']}
args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
(ROOT/'contracts/non-ai.fixture.json').write_text(json.dumps({'contractFixtureOnly':True,'draft':draft,'assets':assets},indent=2)+'\n',encoding='utf-8',newline='\n')
(ROOT/'contracts/research.fixture.json').write_text(json.dumps({'contractFixtureOnly':True,'draft':ctmr},indent=2)+'\n',encoding='utf-8',newline='\n')
link_errors=[]
for md in ROOT.rglob('*.md'):
    if 'inputs' in md.relative_to(ROOT).parts: continue
    for target in re.findall(r'\]\(([^)]+)\)',md.read_text(encoding='utf-8')):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) or target.startswith('#'):continue
        if not (md.parent/target.split('#')[0]).exists():link_errors.append([str(md),target])
record('docs/local-links',not link_errors)
report.update(result='PASS',p05Passed=len(cases))
args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'p0':42,'p05':len(cases),'result':'PASS','report':str(args.report)}))
