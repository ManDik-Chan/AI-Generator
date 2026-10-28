"""Record local evidence once; never reads .env or modifies source checkouts."""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--source-checkout',type=Path,required=True)
p.add_argument('--legacy-checkout',type=Path,required=True)
p.add_argument('--p0-original',type=Path,required=True)
p.add_argument('--review-original',type=Path,required=True)
p.add_argument('--roadmap-original',type=Path,required=True)
a=p.parse_args()
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[2]
def git(repo,*args):return subprocess.check_output(['git','-C',str(repo),*args],text=True).rstrip()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def state(repo):return {'path':str(repo),'head':git(repo,'rev-parse','HEAD'),'branch':git(repo,'branch','--show-current'),
                       'statusPorcelain':git(repo,'status','--porcelain=v1','--untracked-files=all').splitlines()}
baseline={'recordedAt':datetime.now(timezone.utc).isoformat(),'timezone':'Asia/Singapore',
    'mainSha':'e33ac216bdcffc44d12d4b7315e0d6cc48decf5c','mainTree':'8372e935e331688d6007b3433849c8efa8f6d10e',
    'baseSha':git(REPO,'rev-parse','HEAD'),'workBranch':git(REPO,'branch','--show-current'),
    'worktree':str(REPO),'worktreeStatusOnCreation':'clean; only subsequent docs/platform changes are authorized',
    'originalSourceCheckout':state(a.source_checkout),'legacyAuthorizedCheckout':state(a.legacy_checkout),
    'network':'git ls-remote failed: configured proxy 127.0.0.1:26001 unreachable; GitHub connector GET main identity verified',
    'inputs':[],'p0Archive':[],'sourceDocuments':[],'limitations':['Roadmap Self_Audit companion not obtained','No browser, DB, Provider or model tests executed']}
for path in sorted((ROOT/'inputs').iterdir()):
    if not path.is_file():continue
    original=(a.source_checkout/'AGENTS.md' if path.name=='source-checkout-AGENTS.md' else
              a.roadmap_original if path.name.startswith('AIG_Platform_Development_Roadmap') else a.review_original/path.name)
    assert original.is_file() and sha(path)==sha(original)
    baseline['inputs'].append({'path':path.relative_to(ROOT).as_posix(),'original':str(original),'sha256':sha(path)})
for path in sorted((ROOT.parent/'archive/p0').rglob('*')):
    if not path.is_file() or '__pycache__' in path.parts:continue
    rel=path.relative_to(ROOT.parent/'archive/p0');original=a.p0_original/rel
    assert original.is_file() and sha(path)==sha(original),(path,'archive mismatch')
    baseline['p0Archive'].append({'path':rel.as_posix(),'sha256':sha(path)})
for name in ['docs/architecture.md','docs/database-design.md','docs/design-system.md','docs/security-audit-2026-07-22.md',
             'docs/security-hardening-deployment.md','docs/authentication.md','docs/agent-threat-model.md',
             'prisma/schema.prisma','prisma/rls.sql','.github/workflows/security-acceptance.yml','.github/workflows/merge-gates.yml','package.json']:
    path=REPO/name;baseline['sourceDocuments'].append({'path':name,'sha256':sha(path)})
target=ROOT/'evidence/baseline.json'
if target.exists():raise SystemExit('Baseline already exists; do not overwrite initial evidence')
target.write_text(json.dumps(baseline,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
paths=sorted((REPO/'features/landing').rglob('*'))+sorted((REPO/'app/(marketing)').rglob('*'))
paths += [REPO/'app/layout.tsx',REPO/'app/globals.css',REPO/'app/(platform)/workspace/page.tsx']
landing={'mainSha':baseline['mainSha'],'tree':baseline['mainTree'],'verification':'SOURCE_ONLY',
         'golden':'MISSING','ownerArtifactSignoff':'PENDING','files':[{'path':x.relative_to(REPO).as_posix(),'sha256':sha(x)} for x in paths if x.is_file()]}
(ROOT/'evidence/landing-source.json').write_text(json.dumps(landing,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'baseline':str(target),'p0Files':len(baseline['p0Archive']),'inputs':len(baseline['inputs']),'landingFiles':len(landing['files'])}))
