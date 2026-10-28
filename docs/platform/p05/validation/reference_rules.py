"""Executable specification examples, NOT application authorization or sanitization."""
import re
import json
from datetime import datetime, timezone

CAPABILITIES={'documentation.read','presentation.read','static-image.read'}
MIMES={'image/png','image/jpeg','image/webp','text/markdown'}
PUBLIC={'PUBLIC','UNLISTED'}

def expired(expiry, now):
    return datetime.fromisoformat(expiry.replace('Z','+00:00')) <= datetime.fromisoformat(now.replace('Z','+00:00'))

def strict_json_loads(text):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise ValueError('DUPLICATE_KEY')
            result[key]=value
        return result
    def invalid(value): raise ValueError('NON_FINITE_NUMBER')
    return json.loads(text,object_pairs_hook=pairs,parse_constant=invalid)

def safe_text(text):
    # Conservative P1 publication profile. Real AST renderer/sanitizer remains unimplemented.
    return not re.search(r'<|>|!\[|\]\s*\(|\]\s*\[|https?\s*:|javascript\s*:|data\s*:|file\s*:|\\\\',text,re.I)

def publication_errors(draft, assets, review, actor, project, now):
    p=draft['payload'];m=p['manifest'];v=p['presentation'];errors=set()
    if not actor.get('internal') or not actor.get('active') or 'PUBLISHER' not in actor.get('roles',[]): errors.add('ACTOR')
    if project.get('archived'): errors.add('ARCHIVED')
    if draft['state']!='IN_REVIEW': errors.add('STATE')
    if not (draft['projectId']==m['projectId']==v['projectId']==project['id']): errors.add('PROJECT')
    if m['version']!=v['version']: errors.add('VERSION')
    if m['integration']['mode']!='SHOWCASE' or not set(m['capabilities'])<=CAPABILITIES: errors.add('CAPABILITY')
    if len({s['id'] for s in v['sections']})!=len(v['sections']): errors.add('SECTION_ID')
    if len({d['id'] for d in p['documentation']})!=len(p['documentation']): errors.add('DOCUMENT_ID')
    if review['decision']!='APPROVED' or review['reviewerId']==review['submitterId']: errors.add('REVIEW')
    if review['projectId']!=project['id'] or review['draftRevision']!=draft['revision']: errors.add('STALE_REVIEW')
    if review['snapshotHash']!=project['candidateHash'] or review['visibility']!=m['visibility']: errors.add('HASH_OR_VISIBILITY')
    if expired(review['expiresAt'],now) or review['policyRevision']!=project['policyRevision']: errors.add('EXPIRED_REVIEW')
    if actor['epoch']!=project['authzEpoch']: errors.add('STALE_AUTHZ')
    refs=set()
    for s in v['sections']:
        if s['kind']=='MARKDOWN':
            if not safe_text(s['body']): errors.add('UNSAFE_CONTENT')
            refs.update(s['sourceAssetIds'])
        elif s['kind']=='IMAGE': refs.add(s['assetId'])
        elif s['kind']=='BENCHMARKS':
            for metric in s['metrics']:
                if metric['status']=='REPORTED': refs.add(metric['evidenceAssetId'])
        else: errors.add('UNSUPPORTED_VIEWER')
    for c in m['researchClaims']:
        refs.update(c['evidenceAssetIds'])
        if c['status'] in {'SOURCE_IMPLEMENTED','EXPERIMENT_VERIFIED'} and not c['evidenceAssetIds']: errors.add('EVIDENCE')
    for d in p['documentation']: refs.add(d['assetId'])
    for aid in refs:
        a=assets.get(aid)
        if not a: errors.add('MISSING_ASSET');continue
        if a['projectId']!=project['id']: errors.add('ASSET_PROJECT')
        if a['state']!='APPROVED' or a['dataClass'] not in {'SYNTHETIC','PUBLIC_CURATED'}: errors.add('ASSET_STATE')
        if a['mime'] not in MIMES: errors.add('ASSET_TYPE')
        if not a.get('rightsRef') or not a.get('provenance') or expired(a['rightsExpiresAt'],now): errors.add('RIGHTS')
        if not a.get('scanRevision') or review['assetDigests'].get(aid)!=a.get('deliveryDigest'): errors.add('ASSET_DIGEST')
    for d in p['documentation']:
        if assets.get(d['assetId'],{}).get('mime')!='text/markdown': errors.add('DOC_TYPE')
    return errors

def project_public_release(project, release, sealed_version):
    """Explicit projection; caller passes sealed version only, never a draft."""
    if project.get('archived') or project['visibility'] not in PUBLIC or release['state']!='PUBLISHED': return None
    if release['projectId']!=project['id'] or sealed_version['projectId']!=project['id']: return None
    if release['versionId']!=sealed_version['id'] or release['contentHash']!=sealed_version['contentHash']: return None
    if release['visibilityAtApproval']!=project['visibility']: return None
    p=sealed_version['snapshot'];m=p['manifest']
    return {'schemaVersion':'0.5.0','projectId':project['id'],'releaseId':release['id'],'version':sealed_version['version'],
            'name':m['name'],'summary':m['summary'],'visibility':project['visibility'],'publishedAt':release['publishedAt'],
            'presentation':p['presentation'],'documentation':p['documentation'],'researchClaims':m['researchClaims']}

def asset_readable(project, release, asset, mapped_digests, now):
    return (not project.get('archived') and project['visibility'] in PUBLIC and release['state']=='PUBLISHED'
        and release['visibilityAtApproval']==project['visibility']
        and project['id']==release['projectId']==asset['projectId']
        and mapped_digests.get(asset['id'])==asset.get('deliveryDigest') and asset.get('deliveryDigest') is not None
        and asset['state']=='APPROVED' and asset['mime'] in MIMES and asset['dataClass'] in {'SYNTHETIC','PUBLIC_CURATED'}
        and not expired(asset['rightsExpiresAt'],now) and bool(asset.get('rightsRef')))

def catalog_visible(project, release):
    return not project.get('archived') and project['visibility']=='PUBLIC' and release['state']=='PUBLISHED' and release['visibilityAtApproval']=='PUBLIC'

def transition(state, command, review_approved=False, prepared=False):
    allowed={('DRAFT','submit'):'IN_REVIEW',('IN_REVIEW','withdraw'):'DRAFT',('IN_REVIEW','reject'):'DRAFT'}
    if command=='archive' and state in {'DRAFT','IN_REVIEW'}: return 'ARCHIVED'
    if command=='publish' and state=='IN_REVIEW' and review_approved and prepared: return 'PUBLISHED'
    if (state,command) not in allowed: raise ValueError('INVALID_TRANSITION')
    return allowed[(state,command)]
