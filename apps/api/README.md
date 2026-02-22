# apps/api

Node API (Node 20+) with provider integration:

- `POST /auth/login` (Beanbag MD5 login)
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

## Example

```bash
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

Use returned token in `X-Session-Token`:

```bash
curl http://localhost:3001/devices -H 'X-Session-Token: <token>'
curl http://localhost:3001/state -H 'X-Session-Token: <token>'
```
