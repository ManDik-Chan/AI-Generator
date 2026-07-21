BEGIN;

DROP INDEX IF EXISTS "public"."usage_ledger_user_id_capability_run_id_key";

CREATE UNIQUE INDEX "usage_ledger_user_id_run_id_key"
  ON "public"."usage_ledger" ("user_id", "run_id");

COMMIT;
