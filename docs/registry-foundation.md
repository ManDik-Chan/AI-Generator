# P1-B1 Registry foundation

Scope: Issue #28, original PR #29 foundation on
`main@0e13d32fdcfd1555172c7d93aa74c036466d0943`, integrated with
`main@c79b6a78d30b5697a842f9491a2a0667cc3168dd` after PR #36. Current
compatibility, delivery boundaries and B2 sequence are in
[the 2026-10-30 handoff](handoffs/2026-10-30-codex-registry-b1.md).
Design inputs are read-only historical `codex/p1-a-final-evidence-20261028` (`d616364`):
`docs/platform/p05/{registry-publication,architecture,p1-tasks}.md` and
`contracts/{manifest,draft,version,release}.schema.json`. They are not cherry-picked migrations.

## Data and ownership

Eight Prisma entities: Project, ProjectDraft, ProjectVersion, ProjectRelease,
ProjectAsset, ProjectDocumentation, ProjectMembership, PublicationReview.
Profile relations reuse existing Auth user UUIDs; SQL cross-schema FKs require
operator and membership subjects to exist in auth.users as well. Existing enum semantics, tables,
routes, services, Landing and Workspace are unchanged.

The unchanged `20261028135224_project_registry_foundation` migration is one
transaction. It includes Prisma-generated FKs and indexes plus SQL-only checks,
partial indexes and triggers. The additive
`20261030120001_registry_sealing_qualification` migration independently wraps its
qualification guards in a transaction. The complete chain is main's unchanged
21-migration prefix plus these two migrations. Do not use `db push` to recreate
this schema: Prisma cannot express all these constraints.

- Slug and owner are immutable. Projects cannot be hard deleted; slugs are never
  reused, including after archival. Foreign keys restrict removal of history.
- Creation defaults to PRIVATE with epoch/revision 1, and atomically establishes
  exactly one active OWNER membership. The internal command also creates a DRAFT.
- Membership is unique per project/subject. `roles` is a nonempty distinct array
  of OWNER/EDITOR/REVIEWER/PUBLISHER/VIEWER, allowing the contract's multiple roles.
  OWNER must be the project's owner. Membership changes advance project epoch
  and revision; visibility/archive changes advance epoch. Operator qualification
  changes also advance affected active projects' epochs. No ownership transfer.
- One active DRAFT or IN_REVIEW per project. Content edits are limited to DRAFT;
  draft revisions advance in the database. Published/archived drafts are terminal.
- Every child reference includes project_id. The current release also has a
  same-project composite FK and must be PUBLISHED. IDs cannot be reassigned.
- Version numbers are unique per project. Versions cannot be updated/deleted.
  An eligible independent reviewer, current approved review, matching hash,
  draft revision and epoch are required for insertion. Versions have no publishedAt.
- Version and Release insertion recheck the submitter's current OWNER/EDITOR and
  reviewer's current REVIEWER qualification and membership. Natural operator
  expiry does not fire an UPDATE trigger or advance epoch, so the follow-up
  migration explicitly checks both actors at sealing time.
- Releases require publishedAt, matching version hash and approval visibility.
  They can only transition once from PUBLISHED to WITHDRAWN, with a timestamp;
  clear the current pointer first. No resurrection or overwrite of history.
- Assets begin QUARANTINED and follow VALIDATED → APPROVED → RETIRED or REJECTED.
  Original identity/provenance are frozen, hashes are lowercase SHA-256 syntax,
  validated/approved assets require delivery digests; size is 1..2 MiB.
- Documentation has exactly one draft/version parent and an approved same-project
  text/markdown asset with matching delivery digest. Sealed document references
  must be inserted in the version's transaction and cannot later be appended,
  changed, reparented or deleted.
- Reviews bind draft/revision/epoch, visibility, digest set, policy revision,
  expiry and submitter. Self-review is rejected; approved/rejected decisions
  require a reviewer and timestamp. Bound fields and terminal decisions are frozen.

## Authorization and inactive entry point

`registry_private.internal_operators` is a small SQL-only qualification table,
not a ninth product entity. It references Profile UUIDs, requires explicit active
status and an expiry, and separates creator eligibility (`can_create`) from login,
Profile.ADMIN and project roles. Only a trusted DB administrator provisions it.
No real operator is provisioned by the migration. This schema is not in the Data
API's exposed schema list; it has RLS and no browser/service-role table grants.

All eight public tables have RLS. Anon has no privileges. Authenticated receives
only SELECT, filtered by live internal eligibility AND active project membership.
There are no browser write policies or grants. Revoking eligibility or membership
takes effect on subsequent statements even with an unrefreshed JWT. Membership
does not grant platform privileges, and user_metadata is never authorization data.

The single SECURITY DEFINER function `registry_private.can_read(project)` is
necessary to avoid recursive membership RLS. It is a read-only existence check,
uses the caller's auth.uid(), has a fixed empty search_path, takes no subject ID,
is outside exposed schemas, and has explicit authenticated-only EXECUTE. All
other helpers/triggers use invoker security with revoked public execution.

The service_role has **no direct Registry table privileges**, including SELECT.
BYPASSRLS does not bypass table ACLs. Existing service-role permissions on legacy
tables are unchanged. Prisma/database-owner connections remain privileged and
must stay server-only; a DB owner can always alter guards and is not an untrusted
actor. `createInternalRegistryProject` is the only application command in B1:

1. Require `REGISTRY_INTERNAL_ACCESS_ENABLED=true` (unset/false denies).
2. Strictly accept slug only; reject ownerId/projectId and extra input.
3. Verify the supplied access token against Supabase Auth getUser, reject anonymous users.
4. Lock/check current internal creator qualification inside the transaction.
5. Derive ownership from the verified subject and atomically create Project/OWNER/DRAFT.

No route imports the command. There is no public Draft DTO, publication command,
asset origin, new UI, execution, BYOK or GPU feature. B1 tests create synthetic
review/version/release rows through the trusted disposable DB to exercise constraints;
that does not enable a runtime release feature.

Supabase `getUser(accessToken)` verifies the token; B1 does not promise immediate
invalidation of already-issued access tokens after session logout. Auth session
revocation and internal qualification revocation are different operations. The
live operator/membership revoke and expiry guarantees above are the B1 boundary.
If B2 requires immediate session revocation on sensitive commands, it must also
validate the token's `session_id` against current session state; that check is not
implemented by B1.

## Verification and operations

Tests use a separately named local Supabase stack, loopback-bound inspected
containers, explicit disposable marker and existing mutation/reset guards. No
application `.env` is copied or loaded. Commands from the dedicated worktree:

```text
node scripts/run-local-security-stage.mjs registry-migrations <isolated-workdir>
node scripts/run-local-security-stage.mjs registry <isolated-workdir>
node scripts/run-local-security-stage.mjs integration <isolated-workdir>
```

The migration proof applies main's migration prefix, seeds real old Chat/Persona/
Tools/Memory rows, snapshots all legacy table data, injects a final SQL failure,
checks rollback of Registry/private schema and unchanged old rows, then upgrades
and compares again. A fresh install, repeat deploy, migration checksum and eight
RLS tables are checked separately. The test runner discovers the new Registry
suite automatically and treats skipped/TODO/empty suites as acceptance failures.
CI retains existing six required gate definitions and the P1-A security suites.

Registry integration covers real Auth-issued JWTs for two internal operators and
an ordinary ADMIN, anon and service-role REST attacks, all table ACLs, cross-user/
project reads and writes, forged references/ownership, live revoke/expiry, immutable
history, review and asset/document lifecycle negatives, and the real privileged
server command. Synthetic fixture cleanup uses a transaction-local superuser
trigger bypass restricted to IDs created by the suite; runtime has no such bypass.

Branch preview deployment is disabled in vercel.json. Production DB operations,
main merge and deployment remain Owner actions. Main auto-deploy configuration
must be addressed before any future manual merge; this branch's setting only
disables its own preview. This PR is not permission to run a production migration.

## Risks, rollback and B2 handoff

Keep the flag false and leave the tables empty in environments that have not
received separate migration approval. Roll back application code/disable its flag;
retain schema, immutable history, ACLs and slug reservations. Do not undo by
granting client writes, dropping tables or rewriting applied migration files.
A migration error rolls back the entire new transaction. Backup/restore and
production rollout need a separate approved runbook.

B2 must implement DraftDTO/semantic schemas, expected revision CAS, complete
independent review commands, policy/asset authorization freshness, canonical
JCS-SHA256-v1 hashing and cross-language vectors, idempotency, locking/race/replay
and response-loss tests, release publish/withdrawal/rollback transactions and
fail-closed public projection. B1 validates hash shape/bindings, **not** JCS bytes
or content policy. SQL epoch/revision checks are foundations, not a completed
publication protocol. Do not expose raw ORM rows or enable this flag as a shortcut
to B2. New safety actions require separately granted operator capabilities.
