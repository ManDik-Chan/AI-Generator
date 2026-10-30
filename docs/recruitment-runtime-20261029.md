# Recruitment runtime delivery — 2026-10-29

Branch: `codex/recruitment-demo-runtime-20261029`, based on `origin/main` at `0e13d32fdcfd1555172c7d93aa74c036466d0943`.

## Verified results

- Node 22.23.1 / pnpm 11.7.0; frozen install and Prisma Client generation pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` pass. Initial Google Fonts fetch timeouts recovered without changing typography or UI.
- `pnpm test -- --no-file-parallelism`: 150 files / 863 tests pass; 7 integration files / 51 tests skipped without explicit database environment.
- Existing local disposable Supabase project `aig-platform-p1-final-20261028` restored without reset or migrations. Auth, REST and Storage health pass. Database and API ports bound to loopback only (56432 / 56431). Existing data retained; test fixtures clean up their own synthetic accounts.
- `node scripts/run-local-security-stage.mjs integration D:/AIGC/platform-p1-final-isolated-20261028`: final 7 suites / 51 real integration tests pass, including RLS, ownership, private Storage, usage ledger and memory transactions. Initial 49/51 result occurred during environment recovery; after gateway/database binding and routed health checks completed, unchanged tests passed. This is local evidence, not cloud security acceptance.
- `pnpm demo:preflight -- --provider`: real remote GLM Provider streamed a nonempty answer (37 chunks in initial probe). Prisma read-only connectivity and Supabase Auth health pass. No mock AI service used.
- `pnpm demo:smoke`: HTTP end-to-end passes in development and production (`next start`) modes against local Next.js and isolated Supabase with real Provider: rendered Next.js login server-action form submitted over HTTP (signIn/ensureProfile), issued auth cookies sent to actual app routes, new conversation, chat SSE `conversation/turn/delta/done`, exact persisted assistant content, two fresh history bootstrap requests, authenticated history page, summary SSE and persisted ToolRun, token refresh, sign-out, anonymous 401/protected-page redirect, invalid-input 400. Synthetic account removed afterward.
- Browser automation remains disabled by the original workspace AGENTS.md. This does not certify rendered login forms, UI refresh behavior, visual error presentation, or browser cookie lifecycle.

## What changed

- Added read-only `demo:preflight` with an optional real Provider call. Rejects loopback/mock Provider configuration and prints no configuration values or raw SDK errors.
- Added browser-free `demo:smoke`. It refuses remote database, Auth or app targets and requires `DEMO_DISPOSABLE_DATABASE=true`. Only the existing real business endpoints generate answers; no success fixtures are injected.
- Fixed both GitHub workflow diagnostic steps when initialization fails before `E2E_SENSITIVE_VALUES_FILE` reaches `GITHUB_ENV`. Preserves redaction and fail-closed artifact upload. Observed in PR #29 run 40703981933. No tests weakened. Related redaction/integration-runner tests: 11/11 pass. Windows Prisma regeneration briefly encountered an engine DLL lock while the dev server was running; stopping that owned server and rerunning the install/checks/build resolved it. Stop the local server before regenerating Prisma.
- Disabled Vercel Git deployment for this branch to honor the owner's latest instruction not to deploy. Other branches' configuration preserved.
- Repository Description and Topics updated to describe existing capabilities. Existing Homepage retained because no new online demo was validated.

## Local demonstration

Worktree: `D:/AIGC/recruitment-demo-runtime-20261029`. App: `http://127.0.0.1:3029`.

The ignored `.env` supplies the existing real Provider configuration and isolated local database/Auth defaults (production DB/Auth credentials were replaced only in this worktree). The ignored `.env.local` supplies only the isolated local database/Auth configuration, `NEXT_PUBLIC_SITE_URL`, `DEMO_BASE_URL` and `DEMO_DISPOSABLE_DATABASE=true`. Never copy original workspace `.env.local` blindly: it selected `playwright-mocked-model` and a loopback Provider, overriding real AI configuration.

```powershell
pnpm demo:preflight
pnpm demo:preflight -- --provider # Sends one real, billable Provider request
pnpm build
pnpm start --hostname 127.0.0.1 --port 3029
# In another terminal, with the same ignored runtime configuration:
pnpm demo:smoke # Creates/deletes only its own synthetic local account and records
```

Use a local Supabase account at `/login`, open `/chat`, send a message, refresh its conversation, then run `/tools/summarize`. The smoke account is ephemeral and cannot be reused for interactive sign-in. Local Auth settings confirm sign-up enabled and email autoconfirm enabled; use `/register` to create your personal local demo account, then `/login`. Configure credentials privately; do not commit them.

## Cloud / release blockers

- **No deployment authorized** under the latest owner instruction. No Preview or Production deployment initiated. No merges performed; PR #29/#30 remain separate.
- Cloud `AI-Generator-Preview` is INACTIVE independently of Docker. It was not resumed or modified. Vercel Preview configuration lacks `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` and the base Provider settings. Production values were not copied, overwritten or exposed.
- Vercel has deployment authentication protection enabled. No protection, RLS or Auth policy was relaxed.
- The production-connected database was inspected read-only: connectivity works, 15 applied migrations, protected business tables have RLS enabled; `app_settings` and `model_configs` have no anon SELECT grant. Local disposable database has 21 applied migrations. **Do not deploy this branch to that database without separately reviewing migration compatibility.** No production mutation or migration performed.
- Cloud Auth redirect allowlist, cloud RLS/Storage policies, production browser flows and online full-stack behavior remain unaccepted. Successful local security tests cannot substitute for them.
- Targeted public-repository scan: only `.env.example` tracked; no `.env`/`.env.local`/`.env.production` commits found in available Git history. Targeted scan of 642 tracked files for private keys and common secret-token patterns found no matches. GitHub secret-scanning alert list empty at inspection; secret scanning and push protection enabled. This is not an exhaustive historical secret audit.

## Integration with Claude

No Landing, Workspace, design system, visual component, typography or README edits. Runtime additions live in `scripts/`, `package.json`, workflow failure handlers, this report and a branch-scoped Vercel entry. Potential shared edits: package scripts, workflow files and vercel.json. Merge these small additions by key/hunk; keep Claude's UI changes. Owner reviews this Draft PR and PR #30 separately. PR #29 registry work is not required for the demonstrated chat/summary path and was not merged.
