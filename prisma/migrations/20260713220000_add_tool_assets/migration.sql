ALTER TYPE "ToolType" ADD VALUE 'IMAGE_ANALYZE';

CREATE TYPE "ToolAssetKind" AS ENUM ('IMAGE');

CREATE TABLE "tool_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "tool_run_id" UUID NOT NULL,
  "kind" "ToolAssetKind" NOT NULL DEFAULT 'IMAGE',
  "storage_path" TEXT NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tool_assets_dimensions_check" CHECK ("width" > 0 AND "height" > 0),
  CONSTRAINT "tool_assets_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  CONSTRAINT "tool_assets_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "tool_assets_tool_run_id_key" ON "tool_assets"("tool_run_id");
CREATE INDEX "tool_assets_user_id_expires_at_idx" ON "tool_assets"("user_id", "expires_at");
CREATE INDEX "tool_assets_user_id_created_at_idx" ON "tool_assets"("user_id", "created_at" DESC);

ALTER TABLE "tool_assets" ADD CONSTRAINT "tool_assets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_assets" ADD CONSTRAINT "tool_assets_tool_run_id_fkey"
  FOREIGN KEY ("tool_run_id") REFERENCES "tool_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_assets_select_own" ON "tool_assets" FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tool_assets_insert_own_run" ON "tool_assets" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM "tool_runs" r WHERE r.id = tool_run_id AND r.user_id = auth.uid())
);
CREATE POLICY "tool_assets_update_own_run" ON "tool_assets" FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM "tool_runs" r WHERE r.id = tool_run_id AND r.user_id = auth.uid())
);
CREATE POLICY "tool_assets_delete_own" ON "tool_assets" FOR DELETE USING (user_id = auth.uid());
