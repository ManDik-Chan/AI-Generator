CREATE TYPE "AgentRunMode" AS ENUM ('STANDARD', 'DEEP');
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'COMPLETE', 'ERROR', 'CANCELLED');
CREATE TYPE "AgentRunPhase" AS ENUM ('PLANNING', 'DISPATCHING', 'WORKING', 'SYNTHESIZING', 'FINISHED');
CREATE TYPE "AgentWorkerStatus" AS ENUM ('QUEUED', 'BLOCKED', 'RUNNING', 'COMPLETE', 'ERROR', 'CANCELLED', 'TIMEOUT');
CREATE TYPE "AgentPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "AgentEventType" AS ENUM (
  'RUN_CREATED',
  'PLANNING_STARTED',
  'PLAN_CREATED',
  'PLAN_FALLBACK',
  'WORKERS_CREATED',
  'WORKER_QUEUED',
  'WORKER_BLOCKED',
  'WORKER_STARTED',
  'WORKER_COMPLETED',
  'WORKER_FAILED',
  'WORKER_CANCELLED',
  'WORKER_TIMEOUT',
  'SYNTHESIS_STARTED',
  'RUN_COMPLETED',
  'RUN_FAILED',
  'RUN_CANCELLED',
  'RUN_TIMEOUT'
);

CREATE UNIQUE INDEX "conversations_id_user_id_key"
  ON "public"."conversations"("id", "user_id");
CREATE UNIQUE INDEX "messages_id_conversation_id_key"
  ON "public"."messages"("id", "conversation_id");

CREATE TABLE "public"."agent_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "user_message_id" UUID NOT NULL,
  "assistant_message_id" UUID NOT NULL,
  "mode" "AgentRunMode" NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
  "phase" "AgentRunPhase" NOT NULL DEFAULT 'PLANNING',
  "plan_overview" TEXT,
  "plan_fallback" BOOLEAN NOT NULL DEFAULT false,
  "planned_worker_count" INTEGER NOT NULL,
  "completed_worker_count" INTEGER NOT NULL DEFAULT 0,
  "successful_worker_count" INTEGER NOT NULL DEFAULT 0,
  "provider_call_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(100),
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_runs_mode_worker_count_check" CHECK (
    ("mode" = 'STANDARD' AND "planned_worker_count" = 4)
    OR ("mode" = 'DEEP' AND "planned_worker_count" = 6)
  ),
  CONSTRAINT "agent_runs_counters_check" CHECK (
    "completed_worker_count" BETWEEN 0 AND "planned_worker_count"
    AND "successful_worker_count" BETWEEN 0 AND "completed_worker_count"
    AND "provider_call_count" >= 0
    AND (("mode" = 'STANDARD' AND "provider_call_count" <= 6)
      OR ("mode" = 'DEEP' AND "provider_call_count" <= 8))
  ),
  CONSTRAINT "agent_runs_terminal_phase_check" CHECK (
    ("status" = 'PENDING' AND "phase" <> 'FINISHED' AND "completed_at" IS NULL)
    OR ("status" <> 'PENDING' AND "phase" = 'FINISHED' AND "completed_at" IS NOT NULL)
  ),
  CONSTRAINT "agent_runs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_conversation_id_user_id_fkey"
    FOREIGN KEY ("conversation_id", "user_id") REFERENCES "public"."conversations"("id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_user_message_id_conversation_id_fkey"
    FOREIGN KEY ("user_message_id", "conversation_id") REFERENCES "public"."messages"("id", "conversation_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runs_assistant_message_id_conversation_id_fkey"
    FOREIGN KEY ("assistant_message_id", "conversation_id") REFERENCES "public"."messages"("id", "conversation_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agent_runs_id_user_id_key" ON "public"."agent_runs"("id", "user_id");
CREATE UNIQUE INDEX "agent_runs_user_message_id_conversation_id_key" ON "public"."agent_runs"("user_message_id", "conversation_id");
CREATE UNIQUE INDEX "agent_runs_assistant_message_id_conversation_id_key" ON "public"."agent_runs"("assistant_message_id", "conversation_id");
CREATE INDEX "agent_runs_user_id_created_at_idx" ON "public"."agent_runs"("user_id", "created_at" DESC);
CREATE INDEX "agent_runs_user_id_mode_status_created_at_idx" ON "public"."agent_runs"("user_id", "mode", "status", "created_at" DESC);
CREATE INDEX "agent_runs_conversation_id_created_at_idx" ON "public"."agent_runs"("conversation_id", "created_at");

CREATE TABLE "public"."agent_workers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_run_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "position" INTEGER NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "objective" VARCHAR(1200) NOT NULL,
  "expected_deliverable" VARCHAR(1200) NOT NULL,
  "priority" "AgentPriority" NOT NULL,
  "status" "AgentWorkerStatus" NOT NULL DEFAULT 'QUEUED',
  "depends_on_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "work_summary" VARCHAR(1200),
  "findings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "assumptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "risks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recommendations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "final_deliverable" TEXT,
  "structured" BOOLEAN NOT NULL DEFAULT false,
  "provider_call_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(100),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_workers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_workers_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT "agent_workers_position_check" CHECK ("position" BETWEEN 0 AND 5),
  CONSTRAINT "agent_workers_provider_call_count_check" CHECK ("provider_call_count" BETWEEN 0 AND 1),
  CONSTRAINT "agent_workers_dependencies_check" CHECK (
    cardinality("depends_on_keys") <= 6
    AND NOT ("key" = ANY("depends_on_keys"))
  ),
  CONSTRAINT "agent_workers_array_count_check" CHECK (
    cardinality("findings") <= 8
    AND cardinality("assumptions") <= 8
    AND cardinality("risks") <= 8
    AND cardinality("recommendations") <= 8
  ),
  CONSTRAINT "agent_workers_deliverable_length_check" CHECK (
    "final_deliverable" IS NULL OR char_length("final_deliverable") <= 40000
  ),
  CONSTRAINT "agent_workers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_workers_agent_run_id_user_id_fkey"
    FOREIGN KEY ("agent_run_id", "user_id") REFERENCES "public"."agent_runs"("id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agent_workers_agent_run_id_key_key" ON "public"."agent_workers"("agent_run_id", "key");
CREATE UNIQUE INDEX "agent_workers_agent_run_id_position_key" ON "public"."agent_workers"("agent_run_id", "position");
CREATE INDEX "agent_workers_user_id_created_at_idx" ON "public"."agent_workers"("user_id", "created_at" DESC);
CREATE INDEX "agent_workers_agent_run_id_status_idx" ON "public"."agent_workers"("agent_run_id", "status");

CREATE TABLE "public"."agent_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_run_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "AgentEventType" NOT NULL,
  "worker_key" VARCHAR(64),
  "summary_text" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_events_sequence_check" CHECK ("sequence" BETWEEN 1 AND 96),
  CONSTRAINT "agent_events_worker_key_check" CHECK (
    "worker_key" IS NULL OR "worker_key" ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  CONSTRAINT "agent_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_events_agent_run_id_user_id_fkey"
    FOREIGN KEY ("agent_run_id", "user_id") REFERENCES "public"."agent_runs"("id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "agent_events_agent_run_id_sequence_key" ON "public"."agent_events"("agent_run_id", "sequence");
CREATE INDEX "agent_events_user_id_created_at_idx" ON "public"."agent_events"("user_id", "created_at" DESC);
CREATE INDEX "agent_events_agent_run_id_type_created_at_idx" ON "public"."agent_events"("agent_run_id", "type", "created_at");

CREATE OR REPLACE FUNCTION public.enforce_agent_run_message_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = NEW.user_message_id
      AND m.conversation_id = NEW.conversation_id
      AND m.role = 'USER'
      AND m.status = 'COMPLETE'
      AND m.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'agent run requires an active COMPLETE user message';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = NEW.assistant_message_id
      AND m.conversation_id = NEW.conversation_id
      AND m.role = 'ASSISTANT'
      AND m.status = 'PENDING'
      AND m.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'agent run requires an active PENDING assistant message';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_runs_validate_messages
  BEFORE INSERT OR UPDATE OF conversation_id, user_message_id, assistant_message_id
  ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_run_message_roles();

CREATE OR REPLACE FUNCTION public.enforce_agent_worker_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  run_mode "AgentRunMode";
  maximum_workers INTEGER;
BEGIN
  SELECT mode INTO run_mode
  FROM public.agent_runs
  WHERE id = NEW.agent_run_id AND user_id = NEW.user_id
  FOR UPDATE;

  IF run_mode IS NULL THEN
    RAISE EXCEPTION 'agent worker requires an owned agent run';
  END IF;
  maximum_workers := CASE WHEN run_mode = 'STANDARD' THEN 4 ELSE 6 END;

  IF NEW.position < 0 OR NEW.position >= maximum_workers THEN
    RAISE EXCEPTION 'agent worker position exceeds run mode limit';
  END IF;

  IF TG_OP = 'INSERT' AND (
    SELECT count(*) FROM public.agent_workers WHERE agent_run_id = NEW.agent_run_id
  ) >= maximum_workers THEN
    RAISE EXCEPTION 'agent worker count exceeds run mode limit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_workers_validate_limit
  BEFORE INSERT OR UPDATE OF agent_run_id, user_id, position
  ON public.agent_workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_worker_limit();

ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_workers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_select_own" ON "public"."agent_runs";
CREATE POLICY "agent_runs_select_own" ON "public"."agent_runs"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "agent_workers_select_own" ON "public"."agent_workers";
CREATE POLICY "agent_workers_select_own" ON "public"."agent_workers"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "agent_events_select_own" ON "public"."agent_events";
CREATE POLICY "agent_events_select_own" ON "public"."agent_events"
  FOR SELECT USING ("user_id" = auth.uid());
