# P1-B1 local validation — 2026-10-28 (Asia/Singapore)

Base: `0e13d32fdcfd1555172c7d93aa74c036466d0943`.
Disposable stack: `aig-platform-p1-final-b1-20261028`, PostgreSQL 17,
API/DB bound to 127.0.0.1:57321/57322. No production connection was loaded.
Migration SHA-256: `e697b7b16c93abf204836ff0cfb036999e5f1bf95016c3b0defd1ee10417ff89`.

| Verification | Result |
| --- | --- |
| main migration prefix → new Registry migration | Passed; all legacy table data snapshots unchanged |
| Failure injected immediately before migration COMMIT | Passed; Registry/private schema absent afterward, legacy data unchanged |
| Clean install, repeated deploy, checksum, eight RLS tables | Passed |
| Final migration metadata | 22 applied migrations, all local checksums match |
| Real database/JWT security regression | 8 suites / 63 assertions passed, no skip/TODO (before adding the final version-uniqueness assertion) |
| Final Registry suite | 13/13 passed with real Auth/PostgREST and privileged server command |
| Relevant unit and existing workflow contract tests | 6/6 passed |
| Full lint and TypeScript | Passed |
| Prisma validate | Passed with unused loopback-only URL placeholders |
| Supabase local DB lint, registry_private | No schema errors |
| Synthetic Auth accounts and Registry projects after suite cleanup | 0 / 0 |

The full unit run initially exposed an existing workflow text contract; the workflow
now retains that original command verbatim and its complete contract suite passed.
No existing test assertion or P1-A gate was weakened. Final PR CI is authoritative
for complete tests on the committed SHA, including the additional uniqueness
assertion. Local browser tests were not run. Owner separately authorized only this
PR's existing GitHub Actions isolated browser/E2E gates.

Raw local logs and JWT-bearing stack output stay in ignored test-results and are
not committed. The PR reports committed SHA and CI links separately. Operational
limitations, rollback and P1-B2 handoff are in registry-foundation.md.
