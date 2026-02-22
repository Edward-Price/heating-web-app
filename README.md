# Heating Web App

Runnable monorepo starter for migrating Secure Controls app to web + Node backend.

## Run

From project root:

- `npm run dev:web` -> web app on http://localhost:5173
- `npm run dev:api` -> api on http://localhost:3001
- `npm run dev:worker` -> worker loop (15-minute interval, immediate first tick)

## Structure

- `apps/web` - browser UI starter
- `apps/api` - Node API starter
- `apps/worker` - background polling starter
- `packages/shared` - shared constants/types starter
- `docs` - copied protocol and migration docs

Next step: replace stubs with real API/WS + DB implementation from `docs/migration-checklist.md`.
