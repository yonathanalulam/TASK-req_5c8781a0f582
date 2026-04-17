# API Reference (summary)

All endpoints under `/api/v1`. JSON envelope:
```json
{ "success": true, "data": {}, "error": null, "meta": { "requestId": "...", "serverTime": "..." } }
```

## Auth
- `GET /auth/security-questions`
- `POST /auth/signup` `{ username, password, displayName, securityQuestionId, securityAnswer }`
- `POST /auth/login` `{ username, password }` → `{ token, sessionId, user }`
- `POST /auth/logout` (auth)
- `GET /auth/me` (auth)
- `POST /auth/reset/start` `{ username }` → `{ questionText, questionId }`
- `POST /auth/reset/complete` `{ username, securityAnswer, newPassword }`
- `POST /auth/change-password` (auth) `{ currentPassword, newPassword }`

## Catalog
- `GET /catalog/services?q=&category=&tag=&limit=&skip=`
- `GET /catalog/services/sync` — full snapshot for offline cache
- `GET /catalog/categories`, `GET /catalog/tags`
- `POST /catalog/services` (cap `catalog.manage`)
- `PUT /catalog/services/:id`, `DELETE /catalog/services/:id`

## Admin
- `GET /admin/users`, `POST /admin/users/:id/roles`, `DELETE /admin/users/:id/roles/:roleCode`
- `POST /admin/users/:id/scopes`, `POST /admin/users/:id/unlock`
- `POST /admin/sessions/force-logout`
- `GET /admin/audit`, `POST /admin/audit/verify`

## Shoes & Custody
- `POST /shoes/intake` (idempotent)
- `POST /shoes/:id/photos` (multipart `photos[]`)
- `POST /shoes/:id/complete-intake`
- `GET /shoes/:id`, `GET /shoes`, `GET /shoes/attachments/:opaqueId`
- `POST /custody/scan` (idempotent) `{ barcode, eventType, toState?, station?, notes?, manualEntry?, manualEntryReason? }`
- `GET /custody/lookup?barcode|serial|ownerUserId`
- `GET /custody/verify-barcode/:code`

## Contracts / Billing / Deposits
- `POST /contracts`, `POST /contracts/:id/activate|amend|renew|terminate`
- `GET /contracts`, `GET /contracts/expirations`, `GET /contracts/:id`
- `POST /billing/contracts/:id/rules`, `GET /billing/contracts/:id/rules`
- `POST /billing/contracts/:id/events`, `POST /billing/contracts/:id/events/:eventId/correct`
- `POST /deposits/contracts/:id/ledger`, `GET /deposits/contracts/:id/ledger`
- `POST /deposits/contracts/:id/reconciliation/complete`, `GET /deposits/contracts/:id/reconciliation`

## Addresses / Shipping
- `POST /addresses`, `GET /addresses`, `GET /addresses/:id`
- `POST /shipping` (idempotent), `POST /shipping/:id/transition`
- `POST /shipping/:id/proof-of-delivery` (multipart `signature`)
- `POST /shipping/:id/delivery-failed`, `POST /shipping/:id/delivery-exception/signoff`
- `GET /shipping`, `GET /shipping/:id`

## Exceptions / Appeals
- `POST /exceptions`, `POST /exceptions/:id/transition`, `GET /exceptions`, `GET /exceptions/:id`
- `POST /appeals` (idempotent, multipart `evidence[]`)
- `POST /appeals/:id/start-review`, `POST /appeals/:id/decide`, `POST /appeals/:id/withdraw`
- `GET /appeals`, `GET /appeals/:id`

## Tags
- `POST /tags/assign`, `POST /tags/remove`, `GET /tags/user/:userId`
- `GET /tags/history`, `POST /tags/rules`, `GET /tags/rules`
- `POST /tags/recompute`, `GET /tags/counts`

## Imports / Exports / Reports / Jobs
- `POST /imports/tags` (multipart CSV), `GET /imports`, `GET /imports/:id`
- `POST /exports/(contracts|tags|exceptions|appeals|shipping)`, `GET /exports`, `GET /exports/:id/download`
- `GET /reports/kpis` — response includes `scope: "global" | "scoped"`. Admin, security_admin, and ops (without specific non-global scopes) receive `scope: "global"` with site-wide aggregates. Faculty advisors and corporate mentors receive `scope: "scoped"` with aggregates filtered to their assigned scopes (contract/reconciliation fields are `null` in scoped responses because those records are not scope-tagged). Scoped reviewers with no effective scope assignment receive 403. Students are 403.
- `GET /jobs/runs`, `POST /jobs/run/:name`

## Service Requests
Member-initiated (or ops-on-behalf) service orders against the service catalog.

- `POST /service-requests` (auth; idempotent via `Idempotency-Key` header)
  - Body: `{ serviceCodes: string[], onBehalfOfUserId?: string, shoeProfileId?: string, notes?: string, scopes?: [{dimension,value}] }`
  - Students may create for themselves. `onBehalfOfUserId` requires `operations_staff` or `department_admin`; otherwise 403.
  - `serviceCodes` must reference active `ServiceCatalogEntry` records; otherwise 422.
  - Optional `shoeProfileId` must be owned by the requester (or subject when acting on behalf) unless the caller is ops/admin; otherwise 403.
  - Created status: `submitted`. Response: 201 with the created record.

- `GET /service-requests?status=&shoeProfileId=` (auth)
  - Returns `{ items, total }`.
  - Ownership/scope filter: admin/security_admin/ops see all. Requesters see their own (including requests created `onBehalfOfUserId` equal to them). Faculty advisors and corporate mentors see only records whose `scopes` intersect their scope assignments.

- `GET /service-requests/:id` (auth)
  - 404 if missing. 403 if the caller is not the requester/subject, not admin/ops, and the record's scopes do not intersect the caller's (faculty/mentor).
  - Response: `{ request, shoe, catalog }` with a public-safe shoe summary and catalog detail for each code.

- `POST /service-requests/:id/cancel` (auth)
  - Body: `{ reason?: string }`.
  - Allowed for the requester, `operations_staff`, or `department_admin`; otherwise 403.
  - Requires current status in `{ submitted, draft, accepted }`; otherwise 409 `INVALID_STATE`.
  - Transitions status → `cancelled`. Audit logged.

Errors: 401 unauthenticated · 403 forbidden (ownership/scope) · 404 not found · 409 `INVALID_STATE` (illegal cancel transition) · 422 `VALIDATION_ERROR` (missing/unknown service codes or missing `onBehalfOfUserId`).

## Status codes
- 200 OK, 201 Created
- 401 unauthenticated, 403 forbidden, 404 not found
- 409 CONFLICT (state, idempotency, duplicates, illegal transitions)
- 422 VALIDATION_ERROR (bad input)
- 423 LOCKED (account/reset lockout)
- 410 GONE (attachment file missing)
- 500 INTERNAL_ERROR
