# Fix Check for `audit_report-2.md` (Static Review)

This is a static-only verification of the 8 issues listed in `.tmp/audit_report-2.md`.

## Overall Fix Status
- **Resolved:** 8 / 8
- **Partially resolved:** 0 / 8
- **Unresolved:** 0 / 8

## Issue-by-Issue Verification

1) **Blocker — Shoe object authorization leak on empty scopes**
- **Previous finding:** unresolved access via local shoe visibility logic.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/routes/shoes.js:152`, `backend/src/routes/shoes.js:165`, `backend/src/services/authz.js:38`, `backend/src/services/authz.js:44`
- **Why fixed:** routes now rely on centralized `authz.canViewShoe`; policy is explicit deny-by-default for non-owners and rejects empty record scopes for scoped reviewers.

2) **High — Address endpoint IDOR / over-broad object access behavior**
- **Previous finding:** unauthorized callers could retrieve address metadata; object authorization was weak.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/routes/addresses.js:54`, `backend/src/routes/addresses.js:65`, `backend/src/routes/addresses.js:67`
- **Why fixed:** object-level policy helper added; unauthorized requests now return uniform `404` and do not return masked metadata for unauthorized IDs.

3) **High — Frontend appeals lacked evidence attachment flow**
- **Previous finding:** UI only submitted rationale/exceptionId.
- **Current status:** **Fixed**
- **Evidence:** `frontend/src/pages/Appeals.jsx:27`, `frontend/src/pages/Appeals.jsx:55`, `frontend/src/pages/Appeals.jsx:120`
- **Why fixed:** file selection, client-side limits, and `FormData` append for `evidence` are implemented in the appeals submission path.

4) **Medium — Password reset start allowed account enumeration**
- **Previous finding:** known vs unknown username returned distinguishable response content.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/services/authService.js:156`, `backend/src/services/authService.js:167`, `backend/src/services/authService.js:170`
- **Why fixed:** reset-start now returns a uniform masked shape for all usernames and no longer discloses per-user question text.

5) **Medium — Service history not implemented as active workflow**
- **Previous finding:** model existed but was effectively unused.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/services/serviceHistoryService.js:10`, `backend/src/routes/custody.js:83`, `backend/src/routes/shipping.js:115`, `backend/src/routes/shoes.js:141`
- **Why fixed:** service history materialization service added; history records are created/updated on completion states and exposed via dedicated read endpoint.

6) **Medium — Barcode label print workflow missing**
- **Previous finding:** serial/barcode existed but no print/label flow.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/routes/shoes.js:115`, `backend/src/routes/shoes.js:122`, `frontend/src/pages/Intake.jsx:45`, `frontend/src/pages/Intake.jsx:92`
- **Why fixed:** backend label endpoint (`/shoes/label/:id`) exists with audit actions for print/reprint; frontend intake page now provides print/reprint UI and preview.

7) **Medium — Insecure default secrets/keys fallback**
- **Previous finding:** predictable hardcoded fallbacks for JWT/encryption key material.
- **Current status:** **Fixed**
- **Evidence:** `backend/src/config/env.js:27`, `backend/src/config/env.js:62`, `backend/src/config/env.js:67`, `backend/src/config/env.js:76`, `backend/src/config/env.js:94`, `backend/src/config/env.js:97`
- **Why fixed:** weak/default secrets are rejected by validators; production now fails hard on weak/missing values; test/dev use ephemeral random fallback instead of predictable literals.

8) **Medium — Missing security regression tests for shoe/address object auth**
- **Previous finding:** no direct regression tests for `/shoes/:id` and `/addresses/:id` object-level authorization.
- **Current status:** **Fixed**
- **Evidence:** `backend/tests/integration/authzRegressions.test.js:276`, `backend/tests/integration/authzRegressions.test.js:364`
- **Why fixed:** dedicated regression workstreams now assert allow/deny behavior for shoe and address object access, including empty-scope and enumeration-protection cases.

## Notes
- This verification is static-only and does **not** claim runtime success.
- The project now includes additional regression coverage beyond the original 8 issues (e.g., label/history/secret validation checks in `backend/tests/integration/authzRegressions.test.js:477`, `backend/tests/integration/authzRegressions.test.js:509`, `backend/tests/integration/authzRegressions.test.js:549`).
