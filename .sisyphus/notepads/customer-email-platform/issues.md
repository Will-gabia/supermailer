# Issues

- 2026-03-20: `git worktree` cannot be used because `/Users/will/Jobs/projects/labs/supermailer` is not a git repository; `worktree_path` is set to the workspace root for this session.

- 2026-03-20: `pnpm --filter @supermailer/does-not-exist test` reports no matching projects but in this pnpm version did not surface a non-zero exit via shell checks, so the fast-fail scenario should be revisited if strict exit-code enforcement is needed later.

- 2026-03-20: Browser scaffold QA surfaced a missing `favicon.ico` request at `http://localhost:5173`; resolved by explicitly defining a favicon in the HTML head.
- 2026-03-20: The required `-- send-state-machine` and `-- terminal-state-monotonicity` Vitest selectors are substring filters, so matching tests in multiple files run; test names should keep those unique tokens intentional to avoid accidental cross-file scope broadening.
- 2026-03-20: `@supermailer/testing` helpers used by app integration tests require explicit TS project references from consuming apps, otherwise build-mode `rootDir` / file-list errors surface during diagnostics and typecheck.
- 2026-03-20: `apps/mail-worker/src/queue/primitives.ts` currently uses an `as unknown as` cast around `queue.add.bind(queue)` to satisfy BullMQ typing; verification passed, but future delegates should avoid expanding that pattern unless necessary.

- 2026-03-20: Initial `docker compose up -d` failed because host ports `5432` and `6379` were already allocated by unrelated local containers; the harness was adjusted to deterministic high ports `15432` and `16379` to keep agent execution reproducible.

- 2026-03-20: Hono route-level `use('*', admin middleware)` on the shared `/api` prefix intercepted external API-key endpoints and returned admin-session `401` responses; attaching admin auth middleware per protected admin route avoids that route-shadowing bug.

- 2026-03-20: Simply swallowing the `/api/auth/session` error was insufficient for browser QA because the app stayed rendered on `/subscribers`; the unauthenticated catch path still needs a client-side redirect to `/login` even when the session endpoint stops returning `401`.

- 2026-03-20: Existing `subscriber-sync` API-key integration coverage still posts only `{ source: "crm" }`; the external sync endpoint must preserve that legacy accepted response when no `endpointUrl` is supplied, otherwise unrelated auth-scope tests fail.
- 2026-03-20: Local ad hoc repro using Ruby WEBrick was unreliable because this environment lacks the bundled `webrick` gem, so `data:` URLs were a more dependable zero-dependency sync source for Playwright verification.

- 2026-03-20: Cleaned up accidental scope drift in Task 7. Development on Task 7 unintentionally pulled in routing rules artifacts (e.g. `e2e/routing-rules.spec.ts`) intended for Task 8. Removed these files and reverted unintended logging additions in the frontend App to preserve strictly the template-related flow required by Task 7.

- 2026-03-20: pnpm --filter @supermailer/management-console test:integration -- routing-rule-versioning matches multiple integration files under Vitest substring filtering, so the integration config now needs longer hook/test timeouts for container-backed suites to stay stable.
- 2026-03-20: `pnpm playwright test e2e/send-flows.spec.ts` initially failed when reusing existing dev servers because stale `NODE_ENV=development` server state caused send-flow API failures and data collisions; disabling `reuseExistingServer` in Playwright config forced clean test-server boot for deterministic results.
- 2026-03-20: Send-flow e2e also surfaced persistent-data collisions (duplicate subscriber/template names); the test now uses unique per-run identifiers to avoid false negatives from prior local runs.
- 2026-03-20: `apps/mail-worker` integration selectors still execute multiple files due to Vitest substring filtering; setting longer hook/test timeouts plus serial file execution avoids flaky container startup timeout failures during targeted command runs.
- Removed stray patch artifacts (`.orig`, `.patch`, `.rej`) in `apps/management-console/src/server/routes/` that were causing code-quality blockers.
- 2026-03-20: `apps/mail-worker/src/index.integration.test.ts` originally only asserted the configured port value, which let the health-endpoint gap slip through without proving any server was listening.
- 2026-03-20: After switching shared package `main` to built JS outputs, app-level Vitest started failing module resolution (`@supermailer/config`, `@supermailer/contracts`, `@supermailer/testing`) until absolute `resolve.alias` entries were added in each app Vitest config.
- 2026-03-20: Hono static serving middleware returned HTTP 500 in tests when middleware flow did not return `next()`/middleware promise; explicit `return next()` and `return staticMiddleware(...)` fixed the non-finalized context error.
- 2026-03-20: Runtime verification showed `pnpm build` passing while compiled starts failed with `ERR_MODULE_NOT_FOUND` because emitted ESM preserved extensionless relative imports (`./app`, `./queue/health`) that Node does not resolve without explicit suffixes.
- 2026-03-20: Runtime verification also confirmed management-console static root mismatch (`dist/client` expected vs actual Vite output `dist/index.html` + `dist/assets/*`), requiring server path correction to avoid broken SPA serving in production.
- 2026-03-23: `pnpm playwright test` initially failed before any UI assertions because local Postgres was not running on `15432`; bringing up `docker compose up -d` was required before browser verification.
- 2026-03-23: The first pass of the Korean dashboard broke Playwright by changing visible labels and DOM structure without updating accessibility hooks, especially on the login form and template editor; adding `aria-label` support and refreshing the E2E contract fixed the regressions.
- 2026-03-23: Subscriber sync E2E cannot assume deterministic `created` counts across reruns because the local database persists synced subscribers between tests; assertions should focus on processed/failure totals and visible subscriber outcomes unless the test resets state first.
- 2026-03-23: Migration files in this repo require `--> statement-breakpoint` markers for the custom SQL splitter; comment-style lint hooks can flag them, but they are required for migration execution and should be kept.
- 2026-03-23: Group-management Playwright selectors became ambiguous once inline edit/delete icon buttons reused the group name; adding explicit `aria-label` values for membership and group actions made the new UI testable without weakening coverage.
- 2026-03-23: Group-based campaign sends can overcount preview totals if the UI does not deduplicate subscribers across multiple selected groups; using normalized-email dedupe in the enqueue layer keeps actual send counts stable even when memberships overlap.
- 2026-03-23: If send provenance is stored as only group IDs, later group rename/delete operations make the send history harder to interpret; snapshotting group names on the send row avoids that historical ambiguity.
- 2026-03-23: Adding a new `useEffect` below early login/loading returns in `App.tsx` caused a runtime Hook-order regression that static diagnostics missed; send-list filtering state must stay declared before any conditional return paths.
- 2026-03-23: Query-string E2E assertions are less brittle when they inspect `URL.searchParams` values instead of matching the full encoded URL string, especially for email addresses containing `@`.
- 2026-03-23: Subscriber deep links should only persist display-level tab state (`tab`) because preserving edit mode or sync form values across refresh would make the page reopen in misleading partially edited states.
- 2026-03-23: Template query hydration must wait until the template list has loaded at least once; otherwise `/templates?template=...` can be cleared too early by an invalid-id fallback before the server data arrives.
- 2026-03-23: The `/api-keys` pathname behaved poorly for refresh/deep-link verification because it looked API-like in the local stack, so moving the UI route to `/access-keys` was the safer way to make query restoration real without touching the actual `/api/api-keys` backend endpoint.
