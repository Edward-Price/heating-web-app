# Beanbag live Swagger reference

The Beanbag provider publishes its current OpenAPI document at:

- Swagger UI: <https://app.beanbag.online/swagger/index.html>
- OpenAPI JSON: <https://app.beanbag.online/swagger/v1/swagger.json>

This endpoint was verified on **2026-09-18**. Treat the live JSON as the provider's
current route and request-schema catalogue. It is not a guarantee that every
response's `D` payload is fully described: many provider operations use the generic
`ResponseObject` schema, whose `D` property is intentionally untyped.

## Relationship to the local specifications

- `securemtr-openapi.yaml` documents REST calls confirmed through captures or use.
- `securemtr_asyncapi.yaml` documents the WebSocket protocol used to read and control
  the selected gateway.
- `securemtr_ws_catalog.md` is the human-readable WebSocket operation catalogue.
- The live Swagger document is the discovery source for provider REST routes and DTO
  names. Confirm important payload shapes against a real response before relying on
  fields that Swagger leaves untyped.

Do not replace the local confirmed specifications wholesale with the live document.
The local files contain observed response shapes and protocol details that the live
Swagger omits.

## Service locations

| Purpose | URL |
| --- | --- |
| REST base | `https://app.beanbag.online/api/UserRestAPI` |
| REST v2 base | `https://app.beanbag.online/api/v2/UserRestAPI` |
| WebSocket | `wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket` |
| WebSocket subprotocol | `BB-BO-01` |

Authenticated REST calls require these headers:

```text
Authorization: Bearer <D.JT from LoginRequest>
Session-id: <D.SI from LoginRequest>
Request-id: 1
```

Provider REST responses normally use this envelope:

```json
{
  "RI": "1",
  "D": {}
}
```

`RI: "1"` is the observed success value.

## Heating-system discovery

The login response already contains the authoritative gateways available to the
account. They are in `D.GD`, an array of `LoginGatewayDetails` objects. Do not assume
that `D.GD[0]` is the gateway the user wants or that it is online.

Important `LoginGatewayDetails` fields:

| Field | Meaning |
| --- | --- |
| `GMI` | Gateway MAC identifier; used in REST queries and WebSocket packet headers |
| `LI` | Provider-supplied gateway/location label |
| `UR` | User role for the gateway |
| `HI` | Home identifier |

Use `GET /api/UserRestAPI/GetInstallations` to enrich those gateways. If an
installation does not supply a useful name, query
`GET /api/UserRestAPI/GetHome?GatewayMACID=...` and use its `HomeDTO.HN` value.
Swagger defines each installation as an `InstallationDTO`:

```text
InstallationDTO
├── GI: GatewayInfo
│   ├── GMI: gateway identifier
│   ├── GSN: gateway serial number
│   ├── IST: installation start time
│   └── IET: installation end time
└── HD: HomeDTO
    ├── HN: home name
    ├── HA1/HA2/HA3: address lines
    ├── C/CO: city/country fields
    └── other location metadata
```

The application merges installation details into the login gateways by `GMI`, then
uses `GetHome` as a per-gateway name fallback.
Gateways returned only by `GetInstallations` are not made selectable unless they were
also granted by the current login response.

Current local flow:

1. `POST /auth/login` authenticates but deliberately selects no gateway.
2. `GET /systems` returns all `D.GD` gateways, enriched by `GetInstallations`.
3. The user chooses a system.
4. `POST /systems/select` validates the gateway against `D.GD` and stores it in the
   server-side session.
5. Device, state, schedule, and control calls use the selected `GMI`.

## Useful provider routes found in Swagger

| Method | Provider route | Purpose |
| --- | --- | --- |
| `POST` | `/api/UserRestAPI/LoginRequest` | Authenticate and return session, token, and `D.GD` gateways |
| `GET` | `/api/UserRestAPI/GetInstallations` | Installation/home metadata for account gateways |
| `GET` | `/api/UserRestAPI/IsGatewayConnected?gatewayMacId=...` | Check a gateway's provider connection state |
| `GET` | `/api/UserRestAPI/GetHome?GatewayMACID=...` | Retrieve home data for a gateway |
| `GET` | `/api/UserRestAPI/GetUserInformation` | Current user details |
| `GET` | `/api/UserRestAPI/GetUserList?gatewayMacId=...&lastUpdatedDateTime=...` | Users associated with a gateway |
| `GET` | `/api/v2/UserRestAPI/GetConnectedGateways?homeId=...` | V2 gateways associated with a home |

The provider exposes many administrative and mutation routes as well. Do not call a
mutation merely because it appears in Swagger; first document its observed behavior
and confirm it is required by the product.

## Re-checking the live contract

Download a temporary copy without adding generated vendor files to the repository:

```bash
curl -fsSL https://app.beanbag.online/swagger/v1/swagger.json \
  -o /tmp/beanbag-swagger-v1.json
```

List system-related operations:

```bash
jq -r '.paths | keys[] | select(test("Install|Gateway|Home"; "i"))' \
  /tmp/beanbag-swagger-v1.json
```

Inspect the discovery DTOs:

```bash
jq '.components.schemas | {
  LoginGatewayDetails,
  InstallationDTO,
  GatewayInfo,
  HomeDTO,
  ResponseObject
}' /tmp/beanbag-swagger-v1.json
```

When the provider contract changes, update this note and the relevant confirmed local
specification. Never commit real tokens, session IDs, gateway IDs, email addresses, or
captured personal/home data.
