# Agent Mode data model

> Phase 7A1.1 — Draft. Migration: `20260718160000_add_agent_workers`.

## AgentRun

`AgentRun` is the durable parent for one Agent send. It belongs to one Profile and one Conversation, references exactly one active COMPLETE user Message and one PENDING assistant Message, and records mode, status, phase, plan metadata, real Worker counters, real Provider-call count, safe error code and timestamps. The assistant Message reference is unique, so one normal chat response can bind to at most one run.

`(conversationId,userId)` references the owned Conversation. `(userMessageId,conversationId)` and `(assistantMessageId,conversationId)` keep both Messages in that same Conversation. A database trigger validates the message roles and initial statuses. Deleting a Conversation cascades through Messages and AgentRun; deleting AgentRun never deletes the Conversation.

## AgentWorker

Each Worker stores a unique `(agentRunId,key)` and `(agentRunId,position)`, dynamic assignment fields, priority, dependency keys, terminal state, guarded structured deliverable fields, actual Provider-call count, safe error code and timestamps. `(agentRunId,userId)` is a composite ownership foreign key.

The migration constrains key syntax, positions, array counts, deliverable length and at most one Provider call per Worker. A locking trigger reads the parent mode and refuses a fifth Standard Worker, a seventh Deep Worker or an out-of-range position.

## AgentEvent

Events contain only run ownership, stable sequence, coarse event type, optional Worker key, a maximum 500-character safe summary and creation time. `(agentRunId,sequence)` is unique and sequence is restricted to 1–96, so events cannot become token logs.

## Transaction and ownership

Agent sends use a Serializable transaction to validate the server session, Conversation and Persona ownership, check Agent Credits, create/confirm Conversation, create both Messages, create AgentRun and write `RUN_CREATED`. Provider calls occur only after commit. Planner validation then creates all Workers in a second server transaction.

All application reads and writes include server-derived `userId`. Supabase RLS is defense in depth: authenticated clients may SELECT their own Agent rows but have no INSERT, UPDATE or DELETE policy. Trusted server connections own all mutation paths.

## Migration and rollback

The migration is additive and does not modify an older migration or transform classic Brainstorm data. Application rollback should happen first; the new enums/tables may remain without affecting Conversation, Message, ToolRun, GenerationRun or BrainstormWorker. Destructive database rollback requires a separately reviewed forward migration and confirmation that no Agent data must be retained.
