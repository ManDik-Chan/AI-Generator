BEGIN;

ALTER TABLE public.profiles ADD COLUMN role_version integer NOT NULL DEFAULT 0;

-- The version cannot be supplied or reset by a caller. Every role transition,
-- including the offline OWNER bootstrap, advances it in the same transaction.
CREATE FUNCTION public.maintain_profile_role_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.role_version := 0;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role_version := OLD.role_version + 1;
  ELSE
    NEW.role_version := OLD.role_version;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.maintain_profile_role_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_maintain_role_version BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.maintain_profile_role_version();

-- Receipts include no-op successes so every successful request ID is bound to
-- its exact intent and resulting version. Neither table is exposed to clients.
CREATE TABLE public.platform_role_requests (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  target_id uuid NOT NULL,
  expected_role public."Role" NOT NULL,
  expected_version integer,
  next_role public."Role" NOT NULL,
  result_version integer,
  changed boolean NOT NULL,
  CONSTRAINT platform_role_requests_versions_check CHECK (
    (expected_version IS NULL AND result_version IS NULL) OR
    (expected_version IS NOT NULL AND result_version IS NOT NULL AND expected_version >= 0 AND result_version >= 0)
  )
);
ALTER TABLE public.platform_role_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_role_requests FROM PUBLIC, anon, authenticated;

-- Existing audits lack version evidence. Reserve their IDs but never guess a
-- replay's outcome: the service will return a conflict for those legacy IDs.
INSERT INTO public.platform_role_requests
  (request_id, actor_id, target_id, expected_role, next_role, changed)
SELECT request_id, actor_id, target_id, old_role, new_role, true
FROM public.platform_role_audits;

COMMIT;
