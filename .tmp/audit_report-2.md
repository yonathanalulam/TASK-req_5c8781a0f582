# Static Delivery Acceptance & Architecture Audit

## 1. Verdict
- **Overall conclusion: Partial Pass**
- The repository is substantial and broadly aligned to the prompt, but there are material gaps and security defects, including at least one cross-user data isolation flaw in shoe visibility and an address object-authorization gap.

## 2. Scope and Static Verification Boundary
- **Reviewed:** backend/frontend source, models, routes, middleware, services, docs, and tests (`README.md:1`, `backend/src/app.js:1`, `frontend/src/App.jsx:1`, `backend/tests/integration/authzRegressions.test.js:1`).
- **Not reviewed in depth:** third-party dependencies in `node_modules/`.
- **Intentionally not executed:** app startup, tests, Docker, browser/manual workflows (per audit constraint).
- **Manual verification required:** runtime UX behavior, performance under large data, scanner hardware interactions, print-device integration (not statically demonstrable).

## 3. Repository / Requirement Mapping Summary
- **Prompt core goal mapped:** on-prem/offline lease + shoe intake-to-delivery operations with RBAC/scoping, local identity, encrypted sensitive data, and auditability.
- **Mapped implementation areas:** auth/session (`backend/src/services/authService.js:1`), RBAC/authz (`backend/src/services/rbac.js:1`, `backend/src/services/authz.js:1`), lease/billing/deposits (`backend/src/routes/contracts.js:1`, `backend/src/routes/billing.js:1`, `backend/src/routes/deposits.js:1`), intake/custody/shipping/exceptions/appeals (`backend/src/routes/shoes.js:1`, `backend/src/routes/custody.js:1`, `backend/src/routes/shipping.js:1`, `backend/src/routes/exceptions.js:1`, `backend/src/routes/appeals.js:1`), offline catalog/queue UI (`frontend/src/pages/Catalog.jsx:1`, `frontend/src/store/offlineQueue.jsx:1`), jobs (`backend/src/jobs/scheduler.js:1`).
- **Main deviations:** missing barcode label printing workflow, incomplete frontend appeal evidence upload UX, and security isolation defects in shoe/address access control.

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability
- **Conclusion: Pass**
- **Rationale:** startup/config/test/docs are present and statically coherent.
- **Evidence:** `README.md:13`, `backend/.env.example:1`, `backend/package.json:7`, `frontend/package.json:6`, `docs/api_reference.md:1`.

#### 1.2 Material deviation from prompt
- **Conclusion: Partial Pass**
- **Rationale:** implementation is centered on the prompt domains, but explicit behaviors are missing/partial (barcode label printing, frontend appeal evidence upload, historical service record pipeline).
- **Evidence:** no print/label flow in backend routes (`backend/src/routes/shoes.js:22`), no print feature matches in backend source search (`backend/src/*` grep result), appeal form submits only `exceptionId` and `rationale` (`frontend/src/pages/Appeals.jsx:21`), `ServiceHistory` model appears unused (`backend/src/models/ServiceHistory.js:1`, `backend/src/routes/shoes.js:6`).

### 2. Delivery Completeness

#### 2.1 Core requirements coverage
- **Conclusion: Partial Pass**
- **Rationale:** many core requirements are implemented (offline catalog, intake photos, barcode custody scans, contract lifecycle, billing modes, 10-business-day reconciliation, shipping POD/failed/signoff, tagging/jobs), but some explicit requirements are partial/missing.
- **Evidence:**
  - Implemented examples: catalog sync/filtering/favorites/history (`frontend/src/pages/Catalog.jsx:23`, `frontend/src/services/db.js:9`), intake photo constraints (`backend/src/routes/shoes.js:18`, `backend/src/routes/shoes.js:73`), custody scan (`backend/src/routes/custody.js:15`), contract expiration 90/30/7 (`backend/src/routes/contracts.js:152`), nightly 02:00 recompute (`backend/src/jobs/scheduler.js:9`).
  - Gaps: no print label workflow (`backend/src/routes/shoes.js:22` onward), frontend appeal evidence attachments absent (`frontend/src/pages/Appeals.jsx:21`).

#### 2.2 End-to-end 0→1 deliverable
- **Conclusion: Pass**
- **Rationale:** complete project structure with backend, frontend, docs, tests; not a single-file demo.
- **Evidence:** `README.md:34`, `backend/src/app.js:19`, `frontend/src/App.jsx:63`, `backend/tests/integration/auth.test.js:1`, `frontend/src/__tests__/auth.test.jsx:1`.

### 3. Engineering and Architecture Quality

#### 3.1 Structure and decomposition
- **Conclusion: Pass**
- **Rationale:** modular separation exists (routes/services/models/jobs/middleware), with centralized authz and explicit state-machine services.
- **Evidence:** `backend/src/services/authz.js:1`, `backend/src/services/appealStateMachine.js:1`, `backend/src/services/shippingStateMachine.js:1`, `backend/src/routes/*.js`, `frontend/src/pages/*.jsx`.

#### 3.2 Maintainability/extensibility
- **Conclusion: Partial Pass**
- **Rationale:** generally maintainable, but there is duplicated/ divergent authorization logic (`shoes.js` local `canViewShoe` vs centralized authz), and user-provided scope fields in key writes reduce trust boundaries.
- **Evidence:** duplicated local check in `backend/src/routes/shoes.js:160`; centralized policy exists in `backend/src/services/authz.js:35`; scope input accepted directly in intake/exception/service-request create (`backend/src/routes/shoes.js:24`, `backend/src/routes/exceptions.js:26`, `backend/src/routes/serviceRequests.js:63`).

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, API design
- **Conclusion: Partial Pass**
- **Rationale:** consistent response envelopes and validation exist, but there are security-oriented defects (address object authz, reset enumeration), and some sensitive defaults are insecure.
- **Evidence:** envelope/error middleware (`backend/src/utils/response.js:7`, `backend/src/middleware/errorHandler.js:3`), validation examples (`backend/src/routes/deposits.js:29`, `backend/src/routes/shoes.js:25`), flaws noted in Issues section.

#### 4.2 Product vs demo quality
- **Conclusion: Partial Pass**
- **Rationale:** closer to real product than demo (broad domains, audit, jobs, tests), but material missing prompt features and authorization gaps prevent full acceptance.
- **Evidence:** cross-domain implementation in `backend/src/app.js:19`, docs/runbooks in `docs/operator_runbook.md:1`, and identified gaps in `frontend/src/pages/Appeals.jsx:21`, `backend/src/routes/shoes.js:160`.

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business understanding and implicit constraints
- **Conclusion: Partial Pass**
- **Rationale:** strong alignment to offline/on-prem, role menus, local auth, encryption/audit/jobs; but requirement-fit breaks on strict data isolation and a few explicit user flows.
- **Evidence:** local/offline + queue (`frontend/src/store/offlineQueue.jsx:14`), local auth (`backend/src/routes/auth.js:17`), encryption (`backend/src/utils/crypto.js:11`), audit chain (`backend/src/services/auditService.js:17`), isolation defects (`backend/src/routes/shoes.js:160`, `backend/src/routes/addresses.js:54`).

### 6. Aesthetics (frontend/full-stack)

#### 6.1 Visual/interaction quality
- **Conclusion: Partial Pass**
- **Rationale:** UI is coherent and usable with role-gated navigation and status feedback, but visual system is basic and utilitarian; some workflows rely on browser `prompt()` dialogs.
- **Evidence:** shared styling and layout (`frontend/src/styles/app.css:1`), interaction affordances (`frontend/src/App.jsx:55`, `frontend/src/pages/Catalog.jsx:112`), prompt-based decisions in appeals (`frontend/src/pages/Appeals.jsx:31`).
- **Manual verification note:** final visual polish and responsive behavior require browser review.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1) **Severity: Blocker**
- **Title:** Shoe object-level authorization allows unintended cross-user reads when `scopes` is empty
- **Conclusion:** Fail
- **Evidence:** `backend/src/routes/shoes.js:160`, `backend/src/routes/shoes.js:164`, `backend/src/services/rbac.js:64`
- **Impact:** a non-owner authenticated user can pass `rbac.scopeMatches` for records without scope tags, enabling unauthorized `GET /shoes/:id`, attachment reads, and list visibility filtering behavior.
- **Minimum actionable fix:** remove local `canViewShoe` and use centralized `authz.canViewShoe`; ensure non-owner students are denied unless explicit authorized role/scope rule passes.

2) **Severity: High**
- **Title:** Address endpoint has IDOR/over-broad access to sensitive address data
- **Conclusion:** Fail
- **Evidence:** `backend/src/routes/addresses.js:54`, `backend/src/routes/addresses.js:57`, `backend/src/routes/addresses.js:59`
- **Impact:** any authenticated caller can retrieve metadata (`label`, `maskedPreview`) for arbitrary address IDs; ops/admin/security can decrypt any address by ID with no scope/ownership check.
- **Minimum actionable fix:** enforce object-level authorization (owner or explicit scoped need-to-know policy); return 403/404 for unauthorized IDs instead of masked metadata.

3) **Severity: High**
- **Title:** Frontend appeal submission does not implement evidence attachment flow
- **Conclusion:** Fail
- **Evidence:** `frontend/src/pages/Appeals.jsx:21`, `frontend/src/pages/Appeals.jsx:57`, backend supports `evidence[]` (`backend/src/routes/appeals.js:19`)
- **Impact:** explicit prompt requirement (appeal with evidence attachments in UI) is not met end-to-end for users.
- **Minimum actionable fix:** add file picker (`multiple`, JPEG/PNG constraints), append files as `evidence` entries in `FormData`, and show uploaded evidence state/errors.

### Medium

4) **Severity: Medium**
- **Title:** Password reset start flow reveals account existence
- **Conclusion:** Partial Fail
- **Evidence:** `backend/src/services/authService.js:156`, `backend/src/services/authService.js:160`, `backend/src/services/authService.js:162`
- **Impact:** existing usernames get real question text while unknown users get generic text, enabling account enumeration.
- **Minimum actionable fix:** always return uniform response shape/message for both existent/non-existent accounts; move real challenge to a second step keyed by opaque nonce.

5) **Severity: Medium**
- **Title:** Historical service-record domain is not implemented as an active workflow
- **Conclusion:** Partial Fail
- **Evidence:** model exists `backend/src/models/ServiceHistory.js:1`; only import in shoes route `backend/src/routes/shoes.js:6`; no other usage in backend source search
- **Impact:** “instant lookup of historical service records” is only partially represented via custody events; no dedicated service history population/query pipeline is visible.
- **Minimum actionable fix:** persist service lifecycle milestones into `ServiceHistory` and expose/read through a dedicated lookup endpoint/UI section.

6) **Severity: Medium**
- **Title:** Barcode label printing workflow is not implemented
- **Conclusion:** Partial Fail
- **Evidence:** intake returns barcode/serial (`backend/src/routes/shoes.js:45`), but no print route/service/UI action found in backend/ frontend route set (`backend/src/app.js:19`, `frontend/src/pages/Intake.jsx:65`)
- **Impact:** explicit prompt step (“print and attach serial + barcode label”) lacks implementation evidence.
- **Minimum actionable fix:** add printable label endpoint/template (or client print view) tied to intake record and audit print action.

7) **Severity: Medium**
- **Title:** Insecure default secrets/keys in runtime fallback
- **Conclusion:** Partial Fail
- **Evidence:** hardcoded JWT fallback `backend/src/config/env.js:22`; fallback encryption key `backend/src/config/env.js:42`; example includes default seed password/key `backend/.env.example:9`, `backend/.env.example:16`
- **Impact:** deployments that miss environment hardening can run with predictable credentials/keys, undermining auth and at-rest protection.
- **Minimum actionable fix:** fail startup when `JWT_SECRET` or encryption keys are default/weak in non-test mode; enforce secret-strength checks.

8) **Severity: Medium**
- **Title:** Security regression coverage misses direct tests for shoe and address object authorization
- **Conclusion:** Insufficient Coverage
- **Evidence:** authz regression tests cover custody/shipping/tags/appeals/KPI (`backend/tests/integration/authzRegressions.test.js:47`), but no `/api/v1/shoes/:id` or `/api/v1/addresses/:id` authz assertions in backend tests (`backend/tests` grep for `/api/v1/shoes` shows intake-focused tests only)
- **Impact:** severe access-control regressions can remain undetected while test suite passes.
- **Minimum actionable fix:** add integration tests for unauthorized shoe detail/list and address detail access across student/faculty/mentor/ops/admin roles and scope combinations.

## 6. Security Review Summary

- **Authentication entry points:** **Partial Pass** — local signup/login/reset/change-password and session checks are present (`backend/src/routes/auth.js:17`, `backend/src/middleware/auth.js:5`), but reset-start response pattern enables enumeration (`backend/src/services/authService.js:156`).
- **Route-level authorization:** **Partial Pass** — capability middleware is widely used (`backend/src/routes/contracts.js:25`, `backend/src/routes/shipping.js:22`, `backend/src/routes/admin.js:16`), but some sensitive routes rely only on `requireAuth` and weak object checks (`backend/src/routes/addresses.js:9`).
- **Object-level authorization:** **Fail** — shoe and address object isolation has defects (`backend/src/routes/shoes.js:160`, `backend/src/services/rbac.js:64`, `backend/src/routes/addresses.js:54`).
- **Function-level authorization:** **Partial Pass** — explicit transition policies exist for exceptions/appeals/shipping (`backend/src/services/authz.js:73`, `backend/src/services/authz.js:105`, `backend/src/routes/shipping.js:46`), but correctness still depends on flawed object controls in some paths.
- **Tenant/user data isolation:** **Fail** — unauthorized cross-user data exposure is possible in shoe/address flows; scope tagging is caller-provided in several writes (`backend/src/routes/shoes.js:52`, `backend/src/routes/exceptions.js:26`, `backend/src/routes/serviceRequests.js:63`).
- **Admin/internal/debug protection:** **Pass** — admin and jobs endpoints are guarded by capabilities (`backend/src/routes/admin.js:16`, `backend/src/routes/jobs.js:11`, `backend/src/routes/jobs.js:29`).

## 7. Tests and Logging Review

- **Unit tests:** **Pass** — multiple unit suites exist for billing/crypto/audit/state machines/business calendar (`backend/tests/unit/billing.test.js:1`, `backend/tests/unit/crypto.test.js:1`, `backend/tests/unit/audit.test.js:1`).
- **API/integration tests:** **Partial Pass** — good breadth across auth, contracts, intake/custody, appeals, tags/import/export, regressions (`backend/tests/integration/auth.test.js:1`, `backend/tests/integration/contracts.test.js:1`, `backend/tests/integration/authzRegressions.test.js:1`), but key object-auth flows are missing.
- **Logging categories/observability:** **Partial Pass** — structured audit actions are comprehensive (`backend/src/services/auditService.js:17`, `backend/src/routes/*` audit calls), scheduler and server logs are meaningful (`backend/src/server.js:11`, `backend/src/jobs/scheduler.js:23`), but console error logging still emits raw server errors (`backend/src/middleware/errorHandler.js:8`).
- **Sensitive-data leakage risk in logs/responses:** **Partial Pass** — notable hardening exists (no Mongo URI log, seed password redaction: `backend/src/server.js:10`, `backend/src/seed.js:237`), but defaults and some endpoint metadata exposure remain risks (issues above).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- **Unit tests exist:** yes (`backend/tests/unit/*.test.js`).
- **API/integration tests exist:** yes (`backend/tests/integration/*.test.js`).
- **Frontend tests exist:** yes (`frontend/src/__tests__/*.test.jsx`) using Vitest + RTL (`frontend/package.json:10`, `frontend/vite.config.js:12`).
- **Test frameworks:** Jest/Supertest for backend (`backend/package.json:11`), Vitest/Testing Library for frontend (`frontend/package.json:10`, `frontend/package.json:19`).
- **Test commands documented:** yes (`README.md:58`).

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Local auth + session lifecycle | `backend/tests/integration/auth.test.js:43` | login/me/logout then token invalid (`auth.test.js:55`) | sufficient | none material | keep regression tests for idle/absolute expiry edges |
| 401 unauthenticated on protected APIs | `backend/tests/integration/auth.test.js:81` | `/catalog/services` returns 401 | basically covered | only one route sampled | add matrix for representative sensitive routes |
| Role capability checks (403) | `backend/tests/integration/authorization.test.js:30` | student denied catalog manage | basically covered | limited per-domain breadth | add contract/deposit/admin route capability negatives |
| Intake + photo validation + custody scan transitions | `backend/tests/integration/intakeCustody.test.js:40` | photo upload, illegal transition 409 (`:67`) | sufficient | no shoe detail visibility authz | add shoe detail/list unauthorized tests |
| Object authz for custody/shipping/tags/appeals | `backend/tests/integration/authzRegressions.test.js:47` | explicit 403/200 cross-user assertions | sufficient (for tested endpoints) | shoes/addresses not covered | add IDOR tests for `/shoes/:id`, `/addresses/:id` |
| Contract lifecycle + 10-business-day reconciliation flow | `backend/tests/integration/contracts.test.js:23` | terminate then reconcile (`:48`, `:54`) | basically covered | no negative test for due-date/calendar edge | add dueAt calendar boundary test |
| Deposit encryption and masking | `backend/tests/integration/depositEncryption.test.js:42` | raw Mongo doc lacks plaintext fields (`:57`) | sufficient | reconciliation plaintext schema field not asserted | add assertion that `finalBalanceCents` never persisted |
| Export masking/unmask capability behavior | `backend/tests/integration/exportUnmask.test.js:30` | masked vs unmasked CSV content asserts | basically covered | no scoped export coverage | add role/scope-bound export tests if scope exports introduced |
| Appeals workflow authz + transitions | `backend/tests/integration/appeals.test.js:27` | cohort mentor approve, wrong cohort denied (`:75`) | basically covered | frontend evidence upload path untested | add FE integration test for evidence file submission |
| Offline catalog filters/history/favorites UX | `frontend/src/__tests__/catalogFilters.test.jsx:42` | category/tag/search combinations and offline fallback (`:90`) | basically covered | history/favorites persistence edge cases not asserted | add IndexedDB persistence and replay tests |
| Shipping POD/failed-delivery UI | `frontend/src/__tests__/shippingActions.test.jsx:14` | role-gated controls and payload/file submission | basically covered | no exception signoff UI test | add signoff flow test |

### 8.3 Security Coverage Audit
- **Authentication tests:** **Basically covered** (`backend/tests/integration/auth.test.js:43`).
- **Route authorization tests:** **Basically covered** but not comprehensive (`backend/tests/integration/authorization.test.js:30`).
- **Object-level authorization tests:** **Insufficient** — good coverage for some entities, missing shoes/addresses where defects exist (`backend/tests/integration/authzRegressions.test.js:47`).
- **Tenant/data isolation tests:** **Insufficient** — scoped KPI/tag coverage is good (`backend/tests/integration/authzRegressions.test.js:173`, `:274`), but not extended to all sensitive entities.
- **Admin/internal protection tests:** **Basically covered** indirectly; dedicated negative tests for admin routes are sparse.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major risk areas covered: auth, core lifecycle APIs, several authz regressions, encryption persistence.
- Major uncovered risks: shoe/address object-level authorization and some prompt-critical UX paths; therefore tests could pass while severe access-control defects remain.

## 9. Final Notes
- The codebase is substantial and close to prompt intent, but not acceptance-ready due to security isolation defects and a few explicit requirement gaps.
- Strongest immediate remediation sequence: (1) fix shoe/address object authz, (2) add missing regression tests, (3) complete appeal evidence upload and label-printing workflows.
