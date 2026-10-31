BEGIN;

-- This private byte-evidence boundary does not approve assets or activate a
-- Release. No subject, action qualification, upload URL or public policy seed.
ALTER TABLE registry_private.operator_actions DROP CONSTRAINT operator_actions_action_check;
ALTER TABLE registry_private.operator_actions ADD CONSTRAINT operator_actions_action_check CHECK
  (action IN ('READ_DRAFT','EDIT_DRAFT','SUBMIT_REVIEW','WITHDRAW_REVIEW','DECIDE_REVIEW','SEAL_VERSION',
    'READ_RELEASE','REQUEST_RELEASE','APPROVE_RELEASE','PUBLISH_RELEASE','WITHDRAW_RELEASE','ROLLBACK_RELEASE',
    'INGEST_ASSET','VERIFY_ASSET'));

-- Reservation commits before external Storage IO. Failed acknowledgements and
-- process death retain an attributable private orphan instead of an untracked
-- object. A reservation is never byte, sanitation or publication evidence.
CREATE TABLE registry_private.asset_object_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  asset_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('SOURCE','CANDIDATE')),
  quarantine_id uuid,
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_hash varchar(64) NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  authz_epoch integer NOT NULL CHECK (authz_epoch>0),
  source_digest varchar(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  mime text NOT NULL CHECK (mime IN ('text/markdown','image/png','image/jpeg','image/webp')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 2097152),
  rights_hash varchar(64) NOT NULL CHECK (rights_hash ~ '^[a-f0-9]{64}$'),
  scan_revision integer NOT NULL CHECK (scan_revision>0),
  policy_revision integer NOT NULL CHECK (policy_revision>0),
  bucket text NOT NULL,
  object_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,project_id),
  UNIQUE(project_id,actor_id,kind,idempotency_key),
  FOREIGN KEY(asset_id,project_id) REFERENCES public.project_assets(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((kind='SOURCE' AND quarantine_id IS NULL AND bucket='registry-quarantine-v1'
      AND object_path='q1/'||project_id::text||'/'||asset_id::text||'/'||id::text||'/'||source_digest)
    OR (kind='CANDIDATE' AND quarantine_id IS NOT NULL AND bucket='registry-candidates-v1'
      AND object_path='c1/'||project_id::text||'/'||asset_id::text||'/'||quarantine_id::text||'/'||id::text))
);

CREATE TABLE registry_private.asset_quarantine (
  id uuid PRIMARY KEY REFERENCES registry_private.asset_object_intents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  asset_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_hash varchar(64) NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  authz_epoch integer NOT NULL CHECK (authz_epoch>0),
  source_digest varchar(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  mime text NOT NULL CHECK (mime IN ('text/markdown','image/png','image/jpeg','image/webp')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 2097152),
  rights_hash varchar(64) NOT NULL CHECK (rights_hash ~ '^[a-f0-9]{64}$'),
  scan_revision integer NOT NULL CHECK (scan_revision>0),
  policy_revision integer NOT NULL CHECK (policy_revision>0),
  bucket text NOT NULL CHECK (bucket='registry-quarantine-v1'),
  object_path text NOT NULL UNIQUE,
  -- No FK to mutable Storage rows: deletion must retain historical evidence.
  storage_object_id uuid NOT NULL,
  storage_version text NOT NULL CHECK (length(storage_version) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,project_id),
  UNIQUE(project_id,actor_id,idempotency_key),
  FOREIGN KEY(asset_id,project_id) REFERENCES public.project_assets(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (object_path='q1/'||project_id::text||'/'||asset_id::text||'/'||id::text||'/'||source_digest)
);
ALTER TABLE registry_private.asset_object_intents ADD CONSTRAINT asset_intents_quarantine_project_fkey
  FOREIGN KEY(quarantine_id,project_id) REFERENCES registry_private.asset_quarantine(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE registry_private.asset_verifications (
  id uuid PRIMARY KEY REFERENCES registry_private.asset_object_intents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  quarantine_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source_digest varchar(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  source_size integer NOT NULL CHECK (source_size BETWEEN 1 AND 2097152),
  source_mime text NOT NULL CHECK (length(source_mime) BETWEEN 1 AND 100),
  candidate_digest varchar(64) CHECK (candidate_digest ~ '^[a-f0-9]{64}$'),
  candidate_size integer CHECK (candidate_size BETWEEN 1 AND 2097152),
  candidate_mime text CHECK (candidate_mime IN ('text/markdown','image/png','image/jpeg','image/webp')),
  candidate_path text UNIQUE,
  candidate_object_id uuid,
  candidate_version text CHECK (length(candidate_version) BETWEEN 1 AND 200),
  storage_object_id uuid NOT NULL,
  storage_version text NOT NULL CHECK (length(storage_version) BETWEEN 1 AND 200),
  policy_revision integer NOT NULL CHECK (policy_revision>0),
  scan_revision integer NOT NULL CHECK (scan_revision>0),
  scanner_revision text NOT NULL CHECK (scanner_revision='unavailable-v1'),
  sanitizer_revision text NOT NULL CHECK (sanitizer_revision='candidate-normalization-v1'),
  outcome text NOT NULL CHECK (outcome='BLOCKED'),
  reason text NOT NULL CHECK (reason IN ('SCANNER_UNAVAILABLE','BYTE_MISMATCH','INVALID_CONTENT')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,project_id),
  FOREIGN KEY(quarantine_id,project_id) REFERENCES registry_private.asset_quarantine(id,project_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((candidate_digest IS NULL AND candidate_size IS NULL AND candidate_mime IS NULL AND candidate_path IS NULL
      AND candidate_object_id IS NULL AND candidate_version IS NULL)
    OR (candidate_digest IS NOT NULL AND candidate_size IS NOT NULL AND candidate_mime IS NOT NULL AND candidate_path IS NOT NULL
      AND candidate_object_id IS NOT NULL AND candidate_version IS NOT NULL))
);

ALTER TABLE registry_private.asset_object_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.asset_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.asset_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registry_private.asset_object_intents,registry_private.asset_quarantine,registry_private.asset_verifications FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.asset_object_intents
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();
CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.asset_quarantine
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();
CREATE TRIGGER registry_guard_command_history BEFORE UPDATE OR DELETE ON registry_private.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_command_history();

CREATE FUNCTION registry_private.asset_authority(project uuid,subject uuid,operation text) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT operation IN ('INGEST_ASSET','VERIFY_ASSET') AND EXISTS(
    SELECT 1 FROM registry_private.internal_operators o
      JOIN registry_private.operator_actions a ON a.subject_id=o.subject_id
      JOIN public.project_memberships m ON m.subject_id=o.subject_id AND m.project_id=project
    WHERE o.subject_id=subject AND o.active AND o.expires_at>clock_timestamp()
      AND a.action=operation AND a.active AND a.expires_at>clock_timestamp() AND m.active
      AND m.roles && CASE WHEN operation='VERIFY_ASSET' THEN ARRAY['REVIEWER']::public."ProjectRole"[]
        ELSE ARRAY['OWNER','EDITOR']::public."ProjectRole"[] END);
$$;

CREATE FUNCTION registry_private.guard_asset_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; a public.project_assets; q registry_private.asset_quarantine;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO a FROM public.project_assets WHERE id=NEW.asset_id AND project_id=NEW.project_id FOR SHARE;
  IF p.id IS NULL OR p.archived_at IS NOT NULL OR p.authz_epoch<>NEW.authz_epoch OR a.id IS NULL
    OR a.state IN ('REJECTED','RETIRED') OR a.source_digest<>NEW.source_digest OR a.mime<>NEW.mime
    OR a.size<>NEW.size OR a.scan_revision<>NEW.scan_revision
    OR NOT registry_private.asset_authority(p.id,NEW.actor_id,CASE WHEN NEW.kind='SOURCE' THEN 'INGEST_ASSET' ELSE 'VERIFY_ASSET' END) THEN
    RAISE EXCEPTION 'Current private asset reservation authority required';
  END IF;
  IF NEW.kind='CANDIDATE' THEN
    SELECT * INTO q FROM registry_private.asset_quarantine WHERE id=NEW.quarantine_id AND project_id=NEW.project_id;
    IF q.id IS NULL OR q.actor_id=NEW.actor_id OR q.asset_id<>NEW.asset_id OR q.authz_epoch<>NEW.authz_epoch
      OR q.source_digest<>NEW.source_digest OR q.mime<>NEW.mime OR q.size<>NEW.size OR q.rights_hash<>NEW.rights_hash
      OR q.scan_revision<>NEW.scan_revision OR q.policy_revision<>NEW.policy_revision
      OR NOT registry_private.asset_authority(p.id,q.actor_id,'INGEST_ASSET') THEN
      RAISE EXCEPTION 'Current independent quarantine reservation required';
    END IF;
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_asset_intent BEFORE INSERT ON registry_private.asset_object_intents
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_asset_intent();

CREATE FUNCTION registry_private.guard_asset_quarantine() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; a public.project_assets; i registry_private.asset_object_intents;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO a FROM public.project_assets WHERE id=NEW.asset_id AND project_id=NEW.project_id FOR SHARE;
  SELECT * INTO i FROM registry_private.asset_object_intents WHERE id=NEW.id;
  IF p.id IS NULL OR p.archived_at IS NOT NULL OR p.authz_epoch<>NEW.authz_epoch OR a.id IS NULL
    OR a.state IN ('REJECTED','RETIRED') OR a.source_digest<>NEW.source_digest OR a.mime<>NEW.mime
    OR a.size<>NEW.size OR a.scan_revision<>NEW.scan_revision
    OR i.id IS NULL OR i.kind<>'SOURCE'
    OR (i.project_id,i.asset_id,i.actor_id,i.idempotency_key,i.body_hash,i.authz_epoch,i.source_digest,i.mime,i.size,i.rights_hash,
        i.scan_revision,i.policy_revision,i.bucket,i.object_path) IS DISTINCT FROM
      (NEW.project_id,NEW.asset_id,NEW.actor_id,NEW.idempotency_key,NEW.body_hash,NEW.authz_epoch,NEW.source_digest,NEW.mime,NEW.size,NEW.rights_hash,
        NEW.scan_revision,NEW.policy_revision,NEW.bucket,NEW.object_path)
    OR NOT registry_private.asset_authority(p.id,NEW.actor_id,'INGEST_ASSET') THEN
    RAISE EXCEPTION 'Current private asset identity and ingest authority required';
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_asset_quarantine BEFORE INSERT ON registry_private.asset_quarantine
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_asset_quarantine();

CREATE FUNCTION registry_private.guard_asset_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; q registry_private.asset_quarantine; a public.project_assets; i registry_private.asset_object_intents;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  SELECT * INTO q FROM registry_private.asset_quarantine WHERE id=NEW.quarantine_id AND project_id=NEW.project_id;
  SELECT * INTO a FROM public.project_assets WHERE id=q.asset_id AND project_id=NEW.project_id FOR SHARE;
  SELECT * INTO i FROM registry_private.asset_object_intents WHERE id=NEW.id;
  IF p.id IS NULL OR p.archived_at IS NOT NULL OR q.id IS NULL OR p.authz_epoch<>q.authz_epoch OR a.id IS NULL
    OR a.state IN ('REJECTED','RETIRED') OR a.source_digest<>q.source_digest OR a.mime<>q.mime OR a.size<>q.size
    OR a.scan_revision<>q.scan_revision OR NEW.scan_revision<>q.scan_revision OR NEW.policy_revision<>q.policy_revision
    OR NEW.source_digest<>q.source_digest OR NEW.source_size<>q.size OR NEW.source_mime<>q.mime
    OR NEW.storage_object_id<>q.storage_object_id OR NEW.storage_version<>q.storage_version
    OR NEW.actor_id=q.actor_id OR NOT registry_private.asset_authority(p.id,NEW.actor_id,'VERIFY_ASSET')
    OR NOT registry_private.asset_authority(p.id,q.actor_id,'INGEST_ASSET')
    OR i.id IS NULL OR i.kind<>'CANDIDATE' OR i.quarantine_id<>q.id OR i.project_id<>NEW.project_id OR i.actor_id<>NEW.actor_id
    OR i.authz_epoch<>q.authz_epoch OR i.asset_id<>q.asset_id OR i.source_digest<>q.source_digest
    OR i.mime<>q.mime OR i.size<>q.size OR i.rights_hash<>q.rights_hash OR i.scan_revision<>q.scan_revision OR i.policy_revision<>q.policy_revision
    OR (NEW.candidate_path IS NOT NULL AND NEW.candidate_path<>i.object_path)
    OR (NEW.candidate_path IS NOT NULL AND NEW.candidate_path<>'c1/'||q.project_id::text||'/'||q.asset_id::text||'/'||q.id::text||'/'||NEW.id::text) THEN
    RAISE EXCEPTION 'Current independent private asset verification binding required';
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_asset_verification BEFORE INSERT ON registry_private.asset_verifications
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_asset_verification();

-- Independent Registry buckets. Nothing here widens the preexisting user asset
-- policies; restrictive policies also fence any future broad permissive policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
  ('registry-quarantine-v1','registry-quarantine-v1',false,2097152,ARRAY['text/markdown','image/png','image/jpeg','image/webp']),
  ('registry-candidates-v1','registry-candidates-v1',false,2097152,ARRAY['text/markdown','image/png','image/jpeg','image/webp']);
CREATE POLICY registry_private_objects_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (bucket_id NOT IN ('registry-quarantine-v1','registry-candidates-v1'))
  WITH CHECK (bucket_id NOT IN ('registry-quarantine-v1','registry-candidates-v1'));
CREATE POLICY registry_private_buckets_boundary ON storage.buckets AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (id NOT IN ('registry-quarantine-v1','registry-candidates-v1'))
  WITH CHECK (id NOT IN ('registry-quarantine-v1','registry-candidates-v1'));

CREATE FUNCTION registry_private.guard_registry_bucket() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.id IN ('registry-quarantine-v1','registry-candidates-v1') THEN RAISE EXCEPTION 'Registry bucket identity must be retained'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IN ('registry-quarantine-v1','registry-candidates-v1') OR (TG_OP='UPDATE' AND OLD.id IN ('registry-quarantine-v1','registry-candidates-v1')) THEN
    IF NEW.public IS DISTINCT FROM false OR NEW.name IS DISTINCT FROM NEW.id OR NEW.file_size_limit IS NULL OR NEW.file_size_limit NOT BETWEEN 1 AND 2097152
      OR (TG_OP='UPDATE' AND NEW.id<>OLD.id) THEN RAISE EXCEPTION 'Registry bucket must remain private and bounded'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_storage_bucket BEFORE INSERT OR UPDATE OR DELETE ON storage.buckets
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_registry_bucket();

CREATE FUNCTION registry_private.guard_registry_object() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE protected boolean;
BEGIN
  protected:=NEW.bucket_id IN ('registry-quarantine-v1','registry-candidates-v1');
  IF TG_OP='UPDATE' AND (protected OR OLD.bucket_id IN ('registry-quarantine-v1','registry-candidates-v1'))
    AND (to_jsonb(NEW)-'last_accessed_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'last_accessed_at'-'updated_at') THEN
    RAISE EXCEPTION 'Registry objects are create-only';
  END IF;
  IF protected AND ((NEW.bucket_id='registry-quarantine-v1' AND NEW.name !~ '^q1/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{64}$')
    OR (NEW.bucket_id='registry-candidates-v1' AND NEW.name !~ '^c1/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')) THEN
    RAISE EXCEPTION 'Canonical Registry object identity required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_storage_object BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_registry_object();

REVOKE ALL ON FUNCTION registry_private.asset_authority(uuid,uuid,text),registry_private.guard_asset_intent(),registry_private.guard_asset_quarantine(),
  registry_private.guard_asset_verification(),registry_private.guard_registry_bucket(),registry_private.guard_registry_object()
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
