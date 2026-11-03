# P1-C2 Registry write API and Claude handoff

Base: `/api/internal/registry`. Both commands require `REGISTRY_INTERNAL_ACCESS_ENABLED=true` and `REGISTRY_INTERNAL_WRITE_HTTP_ENABLED=true`. Draft replacement additionally requires the existing `REGISTRY_DRAFT_REVIEW_ENABLED=true` service gate. The GET bootstrap requires both read flags. All flags default to false.

## Requests and authorization

Use the signed-in user's Supabase access token as `Authorization: Bearer <token>`. Send the exact same Origin as the API URL. Browsers supply Origin on these same-origin writes. Explicit HTTP clients must set it. Cookies do not authenticate these routes. The service validates Auth and a current database session, then checks live database permissions in the transaction.

| Method and path | Request JSON | Success | Authority |
| --- | --- | --- | --- |
| POST /projects | `{ "slug": "example-project" }` | 201, `{ result: { id, slug }, replayed }` | Active, unexpired internal operator with `can_create`. The verified subject becomes project OWNER. |
| PUT /projects/{projectId}/draft | Full `DraftPayload` | 200, `{ result: DraftDTO, etag, replayed }`, with matching ETag header | Active internal operator and `EDIT_DRAFT` action grant, plus active project OWNER or EDITOR. |

Both require `Content-Type: application/json` (UTF-8) and `Idempotency-Key` matching `[A-Za-z0-9_-]{1,128}`. Draft PUT also requires one strong `If-Match` tag from the draft or draft head. Unknown fields, duplicate keys, compressed bodies and query parameters are rejected. Body limit is 256 KiB, including whitespace. The existing canonical JSON and draft content constraints apply. Request and response types and runtime schemas live in `features/registry/write-contracts.ts`. Error responses have shape `RegistryWriteError`.

## Claude integration sequence

1. Read `GET /qualifications` to present creation eligibility. Treat eligibility as advisory and handle the live authorization result.
2. POST the slug. Store the returned project ID and slug. Creation atomically initializes a private project, OWNER membership and an empty draft. Project ownership alone does not confer internal action grants.
3. Load `GET /projects/{id}/draft/head`. A null content hash denotes an uninitialized draft. Full draft GET can return `DRAFT_UNINITIALIZED` in that state. Use the head ETag for the first save. On subsequent edits read the full draft and use its ETag.
4. Build the complete payload with the returned project ID and slug, then PUT it. On success take the returned ETag. After a replay or an uncertain outcome, GET the current state before assuming the returned revision is the latest. The write DTO excludes the content hash. GET includes the hash from the same snapshot as its ETag.
5. Allocate a new idempotency key for each logical operation. On an ambiguous network failure retry the same key, body and If-Match. A 412 requires fetching the current draft and resolving the edit before sending a new operation with a new key. Preserve unsaved edits when access is denied.

```sh
curl -X POST "$ORIGIN/api/internal/registry/projects" \
  -H "Origin: $ORIGIN" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Idempotency-Key: $CREATE_KEY" \
  --data '{"slug":"example-project"}'

curl "$ORIGIN/api/internal/registry/projects/$PROJECT_ID/draft/head" \
  -H "Authorization: Bearer $TOKEN"

curl -X PUT "$ORIGIN/api/internal/registry/projects/$PROJECT_ID/draft" \
  -H "Origin: $ORIGIN" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Idempotency-Key: $SAVE_KEY" \
  -H "If-Match: $DRAFT_ETAG" --data-binary @draft.json
```

A minimal draft file has the following shape. Replace both UUIDs with the ID returned by POST.

```json
{
  "manifest": {
    "schemaVersion": "0.5.0",
    "projectId": "11111111-1111-4111-8111-111111111111",
    "slug": "example-project",
    "version": "1.0.0",
    "name": "Example project",
    "summary": "An example Registry draft",
    "category": "software",
    "visibility": "PRIVATE",
    "integration": { "mode": "SHOWCASE" },
    "capabilities": ["documentation.read"],
    "researchClaims": []
  },
  "presentation": {
    "schemaVersion": "0.5.0",
    "projectId": "11111111-1111-4111-8111-111111111111",
    "version": "1.0.0",
    "title": "Example project",
    "sections": []
  },
  "documentation": []
}
```

## Errors and replay

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | AUTH_REQUIRED | Missing, invalid or expired identity/session |
| 403 | DISABLED, FORBIDDEN | Flag closed, Origin rejected, or insufficient qualification |
| 404 | NOT_FOUND | Project/draft unavailable to this actor, including missing membership/role |
| 409 | CONFLICT | Slug unavailable, draft state conflict, or transaction conflict |
| 409 | IDEMPOTENCY_CONFLICT | Key reused with a different request |
| 409 | REPLAY_STALE | Draft authorization epoch changed, or created project is no longer eligible for replay |
| 412 / 428 | PRECONDITION_FAILED / PRECONDITION_REQUIRED | Stale revision / missing If-Match |
| 413 / 415 / 422 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE / INVALID_INPUT | Invalid request framing, type or content |
| 429 | RATE_LIMITED | Respect Retry-After |
| 503 | UNAVAILABLE | Retry with the same idempotency key if the result is uncertain |

Creation receipts are scoped to the creator and key. Edit receipts are scoped to project, actor and key and bind the complete canonical request and precondition. Both enforce current authorization before returning a receipt. Replays return the original success status with `replayed: true`.

## Risk and acceptance boundaries

- The write budget is process-local, at 120 attempts per minute globally and 20 per hashed bearer token. Shared ingress limits, trusted host forwarding and request timeouts are required before enabling a multi-instance deployment.
- Creation receipts are append-only and reference the project and actor. Account/project hard-deletion or retention tooling must account for them. Creation replay evaluates current creation eligibility and ownership. A restored qualification can permit replay again.
- Existing draft authorization and asset binding rules apply. Grant provisioning is an independent operator workflow. Treat disabled or denied writes as unavailable and keep the console in its real-data mode.
- The isolated integration suite sends loopback HTTP to an adapter invoking the actual exported route handlers, using real Auth JWTs and PostgreSQL transactions. It covers concurrent replay, CAS, cross-actor denial, revocation, receipt-write rollback and GET consistency. The loopback adapter does not exercise Next ingress or reverse-proxy behavior. Local browser automation is suspended by repository policy. Local real Supabase acceptance is unavailable without a running task-owned Docker environment. Check the exact Draft PR head's Security Acceptance results before enabling this feature.
