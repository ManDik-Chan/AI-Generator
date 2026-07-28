BEGIN;

CREATE TYPE "MemoryVerificationMethod" AS ENUM (
  'MANUAL_ENTRY',
  'EXPLICIT_REQUEST',
  'PROPOSAL_ACCEPTANCE',
  'MANUAL_REVIEW',
  'LEGACY_UNREVIEWED'
);

ALTER TABLE "public"."memories"
  ADD COLUMN "verification_method" "MemoryVerificationMethod",
  ADD COLUMN "verified_at" TIMESTAMPTZ(6);

UPDATE "public"."memories"
SET
  "verification_method" = 'MANUAL_ENTRY',
  "verified_at" = "created_at"
WHERE "origin" = 'MANUAL';

UPDATE "public"."memories"
SET
  "verification_method" = 'EXPLICIT_REQUEST',
  "verified_at" = "created_at"
WHERE "origin" = 'CHAT_MESSAGE';

WITH latest_accepted_proposal AS (
  SELECT DISTINCT ON ("user_id", "resolved_memory_id")
    "user_id",
    "resolved_memory_id",
    "resolved_at"
  FROM "public"."memory_proposals"
  WHERE "status" = 'ACCEPTED'
    AND "resolved_memory_id" IS NOT NULL
    AND "resolved_at" IS NOT NULL
  ORDER BY
    "user_id",
    "resolved_memory_id",
    "resolved_at" DESC,
    "id" DESC
)
UPDATE "public"."memories" AS memory
SET
  "verification_method" = 'PROPOSAL_ACCEPTANCE',
  "verified_at" = proposal."resolved_at"
FROM latest_accepted_proposal AS proposal
WHERE memory."origin" = 'AUTO_EXTRACTED'
  AND proposal."user_id" = memory."user_id"
  AND proposal."resolved_memory_id" = memory."id";

UPDATE "public"."memories"
SET
  "verification_method" = 'LEGACY_UNREVIEWED',
  "verified_at" = NULL
WHERE "origin" = 'AUTO_EXTRACTED'
  AND "verification_method" IS NULL;

ALTER TABLE "public"."memories"
  ALTER COLUMN "verification_method" SET NOT NULL;

ALTER TABLE "public"."memories"
  ADD CONSTRAINT "memories_verification_timestamp_check"
  CHECK (
    ("verification_method" = 'LEGACY_UNREVIEWED')
    = ("verified_at" IS NULL)
  );

CREATE INDEX "memories_user_id_verification_method_updated_at_idx"
  ON "public"."memories"(
    "user_id",
    "verification_method",
    "updated_at" DESC
  );

COMMIT;
