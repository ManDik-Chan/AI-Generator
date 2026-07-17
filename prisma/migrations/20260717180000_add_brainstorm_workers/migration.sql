ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'BRAINSTORM';

CREATE TYPE "BrainstormWorkerRole" AS ENUM ('ANALYST', 'CREATIVE', 'CRITIC', 'PLANNER');
CREATE TYPE "BrainstormWorkerStatus" AS ENUM ('PENDING', 'COMPLETE', 'ERROR', 'CANCELLED');

CREATE TABLE "public"."brainstorm_workers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tool_run_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "BrainstormWorkerRole" NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "BrainstormWorkerStatus" NOT NULL DEFAULT 'PENDING',
  "output_text" TEXT,
  "error_code" VARCHAR(100),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brainstorm_workers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brainstorm_workers_position_check" CHECK ("position" BETWEEN 0 AND 3),
  CONSTRAINT "brainstorm_workers_output_length_check" CHECK ("output_text" IS NULL OR char_length("output_text") <= 40000),
  CONSTRAINT "brainstorm_workers_tool_run_id_user_id_fkey"
    FOREIGN KEY ("tool_run_id", "user_id") REFERENCES "public"."tool_runs"("id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "brainstorm_workers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "brainstorm_workers_tool_run_id_role_key" ON "public"."brainstorm_workers"("tool_run_id", "role");
CREATE UNIQUE INDEX "brainstorm_workers_tool_run_id_position_key" ON "public"."brainstorm_workers"("tool_run_id", "position");
CREATE INDEX "brainstorm_workers_user_id_created_at_idx" ON "public"."brainstorm_workers"("user_id", "created_at" DESC);
CREATE INDEX "brainstorm_workers_tool_run_id_status_idx" ON "public"."brainstorm_workers"("tool_run_id", "status");

CREATE OR REPLACE FUNCTION public.enforce_brainstorm_worker_tool_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tool_runs r
    WHERE r.id = NEW.tool_run_id
      AND r.user_id = NEW.user_id
      AND r.type = 'BRAINSTORM'
  ) THEN
    RAISE EXCEPTION 'brainstorm worker requires an owned BRAINSTORM tool run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brainstorm_workers_validate_tool_run
  BEFORE INSERT OR UPDATE OF tool_run_id, user_id ON public.brainstorm_workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_brainstorm_worker_tool_run();

ALTER TABLE "public"."tool_runs" DROP CONSTRAINT IF EXISTS "tool_runs_retention_check";
ALTER TABLE "public"."tool_runs" ADD CONSTRAINT "tool_runs_retention_check"
  CHECK (
    "retain_content"
    OR "recovery_expires_at" IS NOT NULL
    OR ("title" IS NULL AND "input_text" IS NULL AND "output_text" IS NULL)
  );

ALTER TABLE "public"."brainstorm_workers" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brainstorm_workers_select_own" ON "public"."brainstorm_workers";
CREATE POLICY "brainstorm_workers_select_own" ON "public"."brainstorm_workers"
  FOR SELECT USING ("user_id" = auth.uid());
