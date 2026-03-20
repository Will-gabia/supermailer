# Customer Email Delivery Platform

## TL;DR

> **Summary**: Build a greenfield single-tenant email delivery platform with a Hono/React control plane, a BullMQ-based MailWorker, and Postfix-based SendSMTP nodes, using a canonical send state machine and Postfix log/callback correlation for final delivery truth.
> **Deliverables**:
>
> - Monorepo scaffold for API, admin UI, worker, shared packages, and Postfix infra assets
> - Subscriber, template, campaign, individual-send, webhook, routing, and reporting capabilities
> - Unit, integration, and Playwright e2e coverage plus local dev/test environment
> - README, INSTALL, CHANGELOG, AGENTS, and conventions documentation
>   **Effort**: XL
>   **Parallel**: YES - 3 waves
>   **Critical Path**: 1 -> 2 -> 3 -> 5 -> 8 -> 9 -> 10 -> 12

## Context

### Original Request

Build a customer-facing email sending program with subscriber management, campaign sending, template management, individual email sending, individual-send webhooks, subscriber sync from external APIs, SMTP server selection, and delivery statistics including SMTP status codes and failures. Required stack is TypeScript, shell script, Hono, React, and Postfix. Required artifacts include unit/e2e tests, README, INSTALL, CHANGELOG, AGENTS guidelines, and code conventions.

### Interview Summary

- Repo state is greenfield; no files, docs, CI, or tests exist.
- Product scope is single-tenant.
- Admin console uses login-based auth; external applications use API keys.
- Queueing must use Redis + BullMQ.
- Test style is tests-after, but every vertical slice still ships with executable verification.
- Postgres is the system-of-record database.
- Routing rules are database-managed and editable in the console.
- Subscriber sync is pull-based in v1 using a standard external API format.
- Compliance baseline is unsubscribe handling plus suppression for hard bounces; complaints/FBL are out of scope.
- Campaigns are immediate-send only in v1; no scheduler, pause, or cancel workflow.
- Final delivery truth comes from terminal webhook/DSN/log-derived events; SMTP acceptance is only handoff evidence.

### Metis Review (gaps addressed)

- Locked the canonical send lifecycle, idempotency, routing ownership, and retry semantics so queue state never becomes delivery truth.
- Bounded scope to avoid multitenancy, scheduling, advanced segmentation, broad analytics, and Postfix fleet automation.
- Added hard requirements for a local mailbox sink, deterministic IDs, suppression behavior, duplicate-event handling, and out-of-order event protection.

## Work Objectives

### Core Objective

Deliver a decision-complete implementation path for a reliable outbound email platform whose control plane, worker, and Postfix relays can be built without further architecture choices.

### Deliverables

- `apps/management-console`: Hono API plus React admin UI
- `apps/mail-worker`: BullMQ consumers and SMTP dispatch orchestration
- `packages/domain`, `packages/contracts`, `packages/testing`, `packages/config`
- `infra/postfix`: Postfix configs, helper scripts, and local/dev assets
- `docker-compose.yml` and env templates for Postgres, Redis, Mailpit, and local SendSMTP
- Docs and repo conventions: `README.md`, `INSTALL.md`, `CHANGELOG.md`, `AGENTS.md`, lint/format/test conventions

### Definition of Done (verifiable conditions with commands)

- `pnpm install && pnpm lint && pnpm typecheck && pnpm test` complete successfully in a clean checkout.
- `pnpm test:integration` validates canonical send-state transitions, idempotent queueing, routing, webhook ingestion, and reporting flows.
- `pnpm playwright test` validates end-to-end admin flows for subscriber sync, template creation, individual send, campaign send, and delivery status display.
- `docker compose up -d` starts Postgres, Redis, Mailpit, and local Postfix services required by tests and manual verification.
- `curl -s http://localhost:3000/api/health` and `curl -s http://localhost:3001/health` return healthy responses for control plane and worker diagnostics.

### Must Have

- Canonical send state machine with monotonic transitions and append-only delivery event history
- Per-recipient send records with deterministic IDs and traceable correlation headers
- Database-managed recipient-domain routing rules with default fallback and node activation flags
- Hard-bounce suppression and unsubscribe enforcement before dispatch
- Raw SMTP code, enhanced code, reason text, relay identity, and event provenance persisted for reporting
- Idempotency for API enqueue, subscriber sync, webhook ingestion, and outbound webhook delivery
- Local dev/test stack that makes API, worker, Postfix, and mailbox verification fully agent-executable

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- No multitenancy, RBAC matrix, SSO, or organization/workspace isolation in v1
- No campaign scheduling, pause/resume, or calendar features in v1
- No advanced segmentation DSL, journeys, A/B testing, or content recommendation logic
- No queue state used as the source of truth for delivery outcome
- No business logic embedded in Postfix beyond transport config, correlation, and callback/log plumbing
- No manual-only QA steps, log-inspection-only verification, or vague acceptance criteria

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after using Vitest for unit/integration and Playwright for e2e
- QA policy: Every task includes happy-path and failure-path scenarios with concrete data and evidence files
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. Shared foundations are isolated into Wave 1.

Wave 1: repo scaffold and quality gates, domain contracts/state model, persistence/queue foundations, local infra harness
Wave 2: auth/API keys, subscriber/suppression/sync, template management, routing management
Wave 3: individual send flow, campaign send flow, worker dispatch, Postfix correlation plumbing, delivery event ingestion, reporting, docs, and final cross-system e2e hardening

### Dependency Matrix (full, all tasks)

| Task | Depends On            | Blocks                       |
| ---- | --------------------- | ---------------------------- |
| 1    | -                     | 2, 3, 4, 5, 6, 7             |
| 2    | 1                     | 5, 8, 9, 10, 11              |
| 3    | 1                     | 4, 5, 6, 7, 8, 9, 10, 11, 12 |
| 4    | 1, 3                  | 8, 9, 10, 12                 |
| 5    | 1, 2, 3               | 8, 9, 11                     |
| 6    | 1, 2, 3               | 9, 12                        |
| 7    | 1, 2, 3               | 8, 9                         |
| 8    | 2, 3, 4, 5, 7         | 10, 11, 12                   |
| 9    | 2, 3, 4, 5, 6, 7      | 10, 11, 12                   |
| 10   | 2, 3, 4, 8, 9         | 11, 12                       |
| 11   | 2, 3, 8, 9, 10        | 12                           |
| 12   | 3, 5, 6, 8, 9, 10, 11 | -                            |

### Agent Dispatch Summary (wave -> task count -> categories)

- Wave 1 -> 4 tasks -> `unspecified-high`, `deep`
- Wave 2 -> 4 tasks -> `unspecified-high`, `visual-engineering`
- Wave 3 -> 4 tasks -> `deep`, `unspecified-high`, `visual-engineering`

## TODOs

> Implementation + Test = ONE task. Never separate.
> Greenfield note: no in-repo code references exist yet; use the cited official docs and this plan as the initial source of truth.

- [x] 1. Scaffold the monorepo, toolchain, and quality gates

  **What to do**: Create a `pnpm` workspace with `turbo`, `apps/management-console`, `apps/mail-worker`, `packages/domain`, `packages/contracts`, `packages/testing`, and `packages/config`. Standardize TypeScript project references, ESLint, Prettier, Vitest, Playwright, shared env loading, and root scripts for `lint`, `typecheck`, `test`, `test:integration`, and `e2e`. Use React + Vite for the admin UI and Node runtime for Hono and BullMQ workers.
  **Must NOT do**: Do not introduce Nx, Next.js, NestJS, or multiple package managers. Do not leave per-package script names inconsistent.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: greenfield repo/tooling design with multiple packages and scripts
  - Skills: `[]` - why needed: no special skill is required beyond disciplined setup
  - Omitted: `[]` - why not needed: no git/browser-specific work is required

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | Blocked By: -

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - repo shape, package boundaries, and commands to preserve
  - External: `https://hono.dev/docs/guides/best-practices` - modular Hono route structure
  - External: `https://hono.dev/docs/helpers/testing` - Hono testing patterns to support script decisions
  - External: `https://github.com/microsoft/playwright/blob/main/docs/src/auth.md` - Playwright worker auth/setup pattern

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm install` completes successfully from repo root.
  - [ ] `pnpm lint` completes successfully across all workspace packages.
  - [ ] `pnpm typecheck` completes successfully across all workspace packages.
  - [ ] `pnpm test` runs placeholder and foundational tests successfully without package-name mismatches.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Root workspace commands work end-to-end
    Tool: Bash
    Steps: Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` from repo root.
    Expected: All commands exit 0 and reference the intended workspace packages by consistent names.
    Evidence: .sisyphus/evidence/task-1-workspace.txt

  Scenario: Invalid workspace script reference fails fast during development
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/does-not-exist test`.
    Expected: Command exits non-zero and confirms unknown filter/package rather than silently passing.
    Evidence: .sisyphus/evidence/task-1-workspace-error.txt
  ```

  **Commit**: YES | Message: `chore(workspace): scaffold monorepo tooling` | Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/*`, `packages/*`, root config files

- [x] 2. Define shared contracts and the canonical send state machine

  **What to do**: Implement `packages/contracts` and `packages/domain` to define all stable identifiers, DTOs, enums, and invariants for subscribers, templates, campaigns, individual sends, routing rules, delivery attempts, delivery events, webhooks, and suppression entries. Model a monotonic send state machine with explicit allowed transitions: `draft -> queued -> dispatching -> accepted_by_mta -> delivered`, `queued -> dispatching -> deferred`, `deferred -> dispatching`, `dispatching -> failed_transient`, `dispatching -> failed_permanent`, `accepted_by_mta -> bounced`, and no backward transitions from terminal states. Standardize IDs as ULIDs and require an application correlation header such as `X-Supermailer-Send-Id` on every outbound message.
  **Must NOT do**: Do not use Postfix queue IDs as business identifiers. Do not allow `delivered` to regress to `deferred` or `queued`. Do not leave terminal-state behavior implicit.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: domain modeling and state-transition correctness are core system risks
  - Skills: `[]` - why needed: requires careful reasoning, not a specialist integration skill
  - Omitted: `[]` - why not needed: no browser or git specialization needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5, 6, 7, 8, 9, 10, 11 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - lifecycle rules, v1 scope, and identifier expectations
  - External: `https://www.postfix.org/postconf.5.html#enable_long_queue_ids` - queue-id uniqueness constraint
  - External: `https://www.postfix.org/qmgr.8.html` - deferred/bounce/trace semantics for delivery events
  - External: `https://datatracker.ietf.org/doc/html/rfc3463` - enhanced SMTP status code categories

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/domain test -- send-state-machine` passes with coverage for allowed and disallowed transitions.
  - [ ] `pnpm --filter @supermailer/contracts test -- ids-and-dtos` passes and proves ULID generation plus DTO parse/validation behavior.
  - [ ] `pnpm --filter @supermailer/domain test -- terminal-state-monotonicity` proves duplicate or stale events cannot move a send backward.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Happy path send lifecycle is accepted
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/domain test -- send-state-machine-happy` using fixtures for `alice@example.com` and send id `01HZYF8SEND00000000000001`.
    Expected: Tests prove `queued -> dispatching -> accepted_by_mta -> delivered` is valid and records event history in order.
    Evidence: .sisyphus/evidence/task-2-state-machine.txt

  Scenario: Duplicate or stale failure event is rejected
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/domain test -- send-state-machine-stale-event` with an already delivered send and a stale `421 4.7.0` deferred event.
    Expected: Tests prove the state remains `delivered` and the stale event is stored as ignored or rejected according to domain rules.
    Evidence: .sisyphus/evidence/task-2-state-machine-error.txt
  ```

  **Commit**: YES | Message: `feat(domain): define send lifecycle contracts` | Files: `packages/contracts/**`, `packages/domain/**`

- [x] 3. Build persistence, repositories, and BullMQ queue primitives

  **What to do**: Add Postgres persistence using Drizzle ORM, Redis connectivity, BullMQ queue setup, migrations, and repositories for subscribers, templates, sends, delivery events, routing rules, SendSMTP nodes, API keys, sync runs, and outbound webhook deliveries. Make Postgres the source of truth; BullMQ stores job coordination only. Require deterministic queue `jobId` values derived from app send IDs or sync run IDs to prevent duplicate enqueue on retries.
  **Must NOT do**: Do not store authoritative delivery state in Redis. Do not allow enqueue endpoints to create multiple jobs for the same send on repeated requests with the same idempotency key.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: data model plus queue infrastructure plus integration tests
  - Skills: `[]` - why needed: no special skill beyond backend infra setup
  - Omitted: `[]` - why not needed: browser/design work is irrelevant here

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4, 5, 6, 7, 8, 9, 10, 11, 12 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - persistence ownership, idempotency rules, and entity list
  - External: `https://hono.dev/docs/guides/best-practices` - keep transport layer thin and persistence in services/repositories
  - External: `https://www.postfix.org/transport.5.html` - routing data requirements for domain-to-transport mapping
  - External: `https://github.com/taskforcesh/bullmq` - queue naming, retry, and deterministic job patterns

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- repositories` passes against Postgres with migrations applied.
  - [ ] `pnpm --filter @supermailer/mail-worker test:integration -- queue-idempotency` proves repeated enqueue with the same send id creates one BullMQ job.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- routing-rule-repository` proves domain-specific rules and default fallback can be stored and queried deterministically.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Idempotent enqueue stores one job and one send row linkage
    Tool: Bash
    Steps: Start infra with `docker compose up -d postgres redis`; run `pnpm --filter @supermailer/mail-worker test:integration -- queue-idempotency`.
    Expected: Test output proves repeated enqueue for send `01HZYF8SEND00000000000002` results in one queue job and one repository linkage.
    Evidence: .sisyphus/evidence/task-3-queue.txt

  Scenario: Redis outage does not silently corrupt authoritative state
    Tool: Bash
    Steps: Stop Redis only, then run `pnpm --filter @supermailer/management-console test:integration -- enqueue-without-redis`.
    Expected: API/service logic fails explicitly, Postgres transaction rolls back, and no partial send or attempt rows remain committed.
    Evidence: .sisyphus/evidence/task-3-queue-error.txt
  ```

  **Commit**: YES | Message: `feat(platform): add persistence and queue foundations` | Files: `packages/config/**`, `apps/management-console/src/db/**`, `apps/mail-worker/src/queue/**`, migration files

- [x] 4. Create the local infrastructure harness for agent-executable verification

  **What to do**: Provide `docker compose` services and helper scripts for Postgres, Redis, Mailpit, and at least one local Postfix SendSMTP container that relays to Mailpit. Add seeded env examples and commands that let tests and Playwright run against deterministic ports and credentials. Ensure the Postfix container enables long queue IDs and exposes logs needed for correlation testing.
  **Must NOT do**: Do not depend on external cloud SMTP or a human-managed mail server for local verification. Do not require manual container edits after startup.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: multi-service local environment with infra scripts and reproducibility requirements
  - Skills: `[]` - why needed: shell and config work is sufficient
  - Omitted: `[]` - why not needed: no UI specialization needed

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 9, 10, 11, 12 | Blocked By: 1, 3

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - required local stack and verification commands
  - External: `https://www.postfix.org/postconf.5.html#enable_long_queue_ids` - required Postfix uniqueness setting
  - External: `https://www.postfix.org/transport.5.html` - domain transport routing behavior to emulate locally
  - External: `https://www.postfix.org/bounce.8.html` - delivery status artifacts relevant for log-based testing

  **Acceptance Criteria** (agent-executable only):
  - [ ] `docker compose up -d` starts Postgres, Redis, Mailpit, and local Postfix successfully.
  - [ ] `docker compose ps` shows all required services in a healthy or running state.
  - [ ] `pnpm test:integration` can connect to all local dependencies without ad hoc environment overrides.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Full local stack boots for development and tests
    Tool: Bash
    Steps: Run `docker compose up -d` and then `docker compose ps`.
    Expected: Postgres, Redis, Mailpit, and SendSMTP services are running and mapped to documented ports.
    Evidence: .sisyphus/evidence/task-4-infra.txt

  Scenario: Missing Postfix uniqueness setting is detected
    Tool: Bash
    Steps: Run a verification script or test such as `pnpm test:integration -- postfix-config` against the local Postfix config.
    Expected: Test fails if `enable_long_queue_ids = yes` is absent and passes only when the documented config is present.
    Evidence: .sisyphus/evidence/task-4-infra-error.txt
  ```

  **Commit**: YES | Message: `chore(infra): add local dev stack` | Files: `docker-compose.yml`, `infra/postfix/**`, `.env.example`, helper scripts

- [x] 5. Implement admin authentication and external API key security

  **What to do**: Add single-tenant admin login using a local user table with hashed password authentication and secure session cookies for the React console. Add external application API key creation, hashing-at-rest, last-used tracking, and scope checks for subscriber sync, individual send, and campaign send endpoints. Include audit logging for login success/failure and API key usage metadata.
  **Must NOT do**: Do not add SSO, RBAC matrices, or per-tenant permissions. Do not store raw API keys in the database after creation.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: API security plus UI login flow plus test coverage
  - Skills: `[]` - why needed: standard backend/frontend security work
  - Omitted: `[]` - why not needed: no unusual external integration beyond normal auth

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 11, 12 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - single-tenant auth scope and API key boundaries
  - External: `https://hono.dev/docs/api/context` - middleware/error handling patterns for auth failures
  - External: `https://github.com/microsoft/playwright/blob/main/docs/src/auth.md` - stable login storage-state pattern for e2e

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- auth-session` passes for valid and invalid admin login attempts.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- api-keys` proves raw API keys are shown once, stored hashed, and enforced by scope.
  - [ ] `pnpm playwright test e2e/auth.spec.ts` passes for admin login and protected-route access.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Admin login grants console access
    Tool: Playwright
    Steps: Start the app, navigate to `/login`, sign in with seeded admin credentials, then open `/subscribers`.
    Expected: Login succeeds, a session cookie is established, and the subscribers page renders for the authenticated admin.
    Evidence: .sisyphus/evidence/task-5-auth.json

  Scenario: Invalid API key is rejected for external send endpoint
    Tool: Bash
    Steps: Run `curl -s -o /tmp/task5.json -w "%{http_code}" -X POST http://localhost:3000/api/individual-sends -H "x-api-key: invalid" -H "content-type: application/json" -d '{"to":"alice@example.com","subject":"Hello","html":"<p>Hi</p>"}'`.
    Expected: HTTP status is `401` or `403`, response body contains a machine-readable error code, and no send row is created.
    Evidence: .sisyphus/evidence/task-5-auth-error.txt
  ```

  **Commit**: YES | Message: `feat(auth): add admin login and api keys` | Files: `apps/management-console/src/auth/**`, relevant UI routes, repository/migration updates

- [x] 6. Build subscriber management, suppression, and pull-based external sync

  **What to do**: Implement subscriber CRUD, unsubscribe flags, hard-bounce suppression records, email normalization, and pull-based sync jobs that fetch an external standard-format API, normalize records, and upsert subscribers idempotently. Add sync run history, last-sync timestamps, per-record error capture, and admin UI visibility into sync outcomes.
  **Must NOT do**: Do not implement push-based webhook ingestion for sync in v1. Do not allow suppressed or unsubscribed recipients to remain eligible for dispatch.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: mixed API/domain/UI integration with idempotent external data import
  - Skills: `[]` - why needed: standard integration and CRUD work
  - Omitted: `[]` - why not needed: no specialist requirement beyond backend/frontend discipline

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 11, 12 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - v1 sync mode, compliance baseline, and suppression rules
  - External: `https://hono.dev/docs/guides/best-practices` - route/module boundaries for CRUD and sync APIs
  - External: `https://datatracker.ietf.org/doc/html/rfc5321` - SMTP address/domain expectations relevant to normalization and validation

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- subscriber-crud` passes for create/update/unsubscribe flows.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- subscriber-sync-idempotency` proves duplicate sync payloads do not create duplicate subscribers.
  - [ ] `pnpm playwright test e2e/subscriber-sync.spec.ts` passes for running a sync and viewing results in the admin UI.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: External sync upserts subscribers deterministically
    Tool: Bash
    Steps: Seed a mock external API with `Alice@Example.com` and `bob@gmail.com`, run the sync endpoint/job twice with the same payload, then query the subscriber API.
    Expected: Only two normalized subscriber rows exist, `alice@example.com` is normalized once, and sync history records two runs without duplicate subscribers.
    Evidence: .sisyphus/evidence/task-6-subscriber-sync.txt

  Scenario: Suppressed recipient is excluded from eligibility
    Tool: Bash
    Steps: Seed a hard-bounce suppression for `hardbounce@example.com`, then run a recipient eligibility test or API flow for a send targeting that address.
    Expected: The address is excluded or rejected with a specific suppression reason, and no queue job is created.
    Evidence: .sisyphus/evidence/task-6-subscriber-sync-error.txt
  ```

  **Commit**: YES | Message: `feat(subscribers): add sync and suppression flows` | Files: subscriber APIs/UI, sync jobs, suppression repositories, tests

- [x] 7. Implement template management with variable rendering and immutable send snapshots

  **What to do**: Create template CRUD, subject/body variable definitions, preview rendering, HTML validation/sanitization rules, and snapshot creation so each individual send or campaign stores the exact rendered template version used at enqueue time. Support simple named variables (for example `{{firstName}}`) and preview data in the admin UI.
  **Must NOT do**: Do not add full template version-history browsing, visual drag-and-drop editors, or live-template mutation of already queued sends.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI authoring flow plus rendering/preview behavior
  - Skills: `[]` - why needed: frontend-heavy slice with supporting backend work
  - Omitted: `[]` - why not needed: no external infra specialization required

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 12 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - v1 template scope and snapshot rule
  - External: `https://hono.dev/docs/guides/best-practices` - boundary between validators, services, and routes
  - External: `https://react.dev` - component composition and controlled form patterns for admin authoring UI

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- templates` passes for create/update/preview/snapshot flows.
  - [ ] `pnpm playwright test e2e/template-management.spec.ts` passes for template authoring and preview in the admin UI.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- template-snapshot` proves a queued send keeps the original snapshot after the template is edited later.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Template preview renders variables correctly
    Tool: Playwright
    Steps: Create a template with subject `Hello {{firstName}}` and HTML `<p>Hi {{firstName}}</p>`, enter preview data `{"firstName":"Alice"}`, and render preview.
    Expected: Preview shows `Hello Alice` and `<p>Hi Alice</p>` without unresolved placeholders.
    Evidence: .sisyphus/evidence/task-7-template.json

  Scenario: Queued send keeps immutable snapshot after template edit
    Tool: Bash
    Steps: Queue an individual send from template `welcome_v1`, edit the template body, then query the stored send snapshot.
    Expected: The queued send retains the original rendered subject/body and does not change to the edited template content.
    Evidence: .sisyphus/evidence/task-7-template-error.txt
  ```

  **Commit**: YES | Message: `feat(templates): add preview and snapshotting` | Files: template APIs/UI, rendering services, tests

- [x] 8. Add routing-rule and SendSMTP node management

  **What to do**: Build admin APIs and UI for SendSMTP node registry and recipient-domain routing rules. Support exact-domain matches plus one required default fallback route, active/inactive node flags, per-node priority, and effective-route preview for a given recipient address. Persist routing-rule versions so the system can explain why a send chose a node at dispatch time.
  **Must NOT do**: Do not implement automatic health-based failover, weighted routing, or sender-domain-based routing in v1. Do not allow saving routing rules without one active default fallback.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: admin CRUD plus dispatch-critical domain logic
  - Skills: `[]` - why needed: backend-heavy with some admin UI
  - Omitted: `[]` - why not needed: no special external skill needed

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 9, 10, 11, 12 | Blocked By: 1, 2, 3

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - DB-managed routing, default fallback, and v1 exclusions
  - External: `https://www.postfix.org/transport.5.html` - transport-map semantics that the app-side routing model must match
  - External: `https://www.postfix.org/SCHEDULER_README.html` - domain-specific delivery-rate and concurrency concepts for node metadata

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- routing-rules` passes for exact-match, default fallback, and inactive-node validation.
  - [ ] `pnpm playwright test e2e/routing-rules.spec.ts` passes for creating nodes/rules and previewing selected routes.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- routing-rule-versioning` proves each queued send stores the routing-rule version used.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Recipient domain resolves to the correct SendSMTP node
    Tool: Bash
    Steps: Create node `smtp-gmail-1` for `gmail.com` and default node `smtp-default-1`, then run a route preview for `bob@gmail.com` and `alice@example.com`.
    Expected: `bob@gmail.com` resolves to `smtp-gmail-1`, `alice@example.com` resolves to `smtp-default-1`, and both responses include the routing-rule version.
    Evidence: .sisyphus/evidence/task-8-routing.txt

  Scenario: Missing active default route is rejected
    Tool: Bash
    Steps: Attempt to save routing rules with only `gmail.com` configured and no active fallback.
    Expected: Validation fails with a machine-readable error and no incomplete routing configuration is persisted.
    Evidence: .sisyphus/evidence/task-8-routing-error.txt
  ```

  **Commit**: YES | Message: `feat(routing): add node registry and domain rules` | Files: routing APIs/UI, repositories, tests

- [x] 9. Implement individual-send and campaign enqueue flows

  **What to do**: Build APIs and admin UI for immediate individual sends and immediate campaign sends. Both flows must resolve recipients, enforce unsubscribe/suppression checks, snapshot template content, create per-recipient send records, assign deterministic send IDs, enqueue BullMQ jobs, and return a canonical ID that later webhooks/reporting use. Individual-send records must also store webhook destination/signing config for outbound result delivery.
  **Must NOT do**: Do not send synchronously in the request cycle. Do not add campaign scheduling, pause, or cancel flows. Do not enqueue one job per batch without preserving per-recipient send IDs.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: high-value orchestration across subscribers, templates, routing, and queueing
  - Skills: `[]` - why needed: domain/application coordination is the main challenge
  - Omitted: `[]` - why not needed: no extra specialist beyond backend/UI integration

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10, 11, 12 | Blocked By: 2, 3, 4, 5, 6, 7, 8

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - enqueue behavior, per-recipient send identity, and webhook scope
  - External: `https://hono.dev/docs/guides/best-practices` - validation and service orchestration split
  - External: `https://github.com/taskforcesh/bullmq` - queue enqueue/retry primitives and deterministic job IDs

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- individual-send` passes for accepted enqueue with canonical send ID and webhook config.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- campaign-enqueue` passes for per-recipient fan-out and suppression filtering.
  - [ ] `pnpm playwright test e2e/send-flows.spec.ts` passes for creating a template, sending one individual email, creating one campaign, and viewing queued statuses.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Individual send returns canonical ID and queue metadata
    Tool: Bash
    Steps: `curl -s -X POST http://localhost:3000/api/individual-sends -H "x-api-key: seeded-valid-key" -H "content-type: application/json" -d '{"to":"alice@example.com","subject":"Hi","html":"<p>Hello</p>","webhookUrl":"http://localhost:4010/webhooks/result"}'`.
    Expected: Response is `202`, includes send id, status `queued`, and metadata sufficient for later webhook correlation.
    Evidence: .sisyphus/evidence/task-9-send.txt

  Scenario: Campaign enqueue excludes suppressed recipients
    Tool: Bash
    Steps: Create subscribers `bob@gmail.com` and `hardbounce@example.com`, mark the latter suppressed, then enqueue a campaign targeting both.
    Expected: Only one per-recipient send record is queued, and the response/reporting output identifies the suppressed recipient as skipped with reason `hard_bounce_suppression`.
    Evidence: .sisyphus/evidence/task-9-send-error.txt
  ```

  **Commit**: YES | Message: `feat(sends): add individual and campaign enqueue flows` | Files: send APIs/UI, orchestration services, queue producers, tests

- [x] 10. Build MailWorker dispatch, retry policy, and Postfix correlation plumbing

  **What to do**: Implement BullMQ consumers that pull queued sends, resolve recipient-domain routing, render final message payloads, attach `X-Supermailer-Send-Id`, dispatch via the selected SendSMTP node, and persist dispatch attempts. Apply retry semantics as fixed capped exponential backoff for transient SMTP/network failures (for example: 1m, 5m, 15m, then terminal transient failure after exhaustion). Capture initial SMTP acceptance separately from terminal delivery outcome. Add local scripts/config so Postfix logs and callback payloads can be correlated back to the app send ID and relay node.
  **Must NOT do**: Do not mark a send `delivered` at SMTP acceptance time. Do not retry permanent 5xx failures. Do not lose correlation if Postfix queue IDs differ from app IDs.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: worker orchestration, retry semantics, and SMTP correlation are core reliability logic
  - Skills: `[]` - why needed: strong reasoning across worker and Postfix boundaries
  - Omitted: `[]` - why not needed: no browser specialization required

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 11, 12 | Blocked By: 2, 3, 4, 8, 9

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - retry policy, correlation header, and delivery truth model
  - External: `https://www.postfix.org/postconf.5.html#enable_long_queue_ids` - queue-id handling constraint
  - External: `https://www.postfix.org/qmgr.8.html` - deferred queue and status report behavior
  - External: `https://www.postfix.org/bounce.8.html` - per-message delivery status artifacts

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/mail-worker test:integration -- dispatch-success` passes for routed SMTP submission with persisted attempt metadata.
  - [ ] `pnpm --filter @supermailer/mail-worker test:integration -- dispatch-retry` proves a simulated `421 4.7.0` response schedules retries and does not mark the send delivered.
  - [ ] `pnpm --filter @supermailer/mail-worker test:integration -- postfix-correlation` proves app send ID, Postfix queue ID, and relay node are linked.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Worker dispatches via domain-selected node and records acceptance
    Tool: Bash
    Steps: Start the stack, enqueue a send to `bob@gmail.com`, run the worker, then query the send/attempt API or DB fixtures.
    Expected: The send uses the `gmail.com` route, stores `accepted_by_mta` or equivalent handoff evidence, captures relay identity, and includes `X-Supermailer-Send-Id` in the delivered message headers visible in Mailpit.
    Evidence: .sisyphus/evidence/task-10-worker.txt

  Scenario: Transient SMTP failure retries then becomes terminal-transient failure
    Tool: Bash
    Steps: Configure the local SendSMTP path to return `421 4.7.0`, run worker processing through all retries, and inspect final send state.
    Expected: Retries follow the documented backoff schedule, no duplicate send rows appear, and the final state is terminal transient failure rather than delivered.
    Evidence: .sisyphus/evidence/task-10-worker-error.txt
  ```

  **Commit**: YES | Message: `feat(worker): add smtp dispatch and retries` | Files: `apps/mail-worker/src/**`, Postfix helper scripts/config, tests

- [x] 11. Implement delivery event ingestion, outbound result webhooks, and reporting APIs

  **What to do**: Build inbound delivery-event ingestion that accepts SendSMTP log-derived callbacks or normalized payloads, verifies authenticity, deduplicates event IDs, enforces monotonic state transitions, and persists raw evidence including SMTP codes, enhanced codes, reasons, relay node, queue ID, and payload provenance. For individual sends only, add outbound result webhook delivery with signing, retry ledger, and normalized result codes. Add reporting APIs for status counts, per-code histograms, per-node breakdowns, and per-send event history.
  **Must NOT do**: Do not emit outbound result webhooks for campaigns in v1. Do not overwrite raw evidence fields with summarized status text. Do not accept unsigned or malformed internal callbacks as valid events.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: integration-heavy state reconciliation plus API/reporting work
  - Skills: `[]` - why needed: careful backend implementation with reliability guarantees
  - Omitted: `[]` - why not needed: no UI-heavy specialization is primary here

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 12 | Blocked By: 3, 5, 6, 8, 9, 10

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - final delivery truth, webhook scope, idempotency rules, and stats requirements
  - External: `https://www.postfix.org/bounce.8.html` - delivery status storage/log behavior
  - External: `https://www.postfix.org/qmgr.8.html` - deferred/bounce trace directories and semantics
  - External: `https://datatracker.ietf.org/doc/html/rfc3463` - enhanced SMTP status code handling

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- delivery-events` passes for accepted, deferred, bounced, delivered, duplicate, and stale-event cases.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- outbound-result-webhooks` proves individual-send webhooks are signed, retried, and deduplicated.
  - [ ] `pnpm --filter @supermailer/management-console test:integration -- reporting` proves API responses include raw code/reason facts and aggregate counts.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: Final delivery event updates canonical state and webhook fires once
    Tool: Bash
    Steps: Enqueue an individual send with webhook URL `http://localhost:4010/webhooks/result`, dispatch it, then post a normalized delivered callback for that send.
    Expected: Send state becomes `delivered`, one outbound webhook delivery is recorded, and the webhook payload includes send id, SMTP code fields if present, and normalized result `success`.
    Evidence: .sisyphus/evidence/task-11-events.txt

  Scenario: Duplicate or invalid callback is rejected safely
    Tool: Bash
    Steps: Replay the same callback twice and then send one callback with an invalid signature.
    Expected: The duplicate produces no second event row or second outbound webhook delivery, the invalid signature is rejected with `401` or `403`, and send state remains unchanged.
    Evidence: .sisyphus/evidence/task-11-events-error.txt
  ```

  **Commit**: YES | Message: `feat(delivery): add event ingestion webhooks and stats` | Files: webhook APIs, event services, reporting APIs, tests

- [x] 12. Complete the admin UI, docs, conventions, and final cross-system e2e suite

  **What to do**: Finish the React admin console for subscribers, templates, routing rules, campaigns, individual sends, send detail/event history, and reporting dashboards. Add README, INSTALL, CHANGELOG, AGENTS, architecture notes, and repo conventions covering naming, testing, commit expectations, environment setup, and evidence capture. Finalize Playwright coverage for full-stack flows that exercise API, worker, Postfix, and webhook behavior through the UI plus API fixtures.
  **Must NOT do**: Do not introduce unrelated marketing dashboards or dark-pattern UI complexity. Do not leave critical operational setup undocumented. Do not rely on screenshots as the only verification artifact.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: admin UX polish plus documentation and cross-system verification
  - Skills: `[]` - why needed: UI completion with supporting writing and e2e work
  - Omitted: `[]` - why not needed: no special research skill beyond execution

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: - | Blocked By: 3, 4, 5, 6, 7, 8, 9, 10, 11

  **References** (executor has NO interview context - be exhaustive):
  - Source of truth: `.sisyphus/plans/customer-email-platform.md` - all feature scope, exclusions, and verification commands
  - External: `https://react.dev` - component and state composition patterns
  - External: `https://github.com/microsoft/playwright/blob/main/docs/src/auth.md` - auth/session reuse for e2e
  - External: `https://hono.dev/docs/helpers/testing` - API-side assertions that complement browser flows

  **Acceptance Criteria** (agent-executable only):
  - [ ] `pnpm playwright test` passes for auth, subscriber sync, template management, routing rules, individual send, campaign send, and delivery reporting flows.
  - [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` pass after documentation and UI completion.
  - [ ] `test -f README.md && test -f INSTALL.md && test -f CHANGELOG.md && test -f AGENTS.md` exits 0.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```text
  Scenario: End-to-end individual-send flow is visible in the admin console
    Tool: Playwright
    Steps: Log in as admin, create or select a template, trigger an individual send to `alice@example.com`, wait for worker processing and a delivered callback, then open the send detail page.
    Expected: UI shows queued -> accepted_by_mta -> delivered history, raw SMTP/code fields where available, and the outbound result webhook status for the individual send.
    Evidence: .sisyphus/evidence/task-12-e2e.json

  Scenario: Missing operational documentation fails repository verification
    Tool: Bash
    Steps: Run `test -f README.md && test -f INSTALL.md && test -f CHANGELOG.md && test -f AGENTS.md` and a grep/assertion script for conventions content.
    Expected: Verification fails if any required doc is missing or if AGENTS/conventions guidance omits commands and standards required by the plan.
    Evidence: .sisyphus/evidence/task-12-e2e-error.txt
  ```

  **Commit**: YES | Message: `docs(ui): finalize console docs and end-to-end coverage` | Files: admin UI routes/components, Playwright tests, `README.md`, `INSTALL.md`, `CHANGELOG.md`, `AGENTS.md`, conventions docs

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [x] F1. Plan Compliance Audit - oracle
- [x] F2. Code Quality Review - unspecified-high
- [x] F3. Agent-Executed QA - unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check - deep

## Commit Strategy

- Commit 1: workspace scaffold, tooling, and local infra harness
- Commit 2: domain contracts and canonical send state machine
- Commit 3: persistence schema, repositories, and queue foundations
- Commit 4: auth and external API key flows
- Commit 5: subscriber, suppression, and sync slice
- Commit 6: templates and routing-management slice
- Commit 7: individual-send and campaign API slice
- Commit 8: worker dispatch and Postfix correlation slice
- Commit 9: delivery event ingestion, outbound webhooks, and reporting slice
- Commit 10: docs, AGENTS, INSTALL, CHANGELOG, and e2e hardening

## Success Criteria

- A new agent can execute the plan without making architecture choices.
- All functional requirements are represented by concrete, testable tasks.
- Every integration boundary has explicit identifiers, retries, idempotency, and failure handling.
- Scope exclusions prevent v1 drift into multitenancy, scheduling, and advanced marketing automation.
