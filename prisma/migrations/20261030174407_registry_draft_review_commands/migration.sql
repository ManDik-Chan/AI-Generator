BEGIN;

-- Per-action platform eligibility is provisioned only by a trusted operator.
-- A project role never implies this independent permission. No seeds or grants.
CREATE TABLE registry_private.operator_actions (
  subject_id uuid NOT NULL REFERENCES registry_private.internal_operators(subject_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  action text NOT NULL CHECK (action IN ('READ_DRAFT','EDIT_DRAFT','SUBMIT_REVIEW','WITHDRAW_REVIEW','DECIDE_REVIEW','SEAL_VERSION')),
  active boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (subject_id,action)
);

-- Mutation results are committed atomically with their effects. The key does
-- not include action: reusing a key for another command is a conflict, not a
-- second operation. Authorization is rechecked before every replay by services.
CREATE TABLE registry_private.command_receipts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key varchar(128) NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 128),
  action text NOT NULL CHECK (action IN ('READ_DRAFT','EDIT_DRAFT','SUBMIT_REVIEW','WITHDRAW_REVIEW','DECIDE_REVIEW','SEAL_VERSION')),
  body_hash varchar(64) NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  expected_revision integer NOT NULL CHECK (expected_revision > 0),
  authz_epoch integer NOT NULL CHECK (authz_epoch > 0),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (project_id,actor_id,idempotency_key)
);

-- An approved/rejected Review remains immutable. Effective invalidation is an
-- append-only fact, including when the original submitter has lost eligibility.
CREATE TABLE registry_private.review_invalidations (
  review_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('WITHDRAWN','DRAFT_EDITED','SUPERSEDED','AUTHORIZATION_CHANGED','POLICY_CHANGED','HASH_MISMATCH','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (review_id,project_id) REFERENCES public.publication_reviews(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

ALTER TABLE registry_private.operator_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.review_invalidations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registry_private.operator_actions,registry_private.command_receipts,registry_private.review_invalidations
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION registry_private.guard_operator_action() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Revoke action qualification rather than deleting history'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.subject_id,NEW.action,NEW.created_at) IS DISTINCT FROM (OLD.subject_id,OLD.action,OLD.created_at) THEN
      RAISE EXCEPTION 'Action qualification identity is immutable';
    END IF;
    NEW.revision:=OLD.revision+1;
  ELSIF NEW.revision<>1 THEN
    RAISE EXCEPTION 'Initial action qualification revision required';
  END IF;
  -- Revocation followed by reactivation cannot revive an earlier approval.
  -- Natural expiry has no UPDATE event and is rechecked by command services.
  UPDATE public.projects SET authz_epoch=authz_epoch+1 WHERE archived_at IS NULL AND id IN
    (SELECT project_id FROM public.project_memberships WHERE subject_id=NEW.subject_id);
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_operator_action BEFORE INSERT OR UPDATE OR DELETE ON registry_private.operator_actions
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_operator_action();

CREATE FUNCTION registry_private.guard_command_history() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Registry command history is append-only';
END $$;
CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.command_receipts
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();
CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.review_invalidations
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();

CREATE FUNCTION registry_private.guard_review_invalidation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- Share the project lock with draft/review/version guards, preventing an
  -- invalidation and a seal from passing each other without serialization.
  PERFORM id FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing invalidation project required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_review_invalidation BEFORE INSERT ON registry_private.review_invalidations
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_review_invalidation();

CREATE FUNCTION registry_private.guard_invalidated_review() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE approval_id uuid;
BEGIN
  -- This trigger sorts before B1's guard_record. Take the shared project lock
  -- here, before checking facts, so an invalidation cannot commit between this
  -- check and guard_record's later lock acquisition under READ COMMITTED.
  PERFORM id FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  IF TG_TABLE_NAME='project_versions' THEN
    approval_id:=NEW.review_id;
  ELSE
    SELECT review_id INTO approval_id FROM public.project_versions
      WHERE id=NEW.version_id AND project_id=NEW.project_id;
  END IF;
  IF EXISTS(SELECT 1 FROM registry_private.review_invalidations
    WHERE review_id=approval_id AND project_id=NEW.project_id) THEN
    RAISE EXCEPTION 'Invalidated review cannot authorize sealing';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_invalidated_review BEFORE INSERT ON public.project_versions
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_invalidated_review();
CREATE TRIGGER registry_guard_invalidated_review BEFORE INSERT ON public.project_releases
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_invalidated_review();

REVOKE ALL ON FUNCTION registry_private.guard_operator_action(),registry_private.guard_command_history(),
  registry_private.guard_review_invalidation(),registry_private.guard_invalidated_review()
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
