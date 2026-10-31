# Engineering collaboration

These rules apply to Codex, Claude and other contributors working in this repository.

- Use an isolated branch/worktree from current main for each agreed scope. Do not rewrite published commit history, merge main or deploy without the Owner's authorization.
- Keep backend contracts and frontend ownership explicit. Put interface changes, error codes, authorization semantics and known gaps in a separate handoff document. Do not edit another contributor's active UI scope without coordination.
- Public PR titles and descriptions must be professional, objective and concise. Describe the problem, resulting behavior and relevant validation. Do not add unsolicited AI attribution or signatures.
- Preserve material security risks, unverified behavior and necessary test evidence. Identify the exact tested head, separate local results from CI results, and do not claim acceptance for skipped or pending checks.
- Preserve required CI, real database/security acceptance and browser gates. Do not weaken accepted assertions or expand skips to make a change pass. Prefer completing local checks before pushing to avoid repeated full CI runs.
- Never use production Supabase or production migrations for local verification. Use guarded, disposable local infrastructure and keep secrets and raw sensitive test artifacts out of commits and PRs.

## Local browser automation

The Owner's existing suspension of local browser automation remains in effect until explicitly restored. Do not launch or connect to local browsers, capture screenshots/video, or execute local browser/E2E/visual tests on the basis of a generic development or testing request. Preserve required remote CI browser gates. Report local browser verification as unperformed, with the reason. Restoration must include resource ownership, a single controlled instance and reliable cleanup; do not terminate the user's browser processes.
