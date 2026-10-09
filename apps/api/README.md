# apps/api

Node API (Node 20+) with provider integration:

- `POST /auth/login` (Beanbag MD5 login)
- `GET /systems` (list the gateways/systems available to the account)
- `POST /systems/select` (select the gateway used by provider calls)
- `POST /auth/logout`
- `GET /devices` (SI=11 HI=49)
- `GET /state` (SI=1 HI=3)
- `POST /zones/:id/target-temp` (SI=15 HI=2)
- `POST /hot-water/:id/boost` (SI=16 HI=2)

## Node version

Use Node 20 from repo root:

```bash
nvm use
```

(`.nvmrc` is set to `20`.)

## Run

```bash
npm run dev:api
```

## Temperature history

The stats screen reads recorded samples from SQLite; it does not fetch historical readings from Beanbag.
Signing into the web app does not enable the background collector.

Set `STATS_PROVIDER_EMAIL` and `STATS_PROVIDER_PASSWORD` in the root `.env` file for local development,
or in the Portainer stack environment for deployment. Use the Beanbag account credentials.
For an account with multiple systems, set `STATS_PROVIDER_GATEWAY_ID` to the gateway ID of the system
whose history you want to record; otherwise the collector uses the first system on the account.
The collector records one system per API instance.

Restart/redeploy the API after changing these values. It collects on startup and then every
`STATS_POLL_MINUTES` (default: 15). Check the API logs for `[api][stats] collector wrote … points`,
`collector disabled`, or `collector tick failed`. History starts when collection is enabled;
earlier periods remain empty unless samples were already recorded.

The database defaults to `apps/data/stats.sqlite`. Docker mounts `./apps/data` to persist it;
keep this volume across deployments. `STATS_DB_PATH` overrides the database location.

## Example

```bash
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

Use returned token in `X-Session-Token`:

```bash
curl http://localhost:3001/systems -H 'X-Session-Token: <token>'
curl -X POST http://localhost:3001/systems/select \
  -H 'Content-Type: application/json' \
  -H 'X-Session-Token: <token>' \
  -d '{"gatewayId":"<gateway-id>"}'
curl http://localhost:3001/devices -H 'X-Session-Token: <token>'
curl http://localhost:3001/state -H 'X-Session-Token: <token>'
```
