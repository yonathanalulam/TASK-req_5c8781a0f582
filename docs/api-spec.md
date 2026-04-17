# API Specification — Offline Lease & Service Operations Portal

Base URL: `/api/v1`

All responses use the envelope:

```json
{ "success": true|false,
  "data": <object|array|null>,
  "error": { "code": "...", "message": "...", "details": ... } | null,
  "meta": { ... } }
```

Authentication (all routes except health/auth/security-questions): `Authorization: Bearer <jwt>`.
Optional on mutating routes: `Idempotency-Key: <uuid>` (7-day uniqueness window).
Optional: `X-Device-Descriptor: <freeform>` (captured in audit + session).

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe. Returns `{ status: 'ok', time }`. |

## Auth (`routes/auth.js`)

| Method | Path | Capability / Auth | Body | Purpose |
|--------|------|-------------------|------|---------|
| GET | `/auth/security-questions` | public | — | List active security questions for signup |
| POST | `/auth/signup` | public | `{ username, password, displayName?, email?, securityQuestionId, securityAnswer }` | Create account with argon2id-hashed password + answer; 201 on success |
| POST | `/auth/login` | public | `{ username, password }` | Returns `{ token, sessionId, user:{ id, username, displayName, mustChangePassword, roles, scopes } }` |
| POST | `/auth/logout` | auth | — | Mark current session `logged_out` |
| GET | `/auth/me` | auth | — | Current user + roles + scopes |
| POST | `/auth/reset/start` | public | `{ username }` | Uniform response regardless of existence |
| POST | `/auth/reset/complete` | public | `{ username, securityAnswer, newPassword }` | Validates answer; on success revokes all active sessions |
| POST | `/auth/change-password` | auth | `{ currentPassword, newPassword }` | New password ≥12 chars |

Error codes: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`, `RESET_LOCKED`.

## Admin (`routes/admin.js`)

| Method | Path | Capability | Body / Query |
|--------|------|------------|--------------|
| GET | `/admin/users` | `user.manage` | `?q&limit&skip` |
| POST | `/admin/users/:id/roles` | `role.manage` | `{ roleCode }` |
| DELETE | `/admin/users/:id/roles/:roleCode` | `role.manage` | — |
| POST | `/admin/users/:id/scopes` | `scope.manage` | `{ dimension, value }` |
| POST | `/admin/users/:id/unlock` | `user.unlock` | `{ reason? }` |
| POST | `/admin/sessions/force-logout` | `force_logout` | `{ userId, reason, sessionId? }` (reason ≥3 chars) |
| GET | `/admin/audit` | `audit.view` | `?action&entityType&actorUserId&limit&skip` |
| POST | `/admin/audit/verify` | `audit.verify` | `{ limit? }` returns `{ valid, checked, broken }` |

## Service Catalog (`routes/catalog.js`)

| Method | Path | Capability | Notes |
|--------|------|------------|-------|
| GET | `/catalog/services` | auth | `?q&category&tag&includeInactive&limit&skip`; response includes `cachedAt` from last update for client cache freshness |
| GET | `/catalog/services/sync` | auth | Full `{services, categories, tags, syncedAt}` payload for offline cache hydration |
| GET | `/catalog/categories` | auth | Active categories |
| GET | `/catalog/tags` | auth | Active tags |
| POST | `/catalog/services` | `catalog.manage` | `{ code, name, description?, categoryCode?, tags?, priceCents?, estimatedDurationMinutes?, active?, displayOrder? }` |
| PUT | `/catalog/services/:id` | `catalog.manage` | Optimistic-concurrency via `version` field (409 on stale) |
| DELETE | `/catalog/services/:id` | `catalog.manage` | Soft delete (`active=false`) |
| POST | `/catalog/categories` | `catalog.manage` | `{ code, name, ... }` |
| POST | `/catalog/tags` | `catalog.manage` | `{ code, label, ... }` |

## Service Requests (`routes/serviceRequests.js`)

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/service-requests` | auth | `{ serviceCodes[], onBehalfOfUserId?, shoeProfileId?, notes?, scopes? }` (ops/admin only for `onBehalfOfUserId`) |
| GET | `/service-requests` | auth | `?status&shoeProfileId` — filtered by visibility |
| GET | `/service-requests/:id` | auth | Returns `{ request, shoe, catalog }` |
| POST | `/service-requests/:id/cancel` | owner/ops/admin | `{ reason? }` — cancel from `submitted|draft|accepted` |

## Shoes / Intake / Attachments (`routes/shoes.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/shoes/intake` | `shoe.intake.create` | `{ ownerUserId, brand, size, material?, color?, defectNotes?, scopes?, allowDuplicateOverride?, duplicateOverrideReason? }` — 409 `DUPLICATE_WARNING` within 24h unless override (reason required) |
| POST | `/shoes/:id/photos` | `shoe.attachment.upload` | multipart `photos[]` ≤8, 5 MB each, JPEG/PNG only |
| POST | `/shoes/:id/complete-intake` | `shoe.intake.create` | `{ station?, zeroPhotoReason? }` — min one photo unless admin zero-photo exception |
| GET | `/shoes/label/:id` | `shoe.intake.create` | `?reprint=true` to audit as reprint |
| GET | `/shoes/:id/history` | auth | Service history timeline |
| GET | `/shoes/:id` | auth | `{ profile, events, attachments, history }` |
| GET | `/shoes` | auth | `?ownerUserId&status&barcode&serial&limit&skip` (object-level post-filter) |
| GET | `/shoes/attachments/:opaqueId` | auth | Streams file after ownership/scope check, sets `X-Content-SHA256` |

## Custody (`routes/custody.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/custody/scan` | `custody.scan` | `{ barcode, eventType, station?, location?, notes?, manualEntry?, manualEntryReason?, toState?, restoredFromState? }` — 30s dedup window per (barcode, actor, eventType); state machine enforced |
| GET | `/custody/lookup` | auth | `?barcode|serial|ownerUserId` |
| GET | `/custody/verify-barcode/:code` | auth | Luhn checksum validity |

Error codes: `UNKNOWN_BARCODE`, `ILLEGAL_TRANSITION`, `VALIDATION_ERROR`.

## Contracts (`routes/contracts.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/contracts` | `contract.create` | `{ contractNumber, facilityUnit, lessorName, lesseeName, startDate, endDate, allowOverride?, reason? }` — 409 on facility overlap unless override |
| POST | `/contracts/:id/activate` | `contract.create` | Requires `currentBillingRuleVersionId` |
| POST | `/contracts/:id/amend` | `contract.amend` | `{ reason, effectiveDate?, endDate?, lessorName?, lesseeName?, billingRuleVersionId? }` |
| POST | `/contracts/:id/renew` | `contract.renew` | `{ newEndDate, effectiveDate?, reason?, billingRuleVersionId? }` |
| POST | `/contracts/:id/terminate` | `contract.terminate` | `{ terminationEffectiveDate, reason }` — sets `reconciliationDueAt = +10 business days`, moves to `reconciliation_pending` |
| GET | `/contracts` | `contract.view.all` | `?status&q&limit&skip` |
| GET | `/contracts/expirations` | `contract.view.all` | Buckets `within7Days/within30Days/within90Days` |
| GET | `/contracts/:id` | `contract.view.all` | Contract + all version snapshots |

## Billing (`routes/billing.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/billing/contracts/:contractId/rules` | `billing.rule.manage` | `{ ruleType: 'fixed'|'tiered'|'revenue_share', fixedAmountCents?, dueDayOfMonth?, shiftDueDatesToNextBusinessDay?, tiers?, revenueShareRate?, provisionalAmountCents?, allowNegativeTrueUpAsCredit?, effectiveFrom?, effectiveTo? }` |
| POST | `/billing/contracts/:contractId/events` | `billing.rule.manage` | `{ eventType?, billingRuleVersionId?, basisCents?, grossRevenueCents?, provisionalAmountsAlreadyBilledCents?, periodStart?, periodEnd?, dueDate?, reason? }` |
| POST | `/billing/contracts/:contractId/events/:eventId/correct` | `billing.override` | `{ amountCents, reason }` — appended as `correction` event |
| GET | `/billing/contracts/:contractId/events` | `view_financial_sensitive` | — |
| GET | `/billing/contracts/:contractId/rules` | `contract.view.all` | All rule versions |

## Deposits / Reconciliation (`routes/deposits.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/deposits/contracts/:contractId/ledger` | `deposit.manage` | `{ entryType: 'deposit'|'partial_refund'|'full_refund'|'forfeit'|'correction'|'adjustment', amountCents: int, reason?, correctsEntryId? }` — amounts AES-256-GCM encrypted; balance cannot go below zero except via `correction` |
| GET | `/deposits/contracts/:contractId/ledger` | `deposit.manage` | Masks amounts unless `view_financial_sensitive` |
| GET | `/deposits/contracts/:contractId/reconciliation` | `reconciliation.manage` | Returns reconciliation with masked `finalBalanceCents` unless privileged |
| POST | `/deposits/contracts/:contractId/reconciliation/complete` | `reconciliation.manage` | `{ notes? }` — closes contract, seals final balance |

## Shipping / Delivery (`routes/shipping.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/shipping` | `shipping.create` | `{ shoeProfileId, addressId, fulfillmentOperator, method?, offline?, offlineCreatedAt? }` — shoe must be `ready_for_delivery`/`shipping_prepared`; address must be `country='US'` |
| POST | `/shipping/:id/transition` | `shipping.fulfill` | `{ to }` — POD required before `closed` from `delivered` |
| POST | `/shipping/:id/proof-of-delivery` | `delivery.proof.capture` | multipart `signature` (JPEG/PNG) + `{ deliveredAt?, recipientName?, notes?, overrideApproval?, overrideReason? }` — override requires `department_admin` |
| POST | `/shipping/:id/delivery-failed` | `shipping.fulfill` | `{ reasonCode, remediationSteps? }` |
| POST | `/shipping/:id/delivery-exception/signoff` | `delivery.exception.signoff` | `{ exceptionId, notes?, followUpStatus? }` |
| GET | `/shipping` | auth | `?status&shoeProfileId&limit&skip` (post-filter by shoe visibility) |
| GET | `/shipping/:id` | auth | `{ order, proofOfDelivery, deliveryExceptions }` |

## Saved Addresses (`routes/addresses.js`)

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/addresses` | auth | `{ label, line1, line2?, city, state, postalCode }` — US only, `^\d{5}(-\d{4})?$` |
| GET | `/addresses` | auth | Owner's addresses (decrypted) |
| GET | `/addresses/:id` | owner / `department_admin`/`security_admin`/`operations_staff` | Unauthorized IDs return 404 (no existence leak) |

## Exceptions (`routes/exceptions.js`)

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/exceptions` | reviewer roles only | `{ exceptionType, summary, details?, subjectUserId?, shoeProfileId?, shippingOrderId?, custodyEventId?, scopes? }` |
| POST | `/exceptions/:id/transition` | scope-limited reviewer | `{ to, reason? }` — subject alone cannot transition; `resolved/dismissed` reserved for ops/admin |
| GET | `/exceptions` | auth | `?status&type&subjectUserId` — post-filtered |
| GET | `/exceptions/:id` | auth | — |

## Appeals (`routes/appeals.js`)

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/appeals` | appellant only (admins on-behalf) | multipart `evidence[]` ≤8 + `{ exceptionId, rationale }` — rationale or evidence required; one active appeal per exception |
| POST | `/appeals/:id/start-review` | scoped reviewer / admin | — |
| POST | `/appeals/:id/decide` | cohort → `corporate_mentor`, else `department_admin` | `{ outcome: 'approved'|'denied'|'remanded', rationale, override?, overrideReason? }` |
| POST | `/appeals/:id/withdraw` | appellant / admin | — |
| GET | `/appeals` | auth | `?status&exceptionId` (post-filtered) |
| GET | `/appeals/:id` | auth | `{ appeal, decisions, attachments }` |

## Tags (`routes/tags.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/tags/assign` | `tag.manage` | `{ userId, tagCode, reason? }` |
| POST | `/tags/remove` | `tag.manage` | `{ userId, tagCode, reason? }` |
| GET | `/tags/user/:userId` | auth (target-scope intersection) | Active tags for user |
| GET | `/tags/history` | `tag.manage` | `?userId&tagCode` |
| POST | `/tags/rules` | `tag.rule.manage` | `{ tagCode, ruleType: 'exception_count_rolling', params: { windowDays, minCount, exceptionTypes? }, effectiveFrom?, active? }` — prior version marked immutable |
| GET | `/tags/rules` | auth | All versions |
| POST | `/tags/recompute` | `tag.rule.manage` | Manual recompute trigger |
| GET | `/tags/counts` | auth (global/scoped/deny per `kpiAccessMode`) | `[{ tagCode, count }]` |

## Imports (`routes/imports.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/imports/tags` | `import.run` | multipart `file` CSV `username,tagCode,action,reason`; `mode=strict|lenient` |
| GET | `/imports` | `import.run` | Job history |
| GET | `/imports/:id` | `import.run` | Single job with per-row errors |

## Exports (`routes/exports.js`)

| Method | Path | Capability | Body |
|--------|------|------------|------|
| POST | `/exports/contracts` | `export.all` | `{ unmask?, reason? }` — unmask requires `unmask_export` capability |
| POST | `/exports/tags` | `export.all` | — |
| POST | `/exports/exceptions` | `export.all` | — |
| POST | `/exports/appeals` | `export.all` | — |
| POST | `/exports/shipping` | `export.all` | — |
| GET | `/exports` | `export.all` | Job list (self-scoped unless `export.all`) |
| GET | `/exports/:id/download` | `export.all` | Streams CSV with `X-Export-Checksum` header; access is audited |

## Reports (`routes/reports.js`)

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/reports/kpis` | `kpiAccessMode` allows `global` or `scoped` | Aggregated KPIs: active contracts, expiring buckets, reconciliation pending/overdue, intake counts, avg turnaround, delivery success rate, exceptions-by-type, appeal approval rate, scan compliance, tag counts |

## Jobs (`routes/jobs.js`)

| Method | Path | Capability | Notes |
|--------|------|------------|-------|
| GET | `/jobs/runs` | `audit.view` | `?jobName&state` |
| POST | `/jobs/run/:name` | `tag.rule.manage` | `name ∈ {tag_recompute, reconciliation_overdue, contract_expiration_alerts, attachment_integrity, audit_retention_report, idempotency_cleanup, stalled_sweep}` |

---

## Common HTTP status mapping

| Code | Error codes |
|------|-------------|
| 400 | `VALIDATION_ERROR` (legacy paths) |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED` |
| 404 | `NOT_FOUND`, `UNKNOWN_BARCODE` |
| 409 | `CONFLICT`, `ILLEGAL_TRANSITION`, `INVALID_STATE`, `DUPLICATE_WARNING`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `IDEMPOTENCY_IN_FLIGHT` |
| 410 | File missing on disk |
| 422 | `VALIDATION_ERROR` (current) |
| 423 | `ACCOUNT_LOCKED`, `RESET_LOCKED` |
| 500 | `JOB_FAILED` |
