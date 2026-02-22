# Heating Web App

Runnable monorepo starter for migrating Secure Controls app to web + Node backend.

## Run

From project root:

- `npm run dev:web` -> web app on http://localhost:5173
- `npm run dev:api` -> api on http://localhost:3001
- `npm run dev:worker` -> worker loop (15-minute interval, immediate first tick)

Web frontend in dev uses `/api` proxy to `http://localhost:3001`.

## Docker (Local Server)

From project root:

1. Build and start:
   - `docker compose up --build -d`
2. Open:
   - `http://localhost:8080`
3. Stop:
   - `docker compose down`

Services:

- `web` (nginx + built React app) on port `8080`
- `api` (Node backend) internal port `3001` (proxied by `web` via `/api`)

## Structure

- `apps/web` - browser UI starter
- `apps/api` - Node API starter
- `apps/worker` - background polling starter
- `packages/shared` - shared constants/types starter
- `docs` - copied protocol and migration docs

Next step: replace stubs with real API/WS + DB implementation from `docs/migration-checklist.md`.

## GitHub Action: Tailscale -> Portainer deploy

Workflow file: `.github/workflows/deploy-portainer-tailscale.yml`

Set these GitHub repository secrets:

- `TAILSCALE_AUTHKEY`: reusable Tailscale auth key for CI
- `PORTAINER_WEBHOOK_URL`: full Portainer stack webhook URL

When you push to `main`/`master` (or run manually), the action:

1. Joins your Tailscale network
2. Calls the Portainer webhook to redeploy the stack

## Web Caching Policy (No PWA / No Service Worker)

This project is intentionally **not** a PWA.

- No service worker is registered.
- Do not add `vite-plugin-pwa`, Workbox, or any `navigator.serviceWorker.register(...)` logic.
- Keep updates server-driven so new deploys are picked up on reload.

If a browser ever serves stale files after deploy:

1. Hard refresh (`Cmd+Shift+R` on macOS, `Ctrl+F5` on Windows)
2. Clear site data for the app origin
3. In DevTools Console, run:
   - `caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))`
   - `navigator.serviceWorker?.getRegistrations().then(r => r.forEach(x => x.unregister()))`
