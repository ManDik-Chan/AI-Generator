BEGIN;
ALTER TABLE public.tool_runs ADD COLUMN storage_deletion_requested_at timestamptz;
ALTER TABLE public.tool_assets ADD COLUMN storage_bucket text, ADD COLUMN deletion_requested_at timestamptz;
ALTER TABLE public.generated_images ADD COLUMN deletion_requested_at timestamptz;
CREATE TABLE public.asset_deletions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 resource_id uuid NOT NULL, scope_id uuid, kind text NOT NULL,
 bucket text NOT NULL, path text NOT NULL, state text NOT NULL DEFAULT 'PENDING',
 attempts int NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error_code text, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT asset_deletion_state CHECK(state IN ('RESERVED','TRACKED','PENDING','BLOCKED','COMPLETE')),
 CONSTRAINT asset_deletion_kind CHECK(kind IN ('TOOL_ASSET','TOOL_GENERATION','PERSONA_AVATAR')),
 CONSTRAINT asset_deletion_complete CHECK((state='COMPLETE')=(completed_at IS NOT NULL)),
 CONSTRAINT asset_deletions_bucket_path_key UNIQUE(bucket,path)
);
CREATE INDEX asset_deletions_state_next_attempt_at_idx ON public.asset_deletions(state,next_attempt_at);
ALTER TABLE public.asset_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_deletions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.asset_deletions TO service_role;
-- Intentionally no owner/account FK: cleanup evidence survives cascade deletion.
ALTER TABLE public.tool_assets ADD CONSTRAINT tool_assets_run_owner_fkey
 FOREIGN KEY(tool_run_id,user_id) REFERENCES public.tool_runs(id,user_id) ON DELETE CASCADE NOT VALID;
-- Preserve legacy bytes; do not auto-repair or delete malformed production rows.

CREATE FUNCTION public.guard_asset_deletion_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF ROW(NEW.owner_id,NEW.resource_id,NEW.scope_id,NEW.kind,NEW.bucket,NEW.path) IS DISTINCT FROM ROW(OLD.owner_id,OLD.resource_id,OLD.scope_id,OLD.kind,OLD.bucket,OLD.path)
 THEN RAISE EXCEPTION 'immutable cleanup identity' USING ERRCODE='23514'; END IF;
 IF OLD.state='COMPLETE' AND NEW.state<>'COMPLETE' THEN RAISE EXCEPTION 'completed cleanup cannot be reopened' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_asset_deletion_identity BEFORE UPDATE ON public.asset_deletions FOR EACH ROW EXECUTE FUNCTION public.guard_asset_deletion_identity();

CREATE FUNCTION public.guard_private_asset_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE parent_deleting timestamptz;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.user_id,NEW.storage_path) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.storage_path)
  THEN RAISE EXCEPTION 'immutable asset identity' USING ERRCODE='23514'; END IF;
  IF OLD.deletion_requested_at IS NOT NULL AND NEW.deletion_requested_at IS NULL THEN RAISE EXCEPTION 'cleanup cannot be cancelled' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='generated_images' AND ROW(NEW.kind,NEW.storage_bucket,NEW.tool_run_id) IS DISTINCT FROM ROW(OLD.kind,OLD.storage_bucket,OLD.tool_run_id)
  THEN RAISE EXCEPTION 'immutable generated image binding' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='tool_assets' THEN
   IF NEW.tool_run_id<>OLD.tool_run_id OR (OLD.storage_bucket IS NOT NULL AND NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket) THEN RAISE EXCEPTION 'immutable tool asset binding' USING ERRCODE='23514'; END IF;
   -- Existing expiry code clears the path only after confirmed object deletion.
   -- No identity rewrite is allowed by application cleanup now.
  END IF;
 END IF;
 IF NEW.tool_run_id IS NOT NULL THEN
  SELECT storage_deletion_requested_at INTO parent_deleting FROM public.tool_runs WHERE id=NEW.tool_run_id AND user_id=NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset run owner mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND parent_deleting IS NOT NULL THEN RAISE EXCEPTION 'run deletion in progress' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_tool_asset_identity BEFORE INSERT OR UPDATE ON public.tool_assets FOR EACH ROW EXECUTE FUNCTION public.guard_private_asset_identity();
CREATE TRIGGER guard_generated_image_identity BEFORE INSERT OR UPDATE ON public.generated_images FOR EACH ROW EXECUTE FUNCTION public.guard_private_asset_identity();

CREATE FUNCTION public.enqueue_deleted_asset() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE k text; b text; scope uuid;
BEGIN
 IF OLD.storage_path='' THEN RETURN OLD; END IF;
 k:=CASE WHEN TG_TABLE_NAME='tool_assets' THEN 'TOOL_ASSET' ELSE OLD.kind::text END;
 b:=COALESCE(OLD.storage_bucket,'');
 IF TG_TABLE_NAME='tool_assets' THEN scope:=OLD.tool_run_id;
 ELSIF k='PERSONA_AVATAR' AND split_part(OLD.storage_path,'/',2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN scope:=split_part(OLD.storage_path,'/',2)::uuid;
 ELSE scope:=NULL; END IF;
 INSERT INTO public.asset_deletions(owner_id,resource_id,scope_id,kind,bucket,path,state,last_error_code)
 VALUES(OLD.user_id,OLD.id,scope,k,b,OLD.storage_path,CASE WHEN b='' THEN 'BLOCKED' ELSE 'PENDING' END,CASE WHEN b='' THEN 'LEGACY_BUCKET_UNBOUND' ELSE NULL END)
 ON CONFLICT(bucket,path) DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER preserve_tool_asset_cleanup BEFORE DELETE ON public.tool_assets FOR EACH ROW EXECUTE FUNCTION public.enqueue_deleted_asset();
CREATE TRIGGER preserve_generated_image_cleanup BEFORE DELETE ON public.generated_images FOR EACH ROW EXECUTE FUNCTION public.enqueue_deleted_asset();

CREATE FUNCTION public.track_attached_asset() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.asset_deletions WHERE bucket=NEW.storage_bucket AND path=NEW.storage_path AND state IN ('PENDING','BLOCKED','COMPLETE')) THEN RAISE EXCEPTION 'object key already retired' USING ERRCODE='23514'; END IF;
 UPDATE public.asset_deletions SET state='TRACKED',updated_at=now() WHERE bucket=NEW.storage_bucket AND path=NEW.storage_path AND state='RESERVED' AND owner_id=NEW.user_id AND resource_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER track_tool_asset AFTER INSERT ON public.tool_assets FOR EACH ROW EXECUTE FUNCTION public.track_attached_asset();
CREATE TRIGGER track_generated_image AFTER INSERT ON public.generated_images FOR EACH ROW EXECUTE FUNCTION public.track_attached_asset();

CREATE FUNCTION public.guard_avatar_attachment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.avatar_image_id IS NOT NULL AND NEW.avatar_image_id IS DISTINCT FROM OLD.avatar_image_id THEN
  PERFORM 1 FROM public.generated_images WHERE id=NEW.avatar_image_id AND user_id=NEW.user_id AND kind='PERSONA_AVATAR' AND deletion_requested_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'avatar ownership or deletion mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_avatar_attachment BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.guard_avatar_attachment();
REVOKE EXECUTE ON FUNCTION public.guard_asset_deletion_identity(),public.guard_private_asset_identity(),public.enqueue_deleted_asset(),public.track_attached_asset(),public.guard_avatar_attachment() FROM PUBLIC,anon,authenticated;
COMMIT;
