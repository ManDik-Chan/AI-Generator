-- P0 security hardening: make authorization deployable and move quota accounting
-- to an append-only ledger that survives deletion of user-facing history.

BEGIN;

CREATE TYPE "UsageCapability" AS ENUM (
  'CHAT_MESSAGE',
  'TOOL_SUMMARIZE',
  'TOOL_REWRITE',
  'TOOL_TRANSLATE',
  'IMAGE_ANALYZE',
  'IMAGE_GENERATE',
  'BRAINSTORM',
  'AGENT_STANDARD',
  'AGENT_DEEP'
);

CREATE TABLE "public"."usage_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "capability" "UsageCapability" NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "run_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "provider" VARCHAR(100),
  "model" VARCHAR(200),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost" DECIMAL(18,8),
  "pricing_version" VARCHAR(50),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_ledger_units_check" CHECK ("units" > 0),
  CONSTRAINT "usage_ledger_tokens_check" CHECK (
    ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
  ),
  CONSTRAINT "usage_ledger_estimated_cost_check" CHECK (
    "estimated_cost" IS NULL OR "estimated_cost" >= 0
  ),
  CONSTRAINT "usage_ledger_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "usage_ledger_user_id_capability_run_id_key"
  ON "public"."usage_ledger"("user_id", "capability", "run_id");
CREATE UNIQUE INDEX "usage_ledger_user_id_idempotency_key_key"
  ON "public"."usage_ledger"("user_id", "idempotency_key");
CREATE INDEX "usage_ledger_user_id_capability_created_at_idx"
  ON "public"."usage_ledger"("user_id", "capability", "created_at" DESC);
CREATE INDEX "usage_ledger_user_id_created_at_idx"
  ON "public"."usage_ledger"("user_id", "created_at" DESC);

-- Backfill before the application switches its counters. Agent user messages are
-- intentionally excluded from ordinary chat usage and are recorded as Agent credits.
INSERT INTO "public"."usage_ledger" (
  "user_id", "capability", "units", "run_id", "idempotency_key", "provider", "model", "created_at"
)
SELECT
  c."user_id",
  'CHAT_MESSAGE'::"UsageCapability",
  1,
  m."id",
  'chat_message:' || m."id"::text,
  NULL,
  NULL,
  m."created_at"
FROM "public"."messages" m
JOIN "public"."conversations" c ON c."id" = m."conversation_id"
LEFT JOIN "public"."agent_runs" ar
  ON ar."user_message_id" = m."id" AND ar."conversation_id" = m."conversation_id"
WHERE m."role" = 'USER' AND ar."id" IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO "public"."usage_ledger" (
  "user_id", "capability", "units", "run_id", "idempotency_key", "created_at"
)
SELECT
  r."user_id",
  CASE r."type"
    WHEN 'SUMMARIZE' THEN 'TOOL_SUMMARIZE'::"UsageCapability"
    WHEN 'REWRITE' THEN 'TOOL_REWRITE'::"UsageCapability"
    WHEN 'TRANSLATE' THEN 'TOOL_TRANSLATE'::"UsageCapability"
    WHEN 'IMAGE_ANALYZE' THEN 'IMAGE_ANALYZE'::"UsageCapability"
    WHEN 'IMAGE_GENERATE' THEN 'IMAGE_GENERATE'::"UsageCapability"
    WHEN 'BRAINSTORM' THEN 'BRAINSTORM'::"UsageCapability"
  END,
  1,
  r."id",
  'tool_run:' || r."id"::text,
  r."created_at"
FROM "public"."tool_runs" r
ON CONFLICT DO NOTHING;

INSERT INTO "public"."usage_ledger" (
  "user_id", "capability", "units", "run_id", "idempotency_key", "created_at"
)
SELECT
  r."user_id",
  CASE r."mode"
    WHEN 'STANDARD' THEN 'AGENT_STANDARD'::"UsageCapability"
    WHEN 'DEEP' THEN 'AGENT_DEEP'::"UsageCapability"
  END,
  CASE r."mode" WHEN 'STANDARD' THEN 1 WHEN 'DEEP' THEN 2 END,
  r."id",
  'agent_run:' || r."id"::text,
  r."created_at"
FROM "public"."agent_runs" r
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "public"."profiles" ("id", "email", "display_name", "role", "created_at", "updated_at")
  VALUES (
    NEW."id",
    COALESCE(NEW."email", ''),
    COALESCE(NEW."raw_user_meta_data" ->> 'display_name', split_part(COALESCE(NEW."email", ''), '@', 1)),
    'USER',
    now(),
    now()
  )
  ON CONFLICT ("id") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_auth_user"();

-- A browser session may edit only non-authoritative profile attributes. This
-- trigger remains a second guard if a future grant accidentally becomes broader.
CREATE OR REPLACE FUNCTION "public"."protect_profile_system_fields"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."email" IS DISTINCT FROM OLD."email"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."updated_at" IS DISTINCT FROM OLD."updated_at"
  ) THEN
    RAISE EXCEPTION 'profile system fields are server-managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "profiles_protect_system_fields" ON "public"."profiles";
CREATE TRIGGER "profiles_protect_system_fields"
  BEFORE UPDATE ON "public"."profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_system_fields"();

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memory_embeddings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generated_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tool_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tool_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."brainstorm_workers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_workers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usage_ledger" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON "public"."profiles";
CREATE POLICY "profiles_select_own" ON "public"."profiles"
  FOR SELECT USING ("id" = auth.uid());
DROP POLICY IF EXISTS "profiles_update_own" ON "public"."profiles";
CREATE POLICY "profiles_update_own" ON "public"."profiles"
  FOR UPDATE USING ("id" = auth.uid()) WITH CHECK ("id" = auth.uid());

DROP POLICY IF EXISTS "personas_own_all" ON "public"."personas";
DROP POLICY IF EXISTS "personas_select_own" ON "public"."personas";
CREATE POLICY "personas_select_own" ON "public"."personas"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "conversations_own_all" ON "public"."conversations";
DROP POLICY IF EXISTS "conversations_select_own" ON "public"."conversations";
CREATE POLICY "conversations_select_own" ON "public"."conversations"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "memories_select_own" ON "public"."memories";
DROP POLICY IF EXISTS "memories_insert_own_relations" ON "public"."memories";
DROP POLICY IF EXISTS "memories_update_own_relations" ON "public"."memories";
DROP POLICY IF EXISTS "memories_delete_own" ON "public"."memories";
CREATE POLICY "memories_select_own" ON "public"."memories"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "messages_via_conversation" ON "public"."messages";
DROP POLICY IF EXISTS "messages_select_via_conversation" ON "public"."messages";
CREATE POLICY "messages_select_via_conversation" ON "public"."messages"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."conversations" c
      WHERE c."id" = "messages"."conversation_id"
        AND c."user_id" = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tool_runs_insert_own" ON "public"."tool_runs";
DROP POLICY IF EXISTS "tool_runs_update_own" ON "public"."tool_runs";
DROP POLICY IF EXISTS "tool_runs_delete_own" ON "public"."tool_runs";
DROP POLICY IF EXISTS "tool_runs_select_own" ON "public"."tool_runs";
CREATE POLICY "tool_runs_select_own" ON "public"."tool_runs"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "tool_assets_insert_own_run" ON "public"."tool_assets";
DROP POLICY IF EXISTS "tool_assets_update_own_run" ON "public"."tool_assets";
DROP POLICY IF EXISTS "tool_assets_delete_own" ON "public"."tool_assets";
DROP POLICY IF EXISTS "tool_assets_select_own" ON "public"."tool_assets";
CREATE POLICY "tool_assets_select_own" ON "public"."tool_assets"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "memory_embeddings_select_own" ON "public"."memory_embeddings";
DROP POLICY IF EXISTS "memory_embeddings_insert_own_memory" ON "public"."memory_embeddings";
DROP POLICY IF EXISTS "memory_embeddings_update_own_memory" ON "public"."memory_embeddings";
DROP POLICY IF EXISTS "memory_embeddings_delete_own" ON "public"."memory_embeddings";
CREATE POLICY "memory_embeddings_select_own" ON "public"."memory_embeddings"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "generated_images_own_all" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_select_own" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_insert_own_run" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_update_own_run" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_delete_own" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_insert_own" ON "public"."generated_images";
DROP POLICY IF EXISTS "generated_images_update_own" ON "public"."generated_images";
CREATE POLICY "generated_images_select_own" ON "public"."generated_images"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "generation_runs_own_all" ON "public"."generation_runs";
DROP POLICY IF EXISTS "generation_runs_select_own" ON "public"."generation_runs";
DROP POLICY IF EXISTS "generation_runs_insert_own" ON "public"."generation_runs";
DROP POLICY IF EXISTS "generation_runs_update_own" ON "public"."generation_runs";
DROP POLICY IF EXISTS "generation_runs_delete_own" ON "public"."generation_runs";
CREATE POLICY "generation_runs_select_own" ON "public"."generation_runs"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "brainstorm_workers_select_own" ON "public"."brainstorm_workers";
DROP POLICY IF EXISTS "brainstorm_workers_insert_own" ON "public"."brainstorm_workers";
DROP POLICY IF EXISTS "brainstorm_workers_update_own" ON "public"."brainstorm_workers";
DROP POLICY IF EXISTS "brainstorm_workers_delete_own" ON "public"."brainstorm_workers";
CREATE POLICY "brainstorm_workers_select_own" ON "public"."brainstorm_workers"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "agent_runs_select_own" ON "public"."agent_runs";
DROP POLICY IF EXISTS "agent_runs_insert_own" ON "public"."agent_runs";
DROP POLICY IF EXISTS "agent_runs_update_own" ON "public"."agent_runs";
DROP POLICY IF EXISTS "agent_runs_delete_own" ON "public"."agent_runs";
CREATE POLICY "agent_runs_select_own" ON "public"."agent_runs"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "agent_workers_select_own" ON "public"."agent_workers";
DROP POLICY IF EXISTS "agent_workers_insert_own" ON "public"."agent_workers";
DROP POLICY IF EXISTS "agent_workers_update_own" ON "public"."agent_workers";
DROP POLICY IF EXISTS "agent_workers_delete_own" ON "public"."agent_workers";
CREATE POLICY "agent_workers_select_own" ON "public"."agent_workers"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "agent_events_select_own" ON "public"."agent_events";
DROP POLICY IF EXISTS "agent_events_insert_own" ON "public"."agent_events";
DROP POLICY IF EXISTS "agent_events_update_own" ON "public"."agent_events";
DROP POLICY IF EXISTS "agent_events_delete_own" ON "public"."agent_events";
CREATE POLICY "agent_events_select_own" ON "public"."agent_events"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "usage_ledger_select_own" ON "public"."usage_ledger";
CREATE POLICY "usage_ledger_select_own" ON "public"."usage_ledger"
  FOR SELECT USING ("user_id" = auth.uid());

-- RLS is row filtering, not a replacement for SQL privileges. Remove every
-- browser mutation privilege from server-owned state and restore SELECT only.
REVOKE ALL PRIVILEGES ON TABLE "public"."profiles" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE "public"."profiles" TO authenticated;
GRANT UPDATE ("display_name", "avatar_url", "memory_enabled") ON TABLE "public"."profiles" TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE "public"."personas", "public"."conversations", "public"."memories"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE "public"."personas", "public"."conversations", "public"."memories"
TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  "public"."messages",
  "public"."memory_embeddings",
  "public"."generated_images",
  "public"."tool_runs",
  "public"."tool_assets",
  "public"."generation_runs",
  "public"."brainstorm_workers",
  "public"."agent_runs",
  "public"."agent_workers",
  "public"."agent_events",
  "public"."usage_ledger"
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  "public"."messages",
  "public"."memory_embeddings",
  "public"."generated_images",
  "public"."tool_runs",
  "public"."tool_assets",
  "public"."generation_runs",
  "public"."brainstorm_workers",
  "public"."agent_runs",
  "public"."agent_workers",
  "public"."agent_events",
  "public"."usage_ledger"
TO authenticated;

-- Global administration tables have no browser use and previously had no RLS.
REVOKE ALL PRIVILEGES ON TABLE "public"."model_configs", "public"."app_settings"
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION "public"."protect_profile_system_fields"()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "public"."handle_new_auth_user"()
FROM PUBLIC, anon, authenticated;

COMMIT;
