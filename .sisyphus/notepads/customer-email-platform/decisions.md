# Decisions

- 2026-03-20: Use the workspace root as the execution path recorded in `.sisyphus/boulder.json` until the project is initialized as a git repository.
- 2026-03-20: Preserve the plan's package layout and do not adopt alternative example layouts such as `workers/*`.
- 2026-03-20: Implement worker health with a minimal built-in `node:http` server in `apps/mail-worker/src/index.ts` rather than introducing Hono or extra dependencies, because the requirement is only a narrow `/health` endpoint on port `3001`.
