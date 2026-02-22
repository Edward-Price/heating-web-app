# Secure Controls API Guide (Known-Working)

This is the practical reference for this project. It documents the calls and payload shapes that were validated during implementation.

## 1. Endpoints

- REST base: `https://app.beanbag.online/api/UserRestAPI`
- WebSocket: `wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket`
- WS subprotocol: `BB-BO-01`

## 2. Login (REST) - use MD5

Login works with **MD5 password hash** (32-char lowercase hex), not SHA-1.

### Request

`POST /api/UserRestAPI/LoginRequest`

Headers:
- `Content-Type: application/json`
- `Request-id: 1`

Body:

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

Success criteria:
- HTTP `200`
- response field `"RI": "1"`

### Example success payload (redacted)

```json
{
  "RI": "1",
  "D": {
    "UI": 1905248,
    "SI": 2141539,
    "GD": [
      {
        "GMI": 179830859557900,
        "SN": "H0002765",
        "HN": "H0002765"
      }
    ],
    "JT": "<JWT>"
  }
}
```

Important fields:
- JWT token: `D.JT`
- Session id: `D.SI`
- Gateway/system id: `D.GD[0].GMI`

## 3. WebSocket connection

Connect to:
- `wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket`

Headers:
- `Authorization: Bearer <D.JT>`
- `Session-id: <D.SI>`
- `Request-id: 1`

Subprotocol:
- `BB-BO-01`

## 4. WS envelope

Client requests:

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
- `DTS` is epoch **seconds**.
- `I` should be unique per request.
- `GMI` is the selected gateway ID.

## 5. Read calls used by app

### 5.1 Discover devices/zones
- `SI=11`, `HI=49`

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 11, "HI": 49 },
    []
  ]
}
```

### 5.2 Read all state
- `SI=1`, `HI=3`

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 1, "HI": 3 },
    []
  ]
}
```

Response includes service blocks like:
- thermostat zones: `SI=15`
- hot water: `SI=16`

## 6. Write calls that are confirmed working

## 6.1 Zone target temperature

- Service: Thermostat (`SI=15`)
- Handler: WriteCharacteristics (`HI=2`)
- Characteristic: target temp (`I=1`)
- Value scaling: tenths of a degree (e.g. `20.0C -> 200`)
- Working payload shape: **object form**, not array form

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 15, "HI": 2 },
    [1, { "I": 1, "V": 200, "OT": 1, "D": 0 }]
  ]
}
```

## 6.2 Hot water boost / off

- Service: HotWater (`SI=16`)
- Handler: WriteCharacteristics (`HI=2`)
- Characteristic used for control: `I=4`
- Working payload shape: **object form**

Boost 1 hour:

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 16, "HI": 2 },
    [3, { "I": 4, "V": 0, "OT": 2, "D": 60 }]
  ]
}
```

Boost 2 hours:

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 16, "HI": 2 },
    [3, { "I": 4, "V": 0, "OT": 2, "D": 120 }]
  ]
}
```

Off:

```json
{
  "P": [
    { "GMI": 179830859557900, "SI": 16, "HI": 2 },
    [3, { "I": 4, "V": 0, "OT": 2, "D": 0 }]
  ]
}
```

Expected notify examples after external/offical-app changes:

```json
{
  "V": "1.0",
  "M": "Notify",
  "P": [
    { "SI": 16, "HI": 4, "GMI": 179830859557900 },
    [3, { "I": 4, "V": 1, "OT": 2, "D": 60 }]
  ]
}
```

```json
{
  "V": "1.0",
  "M": "Notify",
  "P": [
    { "SI": 16, "HI": 4, "GMI": 179830859557900 },
    [3, { "I": 4, "V": 0, "OT": 0, "D": 0 }]
  ]
}
```

## 7. Schedule calls (current integration path)

- Read secure schedule: `SI=17`, `HI=22`, payload `[<deviceId or index>]`
- Write secure schedule: `SI=17`, `HI=21`, payload:

```json
[
  {
    "I": "<scheduleId>",
    "D": [
      { "D": [ { "O": 370, "T": 205 }, { "O": 480, "T": 190 } ] },
      { "D": [ ... ] },
      { "D": [ ... ] },
      { "D": [ ... ] },
      { "D": [ ... ] },
      { "D": [ ... ] },
      { "D": [ ... ] }
    ]
  }
]
```

Conventions:
- 7 day blocks, Monday -> Sunday
- `O` = minutes since midnight
- `T` = temperature in tenths of degree C

## 8. Error handling notes

Observed error envelope:

```json
{
  "E": {
    "C": -1,
    "D": { "EC": 4, "ES": 16 }
  }
}
```

Observed meanings in practice:
- `EC=4`: request rejected for that service/payload combination
- `ES`: service context (e.g., 15 thermostat, 16 hot water)

## 9. Known response shape quirks

Backend may return:
- standard envelope with `M` and `P`
- legacy/no-`M` frames with top-level `R`
- success writes as `{V,I,DTS,R:0}` (no `M`)

Clients must match by request id (`I`) and handle these variants.

## 10. Bring-up checklist for a new project

1. Login with MD5 body and verify `RI=="1"`.
2. Save `JT`, `SI`, first `GD[].GMI`.
3. Open WS with required headers + subprotocol.
4. Send `HI=49/SI=11` then `HI=3/SI=1`.
5. Confirm service blocks include `SI=15` and `SI=16`.
6. Confirm one thermostat write works (`I=1` target temp).
7. Confirm hot water write works (`I=4`, `OT=2`, `D=minutes`).
8. Only then implement schedule edit/write flow.
