# Agent Mode threat model

> Phase 7A1.1 — Draft. This threat model covers reasoning-only Agent Mode. Search, files, code execution, Git, browser automation and MCP remain disabled.

## Trust boundaries

The browser submits only `content`, optional owned `conversationId` / `personaId`, and `mode` (`STANDARD` or `DEEP`). Supabase server sessions establish identity; every Prisma query repeats the owner scope. The server alone selects models, temperatures, output limits, Worker count, concurrency, prompts, dependencies, context envelopes and tool policy.

Planner output, user text, Persona summaries, Memory summaries, dependency deliverables and every Worker deliverable are untrusted data. They never become executable instructions. Provider raw responses are filtered and validated before persistence, SSE publication, recovery or Leader input.

## Prompt injection and cross-Worker contamination

- Planner cannot select models, tools, prompts, concurrency, call counts or Worker count. Its strict Zod result must describe reasoning/content assignments only.
- Each Worker receives only the current problem, compact plan overview, its own assignment, safe dependency deliverables and minimal server-built summaries. It cannot read unrelated Worker output or hidden context.
- Dependency outputs are escaped and labelled untrusted. A dependency cannot redefine the consuming Worker role or server policy.
- Leader receives only guarded successful deliverables plus safe terminal/error metadata. It treats every Worker field as data and cannot dispatch new work.
- No stage is automatically retried. Planner fallback is deterministic server code, not a second Provider call.

## Hidden reasoning and output safety

The product stores and displays assignments, coarse status, safe summaries, findings, assumptions, risks, recommendations and final deliverables. It does not request, persist or expose chain of thought, reasoning tokens, internal drafts, System/Developer prompts, Provider private metadata or intercepted raw output.

Each stage applies a rolling output guard before text can reach SSE or durable storage. Obvious Prompt, Authorization, Cookie, API key, database URL, service-role or private path leakage fails that stage with a safe code. Raw offending content is discarded and excluded from logs, events, recovery, Messages and Leader input.

## Tool default deny

`features/agents/tool-policy.ts` is server-only. Phase 7A1.1 fixes `allowedCapabilities` to `['REASONING']` and `allowedTools` to `[]`; every other capability throws `TOOL_NOT_ALLOWED`. Hiding UI controls is not an authorization control.

Future search/file/code Workers require a separate phase, explicit capability grants, per-tool schemas, audited credentials and resource limits. File writes, code execution and Git writes additionally require an isolated disposable sandbox with a scoped workspace, network policy, secret redaction, CPU/memory/time quotas and an immutable audit trail. None exists in this phase.

## Ownership, credentials and logs

`AgentRun`, `AgentWorker` and `AgentEvent` use composite ownership foreign keys and owner-scoped API queries. RLS allows authenticated users to select only their own rows and exposes no client INSERT/UPDATE/DELETE policy. Other-user IDs return 404.

Credentials remain server-only and never use `NEXT_PUBLIC_`. Logs are limited to run/worker IDs, key, phase, mode, count, status, provider-call count, duration and safe error code. Full questions, conversations, Persona/Memory content, Worker/Leader output, cookies, Authorization, keys, URLs, paths and reasoning are prohibited.

## Resource abuse and recursion

Standard mode has exactly four Workers, at most four concurrent Worker calls and at most six Provider calls total. Deep mode has exactly six Workers, at most six concurrent calls and at most eight calls total. Planner and Leader each run at most once; every Worker runs at most once. Database checks, service counters and a shared deadline enforce the bounds.

Workers cannot create Workers, alter dependencies after validation, re-plan, retry, debate, invoke Leader or recurse. Agent events use sequence values 1–96, preventing token-level or unbounded event growth.

## Cancellation, timeout and late results

Transport abort only detaches an observer. Durable status drives business cancellation. Whole-run cancellation and single-Worker cancellation are owner-scoped, idempotent and confirmed by the server. Conditional terminal writes prevent late Provider output from overwriting COMPLETE, ERROR, CANCELLED, TIMEOUT or BLOCKED.

Explicit cancellation and deadline timeout remain distinct. Timeout never becomes CANCELLED, and recovery only reads durable state—it does not POST, re-run, re-charge or replace terminal data.
