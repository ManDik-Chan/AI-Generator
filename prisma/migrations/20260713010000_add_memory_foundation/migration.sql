CREATE TYPE "MemoryScope" AS ENUM ('GLOBAL', 'PERSONA');
CREATE TYPE "MemoryOrigin" AS ENUM ('MANUAL', 'CHAT_MESSAGE', 'AUTO_EXTRACTED');

ALTER TABLE "profiles" ADD COLUMN "memory_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "memories"
  ADD COLUMN "persona_id" UUID,
  ADD COLUMN "source_message_id" UUID,
  ADD COLUMN "scope" "MemoryScope" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "origin" "MemoryOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6);

UPDATE "memories"
SET
  "scope" = 'GLOBAL',
  "origin" = 'MANUAL',
  "importance" = GREATEST(1, LEAST(5, "importance"))
WHERE true;

ALTER TABLE "memories" ADD CONSTRAINT "memories_importance_check" CHECK ("importance" BETWEEN 1 AND 5);
ALTER TABLE "memories" ADD CONSTRAINT "memories_scope_persona_check" CHECK (("scope" = 'GLOBAL' AND "persona_id" IS NULL) OR ("scope" = 'PERSONA' AND "persona_id" IS NOT NULL));
ALTER TABLE "memories" ADD CONSTRAINT "memories_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "memories_user_id_enabled_importance_idx";
CREATE INDEX "memories_user_id_enabled_scope_importance_updated_at_idx" ON "memories"("user_id", "enabled", "scope", "importance", "updated_at" DESC);
CREATE INDEX "memories_persona_id_enabled_importance_idx" ON "memories"("persona_id", "enabled", "importance");
CREATE INDEX "memories_source_message_id_idx" ON "memories"("source_message_id");

DROP POLICY IF EXISTS "memories_own_all" ON public.memories;
CREATE POLICY "memories_select_own" ON public.memories FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "memories_insert_own_relations" ON public.memories FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND (persona_id IS NULL OR EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND p.user_id = auth.uid()))
  AND (source_conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = source_conversation_id AND c.user_id = auth.uid()))
  AND (source_message_id IS NULL OR EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = source_message_id AND c.user_id = auth.uid() AND (source_conversation_id IS NULL OR m.conversation_id = source_conversation_id)))
);
CREATE POLICY "memories_update_own_relations" ON public.memories FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (
  user_id = auth.uid()
  AND (persona_id IS NULL OR EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND p.user_id = auth.uid()))
  AND (source_conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = source_conversation_id AND c.user_id = auth.uid()))
  AND (source_message_id IS NULL OR EXISTS (SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = source_message_id AND c.user_id = auth.uid() AND (source_conversation_id IS NULL OR m.conversation_id = source_conversation_id)))
);
CREATE POLICY "memories_delete_own" ON public.memories FOR DELETE USING (user_id = auth.uid());
