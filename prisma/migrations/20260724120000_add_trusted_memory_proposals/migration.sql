BEGIN;

CREATE TYPE "MemoryProposalStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "MemoryProposalAction" AS ENUM (
  'CREATE',
  'UPDATE'
);

ALTER TABLE "public"."memories"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "personas_id_user_id_key"
  ON "public"."personas"("id", "user_id");
CREATE UNIQUE INDEX "memories_id_user_id_key"
  ON "public"."memories"("id", "user_id");

CREATE OR REPLACE FUNCTION "public"."bump_memory_revision"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."content" IS DISTINCT FROM OLD."content"
     OR NEW."category" IS DISTINCT FROM OLD."category"
     OR NEW."scope" IS DISTINCT FROM OLD."scope"
     OR NEW."persona_id" IS DISTINCT FROM OLD."persona_id"
     OR NEW."origin" IS DISTINCT FROM OLD."origin"
     OR NEW."importance" IS DISTINCT FROM OLD."importance"
     OR NEW."source_conversation_id" IS DISTINCT FROM OLD."source_conversation_id"
     OR NEW."source_message_id" IS DISTINCT FROM OLD."source_message_id"
     OR NEW."enabled" IS DISTINCT FROM OLD."enabled"
     OR NEW."topic_key" IS DISTINCT FROM OLD."topic_key"
     OR NEW."keywords" IS DISTINCT FROM OLD."keywords" THEN
    NEW."revision" := OLD."revision" + 1;
  ELSIF NEW."revision" IS DISTINCT FROM OLD."revision" THEN
    RAISE EXCEPTION 'memory revision is database controlled'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "memories_bump_revision"
  BEFORE UPDATE ON "public"."memories"
  FOR EACH ROW EXECUTE FUNCTION "public"."bump_memory_revision"();

CREATE TABLE "public"."memory_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "persona_id" UUID,
  "action" "MemoryProposalAction" NOT NULL,
  "status" "MemoryProposalStatus" NOT NULL DEFAULT 'PENDING',
  "target_memory_id" UUID,
  "target_memory_updated_at" TIMESTAMPTZ(6),
  "target_memory_revision" INTEGER,
  "resolved_memory_id" UUID,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "scope" "MemoryScope" NOT NULL,
  "importance" INTEGER NOT NULL DEFAULT 3,
  "topic_key" TEXT,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" DOUBLE PRECISION NOT NULL,
  "reason_code" TEXT NOT NULL,
  "source_conversation_id" UUID,
  "source_message_id" UUID,
  "dedupe_key" VARCHAR(64) NOT NULL,
  "suppression_key" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "memory_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memory_proposals_importance_check"
    CHECK ("importance" BETWEEN 1 AND 5),
  CONSTRAINT "memory_proposals_confidence_check"
    CHECK ("confidence" BETWEEN 0 AND 1),
  CONSTRAINT "memory_proposals_content_check"
    CHECK (char_length(btrim("content")) BETWEEN 2 AND 500),
  CONSTRAINT "memory_proposals_category_check"
    CHECK (char_length(btrim("category")) BETWEEN 1 AND 80),
  CONSTRAINT "memory_proposals_reason_code_check"
    CHECK (char_length(btrim("reason_code")) BETWEEN 1 AND 80),
  CONSTRAINT "memory_proposals_topic_key_check"
    CHECK (
      "topic_key" IS NULL
      OR (char_length("topic_key") <= 80 AND "topic_key" ~ '^[a-z0-9._-]+$')
    ),
  CONSTRAINT "memory_proposals_keywords_check"
    CHECK (public.memory_keywords_valid("keywords")),
  CONSTRAINT "memory_proposals_dedupe_key_check"
    CHECK ("dedupe_key" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "memory_proposals_suppression_key_check"
    CHECK ("suppression_key" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "memory_proposals_scope_persona_check"
    CHECK (
      ("scope" = 'GLOBAL' AND "persona_id" IS NULL)
      OR ("scope" = 'PERSONA' AND "persona_id" IS NOT NULL)
    ),
  CONSTRAINT "memory_proposals_action_target_check"
    CHECK (
      ("action" = 'CREATE'
        AND "target_memory_id" IS NULL
        AND "target_memory_updated_at" IS NULL
        AND "target_memory_revision" IS NULL)
      OR
      ("action" = 'UPDATE'
        AND "target_memory_id" IS NOT NULL
        AND "target_memory_updated_at" IS NOT NULL
        AND "target_memory_revision" IS NOT NULL
        AND "target_memory_revision" > 0)
    ),
  CONSTRAINT "memory_proposals_expiry_check"
    CHECK (
      abs(extract(epoch FROM (
        "expires_at" - ("created_at" + INTERVAL '30 days')
      ))) <= 1
    ),
  CONSTRAINT "memory_proposals_resolution_check"
    CHECK (
      ("status" = 'PENDING'
        AND "resolved_at" IS NULL
        AND "resolved_memory_id" IS NULL)
      OR
      ("status" = 'ACCEPTED'
        AND "resolved_at" IS NOT NULL
        AND "resolved_memory_id" IS NOT NULL)
      OR
      ("status" IN ('REJECTED', 'EXPIRED', 'CANCELLED')
        AND "resolved_at" IS NOT NULL
        AND "resolved_memory_id" IS NULL)
    ),
  CONSTRAINT "memory_proposals_resolved_at_check"
    CHECK ("resolved_at" IS NULL OR "resolved_at" >= "created_at"),
  CONSTRAINT "memory_proposals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "memory_proposals_persona_owner_fkey"
    FOREIGN KEY ("persona_id", "user_id")
    REFERENCES "public"."personas"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "memory_proposals_target_owner_fkey"
    FOREIGN KEY ("target_memory_id", "user_id")
    REFERENCES "public"."memories"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "memory_proposals_resolved_owner_fkey"
    FOREIGN KEY ("resolved_memory_id", "user_id")
    REFERENCES "public"."memories"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "memory_proposals_source_conversation_owner_fkey"
    FOREIGN KEY ("source_conversation_id", "user_id")
    REFERENCES "public"."conversations"("id", "user_id")
    ON DELETE SET NULL ("source_conversation_id") ON UPDATE RESTRICT,
  CONSTRAINT "memory_proposals_source_message_conversation_fkey"
    FOREIGN KEY ("source_message_id", "source_conversation_id")
    REFERENCES "public"."messages"("id", "conversation_id")
    ON DELETE SET NULL ("source_message_id") ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "memory_proposals_user_id_dedupe_key_key"
  ON "public"."memory_proposals"("user_id", "dedupe_key");
CREATE INDEX "memory_proposals_user_id_status_created_at_idx"
  ON "public"."memory_proposals"("user_id", "status", "created_at" DESC);
CREATE INDEX "memory_proposals_source_message_id_idx"
  ON "public"."memory_proposals"("source_message_id");
CREATE INDEX "memory_proposals_target_memory_id_idx"
  ON "public"."memory_proposals"("target_memory_id");
CREATE INDEX "memory_proposals_user_suppression_status_resolved_idx"
  ON "public"."memory_proposals"(
    "user_id",
    "suppression_key",
    "status",
    "resolved_at" DESC
  );
CREATE INDEX "memory_proposals_expires_at_idx"
  ON "public"."memory_proposals"("expires_at");

CREATE OR REPLACE FUNCTION "public"."validate_memory_proposal"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_role "MessageRole";
  source_status "MessageStatus";
  source_superseded_at TIMESTAMPTZ;
  target_scope "MemoryScope";
  target_persona_id UUID;
  target_updated_at TIMESTAMPTZ;
  target_revision INTEGER;
  source_fk_cleanup BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'new memory proposal must be pending'
        USING ERRCODE = '23514';
    END IF;
    IF NEW."source_conversation_id" IS NULL OR NEW."source_message_id" IS NULL THEN
      RAISE EXCEPTION 'new memory proposal requires a source USER message'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."status" IS DISTINCT FROM OLD."status"
       AND NOT (
         OLD."status" = 'PENDING'
         AND NEW."status" IN ('ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')
       ) THEN
      RAISE EXCEPTION 'invalid memory proposal status transition'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."source_conversation_id" IS DISTINCT FROM OLD."source_conversation_id"
       OR NEW."source_message_id" IS DISTINCT FROM OLD."source_message_id" THEN
      IF pg_trigger_depth() = 1 THEN
        RAISE EXCEPTION 'memory proposal source is immutable'
          USING ERRCODE = '23514';
      END IF;
      source_fk_cleanup := true;
    END IF;

    IF NEW."action" IS DISTINCT FROM OLD."action"
       OR NEW."target_memory_id" IS DISTINCT FROM OLD."target_memory_id"
       OR NEW."target_memory_updated_at" IS DISTINCT FROM OLD."target_memory_updated_at"
       OR NEW."target_memory_revision" IS DISTINCT FROM OLD."target_memory_revision" THEN
      RAISE EXCEPTION 'memory proposal target snapshot is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."source_message_id" IS NOT NULL AND NOT source_fk_cleanup THEN
    SELECT m."role", m."status", m."superseded_at"
    INTO source_role, source_status, source_superseded_at
    FROM "public"."messages" m
    WHERE m."id" = NEW."source_message_id"
      AND m."conversation_id" = NEW."source_conversation_id";

    IF source_role IS DISTINCT FROM 'USER'
       OR source_status IS DISTINCT FROM 'COMPLETE'
       OR source_superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'memory proposal source message is not an active complete USER message'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."target_memory_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."status" = 'PENDING')
     AND NOT source_fk_cleanup THEN
    SELECT m."scope", m."persona_id", m."updated_at", m."revision"
    INTO target_scope, target_persona_id, target_updated_at, target_revision
    FROM "public"."memories" m
    WHERE m."id" = NEW."target_memory_id"
      AND m."user_id" = NEW."user_id";

    IF target_scope IS DISTINCT FROM NEW."scope"
       OR target_persona_id IS DISTINCT FROM NEW."persona_id"
       OR target_revision IS DISTINCT FROM NEW."target_memory_revision"
       OR date_trunc('milliseconds', target_updated_at)
          IS DISTINCT FROM date_trunc('milliseconds', NEW."target_memory_updated_at") THEN
      RAISE EXCEPTION 'memory proposal target snapshot mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "memory_proposals_validate"
  BEFORE INSERT OR UPDATE ON "public"."memory_proposals"
  FOR EACH ROW EXECUTE FUNCTION "public"."validate_memory_proposal"();

CREATE OR REPLACE FUNCTION "public"."protect_memory_proposal_source_message"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    NEW."conversation_id" IS DISTINCT FROM OLD."conversation_id"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."superseded_at" IS DISTINCT FROM OLD."superseded_at"
  ) AND EXISTS (
    SELECT 1
    FROM "public"."memory_proposals" p
    WHERE p."source_message_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'message is the immutable source of a memory proposal'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "messages_protect_memory_proposal_source"
  BEFORE UPDATE OF "conversation_id", "role", "status", "superseded_at"
  ON "public"."messages"
  FOR EACH ROW EXECUTE FUNCTION "public"."protect_memory_proposal_source_message"();

ALTER TABLE "public"."memory_proposals" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_proposals_select_own" ON "public"."memory_proposals";
CREATE POLICY "memory_proposals_select_own" ON "public"."memory_proposals"
  FOR SELECT USING ("user_id" = auth.uid());

REVOKE ALL PRIVILEGES ON TABLE "public"."memory_proposals"
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE "public"."memory_proposals" TO authenticated;
REVOKE EXECUTE ON FUNCTION "public"."validate_memory_proposal"()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "public"."protect_memory_proposal_source_message"()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION "public"."bump_memory_revision"()
FROM PUBLIC, anon, authenticated;

COMMIT;
