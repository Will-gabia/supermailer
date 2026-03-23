# Learnings

- 2026-03-20: Repository starts greenfield; no local scaffold or code conventions exist outside `.sisyphus/`.
- 2026-03-20: Task 1 must keep the exact plan layout: `apps/management-console`, `apps/mail-worker`, `packages/domain`, `packages/contracts`, `packages/testing`, `packages/config`.
- 2026-03-20: Root scripts required by the plan are `lint`, `typecheck`, `test`, `test:integration`, and `e2e`.
- 2026-03-20: Stack guidance supports `pnpm` + `turbo`, Hono route modules, React + Vite admin app, Vitest, Playwright, and internal package scope `@supermailer/*`.

- 2026-03-20: Task 1 scaffold uses pnpm workspaces + turbo with TypeScript build-mode project references so cross-package imports typecheck cleanly in a greenfield monorepo.
- 2026-03-20: `apps/management-console` now has a React + Vite client entry plus Hono-ready `/api/health` server structure; `apps/mail-worker` is a Node/BullMQ-ready app with shared env/config wiring.

- 2026-03-20: Scaffold CLI entrypoints can avoid raw `console.log` by writing deterministic JSON to `process.stdout`, which stays lint-clean and keeps the worker bootstrap generic.
- 2026-03-20: Adding an inline favicon in `apps/management-console/index.html` removes the default Vite browser 404 noise during scaffold QA without introducing extra asset files.
- 2026-03-20: Task 2 contracts now centralize ULID-based branded identifiers plus `SEND_CORRELATION_HEADER = X-Supermailer-Send-Id`, and DTO factories enforce domain invariants (email normalization, required snapshot fields, routing-rule shape, and timestamp parsing).
- 2026-03-20: Canonical send lifecycle is encoded in domain as explicit transition map + terminal-state guardrails; delivery events are idempotent by provider event id and stale/regressive events are explicitly ignored without mutating terminal state.
- 2026-03-20: Task 3 persistence foundation fits under `apps/management-console/src/server/db` and `.../repositories`; a small custom migration runner can stay deterministic by splitting `.sql` files on `--> statement-breakpoint` markers instead of adding extra tooling runtime dependencies.
- 2026-03-20: BullMQ rejects custom job ids containing `:`, so deterministic idempotency keys should use safe delimiters like `send-<id>` and `sync-<id>` while still deriving directly from application IDs.

- 2026-03-20: Task 4 local infra harness uses docker compose with deterministic non-default host ports `15432` for Postgres and `16379` for Redis to avoid common local port collisions while keeping Mailpit on `1025/8025` and SendSMTP on `2525`.
- 2026-03-20: Local Postfix assets live under `infra/postfix/**`; `main.cf` relays to Mailpit, sets `enable_long_queue_ids = yes`, and persists `postconf -n` plus mail logs under `/var/log/postfix` for later correlation checks.

- 2026-03-20: Task 5 auth uses a seeded local `admin_users` record plus hashed `admin_sessions` tokens stored server-side; the browser only keeps a secure, httpOnly, SameSite=Lax session cookie for the opaque token.
- 2026-03-20: External API keys now use a visible prefix plus random secret (`sm_<prefix>_<secret>`), but only the prefix and HMAC hash are persisted so raw keys are recoverable only at creation time while still allowing deterministic lookup and scope enforcement.

- 2026-03-20: Returning `200 { authenticated: false }` from `/api/auth/session` keeps the unauthenticated boot check explicit for the client while avoiding expected-login-flow browser console noise from a deliberate `401`.
- 2026-03-20: Task 5 auth runtime config is now part of `.env.example`, including seeded admin credentials, auth secret, cookie name, and session TTL so local boot and Playwright behavior stay discoverable.

- 2026-03-20: Task 6 subscriber sync can stay pull-based without extra mock infrastructure by accepting any fetchable standard JSON source that returns `{ subscribers: [...] }`, including `data:` URLs used by Playwright for deterministic UI verification.
- 2026-03-20: Subscriber sync upserts work best by matching `(sourceKey, externalId)` first and normalized email second, which keeps duplicate payload replays idempotent while still merging case-variant emails like `Alice@Example.com` into one subscriber row.
- 2026-03-20: Eligibility enforcement for later dispatch can be centralized with one lookup that checks subscriber `unsubscribedAt` plus hard-bounce suppression rows, letting admin and external routes share the same rejection reasons.

### Task 7: Template Management (Salvaged)

- Playwright E2E tests for templates initially failed because:
  - Playwright test elements were asserting `toContainText('<p>Welcome to Acme Corp, Alice!</p>')` while `dangerouslySetInnerHTML` strips paragraph tags in textContent retrieval via `.toContainText()`. The string `Welcome to Acme Corp, Alice!` was retrieved from the element instead of `<p>Welcome to Acme Corp, Alice!</p>`. Adjusting the assertion to search for the string representation instead resolved the problem.
  - Test servers must be spun up using explicit scripts within `playwright.config.ts` or handled gracefully without conflicting node servers hanging around. Make sure port bindings on 3000 and 4173 are clear or that Playwright `webServer` blocks execute correctly.
- Variable extraction from strings needs a clear definition, especially capturing variables using `{{var}}` notation. Drizzle ORM arrays function correctly using `jsonb('variables').$type<string[] | null>()`.
- Always verify HTTP requests paths. Our setup places all Hono backend routes under the `/api/` prefix but API handlers within `hono` define it at the router's root context.
- Keep UI testing strictly to DOM visibility and strings. Avoid waiting using `waitForTimeout`, prefer locating explicit elements.

- 2026-03-20: Task 8 routing management can salvage the partial API/UI, but the admin node list must show all nodes (not only active ones) so operators can reactivate routes without hidden state.
- 2026-03-20: Routing Playwright coverage needs to clear preloaded rule rows before composing its own ruleset; the shared dev server can retain prior routing versions, and exact-domain uniqueness is enforced per version.
- 2026-03-20: Sequential node creation in the routing UI needs an explicit submitting state; without disabling the add button until refresh completes, fast e2e input can race the form reset and post a blank node name.
- 2026-03-20: Task 9 enqueue orchestration now reuses `getSubscriberEligibility` for both individual and campaign flows, so suppression/unsubscribe checks remain centralized and consistent.
- 2026-03-20: Individual-send enqueue stores webhook destination + signing secret in `outbound_webhook_deliveries` at queue time, giving later delivery-event webhooks a canonical persisted config source.
- 2026-03-20: Deterministic send IDs can be derived from stable scope seeds plus recipient email while keeping BullMQ IDs compliant via `send-<sendId>` (no `:`) and preserving per-recipient identity.
- 2026-03-20: `e2e/send-flows.spec.ts` stability improved by disabling Playwright `reuseExistingServer` and using per-run unique recipients/template names to avoid collisions with persistent local DB state.
- 2026-03-20: Task 10 dispatch now treats SMTP acceptance as `accepted_by_mta` only, storing accepted attempt/queue/relay metadata on `sends` while leaving final `delivered`/`bounced` to later delivery-event ingestion.
- 2026-03-20: Fixed capped retry semantics are wired through BullMQ custom backoff (`1m, 5m, 15m`) with `SEND_DISPATCH_MAX_ATTEMPTS = 4`; transient 4xx-style failures defer and retry, while 5xx-style failures are terminal without retry.
- 2026-03-20: Postfix local correlation plumbing uses `header_checks` to surface `X-Supermailer-Send-Id` in logs and a helper script can map send-id ↔ queue-id evidence for local debugging.

- 2026-03-20: Task 11 inbound delivery-event ingestion now accepts signed `normalized` or `sendsmtp_log` callbacks, correlates sends by explicit send-id before queue/attempt fallbacks, and uses the shared domain state machine to ignore duplicate/regressive events without moving terminal sends backward.
- 2026-03-20: Individual-only outbound result webhooks reuse the persisted `outbound_webhook_deliveries` row from enqueue time; delivery attempts are signed with the row secret, stored back into the same retry ledger, and campaigns intentionally leave that ledger untouched.
- 2026-03-20: Delivery reporting can stay query-light by using `sends.status` for status counts and `delivery_events` for per-code histograms, per-node breakdowns, and per-send audit history with raw payload evidence preserved.
- 2026-03-20: Task 11 terminology gotcha — SendSMTP callback status `deferred` must normalize to non-terminal `DeliveryEventType.Deferred`, while terminal `failed_transient` remains a distinct event/state; positive ingestion tests must also start from a state machine-legal predecessor (`dispatching`, not `accepted_by_mta`).
- 2026-03-20: Deferred runtime QA bug root cause was subtle test coverage drift, not a second ingestion branch — the real signed HTTP repro must be exercised with a state-machine-legal predecessor (`dispatching`) and exact callback shape/IDs, otherwise route-level checks can look green while the live scenario remains unproven.

## Task 12 Learnings

- **UI State Management:** Expanding the management console involved updating the top-level route state to include 'Reporting'. Using `Promise.all` in the data fetching allowed efficient retrieval of the delivery reporting statistics.
- **Reporting Integration:** The delivery-events API (`/api/admin/reporting/delivery-events` and `/api/admin/sends/:sendId/delivery-events`) successfully connects the backend aggregations to the frontend UI, completing the feedback loop of outbound sending.

## Task 12 Final Documentation Updates

- Updated markdown docs to explicitly list actual repo scripts (`dev`, `lint`, `typecheck`, `test`, `test:integration`, `e2e`).
- Explicitly documented the `http://localhost:4173` port for Vite-based management-console UI and `http://localhost:3000` for Hono API in `INSTALL.md`, matching Playwright logic.
- Documented accurate environment variables in `INSTALL.md` according to actual `.env.example` configurations.
- Removed invalid `pnpm run db:migrate` instruction from INSTALL.md as the repository relies on automatic table generation or doesn't have a separate script.
- Removed cross-package import (`@supermailer/contracts`) from Playwright e2e tests in favor of local unique identifier helpers to avoid TypeScript diagnostic errors related to monorepo module resolution.

### E2E Test Stability: Avoiding Fixed Timeouts

- **Problem**: `e2e/reporting-events.spec.ts` used a fixed `page.waitForTimeout(2000)` to wait for backend processing before viewing send history.
- **Solution**: Replaced with `await expect(sendItem.getByRole('button', { name: 'View History' })).toBeEnabled()`. This leverages Playwright's auto-retrying assertions to wait for the UI state change (button becoming enabled) which correlates with the processing being complete.
- **Outcome**: The test is now more resilient to varying backend performance and adheres to the project's code quality standards.
- 2026-03-20: Worker plan compliance requires a real HTTP listener on `MAIL_WORKER_PORT`; printing health JSON to stdout is not sufficient when the DoD explicitly calls for `curl -s http://localhost:3001/health`.

# 2026-03-20 - Documentation Consistency Fix

- Corrected `INSTALL.md` to use `docker compose up -d` instead of `docker-compose up -d` to ensure compliance with the infrastructure plan and modern Docker CLI standards.

- 2026-03-20: Final Task 12 gap required returning and surfacing outbound webhook delivery history for individual sends alongside their events in `/api/admin/sends/:sendId/delivery-events` and the admin console UI. Added focused integration test to prove data exposure, closing out the task.
- 2026-03-20: Top-level Korean docs are easier to use when `README.md` stays decision-oriented and `INSTALL.md` is split into an operator quick-start path plus a developer deep-dive path with a literal startup checklist.
- 2026-03-20: Operator-facing docs benefit from a separate daily health checklist covering `docker compose ps`, API/worker health curls, login reachability, and Mailpit availability so recurring checks do not require reading the full developer guide.
- 2026-03-20: Operator docs are more actionable when they distinguish three moments explicitly: daily checks, incident triage, and pre-release checks. Each checklist should stay command-first and map symptoms to the nearest observable signal (health endpoints, docker status, login reachability, Mailpit visibility).
- 2026-03-20: Documentation becomes misleading when local Docker stack instructions are labeled as production operations. Keep `INSTALL.md` strictly local-development/local-validation, move real deployment guidance to `OPERATIONS.md`, and isolate Postfix/SMTP relay setup into its own document so Postgres/Redis external-service assumptions are explicit.
- 2026-03-20: Changing workspace package `main` entries from source TS to built JS (`dist/index.js`) can break Vitest imports in app packages unless test configs explicitly alias `@supermailer/*` back to source files.
- 2026-03-20: Management-console production runtime can serve API + SPA in a single Hono process by adding `serveStatic` middleware for non-`/api` paths and an HTML fallback to built `index.html`.
- 2026-03-20: For container-safe runtime defaults, `MANAGEMENT_CONSOLE_HOST` and `MAIL_WORKER_HOST` should default to `0.0.0.0` while dev workflow remains unchanged via explicit Vite dev host settings.
- 2026-03-20: ESM compiled runtime in this monorepo requires `.js` suffixes on relative imports; adding `tsc-alias --resolve-full-paths` in build scripts reliably patches emitted extensionless imports that Node cannot resolve.
- 2026-03-20: Production deployment docs are easier to execute when `.env.production.example` exists separately from `.env.example`, and the operations runbook lists exact `docker compose --env-file .env.production -f compose.production.yml ...` commands plus a literal smoke-test order.
- 2026-03-20: Management-console production static serving must use the real Vite output root (`apps/management-console/dist`) rather than a hypothetical `dist/client`; server-side static root should be resolved from compiled server path accordingly.
- 2026-03-23: The current management console still centers almost all client UI in `apps/management-console/src/client/App.tsx`, so a dashboard redesign can ship safely without backend changes by reshaping the existing route branches and preserving the pathname-based router.
- 2026-03-23: Subscriber editing already exists server-side via `PATCH /api/subscribers/:subscriberId` for `email`, `displayName`, and `unsubscribed`, which lets the UI add an edit flow without schema or API work.
- 2026-03-23: There is no true subscriber-group or subscriber-delete backend yet, so the safest operator-facing dashboard model is to present derived groups from current subscriber state (`발송 가능`, `수신 거부`, `억제됨`) and keep unsupported destructive actions visibly disabled instead of faking success.
- 2026-03-23: CSV export for subscribers can be provided entirely client-side from the already loaded subscriber list, which covers the operator need without widening server scope.
- 2026-03-23: Korean UI migration is easiest to verify by updating Playwright to the new visible labels and route structure while also improving field accessibility with explicit `aria-label` attributes on form controls.
- 2026-03-23: Subscriber groups fit cleanly as a separate `subscriber_groups` table plus a `subscriber_group_memberships` join table with a composite PK, which keeps multi-group membership possible without widening the `subscribers` row shape.
- 2026-03-23: Safe subscriber hard-delete is easiest to reason about as a single DB transaction that first nulls `sync_run_records.subscriber_id`, then removes memberships and email-keyed suppressions, and only then deletes the subscriber row.
- 2026-03-23: Enriching `/api/subscribers` with a `groups` array can be done without disturbing existing eligibility semantics by preserving derived fields (`eligible`, `eligibilityReason`, `suppressionReasons`) and layering group joins in parallel.
- 2026-03-23: The subscriber dashboard works best when named groups are presented as an operator-managed layer separate from the status tabs; keeping both avoids conflating deliverability state with audience organization.
- 2026-03-23: Campaign targeting can safely reuse the existing enqueue path by treating saved groups as an additional audience source, then normalizing and deduplicating the merged email list before eligibility checks.
- 2026-03-23: When operators need to know why a recipient appeared in a campaign send, the most stable model is a per-send audience provenance snapshot (`manual` + saved-group id/name pairs) stored at enqueue time rather than a live lookup against current group state.
- 2026-03-23: Provenance-aware send filtering works best as a client-side derived view over the existing `/api/sends` payload; search can safely match recipient email, saved-group names, and the `직접 입력` label without widening backend scope.
- 2026-03-23: Send filter restoration can stay router-free by treating `/sends` query params as the source of truth for `search` and `provenance`, hydrating from `window.location.search` and writing changes back with `history.replaceState`.
- 2026-03-23: The same query-sync pattern extends safely to `/subscribers` for `subscriberTab` only; keeping forms, edit state, and sync inputs out of the URL avoids confusing deep links while still making filtered views shareable.
- 2026-03-23: `/templates` can safely persist only the selected saved template id, while `/reporting` benefits from a lightweight query-backed section selector; both fit the current SPA without a router migration.
- 2026-03-23: For the remaining admin pages, `routing.section` and API-key `scope` selection are the only query-backed states that add restore/share value without leaking secrets or persisting mutable drafts.
