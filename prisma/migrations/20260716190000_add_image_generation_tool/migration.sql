ALTER TYPE "ToolType" ADD VALUE IF NOT EXISTS 'IMAGE_GENERATE';

CREATE TYPE "GeneratedImageKind" AS ENUM ('PERSONA_AVATAR', 'TOOL_GENERATION');

ALTER TABLE "generated_images"
  ADD COLUMN "kind" "GeneratedImageKind" NOT NULL DEFAULT 'PERSONA_AVATAR',
  ADD COLUMN "storage_bucket" VARCHAR(100) NOT NULL DEFAULT 'persona-avatars',
  ADD COLUMN "mime_type" VARCHAR(100),
  ADD COLUMN "size_bytes" INTEGER,
  ADD COLUMN "tool_run_id" UUID;

UPDATE "generated_images"
SET "kind" = 'PERSONA_AVATAR', "storage_bucket" = 'persona-avatars'
WHERE "kind" = 'PERSONA_AVATAR';

CREATE UNIQUE INDEX "tool_runs_id_user_id_key" ON "tool_runs"("id", "user_id");
CREATE UNIQUE INDEX "generated_images_tool_run_id_key" ON "generated_images"("tool_run_id");
CREATE UNIQUE INDEX "generated_images_tool_run_id_user_id_key" ON "generated_images"("tool_run_id", "user_id");
CREATE INDEX "generated_images_user_id_kind_created_at_idx" ON "generated_images"("user_id", "kind", "created_at" DESC);

ALTER TABLE "generated_images"
  ADD CONSTRAINT "generated_images_tool_run_id_user_id_fkey"
  FOREIGN KEY ("tool_run_id", "user_id") REFERENCES "tool_runs"("id", "user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_images"
  ADD CONSTRAINT "generated_images_kind_tool_run_check"
  CHECK (
    ("kind" = 'PERSONA_AVATAR' AND "tool_run_id" IS NULL)
    OR ("kind" = 'TOOL_GENERATION' AND "tool_run_id" IS NOT NULL)
  );

ALTER TABLE "generated_images"
  ADD CONSTRAINT "generated_images_size_bytes_check"
  CHECK ("size_bytes" IS NULL OR "size_bytes" > 0);
