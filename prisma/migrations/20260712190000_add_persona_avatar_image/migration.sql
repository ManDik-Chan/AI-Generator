ALTER TABLE "personas"
ADD COLUMN "avatar_prompt" TEXT,
ADD COLUMN "avatar_image_id" UUID;

CREATE UNIQUE INDEX "personas_avatar_image_id_key" ON "personas"("avatar_image_id");
ALTER TABLE "personas" ADD CONSTRAINT "personas_avatar_image_id_fkey"
FOREIGN KEY ("avatar_image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
