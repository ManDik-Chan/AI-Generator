CREATE TYPE "ToolType" AS ENUM ('SUMMARIZE', 'REWRITE', 'TRANSLATE');
CREATE TYPE "ToolRunStatus" AS ENUM ('PENDING', 'COMPLETE', 'ERROR', 'CANCELLED');

CREATE TABLE "public"."tool_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "ToolType" NOT NULL,
  "status" "ToolRunStatus" NOT NULL DEFAULT 'PENDING',
  "title" VARCHAR(100),
  "input_text" TEXT,
  "output_text" TEXT,
  "options" JSONB NOT NULL,
  "retain_content" BOOLEAN NOT NULL DEFAULT true,
  "error_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tool_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tool_runs_input_length_check" CHECK ("input_text" IS NULL OR char_length("input_text") <= 20000),
  CONSTRAINT "tool_runs_output_length_check" CHECK ("output_text" IS NULL OR char_length("output_text") <= 40000),
  CONSTRAINT "tool_runs_retention_check" CHECK ("retain_content" OR ("title" IS NULL AND "input_text" IS NULL AND "output_text" IS NULL)),
  CONSTRAINT "tool_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tool_runs_user_id_created_at_idx" ON "public"."tool_runs"("user_id", "created_at" DESC);
CREATE INDEX "tool_runs_user_id_type_created_at_idx" ON "public"."tool_runs"("user_id", "type", "created_at" DESC);
CREATE INDEX "tool_runs_user_id_status_created_at_idx" ON "public"."tool_runs"("user_id", "status", "created_at" DESC);

ALTER TABLE "public"."tool_runs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tool_runs_select_own" ON "public"."tool_runs";
CREATE POLICY "tool_runs_select_own" ON "public"."tool_runs"
  FOR SELECT USING ("user_id" = auth.uid());
DROP POLICY IF EXISTS "tool_runs_insert_own" ON "public"."tool_runs";
CREATE POLICY "tool_runs_insert_own" ON "public"."tool_runs"
  FOR INSERT WITH CHECK ("user_id" = auth.uid());
DROP POLICY IF EXISTS "tool_runs_update_own" ON "public"."tool_runs";
CREATE POLICY "tool_runs_update_own" ON "public"."tool_runs"
  FOR UPDATE USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());
DROP POLICY IF EXISTS "tool_runs_delete_own" ON "public"."tool_runs";
CREATE POLICY "tool_runs_delete_own" ON "public"."tool_runs"
  FOR DELETE USING ("user_id" = auth.uid());
