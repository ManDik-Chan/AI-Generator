BEGIN;
CREATE OR REPLACE FUNCTION public.track_attached_asset() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE cleanup_state text; cleanup_owner uuid; cleanup_resource uuid;
BEGIN
 -- Share the reservation lock with upload compensation. Recheck the state
 -- after acquiring it, so a waiting attach cannot revive a retired object.
 SELECT state,owner_id,resource_id INTO cleanup_state,cleanup_owner,cleanup_resource
 FROM public.asset_deletions WHERE bucket=NEW.storage_bucket AND path=NEW.storage_path FOR UPDATE;
 IF FOUND THEN
  IF cleanup_state<>'RESERVED' OR cleanup_owner<>NEW.user_id OR cleanup_resource<>NEW.id
  THEN RAISE EXCEPTION 'object key already attached or retired' USING ERRCODE='23514'; END IF;
  UPDATE public.asset_deletions SET state='TRACKED',updated_at=now() WHERE bucket=NEW.storage_bucket AND path=NEW.storage_path;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.track_attached_asset() FROM PUBLIC,anon,authenticated;
COMMIT;
