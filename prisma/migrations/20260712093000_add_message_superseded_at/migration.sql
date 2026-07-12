-- Preserve edited message versions while excluding them from the active chat turn.
ALTER TABLE "messages"
ADD COLUMN "superseded_at" TIMESTAMPTZ(6);

CREATE INDEX "messages_conversation_id_superseded_at_created_at_idx"
ON "messages"("conversation_id", "superseded_at", "created_at");
