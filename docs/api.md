# API Guide

This document reflects the API calls currently used by the app in `apps/web` and how they are translated by the local API in `apps/api`.

## Architecture

The frontend does not call the provider directly.

Flow:

1. Web app calls the local API at `VITE_API_BASE` or `/api`.
2. Local API authenticates the user and stores an app session token.
3. Local API talks to the provider using:
   - REST base: `https://app.beanbag.online/api/UserRestAPI`
   - WebSocket: `wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket`
   - WS subprotocol: `BB-BO-01`

Frontend requests use:

- Header: `X-Session-Token: <appSessionToken>`
- Header: `Content-Type: application/json`

## Frontend Endpoints

These are the routes currently used by the web app.

### `POST /auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "plain-text-password"
}
```

Response:

```json
{
  "ok": true,
  "appSessionToken": "<local-session-token>",
  "provider": {
    "userId": 1905248,
    "sessionId": "2141539",
    "gatewayId": "179830859557900",
    "loginResponse": {}
  }
}
```

Notes:

- The browser sends the plain password only to the local API.
- The local API hashes it with MD5 before sending the provider login request.

### `POST /auth/logout`

Invalidates the local app session.

Response:

```json
{
  "ok": true
}
```

### `GET /devices`

Returns parsed devices from the provider `SI=11`, `HI=49` call.

Response shape:

```json
{
  "ok": true,
  "devices": [
    {
      "id": 1,
      "name": "Living Room",
      "type": "zone",
      "raw": {}
    }
  ],
  "providerResponse": {}
}
```

### `GET /state`

Returns parsed device state from provider `SI=1`, `HI=3`.

Response shape:

```json
{
  "ok": true,
  "stateByDeviceId": {
    "1": {
      "deviceId": 1,
      "targetTemp": 20,
      "currentTemp": 19.5,
      "heatingOn": false,
      "mode": 1
    }
  },
  "providerResponse": {}
}
```

### `POST /zones/:zoneId/target-temp`

Used by the web app to change a thermostat target temperature.

Request:

```json
{
  "targetTemp": 20.5
}
```

Behavior:

- Local API sends provider write `SI=15`, `HI=2`
- Payload shape:

```json
[
  1,
  { "I": 1, "V": 205, "OT": 1, "D": 0 }
]
```

Notes:

- `targetTemp` is in Celsius in the web app.
- Provider temperature values are written in tenths of a degree.

### `POST /hot-water/:deviceId/boost`

Request:

```json
{
  "minutes": 60
}
```

Accepted values:

- `0`
- `60`
- `120`

Behavior:

- Local API sends provider write `SI=16`, `HI=2`
- Payload shape:

```json
[
  3,
  { "I": 4, "V": 1, "OT": 2, "D": 60 }
]
```

For `minutes: 0` the local API writes:

```json
[
  3,
  { "I": 4, "V": 0, "OT": 0, "D": 0 }
]
```

### `GET /zones/:zoneId/schedule`

Loads a zone schedule for the schedule UI.

Response:

```json
{
  "ok": true,
  "zoneId": 1,
  "scheduleId": 42,
  "week": [
    {
      "dayIndex": 0,
      "periods": [
        { "start": 6, "end": 8, "temp": 20.5 },
        { "start": 8, "end": 22.5, "temp": 19 }
      ]
    }
  ],
  "providerResponse": {}
}
```

Notes:

- `dayIndex` is `0-6` for Monday-Sunday.
- `start` and `end` are hours in the local API response.
- The frontend snaps displayed periods to 10-minute increments.

### `PUT /zones/:zoneId/schedule/day/:dayIndex`

Primary schedule save endpoint used by the current web app.

Request:

```json
{
  "scheduleId": 42,
  "week": [
    {
      "dayIndex": 0,
      "periods": [
        { "start": 6, "end": 8, "temp": 20.5 },
        { "start": 8, "end": 22.5, "temp": 19 }
      ]
    },
    {
      "dayIndex": 1,
      "periods": [
        { "start": 6, "end": 8, "temp": 20.5 }
      ]
    }
  ]
}
```

Behavior:

- Even though the route includes `:dayIndex`, the web app sends the full `week`.
- The local API reads the current provider schedule first.
- If `scheduleId` is missing, the local API resolves it from the current provider schedule.
- If `week` is missing, the local API reuses the current provider week.
- After a successful write, the local API attempts a readback and returns the parsed week.

Response:

```json
{
  "ok": true,
  "zoneId": 1,
  "dayIndex": 0,
  "scheduleId": 42,
  "week": [],
  "providerResponse": {}
}
```

### `POST /zones/:zoneId/schedule/day/:dayIndex`

Compatibility fallback. The frontend tries `PUT` first and retries with `POST` only if `PUT` returns `404`.

The request and response shapes are the same as the `PUT` route.

### `GET /stats/zone/:zoneId?range=<day|month>&anchor=<iso-like-value>`

Returns chart data for the stats screen.

Example:

`GET /stats/zone/1?range=day&anchor=2026-03-12`

## Provider Login And Transport

The local API authenticates with the provider like this.

### Provider login

`POST /api/UserRestAPI/LoginRequest`

Request:

```json
{
  "ULC": {
    "OI": 1550005,
    "P": "<md5(password)>",
    "NT": "SetLogin",
    "UEI": "<email>"
  }
}
```

Required headers:

- `Content-Type: application/json`
- `Request-id: 1`

Expected success markers:

- HTTP `200`
- `RI === "1"`
- `D.JT`, `D.SI`, and `D.GD[0].GMI` present

### Provider WebSocket

Connect to:

- `wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket`

Headers:

- `Authorization: Bearer <JT>`
- `Session-id: <SI>`
- `Request-id: 1`

Subprotocol:

- `BB-BO-01`

Envelope:

```json
{
  "V": "1.0",
  "DTS": 1771672779,
  "I": "<sessionId>-<seq>",
  "M": "Request",
  "P": [
    { "GMI": 179830859557900, "SI": 15, "HI": 2 },
    [1, { "I": 1, "V": 200, "OT": 1, "D": 0 }]
  ]
}
```

Notes:

- `DTS` is epoch seconds.
- `I` is incremented per request by the local API.
- The client retries some requests with `GMI` as either number or string.
- For empty payload reads, the client can retry with payload omitted entirely.

## Schedule Provider Calls

This is the part that changed and should be treated as the current source of truth.

### Schedule read

Provider read uses:

- `SI=17`
- `HI=22`
- Payload: `[<zoneIdOrIndex>]`

The local API currently tries the requested zone id first, then fallback indexes `1` and `2` if needed.

Example:

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 17, "HI": 22 },
    [1]
  ]
}
```

### Schedule write

Provider write uses:

- `SI=17`
- `HI=21`

The local API does not assume there is only one valid provider shape. It determines a preferred write shape from the current schedule returned by the provider, then falls back to the other shape if the first write fails or the provider rejects it with `EC=4`, `ES=17`.

Supported write shapes:

1. `week-blocks`
2. `flat-stream`

### `week-blocks` write shape

This is the older documented shape and is still supported by the server:

```json
[
  {
    "I": 42,
    "D": [
      { "D": [ { "O": 360, "T": 205 }, { "O": 480, "T": 190 } ] },
      { "D": [ { "O": 360, "T": 205 } ] },
      { "D": [ { "O": 360, "T": 205 } ] },
      { "D": [ { "O": 360, "T": 205 } ] },
      { "D": [ { "O": 360, "T": 205 } ] },
      { "D": [ { "O": 480, "T": 190 } ] },
      { "D": [ { "O": 480, "T": 190 } ] }
    ]
  }
]
```

### `flat-stream` write shape

This is the important update for SPI schedule saving.

The local API can now write the schedule as one flat `D` array with day separator sentinels:

```json
[
  {
    "I": 42,
    "D": [
      { "O": 360, "T": 205 },
      { "O": 480, "T": 190 },
      { "O": 65535, "T": 65535 },
      { "O": 360, "T": 205 },
      { "O": 65535, "T": 65535 }
    ]
  }
]
```

Rules:

- `O` is minutes since midnight.
- `T` is usually tenths of a degree C.
- A sentinel day separator is appended after every day:
  - `{ "O": 65535, "T": 65535 }`
- The server writes all 7 days in one payload.

### How the local API builds a write payload

For each day:

- Input periods are sorted by `start`.
- `start` and `end` are clamped into `0-24`.
- Invalid periods are dropped.
- Each provider entry is created from the period `start` only.
- `O = round(start * 60)`
- `T = round(temp * 10)` for normal Celsius values

Important consequence:

- The provider payload is a list of change points, not explicit `[start,end,temp]` tuples.
- The end of one period is inferred from the next entry, or `24:00` for the final entry.

### Schedule read shape parsing

The local API can parse multiple provider response shapes:

1. Top-level week blocks:
   - `[{ I, D: [{ D: [...] }, ...] }]`
2. Payload-level week blocks:
   - `[{ D: [...] }, ...]`
3. Flat stream with day markers embedded in entries
4. Flat stream split by sentinel markers `65535/65535`
5. Flat stream reused for all days if the provider returns one shared set

The parser returns:

```json
{
  "scheduleId": 42,
  "week": [
    {
      "dayIndex": 0,
      "periods": [
        { "start": 6, "end": 8, "temp": 20.5 }
      ]
    }
  ],
  "writeShape": "flat-stream"
}
```

`writeShape` is internal to the server but is what drives the preferred save shape on the next write.

## Error Handling

Provider errors can come back as:

```json
{
  "E": {
    "C": -1,
    "D": { "EC": 4, "ES": 17 }
  }
}
```

Current handling:

- `401` from local API means the app session is missing or expired.
- `400` means local validation failed.
- `502` means the provider rejected the request or the write transport failed.
- Schedule writes retry with the alternate provider shape when the first attempt fails for service `17`.

## Current Frontend Save Flow

The schedule UI currently saves like this:

1. `GET /zones/:zoneId/schedule`
2. User edits one day in the UI
3. Frontend sends the full week to `PUT /zones/:zoneId/schedule/day/:dayIndex`
4. If `PUT` returns `404`, frontend retries the same body with `POST`
5. Local API reads the live provider schedule
6. Local API writes `SI=17`, `HI=21` using the preferred provider shape
7. If needed, local API retries with the alternate shape
8. Local API reads back the schedule and returns normalized `week`

That is the current behavior implemented in the app.
