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
- 2026-03-23: README drifted from `OPERATIONS.md` by showing `compose.production.yml` startup without `--env-file .env.production`, which could mislead operators into a failing production bring-up path.
- 2026-03-23: E2E command wording had drifted across docs (`pnpm e2e` vs `pnpm playwright test`), which made the same verification step look like two different workflows even though the repo already exposes a single root script.
- 2026-03-23: README and OPERATIONS had partially aligned production commands but still differed in how explicitly they described `build`, `up`, and `ps` order, which could make operator runbooks look inconsistent even when they targeted the same compose file.
- 2026-03-23: `e2e/send-flows.spec.ts` drifted after the subscriber page moved to a group-first layout; the test still searched for the old labeled group-creation controls (`새 그룹 이름`, `그룹 추가`) while the live UI exposed placeholder-based input plus an exact `추가` button.
- 2026-03-23: Moving the product boundary to send-only left a large amount of subscriber/template/campaign-era UI and E2E coverage behind; the main cleanup risk was not type errors but half-removed flows that still compiled while contradicting the supported product.
- 2026-03-23: The existing webhook delivery ledger was send-instance-based, so adding pre-registered callback endpoints required a separate registration model instead of overloading the old per-send `webhookUrl` behavior.
- 2026-03-23: API-key query-state behavior normalized away the redundant `scope=individual-send` query because only one supported scope remains, so tests needed to assert restored checked state rather than literal URL preservation.
- 2026-03-23: Final E2E verification after the client-doc additions initially failed for an environmental reason, not a code regression: local repo dev servers were already listening on `:3000` and `:4173`, which prevented Playwright from starting its own managed web servers.
- 2026-03-24: Admin send history originally loaded the entire send table into the browser and filtered locally, which became the first practical bottleneck once the product boundary shifted to a send-engine with growing history volume.
- 2026-03-24: Raw EML support required a cross-layer addition (`eml_snapshot`) rather than a pure API swap, because the worker and SMTP transport previously assumed all sends could be reconstructed from `subject/html/text` snapshots.

## 2026-03-24 — stale mixed contract wording after raw EML rollout

- After the raw EML implementation landed, `external-api.ts` still accepted the legacy rendered-send fallback and some docs still advertised that mixed contract.
- This created a drift risk where clients could rely on deprecated request fields even though the intended product boundary had already moved to raw EML-only sends.
- Fixed by removing the fallback path, tightening the validation message to `eml is required`, and updating README/INSTALL/OPERATIONS contract language to match the shipped UI/API behavior.

## 2026-03-24 — operator docs lagged behind shipped send-console behavior

- Public API docs were mostly aligned, but top-level/operator docs still described the product too generically and underreported the current admin workflow.
- This created a mismatch where readers could see the right curl examples but still miss that `/sends` is a search/pagination-first history screen and that routing/reporting tabs move between sections.
- Fixed by tightening README/INSTALL/OPERATIONS wording around EML-only sends, paginated send history, SMTP node operations, and routing/reporting tab navigation.

## 2026-03-24 — hard delete semantics conflicted with SMTP history references

- The original SMTP node delete request conflicted with existing foreign-key references from `sends` and `send_dispatch_attempts`, so removing the route guard alone would have left a broken persistence model.
- Fixed by adding `deleted_at` tombstones, keeping latest-routing-rule protection, and excluding tombstoned nodes from live routing/admin lists while preserving historical references.

## 2026-03-24 — Playwright reused stale dev servers during API-key revoke verification

- Browser verification initially failed because Playwright reused older local dev servers on ports 3000/4173, so the running app did not include the new revoke route even though integration tests were green.
- Resolved by restarting the stale processes and rerunning the full suite on a fresh server instance.

## 2026-03-24 — reused Playwright dev servers can hide new admin routes

- The API key delete implementation initially appeared broken in browser tests because Playwright reused an older local dev server that did not include the new `DELETE /api/api-keys/:id` route.
- The actual code path was validated by integration tests; restarting the stale app servers was necessary so the e2e run exercised the current server build.

## 2026-03-24 — revoked API key delete Request failed was stale-server drift, not route logic

- Reproduced the revoke → delete flow directly against a fresh management-console dev server: `POST /api/api-keys/:id/revoke` returned 200, `DELETE /api/api-keys/:id` returned 204, and the deleted key no longer appeared in `/api/api-keys`.
- The earlier `Request failed` symptom came from running against an older reused dev server process that did not include the latest admin API routes.

## 2026-03-24 — routing failover UI can silently degrade if admin parser drops chain fields

- The routing UI sent `failoverNodeIds`, but the admin route initially ignored that field, causing preview/save behavior to collapse back to single-node routing even though repository and worker support were present.
- Fixed by forwarding `failoverNodeIds` from `POST /api/routing-rules` into the repository `createRuleset` call and verifying the browser preview shows the full ordered chain.
