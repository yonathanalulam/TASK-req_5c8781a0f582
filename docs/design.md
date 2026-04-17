# Offline Lease & Service Operations Portal — System Design

## 1. Overview

The platform is an on-premise program-office portal that unifies two operational domains under one identity, RBAC, and audit fabric:

- **Facility lease operations** — contract lifecycle (draft → active → amend → renew → terminate → reconciliation → closed), configurable billing rules (fixed / tiered / revenue-share), deposit ledgers, and 10-business-day termination reconciliation.
- **Physical item service operations** — shoe intake with brand/material/color/size/defect notes, up to 8 photos, auto-generated serial + Luhn-checked 12-digit barcode label, barcode-driven custody events, shipping with proof-of-delivery, and delivery-exception sign-off.

Cross-cutting concerns — authentication, RBAC with scope dimensions, exception/appeal workflow, member tagging, import/export, audit, and offline replay — span both domains and are enforced server-side so no single device compromise can bypass them.

## 2. Architecture

### 2.1 Topology
Two deployables plus MongoDB; everything local-network-only (no external SaaS).

```
┌────────────────────────┐   HTTPS/LAN    ┌──────────────────────┐   mongodb://    ┌─────────────┐
│  React 18 + Vite SPA   │ ─────────────> │ Express API (Node)   │ ──────────────> │ MongoDB     │
│  IndexedDB (offline)   │ <───────────── │ services/routes      │ <────────────── │ (on-prem)   │
└────────────────────────┘                └──────────┬───────────┘                 └─────────────┘
                                                     │
                                                     ▼
                                         Local disk: attachments/, exports/
                                         Node-cron: tag recompute, reconciliation sweep,
                                                    expiration alerts, integrity checks,
                                                    idempotency cleanup, stalled jobs
```

Docker Compose wires the three services for local deployment (`docker-compose.yml`), with a separate `docker-compose.test.yml` for CI/E2E.

### 2.2 Backend layering (`backend/src`)

| Layer | Location | Responsibility |
|-------|----------|----------------|
| HTTP | `app.js`, `routes/*.js` | Route mounting, request parsing, error wrapping, per-route capability gates |
| Middleware | `middleware/auth.js`, `middleware/idempotency.js`, `middleware/errorHandler.js` | Bearer/JWT + session validation, capability checks, idempotency-key replay handling, uniform error envelope |
| Services | `services/*.js` | Domain logic: `authService`, `authz`, `rbac`, `billingService`, `barcodeService`, `attachmentService`, `contractStateMachine`, `shoeStateMachine`, `shippingStateMachine`, `appealStateMachine`, `tagService`, `auditService`, `serviceHistoryService` |
| Models | `models/*.js` | Mongoose schemas for 35 collections |
| Utils | `utils/*.js` | `crypto` (AES-256-GCM + SHA-256), `password` (argon2id primary, scrypt fallback), `businessCalendar`, `csv`, `response` |
| Jobs | `jobs/runner.js`, `jobs/scheduler.js`, `jobs/keyRotation.js` | Scheduled cron workflows, manual `/api/v1/jobs/run/:name` triggers |

### 2.3 Frontend layering (`frontend/src`)

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Routing/shell | `App.jsx`, `main.jsx` | Role-gated navigation, route protection via `RequireAuth` |
| Pages | `pages/*.jsx` | `Login`, `Signup`, `Reset`, `Catalog`, `ServiceRequests`, `Intake`, `Scan`, `Contracts`, `ExpirationDashboard`, `Shipping`, `Appeals`, `Reports`, `Audit`, `Queue` |
| State | `store/auth.jsx`, `store/offlineQueue.jsx` | Auth/session context; online/offline detection, IndexedDB-backed action queue with exponential backoff replay |
| Services | `services/api.js`, `services/db.js` | `fetch` wrapper with bearer-token auth and error normalization; `idb`-backed catalog cache, favorites, browsing history, and queued actions |

## 3. Identity, Session, RBAC

### 3.1 Authentication (fully offline)
- **Signup** (`POST /api/v1/auth/signup`) — username + displayName + password (≥12 chars) + security question + answer. Argon2id hashes both password and lowercased answer; defaults to scrypt when the native `argon2` binding is unavailable.
- **Login** (`POST /api/v1/auth/login`) — 5 failures in 15 min ⇒ 15 min lockout; JWT issued with 24 h absolute TTL, plus a matching `Session` doc tracking `tokenId`, `state`, `lastActivityAt`, `absoluteExpiresAt`, `ip`, `deviceDescriptor`.
- **Session validation** — middleware re-checks state on every request, enforces 30 min idle and 24 h absolute caps, auto-transitions to `idle_expired`/`absolute_expired`, and refreshes `lastActivityAt`.
- **Password reset** (`/auth/reset/start`, `/auth/reset/complete`) — uniform response to start regardless of username existence; complete step verifies `securityAnswerHash` with its own 5/30-min lockout, revokes all active sessions on success.
- **Forced logout** (`POST /api/v1/admin/sessions/force-logout`) — `security_admin`/`department_admin` revokes targeted sessions with a mandatory ≥3-char reason; audit records both reason and actor.

### 3.2 Roles and capabilities
Defined in `services/rbac.js`:

| Role | Representative capabilities |
|------|-----------------------------|
| `student` | catalog.browse, service_request.create.own, item.view.own, appeal.submit.own, export.own |
| `faculty_advisor` | item.view.scoped, exception.view.scoped, appeal.comment.scoped, export.scoped, contract.view.scoped |
| `corporate_mentor` | item.view.scoped_cohort, exception.view.scoped_cohort, appeal.approve.scoped_cohort |
| `operations_staff` | shoe.intake.create, custody.scan, shipping.create/fulfill, delivery.proof.capture, delivery.exception.signoff, service_request.create.on_behalf |
| `department_admin` | contract.* / billing.* / deposit.manage / reconciliation.manage / access.manage / user.manage / role.manage / scope.manage / tag.manage / tag.rule.manage / export.all / unmask_export / view_financial_sensitive / force_logout |
| `security_admin` | force_logout, audit.view, audit.verify, user.unlock, key.rotate |
| `job_runner` | job.execute |

### 3.3 Three-layer authorization
Every protected action checks all three layers (documented in `services/authz.js`):

1. **Route-level capability gate** (`requireCapability('cap.name')`) — coarse-grained, immediately rejects with 403 on miss.
2. **Object-level policy** (`canView<Entity>`, `canReadAddress`, etc.) — combines ownership, scope overlap, and deny-by-default for empty scope tags.
3. **Function-level per-transition policy** (`canTransitionException`, `canDecideAppeal`, shipping/shoe state machines) — enforces allowed state transitions and role-specific authority (e.g. only `corporate_mentor` may decide cohort-scoped appeals; faculty advisors are comment-only).

### 3.4 Scope dimensions
`ScopeAssignment` rows carry `{dimension, value}` pairs (e.g. `school`, `major`, `class`, `internship_cohort`, plus `global:*`). Records that need scoping (shoes, exceptions, appeals, service requests) embed their own `scopes[]`; `rbac.scopeMatches` performs any-of intersection with admin/security bypass. Empty record scopes do not broaden visibility for scoped reviewers.

## 4. Data Model (Mongoose collections)

### Identity & access
`User`, `Session`, `SecurityQuestion`, `Role`, `UserRoleAssignment`, `ScopeAssignment`.

### Service catalog & requests
`ServiceCatalogEntry`, `ServiceCategory`, `ServiceTag`, `ServiceRequest`, `ServiceHistory`.

### Item / shoe custody
`ShoeProfile` (status state machine with `intake_draft → intake_completed → in_service → quality_check → ready_for_delivery → shipping_prepared → in_transit → delivered`, plus `exception_hold`, `rework_required`, `cancelled`, `closed_exception` branches), `CustodyEvent`, `Attachment`.

### Lease contracts
`LeaseContract` (status: `draft | active | amended | pending_renewal | renewed | expired | terminated | reconciliation_pending | reconciliation_overdue | closed`), `LeaseContractVersion` (append-only snapshots), `BillingRuleVersion`, `BillingEvent` (append-only; corrections are new events pointing at `correctsEventId`), `DepositLedgerEntry` (AES-256-GCM-encrypted amounts and running balance), `TerminationReconciliation`.

### Shipping
`ShippingOrder` (with `queued_offline` for deferred creation), `ProofOfDelivery`, `DeliveryException`, `SavedAddress` (encrypted line1/2/city/state/postalCode plus clear `maskedPreview`).

### Exception & appeal
`Exception`, `Appeal`, `AppealDecision` (versioned, superseding links on remand).

### Tagging
`MemberTag`, `TagRuleVersion` (immutable once a newer version supersedes it), `TagChangeHistory`.

### Operations plumbing
`AuditLog` (append-only, SHA-256 chained via `prevHash`/`hash`), `IdempotencyRecord` (7-day window), `ImportJob`, `ExportJob`, `JobRun`, `SystemSetting`.

## 5. Cross-cutting mechanisms

### 5.1 Audit chain (`services/auditService.js`)
Every mutation calls `audit.record()`. The service reads the latest entry's hash, canonicalizes the new payload with sorted keys, and writes `hash = sha256(prevHash || canonicalJSON(payload))`. `/admin/audit/verify` replays the chain and returns the first break (if any). Audit logs are never deleted; retention beyond 7 years is reported for operator review only.

### 5.2 Idempotency (`middleware/idempotency.js`)
Routes that mutate state (`POST /shoes/intake`, `POST /custody/scan`, `POST /shipping`, `POST /appeals`, `POST /imports/tags`, `POST /service-requests`) accept an optional `Idempotency-Key` header. First call hashes the payload and stores a record with a 7-day `expiresAt`; replays with matching payload are short-circuited to the cached response, mismatched payloads fail `IDEMPOTENCY_PAYLOAD_MISMATCH`, and in-flight replays return `IDEMPOTENCY_IN_FLIGHT`.

### 5.3 Encryption at rest (`utils/crypto.js`)
AES-256-GCM with key versioning — `ENCRYPTION_KEY_V<n>_HEX` env vars map to numeric versions; `SystemSetting.currentKeyVersion` selects the active key. Encrypted blobs persist `{v, iv, ct, tag}`. `jobs/keyRotation.js` supports re-encrypting ciphertext under a new version. Sensitive fields: saved addresses, deposit ledger amounts, reconciliation final balance, encrypted user identity metadata.

### 5.4 Attachments (`services/attachmentService.js`)
Disk storage under `storage/attachments/<first-two-sha-bytes>/<opaqueId>.<ext>`. MIME + magic-byte sniff (`FF D8 FF` for JPEG, `89 50 4E 47 …` for PNG) rejects mislabeled uploads; declared MIME must match sniffed type. Each attachment stores `sha256` for tamper-evident fingerprinting, checked nightly by `attachmentIntegrityCheck`. Retrieval routes go through ownership/scope policies before streaming.

### 5.5 Barcodes (`services/barcodeService.js`)
Serial is UUID v4. Barcode is derived by SHA-256 of `serial:attempt`, reduced mod 10¹¹, padded, Luhn-checked to a 12-digit numeric, and re-rolled on collision. Labels are printed at `/shoes/label/:id`; reprints are audited distinctly.

### 5.6 Billing engine (`services/billingService.js`)
Pure calculator (no DB I/O). `fixed` returns `fixedAmountCents`; `tiered` validates contiguous, non-overlapping ranges and picks the tier containing `basisCents`; `revenue_share` computes `round(gross × rate) − provisionalAlreadyBilled`, with optional negative-credit behavior. Billing events are append-only; corrections are new events carrying `correctsEventId` and a required reason.

### 5.7 Exception & appeal loop
Raised from custody scans, shipping failures, tag automations, or manual opens. Appeals require rationale *or* evidence attachments; cohort-scoped appeals go to `corporate_mentor`, everything else to `department_admin`. Decisions are version-numbered (`approved | denied | remanded | withdrawn`), and `remanded` reopens the loop for resubmission.

### 5.8 Computed tagging (`services/tagService.js`, `jobs/runner.js`)
`TagRuleVersion` defines rule-based tags (e.g. `High-Risk Exceptions` via `exception_count_rolling` with `windowDays=14, minCount=3`). Nightly cron at `0 2 * * *` calls `recomputeAllTags`; users who no longer qualify have their computed tag removed (static tags are untouched). Every change appends a `TagChangeHistory` entry.

### 5.9 Offline-first UX (`store/offlineQueue.jsx`, `services/db.js`)
IndexedDB stores: `catalog` (code-keyed cached entries), `favorites`, `history` (browsing, trimmed to 90 days / 50 entries), `queue` (pending mutations keyed by idempotency key). Online/offline is detected via `navigator.onLine`; replay runs on `online` events with an exponential backoff schedule (30 s / 2 m / 10 m / 30 m / 2 h); after 10 retries the entry moves to `manual_review_required` for operator intervention. Status badges in the header show `online`/`offline`, pending sync count, and review-required count.

## 6. Scheduled jobs

| Name | Cron | Responsibility |
|------|------|----------------|
| `tag_recompute` | `0 2 * * *` | Nightly rule evaluation + add/remove computed tags |
| `reconciliation_overdue` | `15 * * * *` | Flip `TerminationReconciliation.status=overdue` and bubble contract status |
| `contract_expiration_alerts` | `30 */6 * * *` | Materialize 7/30/90-day buckets for the dashboard |
| `attachment_integrity` | `30 3 * * *` | SHA-256 re-verify a rolling batch of attachments |
| `audit_retention_report` | `0 4 * * *` | Report audit rows older than 7 years (never purge) |
| `idempotency_cleanup` | `45 * * * *` | Delete expired idempotency records |
| `stalled_sweep` | `*/5 * * * *` | Mark jobs stalled after 15 min; move to dead-letter after `maxAttempts` |

All jobs record a `JobRun` row with `state`, `attempt`, `lastHeartbeatAt`, `summary`, and emit an audit entry on completion or failure.

## 7. Error and response envelope

All responses use a uniform envelope (`utils/response.js`):

```json
{ "success": true|false,
  "data": { ... } | null,
  "error": { "code": "UPPER_SNAKE", "message": "...", "details": ... } | null,
  "meta": { ... } }
```

Canonical error codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`, `ILLEGAL_TRANSITION`, `DUPLICATE_WARNING`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED`, `INVALID_CREDENTIALS`, `RESET_LOCKED`, `UNKNOWN_BARCODE`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `IDEMPOTENCY_IN_FLIGHT`, `JOB_FAILED`.

## 8. Security posture summary

- Offline identity only — no SMS/email dependency; all recovery local.
- Argon2id primary, scrypt fallback; passwords ≥12 chars; throttled failure windows; account and security-answer lockouts are tracked independently.
- Bearer JWT scoped by signed `sub`/`sid`/`username` claims; server re-verifies session state on every call so revocation is immediate.
- Default-deny masking on exports and financial reads; unmasking requires both `unmask_export` capability and explicit `unmask: true` in the request body with an auditable reason.
- Attachment magic-byte + MIME cross-check; existence-enumeration suppressed on address reads by returning 404 on unauthorized.
- Audit chain provides tamper evidence; `audit.verify` pinpoints the first broken row.
- Secret validation at startup rejects weak/default `JWT_SECRET` and `ENCRYPTION_KEY_*_HEX` in production; dev falls back to ephemeral random to avoid shipping predictable literals.

## 9. Test & deployment footprint

- `backend/tests` — route/service tests covering authz matrix, state-machine transitions, billing math, audit-chain verification, encryption round-trips.
- `e2e/` and `frontend/src/__tests__/` — UI flow coverage (catalog offline cache, intake → scan → shipping, reset, appeal loop).
- `docker-compose.yml` orchestrates `mongo`, `backend`, and `frontend` on the on-prem LAN; `docker-compose.test.yml` seeds a disposable database for end-to-end runs.
- Operator guidance lives in `repo/docs/` (`operator_runbook.md`, `backup_restore.md`, `key_rotation.md`, `security.md`, `api_reference.md`).
