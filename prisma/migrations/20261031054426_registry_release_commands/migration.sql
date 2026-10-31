BEGIN;

-- Release authorization is independent of the immutable Version's old review.
-- No actor is provisioned, and no public projection or Storage policy is added.
ALTER TABLE registry_private.operator_actions DROP CONSTRAINT operator_actions_action_check;
ALTER TABLE registry_private.operator_actions ADD CONSTRAINT operator_actions_action_check CHECK
  (action IN ('READ_DRAFT','EDIT_DRAFT','SUBMIT_REVIEW','WITHDRAW_REVIEW','DECIDE_REVIEW','SEAL_VERSION',
    'READ_RELEASE','REQUEST_RELEASE','APPROVE_RELEASE','PUBLISH_RELEASE','WITHDRAW_RELEASE','ROLLBACK_RELEASE'));

CREATE TABLE registry_private.release_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version_id uuid NOT NULL,
  content_hash varchar(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  visibility public."ProjectVisibility" NOT NULL,
  asset_digest_set jsonb NOT NULL CHECK (jsonb_typeof(asset_digest_set)='array'),
  authz_epoch integer NOT NULL CHECK (authz_epoch>0),
  project_revision integer NOT NULL CHECK (project_revision>0),
  current_release_id uuid,
  policy_revision integer NOT NULL CHECK (policy_revision>0),
  intent text NOT NULL CHECK (intent IN ('PUBLISH','ROLLBACK')),
  target_release_id uuid,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,project_id),
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
  CHECK ((intent='PUBLISH' AND target_release_id IS NULL) OR (intent='ROLLBACK' AND target_release_id IS NOT NULL)),
  FOREIGN KEY(version_id,project_id) REFERENCES public.project_versions(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY(current_release_id,project_id) REFERENCES public.project_releases(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY(target_release_id,project_id) REFERENCES public.project_releases(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE registry_private.release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,project_id),
  FOREIGN KEY(request_id,project_id) REFERENCES registry_private.release_requests(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE registry_private.release_withdrawals (
  release_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(release_id,project_id) REFERENCES public.project_releases(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE registry_private.release_receipts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  action text NOT NULL CHECK (action IN ('REQUEST_RELEASE','APPROVE_RELEASE','PUBLISH_RELEASE','WITHDRAW_RELEASE','ROLLBACK_RELEASE')),
  body_hash varchar(64) NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  authz_epoch integer NOT NULL CHECK (authz_epoch>0),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,actor_id,idempotency_key)
);

-- NULL only accommodates pre-B2-B history. Every new publication must bind a
-- fresh independent approval and the publishing principal. Never backfill a
-- historical record with invented authorization.
ALTER TABLE public.project_releases ADD COLUMN authorization_id uuid;
ALTER TABLE public.project_releases ADD COLUMN published_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.project_releases ADD CONSTRAINT project_releases_authorization_project_fkey
  FOREIGN KEY(authorization_id,project_id) REFERENCES registry_private.release_approvals(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX project_releases_one_authorization ON public.project_releases(authorization_id) WHERE authorization_id IS NOT NULL;

CREATE FUNCTION registry_private.release_authority(project uuid, subject uuid, operation text) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM registry_private.internal_operators o
    JOIN registry_private.operator_actions a ON a.subject_id=o.subject_id
    JOIN public.project_memberships m ON m.subject_id=o.subject_id AND m.project_id=project
    WHERE o.subject_id=subject AND o.active AND o.expires_at>clock_timestamp()
      AND a.action=operation AND a.active AND a.expires_at>clock_timestamp() AND m.active
      AND m.roles && CASE WHEN operation='APPROVE_RELEASE' THEN ARRAY['REVIEWER']::public."ProjectRole"[]
        ELSE ARRAY['OWNER','PUBLISHER']::public."ProjectRole"[] END);
$$;

CREATE FUNCTION registry_private.release_request_valid(request uuid) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM registry_private.release_requests r
    JOIN public.projects p ON p.id=r.project_id
    JOIN public.project_versions v ON v.id=r.version_id AND v.project_id=r.project_id
    JOIN public.publication_reviews original ON original.id=v.review_id AND original.project_id=v.project_id
    WHERE r.id=request AND p.archived_at IS NULL AND p.authz_epoch=r.authz_epoch AND p.revision=r.project_revision
      AND p.current_release_id IS NOT DISTINCT FROM r.current_release_id AND r.policy_revision=1
      AND r.expires_at>clock_timestamp() AND v.content_hash=r.content_hash AND v.hash_algorithm='JCS-SHA256-v1'
      AND original.decision='APPROVED' AND original.snapshot_hash=v.content_hash
      AND NOT EXISTS(SELECT 1 FROM registry_private.review_invalidations invalid WHERE invalid.review_id=original.id)
      AND (v.snapshot #>> '{manifest,visibility}')=r.visibility::text
      AND registry_private.release_authority(p.id,r.requester_id,'REQUEST_RELEASE')
      AND (r.intent='PUBLISH' OR EXISTS(SELECT 1 FROM public.project_releases previous
        WHERE previous.id=r.target_release_id AND previous.project_id=r.project_id AND previous.version_id=r.version_id
          AND previous.id IS DISTINCT FROM p.current_release_id))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.asset_digest_set) binding
        WHERE NOT EXISTS(SELECT 1 FROM public.project_assets a
          WHERE a.project_id=r.project_id AND a.id::text=binding->>'assetId' AND a.state='APPROVED'
            AND a.data_class='CURATED' AND a.delivery_digest=binding->>'deliveryDigest'
            AND a.source_digest=binding->>'sourceDigest' AND to_jsonb(a.scan_revision)=binding->'scanRevision'
            AND to_jsonb(a.size)=binding->'size' AND a.mime=binding->>'mime' AND a.data_class=binding->>'dataClass')));
$$;

CREATE FUNCTION registry_private.guard_release_request() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; v public.project_versions;
BEGIN
  NEW.created_at:=clock_timestamp();
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO v FROM public.project_versions WHERE id=NEW.version_id AND project_id=NEW.project_id;
  IF p.id IS NULL OR p.archived_at IS NOT NULL OR v.id IS NULL OR p.authz_epoch<>NEW.authz_epoch
    OR p.revision<>NEW.project_revision OR p.current_release_id IS DISTINCT FROM NEW.current_release_id
    OR NEW.policy_revision<>1 OR NEW.expires_at<=clock_timestamp() OR v.content_hash<>NEW.content_hash
    OR v.hash_algorithm<>'JCS-SHA256-v1' OR (v.snapshot #>> '{manifest,visibility}') IS DISTINCT FROM NEW.visibility::text
    OR NOT EXISTS(SELECT 1 FROM public.publication_reviews original WHERE original.id=v.review_id AND original.project_id=v.project_id
      AND original.decision='APPROVED' AND original.snapshot_hash=v.content_hash
      AND NOT EXISTS(SELECT 1 FROM registry_private.review_invalidations invalid WHERE invalid.review_id=original.id))
    OR NOT registry_private.release_authority(p.id,NEW.requester_id,'REQUEST_RELEASE')
    OR (NEW.intent='ROLLBACK' AND NOT EXISTS(SELECT 1 FROM public.project_releases previous
      WHERE previous.id=NEW.target_release_id AND previous.project_id=NEW.project_id AND previous.version_id=NEW.version_id
        AND previous.id IS DISTINCT FROM p.current_release_id)) THEN
    RAISE EXCEPTION 'Current release request authority and exact Version binding required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_release_request BEFORE INSERT ON registry_private.release_requests
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_request();

CREATE FUNCTION registry_private.guard_release_approval() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r registry_private.release_requests;
BEGIN
  PERFORM id FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO r FROM registry_private.release_requests WHERE id=NEW.request_id AND project_id=NEW.project_id;
  IF r.id IS NULL OR r.requester_id=NEW.reviewer_id OR NOT registry_private.release_request_valid(r.id)
    OR NOT registry_private.release_authority(NEW.project_id,NEW.reviewer_id,'APPROVE_RELEASE') THEN
    RAISE EXCEPTION 'Fresh independent release approval required';
  END IF;
  NEW.approved_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_release_approval BEFORE INSERT ON registry_private.release_approvals
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_approval();

-- Replace only Release's legacy sealing guards. Version and Review protections
-- remain as installed. A fresh Release approval can authorize an old Version;
-- the original review is immutable provenance, not a reusable live credential.
DROP TRIGGER registry_guard_record ON public.project_releases;
DROP TRIGGER registry_guard_sealing_qualification ON public.project_releases;
DROP TRIGGER registry_guard_invalidated_review ON public.project_releases;
CREATE FUNCTION registry_private.guard_release_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a registry_private.release_approvals; r registry_private.release_requests;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Release publication history is immutable; append withdrawal fact'; END IF;
  PERFORM id FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO a FROM registry_private.release_approvals WHERE id=NEW.authorization_id AND project_id=NEW.project_id;
  SELECT * INTO r FROM registry_private.release_requests WHERE id=a.request_id AND project_id=NEW.project_id;
  IF a.id IS NULL OR r.id IS NULL OR NEW.published_by IS NULL OR NEW.state<>'PUBLISHED' OR NEW.withdrawn_at IS NOT NULL
    OR NEW.published_by<>r.requester_id
    OR NEW.version_id<>r.version_id OR NEW.content_hash<>r.content_hash OR NEW.visibility_at_approval<>r.visibility
    OR NOT registry_private.release_request_valid(r.id)
    OR NOT registry_private.release_authority(NEW.project_id,a.reviewer_id,'APPROVE_RELEASE')
    OR NOT registry_private.release_authority(NEW.project_id,NEW.published_by,
      CASE WHEN r.intent='ROLLBACK' THEN 'ROLLBACK_RELEASE' ELSE 'PUBLISH_RELEASE' END) THEN
    RAISE EXCEPTION 'Fresh exact release approval and publisher required';
  END IF;
  NEW.published_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_release_publication BEFORE INSERT OR UPDATE OR DELETE ON public.project_releases
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_publication();

CREATE FUNCTION registry_private.guard_release_publication_committed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND current_release_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM registry_private.release_withdrawals WHERE release_id=NEW.id AND project_id=NEW.project_id) THEN
    RAISE EXCEPTION 'Publication and current pointer must commit atomically';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER registry_guard_release_publication_committed AFTER INSERT ON public.project_releases
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_publication_committed();

CREATE FUNCTION registry_private.guard_release_withdrawal() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM id FROM public.projects WHERE id=NEW.project_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT registry_private.release_authority(NEW.project_id,NEW.actor_id,'WITHDRAW_RELEASE')
    OR NOT EXISTS(SELECT 1 FROM public.project_releases WHERE id=NEW.release_id AND project_id=NEW.project_id AND state='PUBLISHED') THEN
    RAISE EXCEPTION 'Current withdrawal authority required';
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_release_withdrawal BEFORE INSERT ON registry_private.release_withdrawals
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_withdrawal();

CREATE FUNCTION registry_private.guard_release_withdrawal_committed() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND current_release_id=NEW.release_id) THEN
    RAISE EXCEPTION 'Withdrawn release must be cleared atomically';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER registry_guard_release_withdrawal_committed AFTER INSERT ON registry_private.release_withdrawals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION registry_private.guard_release_withdrawal_committed();

-- Publication rows are immutable facts; the current pointer and append-only
-- withdrawal facts express live state. PRIVATE never selects a public DTO.
CREATE OR REPLACE FUNCTION registry_private.guard_project() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registry projects retain slug and audit history'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.visibility<>'PRIVATE' OR NEW.current_release_id IS NOT NULL OR NEW.archived_at IS NOT NULL
      OR NEW.revision<>1 OR NEW.authz_epoch<>1 OR NOT EXISTS(SELECT 1 FROM registry_private.internal_operators
      WHERE subject_id=NEW.owner_id AND active AND can_create AND expires_at>statement_timestamp()) THEN
      RAISE EXCEPTION 'Eligible internal creator and private initial project required';
    END IF;
  ELSE
    IF (NEW.id,NEW.slug,NEW.owner_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.slug,OLD.owner_id,OLD.created_at)
      OR OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Project identity/archive is immutable'; END IF;
    NEW.revision:=OLD.revision+1;
    NEW.updated_at:=statement_timestamp();
    IF NEW.current_release_id IS DISTINCT FROM OLD.current_release_id THEN
      IF NEW.current_release_id IS NULL THEN
        IF OLD.current_release_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM registry_private.release_withdrawals w
          WHERE w.release_id=OLD.current_release_id AND w.project_id=OLD.id AND w.xmin=pg_current_xact_id()::xid) THEN
          RAISE EXCEPTION 'Clear current release in the withdrawal transaction';
        END IF;
        IF NEW.visibility<>'PRIVATE' THEN RAISE EXCEPTION 'Withdrawal makes current project private'; END IF;
      ELSIF NOT EXISTS(SELECT 1 FROM public.project_releases r WHERE r.id=NEW.current_release_id AND r.project_id=NEW.id
        AND r.state='PUBLISHED' AND r.authorization_id IS NOT NULL AND r.xmin=pg_current_xact_id()::xid
        AND r.visibility_at_approval=NEW.visibility AND NOT EXISTS(SELECT 1 FROM registry_private.release_withdrawals w WHERE w.release_id=r.id)) THEN
        RAISE EXCEPTION 'Newly authorized publication required for pointer transition';
      END IF;
    ELSIF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      RAISE EXCEPTION 'Visibility changes require a new release or withdrawal';
    END IF;
    IF (NEW.visibility,NEW.archived_at) IS DISTINCT FROM (OLD.visibility,OLD.archived_at) THEN
      NEW.authz_epoch:=OLD.authz_epoch+1;
    ELSIF NEW.authz_epoch NOT IN (OLD.authz_epoch,OLD.authz_epoch+1) THEN RAISE EXCEPTION 'Invalid authorization epoch'; END IF;
    IF NEW.archived_at IS NOT NULL AND (NEW.current_release_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.project_drafts
      WHERE project_id=NEW.id AND state IN ('DRAFT','IN_REVIEW'))) THEN RAISE EXCEPTION 'Withdraw current release and archive drafts first'; END IF;
  END IF;
  -- B1 allowed mismatched visibility on an unchanged legacy pointer. Preserve
  -- those facts without letting them prevent an epoch bump during revocation.
  -- Every NEW pointer transition is strictly bound above; future projections
  -- must independently reject legacy or inconsistent publication metadata.
  IF NEW.current_release_id IS NOT NULL
    AND (TG_OP='INSERT' OR NEW.current_release_id IS DISTINCT FROM OLD.current_release_id OR NEW.visibility IS DISTINCT FROM OLD.visibility)
    AND NOT EXISTS(SELECT 1 FROM public.project_releases r WHERE r.id=NEW.current_release_id
    AND r.project_id=NEW.id AND r.state='PUBLISHED' AND r.visibility_at_approval=NEW.visibility
    AND NOT EXISTS(SELECT 1 FROM registry_private.release_withdrawals w WHERE w.release_id=r.id)) THEN
    RAISE EXCEPTION 'Invalid current release';
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['release_requests','release_approvals','release_withdrawals','release_receipts'] LOOP
    EXECUTE format('ALTER TABLE registry_private.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('REVOKE ALL ON registry_private.%I FROM PUBLIC,anon,authenticated,service_role',relation);
    EXECUTE format('CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.%I FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history()',relation);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION registry_private.release_authority(uuid,uuid,text),registry_private.release_request_valid(uuid),
  registry_private.guard_release_request(),registry_private.guard_release_approval(),registry_private.guard_release_publication(),
  registry_private.guard_release_publication_committed(),registry_private.guard_release_withdrawal(),registry_private.guard_release_withdrawal_committed()
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
