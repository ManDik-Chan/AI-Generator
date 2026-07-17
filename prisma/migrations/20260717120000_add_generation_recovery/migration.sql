ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "GenerationRunType" AS ENUM ('PERSONA_DRAFT', 'PERSONA_AVATAR');
CREATE TYPE "GenerationRunStatus" AS ENUM ('PENDING', 'COMPLETE', 'ERROR', 'CANCELLED');

ALTER TABLE "tool_runs"
  ADD COLUMN "recovery_expires_at" TIMESTAMPTZ(6);

CREATE TABLE "generation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "persona_id" UUID,
  "type" "GenerationRunType" NOT NULL,
  "status" "GenerationRunStatus" NOT NULL DEFAULT 'PENDING',
  "input" JSONB NOT NULL,
  "result" JSONB,
  "error_code" VARCHAR(100),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generation_runs_user_id_status_created_at_idx" ON "generation_runs"("user_id", "status", "created_at" DESC);
CREATE INDEX "generation_runs_persona_id_type_created_at_idx" ON "generation_runs"("persona_id", "type", "created_at" DESC);
CREATE INDEX "generation_runs_expires_at_idx" ON "generation_runs"("expires_at");

ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_persona_id_fkey"
  FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
