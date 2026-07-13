CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE "public"."memory_embeddings" (
  "memory_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "embedding" extensions.vector(512) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "memory_embeddings_pkey" PRIMARY KEY ("memory_id"),
  CONSTRAINT "memory_embeddings_dimensions_check" CHECK ("dimensions" = 512),
  CONSTRAINT "memory_embeddings_content_hash_check" CHECK (length("content_hash") > 0),
  CONSTRAINT "memory_embeddings_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memory_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "memory_embeddings_user_id_model_dimensions_idx"
  ON "public"."memory_embeddings"("user_id", "model", "dimensions");

ALTER TABLE "public"."memory_embeddings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_embeddings_select_own" ON "public"."memory_embeddings";
CREATE POLICY "memory_embeddings_select_own" ON "public"."memory_embeddings"
  FOR SELECT USING ("user_id" = auth.uid());

DROP POLICY IF EXISTS "memory_embeddings_insert_own_memory" ON "public"."memory_embeddings";
CREATE POLICY "memory_embeddings_insert_own_memory" ON "public"."memory_embeddings"
  FOR INSERT WITH CHECK (
    "user_id" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m."id" = "memory_id" AND m."user_id" = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_embeddings_update_own_memory" ON "public"."memory_embeddings";
CREATE POLICY "memory_embeddings_update_own_memory" ON "public"."memory_embeddings"
  FOR UPDATE USING ("user_id" = auth.uid()) WITH CHECK (
    "user_id" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m."id" = "memory_id" AND m."user_id" = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_embeddings_delete_own" ON "public"."memory_embeddings";
CREATE POLICY "memory_embeddings_delete_own" ON "public"."memory_embeddings"
  FOR DELETE USING ("user_id" = auth.uid());
