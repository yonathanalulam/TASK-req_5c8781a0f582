# Test Coverage Audit

## Project Type Detection
- README explicitly declares project type `fullstack` (`README.md:3`).
- Repository structure confirms fullstack (`backend/`, `frontend/`, `e2e/`).
- Effective project type for this audit: **fullstack**.

## Backend Endpoint Inventory
- Inventory extraction source: `backend/src/app.js` mounts + `backend/src/routes/*.js` route declarations.
- Total resolved endpoints: **99** unique `METHOD + PATH`.
- Endpoint list:
- GET /api/v1/addresses
- POST /api/v1/addresses
- GET /api/v1/addresses/:id
- GET /api/v1/admin/audit
- POST /api/v1/admin/audit/verify
- POST /api/v1/admin/sessions/force-logout
- GET /api/v1/admin/users
- POST /api/v1/admin/users/:id/roles
- DELETE /api/v1/admin/users/:id/roles/:roleCode
- POST /api/v1/admin/users/:id/scopes
- POST /api/v1/admin/users/:id/unlock
- GET /api/v1/appeals
- POST /api/v1/appeals
- GET /api/v1/appeals/:id
- POST /api/v1/appeals/:id/decide
- POST /api/v1/appeals/:id/start-review
- POST /api/v1/appeals/:id/withdraw
- POST /api/v1/auth/change-password
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- POST /api/v1/auth/reset/complete
- POST /api/v1/auth/reset/start
- GET /api/v1/auth/security-questions
- POST /api/v1/auth/signup
- GET /api/v1/billing/contracts/:contractId/events
- POST /api/v1/billing/contracts/:contractId/events
- POST /api/v1/billing/contracts/:contractId/events/:eventId/correct
- GET /api/v1/billing/contracts/:contractId/rules
- POST /api/v1/billing/contracts/:contractId/rules
- GET /api/v1/catalog/categories
- POST /api/v1/catalog/categories
- GET /api/v1/catalog/services
- POST /api/v1/catalog/services
- DELETE /api/v1/catalog/services/:id
- PUT /api/v1/catalog/services/:id
- GET /api/v1/catalog/services/sync
- GET /api/v1/catalog/tags
- POST /api/v1/catalog/tags
- GET /api/v1/contracts
- POST /api/v1/contracts
- GET /api/v1/contracts/:id
- POST /api/v1/contracts/:id/activate
- POST /api/v1/contracts/:id/amend
- POST /api/v1/contracts/:id/renew
- POST /api/v1/contracts/:id/terminate
- GET /api/v1/contracts/expirations
- GET /api/v1/custody/lookup
- POST /api/v1/custody/scan
- GET /api/v1/custody/verify-barcode/:code
- GET /api/v1/deposits/contracts/:contractId/ledger
- POST /api/v1/deposits/contracts/:contractId/ledger
- GET /api/v1/deposits/contracts/:contractId/reconciliation
- POST /api/v1/deposits/contracts/:contractId/reconciliation/complete
- GET /api/v1/exceptions
- POST /api/v1/exceptions
- GET /api/v1/exceptions/:id
- POST /api/v1/exceptions/:id/transition
- GET /api/v1/exports
- GET /api/v1/exports/:id/download
- POST /api/v1/exports/appeals
- POST /api/v1/exports/contracts
- POST /api/v1/exports/exceptions
- POST /api/v1/exports/shipping
- POST /api/v1/exports/tags
- GET /api/v1/health
- GET /api/v1/imports
- GET /api/v1/imports/:id
- POST /api/v1/imports/tags
- POST /api/v1/jobs/run/:name
- GET /api/v1/jobs/runs
- GET /api/v1/reports/kpis
- GET /api/v1/service-requests
- POST /api/v1/service-requests
- GET /api/v1/service-requests/:id
- POST /api/v1/service-requests/:id/cancel
- GET /api/v1/shipping
- POST /api/v1/shipping
- GET /api/v1/shipping/:id
- POST /api/v1/shipping/:id/delivery-exception/signoff
- POST /api/v1/shipping/:id/delivery-failed
- POST /api/v1/shipping/:id/proof-of-delivery
- POST /api/v1/shipping/:id/transition
- GET /api/v1/shoes
- GET /api/v1/shoes/:id
- POST /api/v1/shoes/:id/complete-intake
- GET /api/v1/shoes/:id/history
- POST /api/v1/shoes/:id/photos
- GET /api/v1/shoes/attachments/:opaqueId
- POST /api/v1/shoes/intake
- GET /api/v1/shoes/label/:id
- POST /api/v1/tags/assign
- GET /api/v1/tags/counts
- GET /api/v1/tags/history
- POST /api/v1/tags/recompute
- POST /api/v1/tags/remove
- GET /api/v1/tags/rules
- POST /api/v1/tags/rules
- GET /api/v1/tags/user/:userId

## API Test Mapping Table
| Endpoint | Covered | Test Type | Test File(s) | Evidence |
| --- | --- | --- | --- | --- |
| GET /api/v1/addresses | yes | true no-mock HTTP | backend/tests/integration/addressesFull.test.js | backend/tests/integration/addressesFull.test.js:60 test('owner lists their addresses decrypted') |
| POST /api/v1/addresses | yes | true no-mock HTTP | backend/tests/integration/addressesFull.test.js | backend/tests/integration/addressesFull.test.js:16 test('creates a valid US address (201, maskedPreview present)') |
| GET /api/v1/addresses/:id | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:383 test('owner can fetch own address with decrypted fields') |
| GET /api/v1/admin/audit | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:215 test('student cannot view audit log (403)') |
| POST /api/v1/admin/audit/verify | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:235 test('security_admin can run chain verification and gets a structured result') |
| POST /api/v1/admin/sessions/force-logout | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:175 test('validation: missing userId returns 422') |
| GET /api/v1/admin/users | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:18 test('requires user.manage capability (403 for student)') |
| POST /api/v1/admin/users/:id/roles | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:52 test('validation: missing roleCode returns 422') |
| DELETE /api/v1/admin/users/:id/roles/:roleCode | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:82 test('admin removes role assignment') |
| POST /api/v1/admin/users/:id/scopes | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:103 test('validation: missing dimension/value returns 422') |
| POST /api/v1/admin/users/:id/unlock | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:133 test('404 when target user not found') |
| GET /api/v1/appeals | yes | true no-mock HTTP | backend/tests/integration/appealsExtra.test.js | backend/tests/integration/appealsExtra.test.js:21 test('admin sees all appeals') |
| POST /api/v1/appeals | yes | true no-mock HTTP | backend/tests/integration/appeals.test.js | backend/tests/integration/appeals.test.js:42 test('student submits appeal, corporate mentor approves within cohort') |
| GET /api/v1/appeals/:id | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:119 test('appeal detail is not visible to unrelated user') |
| POST /api/v1/appeals/:id/decide | yes | true no-mock HTTP | backend/tests/integration/appeals.test.js | backend/tests/integration/appeals.test.js:50 test('student submits appeal, corporate mentor approves within cohort') |
| POST /api/v1/appeals/:id/start-review | yes | true no-mock HTTP | backend/tests/integration/appeals.test.js | backend/tests/integration/appeals.test.js:47 test('student submits appeal, corporate mentor approves within cohort') |
| POST /api/v1/appeals/:id/withdraw | yes | true no-mock HTTP | backend/tests/integration/appealsExtra.test.js | backend/tests/integration/appealsExtra.test.js:71 test('appellant can withdraw their own submitted appeal') |
| POST /api/v1/auth/change-password | yes | true no-mock HTTP | backend/tests/integration/authExtra.test.js | backend/tests/integration/authExtra.test.js:42 test('rejects short new password (422)') |
| POST /api/v1/auth/login | yes | true no-mock HTTP | backend/tests/integration/appeals.test.js | backend/tests/integration/appeals.test.js:23 test('(unknown test)') |
| POST /api/v1/auth/logout | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:52 test('signup + login + me + logout') |
| GET /api/v1/auth/me | yes | true no-mock HTTP | backend/tests/integration/admin.test.js | backend/tests/integration/admin.test.js:191 test('admin revokes active session (subsequent /me returns 401)') |
| POST /api/v1/auth/reset/complete | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:75 test('password reset via security question (no account-existence leakage at start)') |
| POST /api/v1/auth/reset/start | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:70 test('password reset via security question (no account-existence leakage at start)') |
| GET /api/v1/auth/security-questions | yes | true no-mock HTTP | backend/tests/integration/authExtra.test.js | backend/tests/integration/authExtra.test.js:19 test('returns active question list without auth (public endpoint)') |
| POST /api/v1/auth/signup | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:25 test('(unknown test)') |
| GET /api/v1/billing/contracts/:contractId/events | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:114 test('admin (view_financial_sensitive) can list events') |
| POST /api/v1/billing/contracts/:contractId/events | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:29 test('validation: unknown contract returns 404') |
| POST /api/v1/billing/contracts/:contractId/events/:eventId/correct | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:70 test('validation: missing amountCents or reason returns 422') |
| GET /api/v1/billing/contracts/:contractId/rules | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:134 test('admin lists rules sorted by versionNumber') |
| POST /api/v1/billing/contracts/:contractId/rules | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:19 test('(unknown test)') |
| GET /api/v1/catalog/categories | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:26 test('authenticated user gets active categories only') |
| POST /api/v1/catalog/categories | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:72 test('validation: missing code/name returns 422') |
| GET /api/v1/catalog/services | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:84 test('unauthenticated access to protected route denied') |
| POST /api/v1/catalog/services | yes | true no-mock HTTP | backend/tests/integration/authorization.test.js | backend/tests/integration/authorization.test.js:33 test('student cannot manage catalog') |
| DELETE /api/v1/catalog/services/:id | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:166 test('admin soft-deletes (deactivates) service') |
| PUT /api/v1/catalog/services/:id | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:128 test('admin updates service, version bumps, audit fields touched') |
| GET /api/v1/catalog/services/sync | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:58 test('returns services, categories, tags, syncedAt') |
| GET /api/v1/catalog/tags | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:45 test('authenticated user gets active tags only') |
| POST /api/v1/catalog/tags | yes | true no-mock HTTP | backend/tests/integration/catalogCrud.test.js | backend/tests/integration/catalogCrud.test.js:98 test('validation: missing code/label returns 422') |
| GET /api/v1/contracts | yes | true no-mock HTTP | backend/tests/integration/contractsExtra.test.js | backend/tests/integration/contractsExtra.test.js:28 test('admin lists contracts with pagination') |
| POST /api/v1/contracts | yes | true no-mock HTTP | backend/tests/integration/billingEvents.test.js | backend/tests/integration/billingEvents.test.js:14 test('(unknown test)') |
| GET /api/v1/contracts/:id | yes | true no-mock HTTP | backend/tests/integration/contractsExtra.test.js | backend/tests/integration/contractsExtra.test.js:57 test('admin gets contract with versions array') |
| POST /api/v1/contracts/:id/activate | yes | true no-mock HTTP | backend/tests/integration/contracts.test.js | backend/tests/integration/contracts.test.js:36 test('create -> add rule -> activate -> terminate -> reconcile') |
| POST /api/v1/contracts/:id/amend | yes | true no-mock HTTP | backend/tests/integration/contractsExtra.test.js | backend/tests/integration/contractsExtra.test.js:87 test('admin amends contract with required reason') |
| POST /api/v1/contracts/:id/renew | yes | true no-mock HTTP | backend/tests/integration/contractsExtra.test.js | backend/tests/integration/contractsExtra.test.js:129 test('admin renews to new end date') |
| POST /api/v1/contracts/:id/terminate | yes | true no-mock HTTP | backend/tests/integration/contracts.test.js | backend/tests/integration/contracts.test.js:48 test('create -> add rule -> activate -> terminate -> reconcile') |
| GET /api/v1/contracts/expirations | yes | true no-mock HTTP | backend/tests/integration/contracts.test.js | backend/tests/integration/contracts.test.js:74 test('expiration dashboard returns 3 buckets') |
| GET /api/v1/custody/lookup | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:55 test('custody lookup rejects unrelated student') |
| POST /api/v1/custody/scan | yes | true no-mock HTTP | backend/tests/integration/intakeCustody.test.js | backend/tests/integration/intakeCustody.test.js:57 test('intake flow: create -> upload photo -> complete -> scan') |
| GET /api/v1/custody/verify-barcode/:code | yes | true no-mock HTTP | backend/tests/integration/custodyExtra.test.js | backend/tests/integration/custodyExtra.test.js:17 test('returns valid:true for a well-formed 12-digit Luhn barcode') |
| GET /api/v1/deposits/contracts/:contractId/ledger | yes | true no-mock HTTP | backend/tests/integration/depositEncryption.test.js | backend/tests/integration/depositEncryption.test.js:72 test('authorized admin read decrypts amounts') |
| POST /api/v1/deposits/contracts/:contractId/ledger | yes | true no-mock HTTP | backend/tests/integration/contracts.test.js | backend/tests/integration/contracts.test.js:39 test('create -> add rule -> activate -> terminate -> reconcile') |
| GET /api/v1/deposits/contracts/:contractId/reconciliation | yes | true no-mock HTTP | backend/tests/integration/depositsReconciliation.test.js | backend/tests/integration/depositsReconciliation.test.js:32 test('admin gets reconciliation with unmasked final balance only after completion') |
| POST /api/v1/deposits/contracts/:contractId/reconciliation/complete | yes | true no-mock HTTP | backend/tests/integration/contracts.test.js | backend/tests/integration/contracts.test.js:54 test('create -> add rule -> activate -> terminate -> reconcile') |
| GET /api/v1/exceptions | yes | true no-mock HTTP | backend/tests/integration/exceptionsFull.test.js | backend/tests/integration/exceptionsFull.test.js:20 test('admin sees all exceptions with filter support') |
| POST /api/v1/exceptions | yes | true no-mock HTTP | backend/tests/integration/appeals.test.js | backend/tests/integration/appeals.test.js:36 test('student submits appeal, corporate mentor approves within cohort') |
| GET /api/v1/exceptions/:id | yes | true no-mock HTTP | backend/tests/integration/exceptionsFull.test.js | backend/tests/integration/exceptionsFull.test.js:48 test('admin fetches exception detail') |
| POST /api/v1/exceptions/:id/transition | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:130 test('student subject cannot transition own exception to resolved') |
| GET /api/v1/exports | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:112 test('admin lists prior export jobs (own + global)') |
| GET /api/v1/exports/:id/download | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:132 test('admin can download their export and receives CSV with checksum header') |
| POST /api/v1/exports/appeals | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:70 test('admin creates appeals export') |
| POST /api/v1/exports/contracts | yes | true no-mock HTTP | backend/tests/integration/exportUnmask.test.js | backend/tests/integration/exportUnmask.test.js:41 test('admin can unmask; student cannot') |
| POST /api/v1/exports/exceptions | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:48 test('admin creates exceptions export') |
| POST /api/v1/exports/shipping | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:93 test('admin creates shipping export') |
| POST /api/v1/exports/tags | yes | true no-mock HTTP | backend/tests/integration/exportsFull.test.js | backend/tests/integration/exportsFull.test.js:25 test('admin creates tags export job (CSV file written, 201)') |
| GET /api/v1/health | yes | true no-mock HTTP | backend/tests/integration/auth.test.js | backend/tests/integration/auth.test.js:30 test('health endpoint works') |
| GET /api/v1/imports | yes | true no-mock HTTP | backend/tests/integration/importsFull.test.js | backend/tests/integration/importsFull.test.js:25 test('admin lists prior import jobs') |
| GET /api/v1/imports/:id | yes | true no-mock HTTP | backend/tests/integration/importsFull.test.js | backend/tests/integration/importsFull.test.js:46 test('admin fetches import detail') |
| POST /api/v1/imports/tags | yes | true no-mock HTTP | backend/tests/integration/importsFull.test.js | backend/tests/integration/importsFull.test.js:14 test('(unknown test)') |
| POST /api/v1/jobs/run/:name | yes | true no-mock HTTP | backend/tests/integration/jobsFull.test.js | backend/tests/integration/jobsFull.test.js:36 test('admin runs a registered job and gets a summary') |
| GET /api/v1/jobs/runs | yes | true no-mock HTTP | backend/tests/integration/jobsFull.test.js | backend/tests/integration/jobsFull.test.js:18 test('security_admin lists runs with filter') |
| GET /api/v1/reports/kpis | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:89 test('reports KPIs rejected for pure student') |
| GET /api/v1/service-requests | yes | true no-mock HTTP | backend/tests/integration/serviceRequests.test.js | backend/tests/integration/serviceRequests.test.js:47 test('student creates own service request and sees only own list') |
| POST /api/v1/service-requests | yes | true no-mock HTTP | backend/tests/integration/serviceRequests.test.js | backend/tests/integration/serviceRequests.test.js:42 test('student creates own service request and sees only own list') |
| GET /api/v1/service-requests/:id | yes | true no-mock HTTP | backend/tests/integration/serviceRequests.test.js | backend/tests/integration/serviceRequests.test.js:68 test('other student cannot view my service request detail') |
| POST /api/v1/service-requests/:id/cancel | yes | true no-mock HTTP | backend/tests/integration/serviceRequests.test.js | backend/tests/integration/serviceRequests.test.js:77 test('student can cancel own submitted request; cannot cancel after cancel') |
| GET /api/v1/shipping | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:77 test('shipping list/detail scoped to visible shoes') |
| POST /api/v1/shipping | yes | true no-mock HTTP | backend/tests/integration/shippingFull.test.js | backend/tests/integration/shippingFull.test.js:34 test('(unknown test)') |
| GET /api/v1/shipping/:id | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:82 test('shipping list/detail scoped to visible shoes') |
| POST /api/v1/shipping/:id/delivery-exception/signoff | yes | true no-mock HTTP | backend/tests/integration/shippingFull.test.js | backend/tests/integration/shippingFull.test.js:243 test('ops signs off â†’ order transitions to returned and exception has signedOffBy') |
| POST /api/v1/shipping/:id/delivery-failed | yes | true no-mock HTTP | backend/tests/integration/shippingFull.test.js | backend/tests/integration/shippingFull.test.js:210 test('creates delivery exception and transitions order to exception_pending_signoff') |
| POST /api/v1/shipping/:id/proof-of-delivery | yes | true no-mock HTTP | backend/tests/integration/shippingFull.test.js | backend/tests/integration/shippingFull.test.js:168 test('signature file captured â†’ POD created and order delivered') |
| POST /api/v1/shipping/:id/transition | yes | true no-mock HTTP | backend/tests/integration/shippingFull.test.js | backend/tests/integration/shippingFull.test.js:123 test('transition draftâ†’ready_to_ship succeeds') |
| GET /api/v1/shoes | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:330 test('shoe list does not leak other students shoes (direct list path)') |
| GET /api/v1/shoes/:id | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:281 test('student owner can fetch own shoe detail') |
| POST /api/v1/shoes/:id/complete-intake | yes | true no-mock HTTP | backend/tests/integration/intakeCustody.test.js | backend/tests/integration/intakeCustody.test.js:53 test('intake flow: create -> upload photo -> complete -> scan') |
| GET /api/v1/shoes/:id/history | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:522 test('shoe history endpoint returns entries after delivery completion') |
| POST /api/v1/shoes/:id/photos | yes | true no-mock HTTP | backend/tests/integration/intakeCustody.test.js | backend/tests/integration/intakeCustody.test.js:50 test('intake flow: create -> upload photo -> complete -> scan') |
| GET /api/v1/shoes/attachments/:opaqueId | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:350 test('unauthorized shoe attachment access is denied via the attachment endpoint') |
| POST /api/v1/shoes/intake | yes | true no-mock HTTP | backend/tests/integration/authorization.test.js | backend/tests/integration/authorization.test.js:46 test('ops staff can create intake; student cannot') |
| GET /api/v1/shoes/label/:id | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:483 test('ops can fetch printable label payload for an intake shoe') |
| POST /api/v1/tags/assign | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:18 test('validation: missing userId/tagCode returns 422') |
| GET /api/v1/tags/counts | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:631 test('corporate_mentor /tags/counts returns cohort-scoped counts only') |
| GET /api/v1/tags/history | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:119 test('admin queries history with filters') |
| POST /api/v1/tags/recompute | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:136 test('admin triggers recompute and gets runId + results') |
| POST /api/v1/tags/remove | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:48 test('admin removes tag; MemberTag marked inactive') |
| GET /api/v1/tags/rules | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:106 test('authenticated user lists all rule versions') |
| POST /api/v1/tags/rules | yes | true no-mock HTTP | backend/tests/integration/tagsFull.test.js | backend/tests/integration/tagsFull.test.js:75 test('admin creates rule version; previous version becomes immutable') |
| GET /api/v1/tags/user/:userId | yes | true no-mock HTTP | backend/tests/integration/authzRegressions.test.js | backend/tests/integration/authzRegressions.test.js:103 test('tag lookup rejects unrelated student') |

## API Test Classification
1. **True No-Mock HTTP**
   - All backend integration suites use real app bootstrap (`createApp()`), real HTTP calls (`request(app)`), and real handler execution (`backend/tests/integration/*.test.js`, `backend/tests/setupTestDb.js`).
2. **HTTP with Mocking**
   - **None detected** in backend tests (`jest.mock|vi.mock|sinon.stub` absent under `backend/tests/**/*.js`).
3. **Non-HTTP (unit/integration without HTTP)**
   - Unit tests:
     - `backend/tests/unit/csv.test.js`
     - `backend/tests/unit/stateMachines.test.js`
     - `backend/tests/unit/audit.test.js`
     - `backend/tests/unit/crypto.test.js`
     - `backend/tests/unit/barcode.test.js`
     - `backend/tests/unit/billing.test.js`
     - `backend/tests/unit/businessCalendar.test.js`
   - Direct non-HTTP calls in integration folder:
     - `backend/tests/integration/tagsImports.test.js:50` (`runner.tagRecompute()`)
     - `backend/tests/integration/authzRegressions.test.js:518` (`serviceHistory.recordCompletion(...)`)
     - `backend/tests/integration/authzRegressions.test.js:531` (`serviceHistory.recordCompletion(...)`)
     - `backend/tests/integration/authzRegressions.test.js:542` (`serviceHistory.recordCompletion(...)`)

## Mock Detection Rules
- Backend mocks/stubs (`jest.mock`, `vi.mock`, `sinon.stub`): **not found**.
- DI override patterns: **not found**.
- Frontend transport mocking exists (component-unit scope):
  - `frontend/src/__tests__/auth.test.jsx:15`
  - `frontend/src/__tests__/serviceRequests.test.jsx:16`
  - `frontend/src/__tests__/catalogFilters.test.jsx:35`
  - `frontend/src/__tests__/intakeLabel.test.jsx:18`
  - `frontend/src/__tests__/appealsEvidence.test.jsx:17`
  - `frontend/src/__tests__/shippingActions.test.jsx:16`

## Coverage Summary
- Total endpoints: **99**
- Endpoints with HTTP tests: **99**
- Endpoints with TRUE no-mock tests: **99**
- HTTP coverage: **100.00%**
- True API coverage: **100.00%**

## Unit Test Summary
### Backend Unit Tests
- Files: `backend/tests/unit/*.test.js` (7 files).
- Covered modules:
  - services/state machines (`billingService`, `auditService`, `barcodeService`, state machines)
  - utilities (`csv`, `crypto`, `businessCalendar`)
- Important backend modules not unit-tested directly:
  - `backend/src/services/authService.js`
  - `backend/src/services/authz.js`
  - `backend/src/services/attachmentService.js`
  - `backend/src/services/tagService.js`
  - `backend/src/services/serviceHistoryService.js`

### Frontend Unit Tests (STRICT)
- Frontend test files detected:
  - `frontend/src/__tests__/auth.test.jsx`
  - `frontend/src/__tests__/serviceRequests.test.jsx`
  - `frontend/src/__tests__/catalogFilters.test.jsx`
  - `frontend/src/__tests__/intakeLabel.test.jsx`
  - `frontend/src/__tests__/appealsEvidence.test.jsx`
  - `frontend/src/__tests__/shippingActions.test.jsx`
- Framework/tooling evidence:
  - Vitest (`frontend/package.json:10`)
  - React Testing Library + user-event (`frontend/package.json:19-21`)
  - jsdom (`frontend/vite.config.js:12-16`)
- Components/modules covered:
  - `frontend/src/App.jsx`
  - `frontend/src/pages/ServiceRequests.jsx`
  - `frontend/src/pages/Catalog.jsx`
  - `frontend/src/pages/Intake.jsx`
  - `frontend/src/pages/Appeals.jsx`
  - `frontend/src/pages/Shipping.jsx`
- Important frontend modules not unit-tested:
  - `frontend/src/pages/Contracts.jsx`
  - `frontend/src/pages/Reports.jsx`
  - `frontend/src/pages/Audit.jsx`
  - `frontend/src/pages/ExpirationDashboard.jsx`
  - `frontend/src/pages/Scan.jsx`
  - `frontend/src/pages/Queue.jsx`
  - `frontend/src/pages/Signup.jsx`
  - `frontend/src/pages/Reset.jsx`
  - `frontend/src/pages/Login.jsx`
- **Frontend unit tests: PRESENT**

### Cross-Layer Observation
- Coverage is balanced across layers:
  - backend API: complete endpoint HTTP coverage
  - frontend unit: present
  - fullstack E2E: present (`e2e/tests/smoke.e2e.test.js`)

## API Observability Check
- Endpoint/method visibility: strong and explicit (`request(app).<method>(...)`).
- Request/response visibility: generally strong with status and body assertions.
- Residual weakness:
  - Some first evidence lines appear outside explicit `test(...)` blocks and are labeled `(unknown test)` in static mapping.

## Test Quality & Sufficiency
- Success/failure/validation/auth paths: broad and deep across critical route families.
- Integration boundaries: backend true no-mock HTTP + real FE<->BE E2E present.
- `run_tests.sh`: present and Docker orchestrated (`run_tests.sh`).
- No runtime package-install commands remain in `docker-compose.test.yml` service commands.

## End-to-End Expectations
- Fullstack expectation (real FE<->BE tests) is satisfied by `e2e/tests/smoke.e2e.test.js`.

## Tests Check
- Backend Endpoint Inventory: complete.
- API Test Mapping Table: complete.
- Coverage Summary: 99/99 true no-mock HTTP.
- Unit Test Summary: backend + frontend present.

## Test Coverage Score (0-100)
- **95 / 100**

## Score Rationale
- 100% endpoint HTTP coverage with true no-mock backend API tests.
- Strong auth/validation/negative-path depth.
- Real fullstack E2E exists.
- Minor deductions for direct non-HTTP helper calls and partial frontend unit breadth.

## Key Gaps
- Expand frontend unit coverage for remaining major pages.
- Replace helper-origin endpoint calls with explicit per-endpoint test assertions where `(unknown test)` appears.

## Confidence & Assumptions
- Confidence: **high**.
- Assumptions:
  - Endpoint inventory is based on static route declarations.
  - No hidden dynamic route registration exists outside inspected files.

## Test Coverage Verdict
- **PASS (with minor quality debt)**

---

# README Audit

## High Priority Issues
- None.

## Medium Priority Issues
- None.

## Low Priority Issues
- None material.

## Hard Gate Failures
- None.

## README Verdict
- **PASS**

## Compliance Notes
- Project type explicitly declared at top (`README.md:3`).
- Startup section includes required `docker-compose up` command (`README.md:53`).
- Access method includes URL/port table (`README.md:59-64`).
- Verification section includes API and web validation flows (`README.md:71-109`).
- Environment rules align with Docker-contained execution; test compose no longer runs runtime package installation commands (`docker-compose.test.yml`).
- Demo credentials section explicitly handles all roles, including system-only `job_runner` (`README.md:119-128`, `backend/src/seed.js:40-48`).

---

# Final Combined Verdicts
- **Test Coverage Audit:** PASS (with minor quality debt)
- **README Audit:** PASS

