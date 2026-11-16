# Overnight sequential work, 2026-11-15

This note records the order and rules for the sequential work that follows the unmerged dependency branch `claude/deps-security-20261115`.

## Order

1. Dependency advisory pull request. Required checks must be green on that pull request's exact head before later work is treated as unblocked. CI repairs stay on `claude/deps-security-20261115`, at most two rounds. No other commits belong on that branch.
2. Create qualification on `GET /qualifications`: add `create: { expiresAt } | null` to `qualificationsDTOSchema`, derived from the internal operator `can_create` and `expires_at`. Sync the registry query contract, related docs, and the developer-console mirror. Show the create form only when that read confirms a create qualification, and remove the copy that said eligibility is decided on submit.
3. Database hardening migration only when the repository already contains a specific written design that names the exact change. Otherwise record the gap and continue. A new migration must also update `prisma/rls.sql`. Do not edit already-applied historical migrations. Do not run the migration against a shared database.
4. Review, in order: chat, tool quotas, and the Agent state machine. Fix only clear defects that can be validated. Distinct fixes get their own branch and pull request. Leave decisions that need the Owner unfixed.
5. Closing handoff under `docs/handoffs/` with what completed, pull request URLs, CI results, blockers, and what waits for the Owner.

## Branch and pull request rule

Later work is branched from the latest head of `claude/deps-security-20261115`, including CI-fix commits, not from `main`. Each item uses its own branch and pull request. Until the dependency pull request merges, later pull requests use the previous item's branch as their base. Do not merge any pull request.

## CI completion rule

An item is done only when its pull request exists and required CI is green on that pull request's exact head. After at most two repair rounds, stop that item, record the cause, and do not keep iterating. Do not start later items that depend on a dependency upgrade whose required checks are still failing.

## Forbidden

- Do not touch production databases, run production migrations, deploy, restore, or change production.
- Do not assume a current production backup. Production backups, Registry feature flags, production migration, and browser acceptance stay with the Owner.
- Do not start or connect a local browser, take screenshots, or run local end-to-end or visual tests. Remote CI browser gates stay in place.
- Do not merge a pull request, enable auto-merge, or change branch protection or required checks.
- Do not weaken, skip, or delete existing assertions, CI gates, or security checks.
- Do not add attribution or signatures in commits, pull requests, or docs. Public pull request text states the problem, the resulting behavior, and the validation, and separates local results from CI.
- Do not rewrite published history or edit another contributor's active UI scope beyond the create-form condition described above.
- Do not put secrets, credentials, personal information, account information, location information, or production-internal operational details into the repository, commits, or pull request bodies.
- Do not start a Prisma 7 upgrade or otherwise expand the remaining `deepmerge-ts` advisory unless that is required to keep the dependency pull request green.
