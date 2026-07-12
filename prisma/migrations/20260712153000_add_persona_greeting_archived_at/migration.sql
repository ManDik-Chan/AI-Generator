ALTER TABLE "personas"
ADD COLUMN "greeting" TEXT,
ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE INDEX "personas_user_id_archived_at_updated_at_idx"
ON "personas"("user_id", "archived_at", "updated_at" DESC);
