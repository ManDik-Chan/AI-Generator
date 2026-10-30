BEGIN;
-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ProjectDraftState" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectReleaseState" AS ENUM ('PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProjectAssetState" AS ENUM ('QUARANTINED', 'VALIDATED', 'APPROVED', 'RETIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'REVIEWER', 'PUBLISHER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PublicationDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "owner_id" UUID NOT NULL,
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'PRIVATE',
    "archived_at" TIMESTAMPTZ(6),
    "current_release_id" UUID,
    "authz_epoch" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" "ProjectDraftState" NOT NULL DEFAULT 'DRAFT',
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "presentation" JSONB NOT NULL DEFAULT '{}',
    "documentation" JSONB NOT NULL DEFAULT '[]',
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "draft_revision" INTEGER NOT NULL,
    "authz_epoch" INTEGER NOT NULL,
    "snapshot_hash" VARCHAR(64) NOT NULL,
    "visibility" "ProjectVisibility" NOT NULL,
    "asset_digest_set" JSONB NOT NULL,
    "submitter_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "decision" "PublicationDecision" NOT NULL DEFAULT 'PENDING',
    "policy_revision" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "hash_algorithm" VARCHAR(32) NOT NULL DEFAULT 'JCS-SHA256-v1',
    "review_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_releases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "visibility_at_approval" "ProjectVisibility" NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "state" "ProjectReleaseState" NOT NULL DEFAULT 'PUBLISHED',
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_digest" VARCHAR(64) NOT NULL,
    "delivery_digest" VARCHAR(64),
    "mime" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "data_class" VARCHAR(100) NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,
    "rights_ref" TEXT NOT NULL,
    "scan_revision" INTEGER NOT NULL DEFAULT 1,
    "state" "ProjectAssetState" NOT NULL DEFAULT 'QUARANTINED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documentation" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "draft_id" UUID,
    "version_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "asset_id" UUID NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "project_documentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memberships" (
    "project_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "roles" "ProjectRole"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("project_id","subject_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "project_drafts_project_id_state_idx" ON "project_drafts"("project_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "project_drafts_id_project_id_key" ON "project_drafts"("id", "project_id");

-- CreateIndex
CREATE INDEX "publication_reviews_project_id_decision_idx" ON "publication_reviews"("project_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "publication_reviews_id_project_id_key" ON "publication_reviews"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_project_id_version_key" ON "project_versions"("project_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_id_project_id_key" ON "project_versions"("id", "project_id");

-- CreateIndex
CREATE INDEX "project_releases_project_id_state_idx" ON "project_releases"("project_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "project_releases_id_project_id_key" ON "project_releases"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_assets_storage_ref_key" ON "project_assets"("storage_ref");

-- CreateIndex
CREATE INDEX "project_assets_project_id_state_idx" ON "project_assets"("project_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "project_assets_id_project_id_key" ON "project_assets"("id", "project_id");

-- CreateIndex
CREATE INDEX "project_documentation_project_id_idx" ON "project_documentation"("project_id");

-- CreateIndex
CREATE INDEX "project_memberships_subject_id_active_idx" ON "project_memberships"("subject_id", "active");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_release_id_id_fkey" FOREIGN KEY ("current_release_id", "id") REFERENCES "project_releases"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "publication_reviews" ADD CONSTRAINT "publication_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "publication_reviews" ADD CONSTRAINT "publication_reviews_draft_id_project_id_fkey" FOREIGN KEY ("draft_id", "project_id") REFERENCES "project_drafts"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "publication_reviews" ADD CONSTRAINT "publication_reviews_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "publication_reviews" ADD CONSTRAINT "publication_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_review_id_project_id_fkey" FOREIGN KEY ("review_id", "project_id") REFERENCES "publication_reviews"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_version_id_project_id_fkey" FOREIGN KEY ("version_id", "project_id") REFERENCES "project_versions"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_documentation" ADD CONSTRAINT "project_documentation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_documentation" ADD CONSTRAINT "project_documentation_draft_id_project_id_fkey" FOREIGN KEY ("draft_id", "project_id") REFERENCES "project_drafts"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_documentation" ADD CONSTRAINT "project_documentation_version_id_project_id_fkey" FOREIGN KEY ("version_id", "project_id") REFERENCES "project_versions"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_documentation" ADD CONSTRAINT "project_documentation_asset_id_project_id_fkey" FOREIGN KEY ("asset_id", "project_id") REFERENCES "project_assets"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Qualification is deliberately outside the exposed public schema and the old
-- Profile role system. Only a trusted database administrator provisions it.
CREATE SCHEMA registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE registry_private.internal_operators (
  subject_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
ALTER TABLE registry_private.internal_operators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON registry_private.internal_operators FROM PUBLIC, anon, authenticated, service_role;
-- Unlike historical Profile fixtures, Registry identities must also be real
-- Auth subjects. These cross-schema FKs are maintained in SQL, not Prisma.
ALTER TABLE registry_private.internal_operators ADD CONSTRAINT internal_operators_auth_subject
  FOREIGN KEY (subject_id) REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.project_memberships ADD CONSTRAINT project_memberships_auth_subject
  FOREIGN KEY (subject_id) REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.projects ADD CONSTRAINT projects_shape CHECK
  (slug ~ '^[a-z][a-z0-9-]{2,62}$' AND revision > 0 AND authz_epoch > 0);
ALTER TABLE public.project_drafts ADD CONSTRAINT project_drafts_shape CHECK
  (revision > 0 AND jsonb_typeof(manifest)='object' AND jsonb_typeof(presentation)='object' AND jsonb_typeof(documentation)='array');
CREATE UNIQUE INDEX project_drafts_one_active ON public.project_drafts(project_id) WHERE state IN ('DRAFT','IN_REVIEW');
ALTER TABLE public.project_versions ADD CONSTRAINT project_versions_shape CHECK
  (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' AND content_hash ~ '^[a-f0-9]{64}$'
   AND hash_algorithm='JCS-SHA256-v1' AND jsonb_typeof(snapshot)='object');
ALTER TABLE public.project_releases ADD CONSTRAINT project_releases_shape CHECK
  (content_hash ~ '^[a-f0-9]{64}$' AND ((state='PUBLISHED' AND withdrawn_at IS NULL) OR
   (state='WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_at >= published_at)));
ALTER TABLE public.project_assets ADD CONSTRAINT project_assets_shape CHECK
  (source_digest ~ '^[a-f0-9]{64}$' AND (delivery_digest IS NULL OR delivery_digest ~ '^[a-f0-9]{64}$')
   AND size BETWEEN 1 AND 2097152 AND scan_revision > 0 AND length(storage_ref)>0 AND length(rights_ref)>0
   AND jsonb_typeof(provenance)='object' AND (state NOT IN ('VALIDATED','APPROVED') OR delivery_digest IS NOT NULL));
ALTER TABLE public.project_documentation ADD CONSTRAINT project_documentation_shape CHECK
  ((draft_id IS NULL) <> (version_id IS NULL) AND language IN ('zh','en') AND length(trim(title))>0 AND content_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX project_documentation_draft_asset ON public.project_documentation(draft_id,asset_id) WHERE draft_id IS NOT NULL;
CREATE UNIQUE INDEX project_documentation_version_asset ON public.project_documentation(version_id,asset_id) WHERE version_id IS NOT NULL;
ALTER TABLE public.project_memberships ADD CONSTRAINT project_memberships_shape CHECK
  (cardinality(roles)>0 AND array_position(roles,NULL) IS NULL AND revision>0);
CREATE UNIQUE INDEX project_memberships_one_owner ON public.project_memberships(project_id) WHERE roles @> ARRAY['OWNER']::public."ProjectRole"[];
ALTER TABLE public.publication_reviews ADD CONSTRAINT publication_reviews_shape CHECK
  (draft_revision>0 AND authz_epoch>0 AND policy_revision>0 AND snapshot_hash ~ '^[a-f0-9]{64}$'
   AND jsonb_typeof(asset_digest_set)='array' AND reviewer_id IS DISTINCT FROM submitter_id
   AND expires_at>created_at AND ((decision IN ('PENDING','INVALIDATED')) OR (reviewer_id IS NOT NULL AND decided_at IS NOT NULL)));

-- These invoker-only helpers are never RPC endpoints. They also serve the SQL
-- guards on privileged Prisma connections. No user_metadata/JWT role inference.
CREATE FUNCTION registry_private.eligible(subject uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM registry_private.internal_operators o WHERE o.subject_id=subject AND o.active AND o.expires_at>statement_timestamp());
$$;
CREATE FUNCTION registry_private.has_role(project uuid, subject uuid, required public."ProjectRole"[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT registry_private.eligible(subject) AND EXISTS(SELECT 1 FROM public.project_memberships m
 WHERE m.project_id=project AND m.subject_id=subject AND m.active AND m.roles && required);
$$;
-- RLS must look through the protected membership table without recursing.
-- This is the only SECURITY DEFINER helper: no caller-supplied subject, no writes,
-- non-exposed schema, fixed search_path and explicit grants.
CREATE FUNCTION registry_private.can_read(project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND registry_private.eligible(auth.uid()) AND EXISTS(
 SELECT 1 FROM public.project_memberships m WHERE m.project_id=project AND m.subject_id=auth.uid() AND m.active);
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA registry_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA registry_private TO authenticated;
GRANT EXECUTE ON FUNCTION registry_private.can_read(uuid) TO authenticated;

CREATE FUNCTION registry_private.guard_project() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
   NEW.revision := OLD.revision+1;
   NEW.updated_at := statement_timestamp();
   IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
     IF NEW.visibility='PRIVATE' THEN
       IF NEW.current_release_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.project_releases WHERE project_id=NEW.id AND state='PUBLISHED') THEN
         RAISE EXCEPTION 'Withdraw releases before making project private';
       END IF;
     ELSIF NOT EXISTS(SELECT 1 FROM public.project_releases WHERE id=NEW.current_release_id AND project_id=NEW.id
       AND state='PUBLISHED' AND visibility_at_approval=NEW.visibility) THEN
       RAISE EXCEPTION 'Visibility requires a release approved for that visibility';
     END IF;
   END IF;
   IF (NEW.visibility,NEW.archived_at) IS DISTINCT FROM (OLD.visibility,OLD.archived_at) THEN
     NEW.authz_epoch := OLD.authz_epoch+1;
   ELSIF NEW.authz_epoch NOT IN (OLD.authz_epoch,OLD.authz_epoch+1) THEN RAISE EXCEPTION 'Invalid authorization epoch'; END IF;
   IF NEW.archived_at IS NOT NULL AND (NEW.current_release_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.project_releases
       WHERE project_id=NEW.id AND state='PUBLISHED') OR EXISTS(SELECT 1 FROM public.project_drafts
       WHERE project_id=NEW.id AND state IN ('DRAFT','IN_REVIEW'))) THEN RAISE EXCEPTION 'Withdraw releases and archive drafts first'; END IF;
 END IF;
 IF NEW.current_release_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_releases r
   WHERE r.id=NEW.current_release_id AND r.project_id=NEW.id AND r.state='PUBLISHED') THEN RAISE EXCEPTION 'Invalid current release'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_project BEFORE INSERT OR UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION registry_private.guard_project();
CREATE FUNCTION registry_private.bootstrap_owner() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.project_memberships(project_id,subject_id,roles) VALUES(NEW.id,NEW.owner_id,ARRAY['OWNER']::public."ProjectRole"[]);
 RETURN NEW;
END $$;
CREATE TRIGGER registry_bootstrap_owner AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION registry_private.bootstrap_owner();

CREATE FUNCTION registry_private.guard_membership() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; candidate public.project_memberships;
BEGIN
 IF TG_OP='DELETE' THEN candidate:=OLD; ELSE candidate:=NEW; END IF;
 SELECT * INTO p FROM public.projects WHERE id=candidate.project_id FOR UPDATE;
 IF TG_OP='DELETE' AND candidate.subject_id=p.owner_id THEN RAISE EXCEPTION 'Owner membership cannot be removed'; END IF;
 IF TG_OP<>'DELETE' THEN
   IF (candidate.roles @> ARRAY['OWNER']::public."ProjectRole"[]) IS DISTINCT FROM (candidate.subject_id=p.owner_id)
      OR (candidate.subject_id=p.owner_id AND NOT candidate.active)
      OR cardinality(candidate.roles)<>(SELECT count(DISTINCT role) FROM unnest(candidate.roles) role) THEN RAISE EXCEPTION 'Invalid owner or duplicate roles'; END IF;
   IF TG_OP='UPDATE' THEN
     IF (NEW.project_id,NEW.subject_id) IS DISTINCT FROM (OLD.project_id,OLD.subject_id) THEN RAISE EXCEPTION 'Membership identity is immutable'; END IF;
     NEW.revision:=OLD.revision+1;
   END IF;
 END IF;
 -- Insert of the bootstrap owner needs no extra project update.
 IF TG_OP<>'INSERT' OR candidate.subject_id<>p.owner_id THEN
   UPDATE public.projects SET authz_epoch=authz_epoch+1 WHERE id=p.id;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_membership BEFORE INSERT OR UPDATE OR DELETE ON public.project_memberships FOR EACH ROW EXECUTE FUNCTION registry_private.guard_membership();

-- Revocation/reactivation cannot restore an approval bound to an earlier
-- qualification state. No global privileges are inferred from project roles.
CREATE FUNCTION registry_private.guard_operator() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Revoke internal qualification rather than deleting history'; END IF;
 IF NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN RAISE EXCEPTION 'Operator identity is immutable'; END IF;
 NEW.revision:=OLD.revision+1;
 UPDATE public.projects SET authz_epoch=authz_epoch+1 WHERE archived_at IS NULL AND id IN
   (SELECT project_id FROM public.project_memberships WHERE subject_id=NEW.subject_id);
 RETURN NEW;
END $$;
CREATE TRIGGER registry_guard_operator BEFORE UPDATE OR DELETE ON registry_private.internal_operators FOR EACH ROW EXECUTE FUNCTION registry_private.guard_operator();

CREATE FUNCTION registry_private.guard_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.projects; r public.publication_reviews; v public.project_versions; a public.project_assets;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registry history cannot be deleted'; END IF;
 SELECT * INTO p FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
 IF p.id IS NULL OR p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Active project required'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.project_id) IS DISTINCT FROM (OLD.id,OLD.project_id) THEN RAISE EXCEPTION 'Record identity is immutable'; END IF;
 IF TG_TABLE_NAME='project_versions' THEN
   IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Version is immutable'; END IF;
   SELECT * INTO r FROM public.publication_reviews WHERE id=NEW.review_id AND project_id=NEW.project_id;
   IF r.id IS NULL OR r.decision<>'APPROVED' OR r.expires_at<=statement_timestamp() OR r.authz_epoch<>p.authz_epoch
     OR r.snapshot_hash<>NEW.content_hash OR NOT registry_private.has_role(p.id,r.reviewer_id,ARRAY['REVIEWER']::public."ProjectRole"[])
     OR NOT EXISTS(SELECT 1 FROM public.project_drafts d WHERE d.id=r.draft_id AND d.revision=r.draft_revision AND d.state='IN_REVIEW') THEN RAISE EXCEPTION 'Current approved review required'; END IF;
 ELSIF TG_TABLE_NAME='project_drafts' THEN
   IF NOT registry_private.has_role(p.id,NEW.updated_by,ARRAY['OWNER','EDITOR']::public."ProjectRole"[]) THEN RAISE EXCEPTION 'Eligible editor required'; END IF;
   IF TG_OP='INSERT' AND (NEW.state<>'DRAFT' OR NEW.revision<>1) THEN RAISE EXCEPTION 'Initial draft required'; END IF;
   IF TG_OP='UPDATE' THEN
     IF OLD.state IN ('PUBLISHED','ARCHIVED') OR (OLD.state<>'DRAFT' AND
       (NEW.manifest,NEW.presentation,NEW.documentation) IS DISTINCT FROM (OLD.manifest,OLD.presentation,OLD.documentation))
       OR NOT ((OLD.state='DRAFT' AND NEW.state IN ('DRAFT','IN_REVIEW','ARCHIVED')) OR
               (OLD.state='IN_REVIEW' AND NEW.state IN ('DRAFT','PUBLISHED','ARCHIVED'))) THEN RAISE EXCEPTION 'Frozen draft or illegal transition'; END IF;
     NEW.revision:=OLD.revision+1;
     NEW.updated_at:=statement_timestamp();
   END IF;
 ELSIF TG_TABLE_NAME='publication_reviews' THEN
   IF NOT registry_private.has_role(p.id,NEW.submitter_id,ARRAY['OWNER','EDITOR']::public."ProjectRole"[]) THEN RAISE EXCEPTION 'Eligible submitter required'; END IF;
   IF TG_OP='INSERT' AND NEW.decision<>'PENDING' THEN RAISE EXCEPTION 'Review starts pending'; END IF;
   IF TG_OP='UPDATE' AND (OLD.decision<>'PENDING' OR NEW.decision='PENDING' OR
      (NEW.project_id,NEW.draft_id,NEW.draft_revision,NEW.authz_epoch,NEW.snapshot_hash,NEW.visibility,NEW.asset_digest_set,NEW.submitter_id,NEW.policy_revision,NEW.expires_at,NEW.created_at)
       IS DISTINCT FROM (OLD.project_id,OLD.draft_id,OLD.draft_revision,OLD.authz_epoch,OLD.snapshot_hash,OLD.visibility,OLD.asset_digest_set,OLD.submitter_id,OLD.policy_revision,OLD.expires_at,OLD.created_at)) THEN RAISE EXCEPTION 'Review binding is immutable'; END IF;
   IF NEW.decision<>'INVALIDATED' AND (NEW.authz_epoch<>p.authz_epoch OR NEW.expires_at<=statement_timestamp() OR
     NOT EXISTS(SELECT 1 FROM public.project_drafts d WHERE d.id=NEW.draft_id AND d.project_id=p.id AND d.revision=NEW.draft_revision AND d.state='IN_REVIEW')) THEN RAISE EXCEPTION 'Stale review'; END IF;
   IF NEW.decision IN ('APPROVED','REJECTED') AND NOT registry_private.has_role(p.id,NEW.reviewer_id,ARRAY['REVIEWER']::public."ProjectRole"[]) THEN RAISE EXCEPTION 'Eligible reviewer required'; END IF;
 ELSIF TG_TABLE_NAME='project_releases' THEN
   IF TG_OP='INSERT' THEN
     SELECT * INTO v FROM public.project_versions WHERE id=NEW.version_id AND project_id=p.id;
     SELECT * INTO r FROM public.publication_reviews WHERE id=v.review_id;
     IF v.id IS NULL OR NEW.state<>'PUBLISHED' OR NEW.content_hash<>v.content_hash OR NEW.visibility_at_approval<>r.visibility
       OR r.decision<>'APPROVED' OR r.expires_at<=statement_timestamp() OR r.authz_epoch<>p.authz_epoch THEN RAISE EXCEPTION 'Valid approved version required'; END IF;
   ELSE
     IF OLD.state<>'PUBLISHED' OR NEW.state<>'WITHDRAWN' OR (to_jsonb(NEW)-'state'-'withdrawn_at')<>(to_jsonb(OLD)-'state'-'withdrawn_at') THEN RAISE EXCEPTION 'Release can only be withdrawn once'; END IF;
     IF p.current_release_id=OLD.id THEN RAISE EXCEPTION 'Clear current release before withdrawal'; END IF;
   END IF;
 ELSIF TG_TABLE_NAME='project_assets' AND TG_OP='UPDATE' THEN
   IF NOT ((OLD.state='QUARANTINED' AND NEW.state IN ('VALIDATED','REJECTED')) OR (OLD.state='VALIDATED' AND NEW.state IN ('APPROVED','REJECTED')) OR (OLD.state='APPROVED' AND NEW.state='RETIRED'))
      OR (to_jsonb(NEW)-'state'-'delivery_digest'-'scan_revision')<>(to_jsonb(OLD)-'state'-'delivery_digest'-'scan_revision')
      OR NEW.scan_revision<OLD.scan_revision OR (OLD.state='APPROVED' AND NEW.delivery_digest IS DISTINCT FROM OLD.delivery_digest) THEN RAISE EXCEPTION 'Invalid asset lifecycle'; END IF;
 ELSIF TG_TABLE_NAME='project_assets' AND TG_OP='INSERT' THEN
   IF NEW.state<>'QUARANTINED' THEN RAISE EXCEPTION 'Assets start quarantined'; END IF;
 ELSIF TG_TABLE_NAME='project_documentation' THEN
   IF TG_OP='UPDATE' AND (OLD.version_id IS NOT NULL OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.draft_id IS DISTINCT FROM OLD.draft_id) THEN RAISE EXCEPTION 'Version documentation is immutable'; END IF;
   -- Sealed document references must be inserted in the sealing transaction.
   -- Later INSERTs would mutate the effective contents of an immutable Version.
   IF NEW.version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_versions sealed
     WHERE sealed.id=NEW.version_id AND sealed.project_id=p.id AND sealed.xmin=pg_current_xact_id()::xid) THEN
     RAISE EXCEPTION 'Version documentation must be sealed with its version';
   END IF;
   SELECT * INTO a FROM public.project_assets WHERE id=NEW.asset_id AND project_id=p.id;
   IF a.id IS NULL OR a.state<>'APPROVED' OR a.mime<>'text/markdown' OR a.delivery_digest<>NEW.content_hash THEN RAISE EXCEPTION 'Approved same-project markdown required'; END IF;
   IF NEW.draft_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_drafts d WHERE d.id=NEW.draft_id AND d.project_id=p.id AND d.state='DRAFT') THEN RAISE EXCEPTION 'Editable draft required'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['project_drafts','project_versions','project_releases','project_assets','project_documentation','publication_reviews'] LOOP
   EXECUTE format('CREATE TRIGGER registry_guard_record BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION registry_private.guard_record()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['projects','project_drafts','project_versions','project_releases','project_assets','project_documentation','project_memberships','publication_reviews'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY registry_internal_read ON public.%I FOR SELECT TO authenticated USING (registry_private.can_read(%I))',t,CASE WHEN t='projects' THEN 'id' ELSE 'project_id' END);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA registry_private FROM PUBLIC, anon, service_role;

COMMIT;
