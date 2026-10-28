BEGIN;
-- Refuse upgrade in the presence of historical cross-owner run bindings.
-- Do not silently repair them or permit the cleanup worker to infer ownership.
ALTER TABLE public.tool_assets VALIDATE CONSTRAINT tool_assets_run_owner_fkey;
COMMIT;
