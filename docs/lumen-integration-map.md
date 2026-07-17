# Lumen integration map

> Phase 6B3 — Draft. This map was created before implementation. It treats the production repository as the only source of business truth and the Lumen ZIP as a visual reference only.

## 1. Source and safety audit

Audited attachment: `ai-generator-lumen-preview.zip`

| Item | Result |
|---|---|
| Archive entries | `index.html`, `screenshots/desktop.png`, `screenshots/mobile.png` |
| Prototype type | Standalone static HTML/CSS/JavaScript |
| Package manifest or executable scripts | None |
| `src`, `app`, `components`, `public`, `assets`, or `styles` directories | None |
| Fonts | No font files and no external font download |
| Icons | Inline SVG symbol sprite inside `index.html` |
| Images | Two reference screenshots only: desktop 1440 × 1000 and mobile 390 × 844 |
| Secrets, environment files, build output, database, or mock server | None |
| Executed from archive | Nothing |
| Files eligible for direct production copy | None required; visual language is reimplemented with repository components and Lucide icons |

The archive was expanded only into a repository-external audit directory. The ZIP, extracted HTML, screenshots, mock data, simulated timers, and prototype JavaScript must not be committed.

## 2. Lumen prototype inventory

### 2.1 Pages and layouts

- Global desktop shell: 252 px sidebar, 72 px top bar, remaining-width content canvas.
- Global mobile shell: compact top bar, drawer navigation, full-width stacked content.
- Control center / home.
- AI chat with conversation rail, header, message scroller, composer, and assistant selector.
- Persona gallery.
- Long-term memory manager.
- Text tool workspace.
- Image understanding workspace.
- Image generation workspace.
- Four-worker multi-Agent brainstorm workspace.
- Unified run history.
- Account and privacy page.

### 2.2 Navigation and overlays

- Grouped desktop sidebar: Workspace, Creation Lab, System.
- Mobile sidebar overlay opened from the top bar.
- Search / command modal opened from the top bar or `Ctrl/Cmd + K`.
- Profile control and theme control.
- No production-ready dropdown, dialog, sheet, or routing primitive exists in the ZIP; these are visual mock interactions and must map to repository primitives.

### 2.3 Reusable visual components

- Brand mark and wordmark treatment.
- Eyebrow / kicker labels and page headings.
- Glassy panel, raised panel, subpanel, chips, badges, icon tiles, status dots, and progress bars.
- Hero orbit visual and capability labels.
- Quick-start cards, recent-conversation cards, persona cards, memory rows, tool cards, history rows.
- Selects, text fields, textareas, segmented filters, toggles, primary/secondary/icon buttons.
- Chat bubbles, assistant/user avatars, typing state, copy action, and composer.
- Worker rows, worker states, synthesis sections, empty states, and toasts.

### 2.4 Prototype design language

- Dark-first near-black canvas with translucent navy panels.
- Violet primary accent, cyan secondary accent, mint success, amber warning, and pink destructive state.
- Thin low-contrast borders, restrained glow, 12/18/26 px visual radius hierarchy.
- Dense desktop information architecture with generous content canvas rather than a narrow centered column.
- Mobile layout preserves the same hierarchy through stacking and progressive disclosure.
- CSS animation is used for orbit, float, aurora, loading, and panel transitions; no animation library is required.

## 3. Production route inventory

All routes below remain backed by the existing Supabase, Prisma, API route, and Server Action implementation.

| Route | Current production entry | Primary real source | Loading/error/empty state |
|---|---|---|---|
| `/` | `HomeDashboard` | authenticated profile and latest conversation | Suspense cards; honest empty recent state |
| `/login` | `AuthForm` | Supabase Auth Server Action | configuration, registration, and action errors |
| `/register` | `AuthForm` | Supabase Auth Server Action | validation and action errors |
| `/chat` | `ChatLayout` | `Conversation`, `Persona`, chat API/SSE | AI configuration, stream, recovery, empty state |
| `/chat/[conversationId]` | `ChatLayout` | owned `Conversation` and `Message` records | route loading/error/not-found |
| `/personas` | `PersonaList` | owned active `Persona` records | route error/loading and empty state |
| `/personas/new` | `PersonaCreation` | Server Action plus optional `GenerationRun` draft | validation, generation, and configuration states |
| `/personas/[personaId]` | detail and avatar workflow | owned `Persona`, `GeneratedImage`, private Storage | not-found, saved, generation states |
| `/personas/[personaId]/edit` | `PersonaForm` | owned `Persona` Server Actions | validation/not-found |
| `/personas/trash` | `PersonaTrashList` | archived owned `Persona` records | empty state and restore action |
| `/memories` | `MemoryManager` | owned `Memory`, `MemoryEmbedding`, Persona scope | loading, empty, mutation errors |
| `/tools` | tools index | owned recent `ToolRun` records | honest empty recent state |
| `/tools/summarize` | `ToolPage` | `ToolRun` and text provider route | streaming, cancel, recovery, quota |
| `/tools/rewrite` | `ToolPage` | `ToolRun` and text provider route | streaming, cancel, recovery, quota |
| `/tools/translate` | `ToolPage` | `ToolRun` and text provider route | streaming, cancel, recovery, quota |
| `/tools/image` | `ImageAnalyzer` | `ToolRun`, `ToolAsset`, private Storage, vision provider | configuration, upload, cancel, recovery, quota |
| `/tools/image-generate` | `ImageGenerationWorkspace` | `ToolRun`, `GeneratedImage`, private Storage, image provider | configuration, cancel, recovery, gallery |
| `/tools/brainstorm` | `BrainstormWorkspace` | `ToolRun`, four `BrainstormWorker` rows, provider | partial failure, cancel, recovery, quota |
| `/tools/history` | `ToolHistory` | owned retained `ToolRun` records and assets | filters, pagination, empty state |
| `/account` | account page | Supabase user and Prisma `Profile` | route loading |
| `/admin` | admin page | server-side `requireAdmin`, Prisma | current honest empty state; real admin views are a Phase 6B3 gap |
| API routes | `app/api/**/route.ts` | authenticated, owner-scoped server services | structured HTTP/SSE errors |
| Global states | `app/loading.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` | App Router boundaries | retained and restyled |

## 4. Prototype-to-production mapping

| ZIP prototype page/component | Production route/component | Integration method | Real data source | Gap or constraint |
|---|---|---|---|---|
| Control center | `/`, `HomeDashboard` | Rebuild hero, orbit, quick start, recent work, and full entry grid | profile, latest conversation, route links | Prototype fake counts are omitted; real aggregate counts may be added only from Prisma |
| Desktop sidebar | `DesktopSidebar` | Adopt grouping, density, active rail, account card, and responsive widths | shell viewer profile and role | Add every real feature entry, with admin role gate |
| Mobile sidebar/top bar | `MobileHeader`, `MobileNavigation` | Use an accessible Sheet/drawer and compact command/search affordance | route tree and shell viewer | Bottom navigation remains available outside Chat only |
| Command palette | new navigation client island | Map commands to real internal routes only | static route catalogue | No fake notification or fake search result |
| AI chat | `/chat`, `/chat/[conversationId]`, `ChatLayout` | Re-skin header/history/messages/composer; isolate mobile viewport | owned conversations/messages, chat SSE, recovery status | Mobile Safari viewport and scroll anchoring are blocking work |
| Conversation rail | `ConversationList` | Lumen recent-row treatment; dynamic links keep `prefetch={false}` | owned conversation summaries | Deletion remains confirmed and functional |
| Persona gallery | `/personas`, `PersonaList` | Lumen cards with real avatar/name/description/actions | owned personas | No fake category or recent-use values |
| Persona builder | `/personas/new`, edit/detail routes | Apply Lumen field and panel system without changing mutations | Server Actions, GenerationRun, private avatar Storage | Generated avatar is never auto-applied |
| Memory manager | `/memories`, `MemoryManager` | Lumen filter/search/list treatment | owned memory records and semantic state | Preserve global/persona scopes and enabled state |
| Text tools | `/tools/*`, `ToolPage`, `ToolRunner` | Lumen card selector and two-pane workspace | ToolRun API/SSE and quota | Results are real and never simulated |
| Image understanding | `/tools/image`, `ImageAnalyzer` | Lumen upload/result workbench | ToolAsset and vision API | Private signed access only |
| Image generation | `/tools/image-generate`, `ImageGenerationWorkspace` | Lumen form, real state, one-image result, and gallery | ToolRun, GeneratedImage, signed URLs | Prototype fake percentage is replaced by honest stages/status |
| Four-agent brainstorm | `/tools/brainstorm`, `BrainstormWorkspace` | Lumen worker rows/cards, mobile role disclosure, synthesis result | four durable workers plus one coordinator | Exactly four workers; maximum five provider calls; no Vibe Coding |
| Run history | `/tools/history`, `ToolHistory` | Lumen filters and rows with open/copy/download/delete | retained owned ToolRun rows/assets | Dynamic detail links do not prefetch in bulk |
| Account/privacy | `/account` | Lumen profile, theme, role, sign-out, memory and privacy explanation | Supabase user and Profile | Only implemented controls are interactive |
| Admin | `/admin` | Extend Lumen panels with real users/roles/usage/system state | Prisma plus server-side admin gate | Must not invent charts; privileged mutations need explicit validation |
| Modal/Sheet | `Dialog` and mobile overlay primitives | Keep portal, focus, escape, collision, nested scroll lock | local UI state only | Restore document scroll without iOS jump |
| Dropdown | `Dropdown` | Keep portal/collision/flip/viewport padding | local UI state only | Long email and touch validation required |
| Toast | `Toast` | Apply Lumen visual tokens and safe-area/composer avoidance | transient local feedback | No business truth stored in toast state |

## 5. Functional completeness checklist

Legend: **Preserve** = business behavior already exists and must survive; **Revise** = Phase 6B3 UI/architecture work; **Gap** = real capability required by the request but not yet complete at audit time.

### Home and global navigation

- Preserve: new chat, latest conversation, Persona, Memory, Tools, image understanding, image generation, multi-Agent, tool history, Account.
- Revise: desktop grouping, mobile all-feature access, route feedback, command palette, Lumen layout.
- Gap: explicit role-gated Admin entry is not present in the main navigation.
- Gap: real aggregate overview data is not shown; fake prototype statistics must not be copied.

### Chat

- Preserve: new/history/persona selection, edit-and-resubmit, explicit stop, durable recovery, error recovery, delete, Markdown/GFM/code, scroll-to-bottom.
- Revise: Lumen appearance, mobile history Sheet, independent mobile visual viewport, composer auto-grow, safe area, scroll anchor.
- Gap: add a clear image-tool entry without pretending Chat supports an unsupported attachment payload.

### Persona

- Preserve: list/new/edit/archive/trash/restore, AI draft, avatar candidates, explicit Apply, current avatar, default assistant chat.
- Revise: Lumen gallery, forms, dialogs, empty/error/loading states, mobile entry.

### Memory

- Preserve: list/search/filter/edit/delete/enable, automatic memory state, global/persona scope, empty/error states.
- Revise: Lumen rows, controls, mobile sheet/dialog behavior.

### Tools and history

- Preserve: summarize/rewrite/translate/image understanding/image generation/brainstorm/history, re-create, delete, download, copy, explicit stop, recovery, quota.
- Revise: Lumen workspaces, honest status visualization, mobile layouts, unified run presentation.
- Gap: ensure every history action is visibly discoverable at mobile widths.

### Account and Admin

- Preserve: user identity, email, role, sign-out, theme, security and privacy explanations.
- Revise: Lumen profile/privacy panels and accessible long-value wrapping.
- Gap: Admin currently exposes no real users, role, usage, or system-status view. Phase 6B3 may add read-only real views and carefully bounded role actions without schema changes.

### Cross-cutting states

- Preserve: App Router loading/error/not-found boundaries; server-side ownership and role checks.
- Revise: Lumen empty/error/loading/permission treatment, accessible focus, reduced motion, 200% zoom, touch targets, safe-area toasts, dialog and dropdown primitives.
- Gap: automated viewport matrix and mocked VisualViewport keyboard coverage are incomplete.

## 6. Explicit non-mappings

- Prototype mock users, conversations, messages, Worker outputs, usage counts, images, timers, percentages, notifications, localStorage state, and hard-coded successes are not integrated.
- Prototype buttons that have no production behavior are either mapped to a real route/action or omitted/disabled with an explanation.
- The prototype brand treatment informs the Lumen visual language, but existing `favicon.ico`, `icon.png`, `apple-icon.png`, product name, and licensed repository assets remain authoritative.
- Phase 7A2, Vibe Coding, code execution, Shell/file-writing agents, unbounded agents, new queues, and new backends are outside Phase 6B3.

