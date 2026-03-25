# Send Engine EML, History, and SMTP Operations

## Context

- Existing `customer-email-platform` top-level plan is complete.
- Current product is already send-only, but still accepts structured `subject/html/text` payloads.
- Admin send history currently loads the full send list and filters client-side.
- Admin send page still exposes a manual test-send form that no longer matches the product boundary.
- SMTP nodes support create/list/update only; operators want connection testing and safe deletion.

## Objective

Implement the next send-engine refinement wave:

1. server-side send-history pagination and search,
2. removal of the admin test-send surface,
3. SMTP node connection testing,
4. guarded SMTP node delete,
5. raw EML send support,
6. docs/tests/verification updates.

## Constraints

- Work exclusively in `/Users/will/Jobs/projects/labs/supermailer`.
- Preserve delivery-event ingestion and send-result polling behavior.
- Treat raw EML as the highest-blast-radius change and sequence it last.
- Do not hard-delete SMTP nodes that are still referenced by routing or historical send records.
- Keep docs and OpenAPI aligned with the final shipped behavior.

## TODOs

- [ ] 1. Add server-side send-history pagination and search contracts

  **What to do**: Add route/repository/client coverage for server-side pagination, search, stable ordering, and send-history detail compatibility before changing implementation.
  **Verification**: integration tests for admin send listing contract and e2e coverage for query persistence + detail inspection.

  **QA Scenarios**:

  ```text
  Scenario: Admin send listing contract supports search and bounded page size
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- admin-send-history-contract` after adding route/repository contract tests for `/api/sends?search=alice@example.com&limit=2`.
    Expected: Response is stable-ordered, returns at most 2 records, includes pagination metadata, and still allows detail-event retrieval for returned send IDs.

  Scenario: Sends page query state survives refresh before implementation changes
    Tool: Playwright
    Steps: Run `pnpm e2e -- e2e/send-history-query-state.spec.ts` against a seeded send list with at least 3 records and a search term.
    Expected: Search value persists in the URL and rehydrates after reload without breaking "이력 보기" expansion for a returned row.
  ```

- [ ] 2. Implement admin send-history pagination and search

  **What to do**: Extend the admin send listing API and repository with pagination/search, then update the admin sends UI to consume server-driven results instead of filtering a fully loaded list in memory.
  **Verification**: targeted integration tests, e2e send-history flow, full lint/type/test.

  **QA Scenarios**:

  ```text
  Scenario: Server-side search returns only matching recipients
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- admin-send-history-search` with seeded sends for `alice@example.com`, `bob@example.com`, and `carol@example.com`.
    Expected: `/api/sends?search=alice` returns only Alice records and preserves newest-first ordering.

  Scenario: Sends page paginates and preserves detail inspection
    Tool: Playwright
    Steps: Run `pnpm e2e -- e2e/send-history-pagination.spec.ts`, navigate across pages on `/sends`, then open an event history row from page 2.
    Expected: The UI moves between pages without loading the whole list client-side, and send detail expansion still shows delivery events/webhook status for the selected row.
  ```

- [ ] 3. Remove the admin test-send route and UI surface

  **What to do**: Delete the manual test-send form from the sends page and remove the matching admin route, leaving the sends screen as history/inspection only.
  **Verification**: e2e and integration tests prove the sends page still works without the removed endpoint.

  **QA Scenarios**:

  ```text
  Scenario: Removed admin send route returns not found
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- removed-admin-send-route` with a request to `POST /api/admin/individual-sends`.
    Expected: The route is absent or rejected in a controlled way, and no send row is created.

  Scenario: Sends page shows history only and no manual form
    Tool: Playwright
    Steps: Run `pnpm e2e -- e2e/send-history-pagination.spec.ts`, visit `/sends`, and assert the page contains history/search controls but not the former manual send fields/buttons.
    Expected: No subject/html/text test-send controls are visible, while search, pagination, and event inspection remain functional.
  ```

- [ ] 4. Add SMTP node connection testing

  **What to do**: Add a management-console endpoint and UI action that performs a short-timeout SMTP connectivity/auth probe without sending a message.
  **Verification**: integration tests for success/failure probe results and e2e coverage from the routing page.

  **QA Scenarios**:

  ```text
  Scenario: SMTP probe succeeds for reachable local node
    Tool: Bash
    Steps: Start local infra with `docker compose up -d`, then run `pnpm --filter @supermailer/management-console test:integration -- smtp-node-connection-test-success` against a node pointing at the local SMTP/Postfix stack.
    Expected: Probe returns structured success with host/port metadata and does not enqueue or send any message.

  Scenario: SMTP probe fails cleanly for unreachable host
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- smtp-node-connection-test-failure` against a node configured with an unreachable port or bad host.
    Expected: Probe returns structured failure/timeout information, and the admin route does not crash or persist misleading success state.

  Scenario: Routing page exposes test action feedback
    Tool: Playwright
    Steps: Run `pnpm e2e -- e2e/routing-rules.spec.ts`, click the node test action for a valid node and an invalid node fixture.
    Expected: The UI shows explicit success/failure feedback for the test action without modifying the node configuration.
  ```

- [ ] 5. Add guarded SMTP node delete behavior

  **What to do**: Add delete handling that blocks with a structured conflict when the node is still referenced by active routing rules or historical send/attempt records.
  **Verification**: integration tests for blocked and allowed delete cases plus routing UI feedback coverage.

  **QA Scenarios**:

  ```text
  Scenario: Delete is blocked when node is referenced by active routing rules
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- smtp-node-delete-blocked-by-routing` after seeding a latest-version routing rule that references the node.
    Expected: DELETE returns `409` with a machine-readable conflict response and the node remains listed.

  Scenario: Delete is blocked when node is referenced by historical send records or attempts
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- smtp-node-delete-blocked-by-history` after seeding sends/dispatch attempts that reference the node.
    Expected: DELETE returns `409`, preserves historical records, and does not null out trace fields.

  Scenario: Unreferenced node deletes successfully from routing UI
    Tool: Playwright
    Steps: Run `pnpm e2e -- e2e/routing-rules.spec.ts`, create an unreferenced node, delete it, and refresh the routing page.
    Expected: The node disappears from the active list, while referenced-node delete actions show a clear blocked state/error.
  ```

- [ ] 6. Add raw EML send support

  **What to do**: Add raw EML as the canonical send payload path across API, persistence, worker dispatch, and SMTP transport while preserving searchable metadata and delivery tracing.
  **Verification**: route/repository/worker integration tests for valid EML, invalid EML, accepted dispatch, retry behavior, and event correlation.

  **QA Scenarios**:

  ```text
  Scenario: Valid raw EML is accepted and queued
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- raw-eml-send-acceptance` with a `POST /api/sends` request containing a valid RFC822 message fixture.
    Expected: Response is accepted/queued, searchable metadata is persisted, and the send can later be found in send history.

  Scenario: Invalid raw EML is rejected before persistence
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/management-console test:integration -- raw-eml-send-rejection` with malformed MIME/header fixtures.
    Expected: The API returns a validation error and no send row or queue job is created.

  Scenario: Worker dispatches raw EML and preserves tracing/event flow
    Tool: Bash
    Steps: Run `pnpm --filter @supermailer/mail-worker test:integration -- raw-eml-dispatch` with a queued raw-EML send fixture and the local SMTP test stack.
    Expected: The worker dispatches without reconstructing HTML/text, attempt metadata is persisted, and delivery events still correlate back to the send record.
  ```

- [ ] 7. Update docs, OpenAPI, notes, and full verification

  **What to do**: Update README, INSTALL, OPERATIONS, CLIENT_API, and `openapi.yaml`; append learnings/issues notes; run full repo verification.
  **Verification**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm e2e` all pass.

  **QA Scenarios**:

  ```text
  Scenario: Client docs and OpenAPI reflect raw EML and current admin behavior
    Tool: Bash
    Steps: Run `test -f openapi.yaml && test -f CLIENT_API.md && grep -n "eml" openapi.yaml CLIENT_API.md README.md INSTALL.md OPERATIONS.md`.
    Expected: The files exist and document raw EML input, send-history usage, and SMTP node operations without stale subject/html/text-only guidance.

  Scenario: Full repository verification passes after the migration
    Tool: Bash
    Steps: Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm e2e` from the worktree root.
    Expected: All commands exit 0 in sequence.
  ```
