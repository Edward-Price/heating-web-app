# Migration Checklist: React Native -> Web + Node Backend

Use this checklist when starting the new project so protocol behavior stays correct.

## 0) Copy these docs into the new repo first

Required:
- `docs/api.md`
- `docs/securemtr-openapi.yaml`
- `docs/securemtr_asyncapi.yaml`
- `docs/securemtr_ws_catalog.md`
- `docs/migration-checklist.md` (this file)

Optional:
- `agents.md` (if you want role/task guidance)

## 1) Target architecture

- Frontend: React web app (PWA-capable).
- Backend: Node.js API server (handles auth + WS to Beanbag cloud).
- DB: Postgres for users/sessions + temperature history.
- Background worker: polls temperatures every 15 min and writes to DB.

Reason:
- Browser cannot reliably set required WS upgrade headers to Beanbag WS.
- Backend can set `Authorization`, `Session-id`, `Request-id`, and subprotocol `BB-BO-01`.

## 2) Create new project structure

Suggested monorepo:

```text
new-heating-app/
  apps/
    web/
    api/
    worker/
  packages/
    shared/
  docs/
```

Minimum stack:
- `apps/web`: Vite + React + TypeScript
- `apps/api`: Fastify (or Express) + TypeScript
- `apps/worker`: Node TS job runner (cron every 15 min)
- DB ORM: Prisma (or Drizzle)

## 3) Backend first (do this before frontend)

Implement in order:

1. `POST /auth/login`
   - Accept email/password.
   - Perform Beanbag login using `docs/api.md`:
     - MD5 hash
     - `POST /api/UserRestAPI/LoginRequest`
     - success only when HTTP 200 + `RI=="1"`.
   - Store encrypted provider credentials/session:
     - JWT (`D.JT`)
     - Session ID (`D.SI`)
     - Gateway ID (`D.GD[0].GMI`)

2. WS gateway service in backend
   - Connect to Beanbag WS with:
     - `Authorization: Bearer <JT>`
     - `Session-id: <SI>`
     - `Request-id: 1`
     - subprotocol `BB-BO-01`
   - Implement request envelope exactly as in `docs/api.md`.
   - Handle response variants:
     - normal `M=Response`
     - `Ack`
     - legacy/no-`M` frames with top-level `R`
     - write success like `{V,I,DTS,R:0}`

3. Backend service methods (minimum)
   - `getDevices`: `SI=11, HI=49`
   - `getState`: `SI=1, HI=3`
   - `setZoneTargetTemp`: `SI=15, HI=2`, payload `[deviceId, {I:1,V:<temp*10>,OT:1,D:0}]`
   - `setHotWaterBoost`: `SI=16, HI=2`, payload `[deviceId, {I:4,V:0,OT:2,D:<0|60|120>}]`
   - `getSchedule`: `SI=17, HI=22`
   - `setSchedule`: `SI=17, HI=21`

4. Internal API endpoints for web app
   - `GET /devices`
   - `GET /state`
   - `POST /zones/:id/target-temp`
   - `POST /hot-water/:id/boost`
   - `GET /zones/:id/schedule`
   - `PUT /zones/:id/schedule/day/:dayIndex`

## 4) Database schema (minimum)

Tables:
- `users`
- `provider_sessions` (encrypted token/session/gateway fields)
- `devices`
- `temperature_readings`
  - `id`, `user_id`, `device_id`, `recorded_at`, `current_temp`, `target_temp`, `heating_on`
- `schedule_snapshots` (optional but useful for audit/versioning)

Indexes:
- `(user_id, device_id, recorded_at DESC)` on `temperature_readings`

Retention:
- keep raw 15-min data for 90 days (or chosen period)

## 5) Worker job (15-minute logging)

Every 15 minutes:
1. Load active users/provider sessions.
2. Call backend WS service `getState`.
3. Extract thermostat zones.
4. Upsert readings into `temperature_readings`.

Failure behavior:
- retry with backoff
- mark provider session stale if repeated auth failure

## 6) Frontend milestones

1. Login/logout flow against your backend.
2. Dashboard:
   - zones
   - current/target/heating state
   - hot water controls
3. Zone detail:
   - interactive target control
4. Schedules:
   - week overview
   - day editor + save day
5. Graphs:
   - day/week/month using `temperature_readings`

## 7) Security checklist

- Never expose Beanbag JWT/session to browser.
- Encrypt provider session fields at rest.
- Store app auth secrets in host secret manager/env vars.
- HTTPS only.
- Add rate limiting on write endpoints.
- Add server-side validation for temperatures/schedule values.

## 8) Hosting (low-cost baseline)

- Web: Vercel
- API + Worker: Render or Railway
- DB: Neon Postgres

## 9) Definition of done (phase 1)

- Can login through backend and persist app session.
- Dashboard loads zones + state.
- Zone temp write works.
- Hot water boost/off works.
- Schedule day edit/save works.
- Worker writes 15-min temperatures to DB.
- Graph screen renders day/week/month history.

---

## Ready-to-paste Codex prompt for new repo

```text
Use docs/api.md + docs/securemtr-openapi.yaml + docs/securemtr_asyncapi.yaml + docs/securemtr_ws_catalog.md + docs/migration-checklist.md as the source of truth.

Build a web + node backend app with this order:
1) backend auth/login + Beanbag WS gateway service,
2) devices/state read endpoints,
3) zone target + hot water write endpoints,
4) schedule read/write day endpoint,
5) postgres schema + 15-minute worker for temperature history,
6) web dashboard + zone detail + schedules + graph view.

Critical constraints:
- Login uses MD5 hash and RI=="1" success check.
- WS uses Authorization + Session-id + Request-id headers and BB-BO-01 subprotocol.
- Use exact payload shapes from docs/api.md for zone/hot water writes.
- Handle legacy WS response shapes with/without M field.

Implement directly with code changes, not just a plan.
```

## How to use this in practice

In the new repo, you can say:
- "Read `docs/migration-checklist.md` and execute phase 1 end-to-end."

Yes, that works well, as long as those docs are copied into the new repo first.
