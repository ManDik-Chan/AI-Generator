ALTER TABLE "memories"
  ADD COLUMN "topic_key" TEXT,
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "use_count" INTEGER NOT NULL DEFAULT 0;

CREATE FUNCTION public.memory_keywords_valid(values_to_check TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT cardinality(values_to_check) <= 12
    AND COALESCE(bool_and(char_length(btrim(value)) BETWEEN 1 AND 40), true)
  FROM unnest(values_to_check) AS value;
$$;

ALTER TABLE "memories"
  ADD CONSTRAINT "memories_use_count_check" CHECK ("use_count" >= 0),
  ADD CONSTRAINT "memories_topic_key_check" CHECK ("topic_key" IS NULL OR (char_length("topic_key") <= 80 AND "topic_key" ~ '^[a-z0-9._-]+$')),
  ADD CONSTRAINT "memories_keywords_check" CHECK (public.memory_keywords_valid("keywords"));

CREATE INDEX "memories_user_id_pinned_enabled_importance_idx" ON "memories"("user_id", "pinned", "enabled", "importance");
CREATE INDEX "memories_user_id_topic_key_idx" ON "memories"("user_id", "topic_key");
CREATE INDEX "memories_persona_id_topic_key_idx" ON "memories"("persona_id", "topic_key");
