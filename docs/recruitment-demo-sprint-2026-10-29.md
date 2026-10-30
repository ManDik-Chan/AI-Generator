# Recruitment Demo Sprint — 2026-10-29

> Scope: isolated demo branch only. Preserve existing business code and security constraints.

## Tonight's objective

Prepare a **working, presentable, truthful** recruitment demo, not a full platform launch. An interviewer should understand the product and complete one real interaction within three minutes.

## Must-have journey

Landing → Login → Workspace → AI Chat → one successful result. Where environment credentials are available, demonstrate one additional real tool (summarize / rewrite / translate). If accounts or services cannot be safely enabled publicly, provide a clearly labeled read-only **preview**, not a fake AI request or fabricated success.

## Claude implementation scope

1. Work on branch `demo/recruitment-20261029` based on the current `main`. Never merge into `main` automatically.
2. Inspect existing `app/(marketing)/page.tsx`, `features/landing`, `app/(platform)/workspace/page.tsx`, `features/home`, `app/chat` and `app/tools`. Reuse working pages; avoid rebuilding functional UI.
3. Visual direction: editorial/product-design quality; paper/charcoal neutral palette, restrained emerald accent, excellent typography/spacing, clean grid and strong mobile layouts. No generic purple-blue gradients, fake glass cards, glowing borders, unnecessary animations.
4. Fix visual defects and broken responsive behavior first. Preserve the existing landing design where usable; do not introduce a new complex motion system that jeopardizes the deadline.
5. Keep landing, login, workspace and core navigation visually consistent. Real features must use existing routes. Features not ready must be labeled `开发中`, not clickable fake workflows.
6. Never change Prisma migrations, database schema, Supabase RLS, grants, Provider plumbing, authentication policy, production environment variables or production data.
7. Avoid modifying `README.md` while the documentation PR is active; focus on screenshots and a short demo acceptance report.
8. Use existing Node 22 and pnpm 11.7.0. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`; targeted tests for changed areas. Report any existing unrelated failures separately, without concealing them.
9. If deployment is possible, use **Vercel Preview**. Do not deploy production, modify production secrets or main branch without owner's approval.
10. Collect **real** screenshots from the actual running app after completion: landing desktop/mobile, workspace desktop, and a real chat or tool result. Never present mockups as production screenshots.

## Acceptance checklist

- [ ] Landing loads without visible errors on desktop and mobile
- [ ] Login or truthful preview available, with no exposure of private data
- [ ] Workspace links lead to actual pages, disabled features clearly disclosed
- [ ] One end-to-end flow tested with real response and no dummy output
- [ ] No secrets in repository, screenshots or logs
- [ ] Lint, typecheck and build results recorded, including failures
- [ ] Preview URL or local demonstration URL recorded
- [ ] Three actual screenshots captured
- [ ] PR created for owner review, **never auto-merge**

## Stop conditions

If external services, migration acceptance or credentials block live AI, do not lower security boundaries to get a passing demo. Ship a polished noninteractive preview with prominent disclosure, and explain what needs to be configured for the live path.

## Delivery report

Return: branch, commit SHA, PR URL, preview/local URL, completed routes, real end-to-end test outcome, responsive screenshots, verification commands/results, outstanding blockers, and exact owner actions. No vague 'done' claims.
