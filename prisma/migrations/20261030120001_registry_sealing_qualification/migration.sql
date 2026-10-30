BEGIN;

-- Natural expiry does not fire guard_operator or advance authz_epoch. Recheck
-- both actors when sealing history even on a privileged internal connection.
-- This is a B1 invariant, not a publish command or a complete B2 protocol.
CREATE FUNCTION registry_private.guard_sealing_qualification() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE review public.publication_reviews;
BEGIN
  IF TG_TABLE_NAME='project_versions' THEN
    SELECT * INTO review FROM public.publication_reviews
      WHERE id=NEW.review_id AND project_id=NEW.project_id;
  ELSE
    SELECT r.* INTO review FROM public.publication_reviews r
      JOIN public.project_versions v ON v.review_id=r.id AND v.project_id=r.project_id
      WHERE v.id=NEW.version_id AND v.project_id=NEW.project_id;
  END IF;
  IF review.id IS NULL
    OR NOT registry_private.has_role(NEW.project_id,review.submitter_id,ARRAY['OWNER','EDITOR']::public."ProjectRole"[])
    OR NOT registry_private.has_role(NEW.project_id,review.reviewer_id,ARRAY['REVIEWER']::public."ProjectRole"[]) THEN
    RAISE EXCEPTION 'Current sealing qualifications required';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION registry_private.guard_sealing_qualification() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER registry_guard_sealing_qualification BEFORE INSERT ON public.project_versions
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_sealing_qualification();
CREATE TRIGGER registry_guard_sealing_qualification BEFORE INSERT ON public.project_releases
  FOR EACH ROW EXECUTE FUNCTION registry_private.guard_sealing_qualification();

COMMIT;
