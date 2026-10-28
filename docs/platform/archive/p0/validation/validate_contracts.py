"""Offline P0 document validation. Never imports application code or connects to a DB."""
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

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1]
AUDIT = SOURCE.parent
BASE_REPO = Path(r"D:\AIGC\ai-generator-pr25-ci")
BASE_COMMIT = "a0050aaf4fc16e1cadd110918c3354a29e8d99fe"
MAIN_COMMIT = "e33ac216bdcffc44d12d4b7315e0d6cc48decf5c"
TREE = "8372e935e331688d6007b3433849c8efa8f6d10e"

def read(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8-sig"))

manifest = read("06-project-manifest.schema.json")
presentation = read("08-presentation.schema.json")
api = read("07-api-contract.openapi.yaml")  # JSON is a YAML-compatible representation.
for schema in [manifest, presentation]:
    Draft202012Validator.check_schema(schema)
validate(api)

uid = "11111111-1111-4111-8111-111111111111"
uid2 = "22222222-2222-4222-8222-222222222222"
showcase = {
    "schemaVersion": "1.0.0", "projectId": uid, "slug": "contract-fixture",
    "version": "0.1.0", "name": "CONTRACT FIXTURE — not a real project",
    "category": "software", "visibility": "PRIVATE",
    "integration": {"mode": "SHOWCASE"}, "capabilities": ["documentation.read"],
    "dataPolicy": {"publicDemoData": "none", "requiresExplicitConsentForRemoteProcessing": False,
                   "dataClasses": ["SYNTHETIC"], "retentionSeconds": 0},
}
remote = copy.deepcopy(showcase)
remote["integration"] = {"mode": "REMOTE_API", "openapi": "./openapi.yaml", "endpointRef": "registered-fixture-v1",
                         "operations": [{"capability": "algorithm.compute", "operationId": "compute",
                                         "inputSchema": "./input.schema.json", "outputSchema": "./output.schema.json"}]}
remote["capabilities"] = ["algorithm.compute"]
remote["dataPolicy"].update(requiresExplicitConsentForRemoteProcessing=True, processorRef="fixture-processor")
pres = {"schemaVersion": "1.0.0", "projectId": uid, "version": "0.1.0", "title": "CONTRACT FIXTURE",
        "sections": [{"id": "overview", "kind": "MARKDOWN", "title": "Overview", "body": "Synthetic schema fixture only.", "verification": "UNVERIFIED"},
                     {"id": "metrics", "kind": "BENCHMARKS", "title": "No results", "metrics": [{"name": "Fixture metric", "status": "UNPUBLISHED"}]}]}
run = {"versionId": uid, "grantId": uid2, "capability": "algorithm.compute", "parameters": {"text": "fixture", "threshold": 0.5},
       "inputMode": "READY", "inputAssetIds": [], "execution": {"mode": "PLATFORM"}}

cases = []
def check(name, schema, value, should_pass=True):
    errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value))
    passed = not errors
    assert passed == should_pass, f"{name}: unexpected validation outcome: {[e.message for e in errors[:2]]}"
    cases.append({"name": name, "expected": "accept" if should_pass else "reject", "result": "PASS"})

def mutate(base, action):
    value = copy.deepcopy(base)
    action(value)
    return value

def api_schema(name):
    return {"$ref": f"#/components/schemas/{name}", "components": api["components"]}

check("manifest/generic-non-AI-showcase", manifest, showcase)
check("manifest/remote-with-operation-schema-mapping", manifest, remote)
check("manifest/registered-embed-proposal", manifest, mutate(showcase, lambda v: v.update(integration={"mode": "VERIFIED_EMBED", "embedRef": "fixture-embed"})))
for name, action in [
    ("unknown-field", lambda v: v.update(shell="whoami")),
    ("unknown-schema-version", lambda v: v.update(schemaVersion="9.0.0")),
    ("slug-in-projectId", lambda v: v.update(projectId="ctmr-4c")),
    ("invalid-slug", lambda v: v.update(slug="../private")),
    ("noncanonical-version", lambda v: v.update(version="01.0.0")),
    ("duplicate-capability", lambda v: v.update(capabilities=["documentation.read"]*2)),
    ("arbitrary-hosted-runtime", lambda v: v.update(integration={"mode": "PLATFORM_HOSTED", "command": "run"})),
    ("negative-retention", lambda v: v["dataPolicy"].update(retentionSeconds=-1)),
]: check("manifest/reject-"+name, manifest, mutate(showcase, action), False)
for name, action in [
    ("remote-without-consent", lambda v: v["dataPolicy"].update(requiresExplicitConsentForRemoteProcessing=False)),
    ("remote-without-processor", lambda v: v["dataPolicy"].pop("processorRef")),
    ("arbitrary-endpoint-url", lambda v: v["integration"].update(endpointUrl="http://127.0.0.1")),
    ("url-as-endpoint-ref", lambda v: v["integration"].update(endpointRef="http://169.254.169.254")),
    ("remote-openapi-url", lambda v: v["integration"].update(openapi="https://example.invalid/api.yaml")),
    ("missing-operation-map", lambda v: v["integration"].pop("operations")),
    ("remote-input-schema-ref", lambda v: v["integration"]["operations"][0].update(inputSchema="https://example.invalid/schema.json")),
]: check("manifest/reject-"+name, manifest, mutate(remote, action), False)

check("presentation/unpublished-no-fake-value", presentation, pres)
viewer = mutate(pres, lambda v: v["sections"].append({"id": "mesh", "kind": "VIEWER", "title": "Fixture only", "viewerType": "MESH3D", "assetIds": [uid], "dataClass": "SYNTHETIC"}))
check("presentation/typed-static-viewer", presentation, viewer)
reported = mutate(pres, lambda v: v["sections"][1]["metrics"][0].update(status="REPORTED", value=1, unit="fixture", dataset="synthetic-contract-fixture", protocol="Schema fixture; no experiment performed", evidenceAssetId=uid))
check("presentation/reported-with-provenance-fields", presentation, reported)
for name, base, action in [
    ("unpublished-zero", pres, lambda v: v["sections"][1]["metrics"][0].update(value=0)),
    ("reported-without-evidence", reported, lambda v: v["sections"][1]["metrics"][0].pop("evidenceAssetId")),
    ("arbitrary-component", pres, lambda v: v["sections"][0].update(component="remote.js")),
    ("iframe-section", pres, lambda v: v["sections"][0].update(kind="IFRAME")),
    ("medical-public-viewer", viewer, lambda v: v["sections"][-1].update(dataClass="MEDICAL_SENSITIVE")),
    ("javascript-viewer", viewer, lambda v: v["sections"][-1].update(viewerType="JAVASCRIPT")),
]: check("presentation/reject-"+name, presentation, mutate(base, action), False)

check("run/generic-parameter-only", api_schema("RunRequest"), run)
upload = mutate(run, lambda v: v.update(inputMode="UPLOAD"))
check("run/upload-awaits-explicit-finalize", api_schema("RunRequest"), upload)
byok = mutate(run, lambda v: v.update(execution={"mode": "BYOK", "credentialId": uid, "credentialGrantId": uid2, "model": "fixture-model"}))
check("run/explicit-byok", api_schema("RunRequest"), byok)
for name, base, action in [
    ("caller-supplied-owner", run, lambda v: v.update(userId=uid2)),
    ("missing-grant", run, lambda v: v.pop("grantId")),
    ("missing-parameters", run, lambda v: v.pop("parameters")),
    ("byok-missing-delegation", byok, lambda v: v["execution"].pop("credentialGrantId")),
    ("implicit-fallback", run, lambda v: v["execution"].update(fallback="BYOK")),
    ("upload-with-presealed-inputs", upload, lambda v: v.update(inputAssetIds=[uid])),
]: check("run/reject-"+name, api_schema("RunRequest"), mutate(base, action), False)
check("finalize/complete-input-list", api_schema("InputFinalize"), {"inputAssetIds": [uid, uid2]})
check("finalize/reject-empty", api_schema("InputFinalize"), {"inputAssetIds": []}, False)
check("finalize/reject-duplicate", api_schema("InputFinalize"), {"inputAssetIds": [uid, uid]}, False)
check("credential/reject-arbitrary-base-url", api_schema("CredentialRequest"), {"providerRef": "fixture-provider", "label": "fixture", "secret": "fixture-not-a-secret", "mode": "PERSISTENT", "baseUrl": "http://127.0.0.1"}, False)
callback = {"eventId": uid, "runId": uid2, "attempt": 1, "fence": 1, "sequence": 1, "state": "RUNNING"}
check("callback/typed-event", api_schema("Callback"), callback)
check("callback/reject-missing-fence", api_schema("Callback"), mutate(callback, lambda v: v.pop("fence")), False)

# Preserve examples as obvious contract fixtures, never sample claims about a live project.
fixtures = {"manifest-showcase": showcase, "manifest-remote": remote, "presentation": pres, "run-parameters": run, "run-upload": upload}
for name, fixture in fixtures.items():
    (ROOT / "validation" / f"fixture-{name}.json").write_text(json.dumps(fixture, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

tree = subprocess.check_output(["git", "-C", str(BASE_REPO), "rev-parse", f"{BASE_COMMIT}^{{tree}}"], text=True).strip()
assert tree == TREE
entries = subprocess.check_output(["git", "-C", str(BASE_REPO), "ls-tree", "-rz", BASE_COMMIT]).split(b"\0")
source_mismatches = []
tracked = set()
for entry in entries:
    if not entry: continue
    meta, raw_path = entry.split(b"\t", 1)
    mode, kind, expected = meta.decode().split()
    assert kind == "blob", "Submodules require a separate audit"
    relative = raw_path.decode("utf-8")
    tracked.add(relative)
    file = SOURCE / relative
    if not file.is_file():
        source_mismatches.append({"path": relative, "issue": "missing"})
        continue
    data = file.read_bytes()
    actual = hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if actual != expected:
        source_mismatches.append({"path": relative, "issue": "changed", "expected": expected, "actual": actual})
assert not source_mismatches, source_mismatches
new_files = sorted(p.relative_to(SOURCE).as_posix() for p in SOURCE.rglob("*") if p.is_file() and p.relative_to(SOURCE).as_posix() not in tracked)
assert all(p.startswith("docs/platform/") for p in new_files), new_files

link_errors=[]
for md in ROOT.rglob("*.md"):
    for label, target in re.findall(r"\[([^\]]+)\]\(([^)]+)\)", md.read_text(encoding="utf-8-sig")):
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:",target) or target.startswith("#"): continue
        local = target.split("#",1)[0].split(":",1)[0]
        if local and not (md.parent/local).exists(): link_errors.append({"file":md.relative_to(ROOT).as_posix(),"target":target})
assert not link_errors, link_errors

report={"checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "scope":"Documentation only; no application imports, tests, network, DB, migration or deployment",
        "validators":{p:importlib.metadata.version(p) for p in ["jsonschema","openapi-spec-validator","openapi-schema-validator"]},
        "metaschemas":"2 PASS", "openapi":{"version":api['openapi'],"result":"PASS","paths":len(api['paths']),"operations":sum(len(p) for p in api['paths'].values())},
        "contract_cases":cases,"contract_cases_passed":len(cases),
        "source_integrity":{"locked_main":MAIN_COMMIT,"archive_from":BASE_COMMIT,"git_tree":TREE,"tracked_files_verified":len(tracked),"mismatches":source_mismatches,"new_files_outside_docs_platform":0},
        "local_markdown_links":"PASS",
        "limitations":["Structural fixtures do not implement or prove AuthZ, SSRF, XSS sanitization, KMS, callback ordering, browser behavior or runtime durability.","Semantic publication checks and application/DB/medical test gates remain unexecuted."]}
(ROOT/"evidence"/"contract-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"result":"PASS","cases":len(cases),"source_files":len(tracked),"source_mismatches":len(source_mismatches),"openapi":api['openapi']},ensure_ascii=False))
