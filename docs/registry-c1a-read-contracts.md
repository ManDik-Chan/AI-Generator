# P1-C1-A internal read API

Baseline: `main@fc43538` (PRs #37–#41 merged). This change implements the read foundation requested by the [P1-D C-1–C-8 handoff](handoffs/2026-10-31-claude-developer-console.md). It does not connect or change the console UI. C-5, HTTP writes, public Registry/distribution, asset delivery, third-party execution and BYOK remain outside scope. No migration, RLS policy, production database or production deployment changes are required.

## Gates and identity

The new query library requires `REGISTRY_INTERNAL_ACCESS_ENABLED=true` and `REGISTRY_INTERNAL_READ_ENABLED=true`. HTTP additionally requires `REGISTRY_INTERNAL_READ_HTTP_ENABLED=true`. All default to false. Draft/review and Release command flags may remain false while reads are enabled. Existing library Draft reads remain backward compatible with their original draft/review flag. No new flag enables HTTP writes or public reads.

Every call verifies the Bearer access token with Supabase Auth, then verifies the corresponding `auth.sessions` row, subject, JWT expiry and `not_after` inside a database transaction. This follows the [Supabase session revocation model](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out). Token metadata and profile ADMIN do not participate in authorization. OWNER does not substitute for internal or action qualifications.

Queries require an active unexpired internal operator, the specific active unexpired read action, an active project membership and the matching same-project object. Archived projects and foreign/missing objects return `NOT_FOUND`. Project lists derive membership from the verified subject, never a client owner/tenant ID. Self qualifications accept no subject parameter. Share locks serialize revocations; Serializable transactions retry bounded conflicts and recheck session, read qualification, membership and returned qualification deadlines against a final database clock. Commands retain their existing independent authorization and transactional checks.

## Browser-safe contracts

`features/registry/read-contracts.ts` exports `DraftReadDTO`, strict `reviewDTOSchema` / `ReviewDTO`, `releaseCommandResultSchema` / `ReleaseCommandResult`, and frozen role maps `REGISTRY_DRAFT_ROLES`, `REGISTRY_RELEASE_ROLES`, `REGISTRY_ACTION_ROLES`. It has no runtime dependency on Node crypto, Prisma, Auth or command modules. `features/registry/query-contracts.ts` exports strict project, self-qualification, Release history/request and pagination schemas/types. Existing literal command role maps are preserved to retain accepted assertions; new parity tests bind them to the shared contract.

| Request | Result and semantics |
| --- | --- |
| Draft head | Existing head plus `contentHash: string \| null`; null means the draft payload is uninitialized/invalid, not a hash to submit |
| Draft | HTTP `DraftReadDTO` adds server-computed JCS-SHA256 contentHash; uninitialized full reads return `DRAFT_UNINITIALIZED` |
| Review | Existing decision/effectiveState/hash/expiry plus `submittedByViewer`; no submitter/reviewer identity |
| Project summary | id, slug, visibility, caller roles; release head pointer requires the independent READ_RELEASE query |
| Project detail | Summary plus `effectiveActions: {action, expiresAt}[]`, intersecting the caller's active independent grants and own project roles |
| Qualifications | `{actions: {action, expiresAt}[]}` for the current caller only; expiry is the earlier of internal/operator-action expiry |
| Version | Existing strict `VersionDTO` with validated canonical snapshot/hash; only same-project members with READ_DRAFT |
| Release history | id/project/version/hash/visibility, publishedAt, state, withdrawnAt and intent; intent can be null for pre-approval legacy history |
| Release requests | id/project/version/hash/intent/target/visibility/expiry, approvalId, state, expired, stale, requestedByViewer, approvedByViewer |

Qualification results describe the identity/role gates at the read's final validation instant, not permission to execute a particular object command. Flags, self-review restrictions, requester-only publishing, policy, asset bindings, expiry and CAS must still be checked by the command. Asset qualifications remain internal actions; sharing their names adds no asset HTTP endpoint.

Release request `state` is an immutable fact projection (`PENDING`, `APPROVED`, `CONSUMED`), not current executable approval. `expired` checks database time; `stale` checks policy/project epoch/revision/current-head bindings. Neither proves current requester/reviewer/asset eligibility. Consumed requests can be stale or expired. Review `SEALED` is historical provenance, not publication permission. History PUBLISHED does not imply current delivery, and withdrawal is projected from append-only withdrawal facts (with legacy withdrawal time compatibility). There is no public content or asset URL in any response.

The legacy `getRegistryDraft()` library keeps `result` compatible with the strict existing DraftDTO and returns `contentHash` alongside it in the envelope. HTTP folds this hash into `result`. This preserves existing accepted DTO assertions. Review reads and fresh commands add viewer-relative identity; old persisted command receipts are rehydrated only for this boolean, without rewriting historical receipts or decisions.

## HTTP

Base: `/api/internal/registry`. Bearer token only; cookies are not an authentication fallback. No login redirects. GET only; HEAD/OPTIONS/POST/PUT/PATCH/DELETE return 405 while enabled. GET bodies and transfer encoding are rejected. Present Origin must match the request origin; cross-site fetch metadata is denied. Missing Origin is allowed for explicit Bearer server clients. There are no CORS grants.

| GET suffix | Read qualification |
| --- | --- |
| `/projects` | READ_DRAFT |
| `/qualifications` | READ_DRAFT |
| `/projects/:projectId` | READ_DRAFT |
| `/projects/:projectId/draft` | READ_DRAFT |
| `/projects/:projectId/draft/head` | READ_DRAFT |
| `/projects/:projectId/drafts/:draftId/reviews` | READ_DRAFT |
| `/projects/:projectId/reviews/:reviewId` | READ_DRAFT |
| `/projects/:projectId/versions` | READ_DRAFT |
| `/projects/:projectId/versions/:versionId` | READ_DRAFT |
| `/projects/:projectId/release/head` | READ_RELEASE |
| `/projects/:projectId/releases` | READ_RELEASE |
| `/projects/:projectId/release-requests` | READ_RELEASE |

List endpoints accept only `limit` (integer 1–50, default 20) and optional UUID `after`. Unknown/duplicate query fields are rejected, including owner/subject/project selectors. Lists return `{items,nextCursor}` ordered by UUID ascending. Cursors are exclusive UUID lower bounds, not authority and not time ordering; they need not name an accessible row. The next request reauthorizes independently. Pages are individually consistent, not a multi-request snapshot. Frontends may sort fetched history by timestamps; never infer recency from UUID order.

Success is HTTP 200 with `{result, etag?, replayed:false}`. Only Draft, Review and Release-head responses carry the existing relevant strong ETag. Do not use project/list responses as CAS tags. `If-Match`, `Idempotency-Key`, conditional 304 and write mapping are deferred; they cannot trigger mutation. Responses set private/no-store, Pragma no-cache, Vary Authorization/Origin, JSON UTF-8 and nosniff. Strict output schemas reject unexpected fields; errors return only `{code}`. Maximum serialized success is 16 MiB; oversized output fails closed with `UNAVAILABLE`.

| Code | Status |
| --- | --- |
| AUTH_REQUIRED | 401 |
| FORBIDDEN / DISABLED | 403 |
| NOT_FOUND | 404 |
| METHOD_NOT_ALLOWED | 405 (Allow: GET) |
| DRAFT_UNINITIALIZED / CONFLICT / REVIEW_INVALID / HASH_MISMATCH / APPROVAL_INVALID | 409 |
| INVALID_INPUT | 422 |
| RATE_LIMITED | 429 (Retry-After: 60) |
| UNAVAILABLE | 503 |

Malformed/unsupported paths and query combinations currently use INVALID_INPUT. ORM messages, SQL, tokens, foreign identities, internal audit records, receipts, storage refs, rights/provenance and credentials are never serialized. Free-text approved schema fields are data, not sanitized HTML; the frontend must render them safely and must not interpret asset IDs as delivery URLs.

The adapter enforces 60 requests per token hash and 600 globally per process per minute, before Auth. The hash map is bounded by the global budget; tokens/IPs are not logged. This is a minimum internal single-process boundary, not a distributed quota. Any multi-process deployment must add a shared ingress limiter before enabling the flags. All flags stay false in this PR.
