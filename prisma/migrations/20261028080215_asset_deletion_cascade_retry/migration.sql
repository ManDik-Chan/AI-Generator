BEGIN;
-- Follow-up to the locally applied first migration; never rewrite applied SQL.
CREATE OR REPLACE FUNCTION public.enqueue_deleted_asset() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE k text; b text; scope uuid; valid_path boolean;
BEGIN
 IF OLD.storage_path='' THEN RETURN OLD; END IF;
 k:=CASE WHEN TG_TABLE_NAME='tool_assets' THEN 'TOOL_ASSET' ELSE OLD.kind::text END;
 b:=COALESCE(OLD.storage_bucket,'');
 IF TG_TABLE_NAME='tool_assets' THEN
  scope:=OLD.tool_run_id;
  valid_path:=OLD.storage_path ~ ('^'||OLD.user_id::text||'/'||OLD.tool_run_id::text||'/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$');
 ELSIF k='PERSONA_AVATAR' AND split_part(OLD.storage_path,'/',2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
  scope:=split_part(OLD.storage_path,'/',2)::uuid;
  valid_path:=OLD.storage_path ~ ('^'||OLD.user_id::text||'/'||scope::text||'/'||OLD.id::text||'\.(png|jpg|jpeg|webp)$');
 ELSIF k='TOOL_GENERATION' THEN
  scope:=NULL; valid_path:=OLD.storage_path ~ ('^'||OLD.user_id::text||'/'||OLD.id::text||'\.(png|jpg|jpeg|webp)$');
 ELSE scope:=NULL; valid_path:=false; END IF;
 -- Quarantine unauthorizable references without touching an existing legitimate
 -- owner's task on the same key. The worker never accepts an empty bucket.
 IF NOT valid_path THEN b:=''; END IF;
 INSERT INTO public.asset_deletions(owner_id,resource_id,scope_id,kind,bucket,path,state,last_error_code)
 VALUES(OLD.user_id,OLD.id,scope,k,b,OLD.storage_path,CASE WHEN b='' THEN 'BLOCKED' ELSE 'PENDING' END,CASE WHEN b='' THEN 'OWNERSHIP_UNPROVEN' ELSE NULL END)
 ON CONFLICT(bucket,path) DO UPDATE SET state=CASE WHEN asset_deletions.state='COMPLETE' THEN 'COMPLETE' WHEN asset_deletions.state='BLOCKED' THEN 'BLOCKED' ELSE 'PENDING' END,next_attempt_at=now(),updated_at=now()
 WHERE asset_deletions.owner_id=EXCLUDED.owner_id AND asset_deletions.resource_id=EXCLUDED.resource_id AND asset_deletions.kind=EXCLUDED.kind AND asset_deletions.scope_id IS NOT DISTINCT FROM EXCLUDED.scope_id;
 RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_deleted_asset() FROM PUBLIC,anon,authenticated;
COMMIT;
