-- This migration follows the enum migration so the new value is committed first.
CREATE UNIQUE INDEX "profiles_single_platform_owner" ON "public"."profiles" (("role")) WHERE "role" = 'OWNER';

CREATE TABLE "public"."platform_role_audits" (
  "id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "old_role" "Role" NOT NULL,
  "new_role" "Role" NOT NULL,
  "request_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_role_audits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_role_audits_request_id_key" ON "public"."platform_role_audits"("request_id");
ALTER TABLE "public"."platform_role_audits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."platform_role_audits" FROM PUBLIC, anon, authenticated;

-- Removing the sole OWNER is an offline recovery/transfer procedure, never a
-- normal application operation. No custom session variable can bypass this.
CREATE FUNCTION "public"."protect_platform_owner"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."role" = 'OWNER' AND (TG_OP = 'DELETE' OR NEW."role" IS DISTINCT FROM OLD."role") THEN
    RAISE EXCEPTION 'platform owner is protected' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION "public"."protect_platform_owner"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "profiles_protect_platform_owner" BEFORE UPDATE OR DELETE ON "public"."profiles"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_platform_owner"();

-- Profiles are not FK-bound to auth.users, so protect the corresponding auth
-- identity as well. The definer is needed because auth administrators cannot
-- be assumed to have profile SELECT privileges. Trigger execution only.
CREATE FUNCTION "public"."protect_platform_owner_auth"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.id AND role = 'OWNER') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'platform owner identity is protected' USING ERRCODE = '42501';
    END IF;
    IF NEW.banned_until IS DISTINCT FROM OLD.banned_until OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'platform owner identity is protected' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION "public"."protect_platform_owner_auth"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "users_protect_platform_owner" BEFORE UPDATE OR DELETE ON "auth"."users"
FOR EACH ROW EXECUTE FUNCTION "public"."protect_platform_owner_auth"();
