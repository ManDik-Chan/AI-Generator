BEGIN;

CREATE TABLE registry_private.project_creation_receipts (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  slug varchar(63) NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{2,62}$'),
  PRIMARY KEY (actor_id, idempotency_key)
);
ALTER TABLE registry_private.project_creation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registry_private.project_creation_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.project_creation_receipts
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();

COMMIT;
