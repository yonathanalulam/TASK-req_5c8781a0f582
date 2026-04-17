# Fix Check Against Previous `audit_repot-1.md`

Static-only verification of issues listed in the prior report (referenced as `./.tmp/audit_repot-1.md`).

## Overall Result
- **All 4 previously listed issues are now fixed based on static evidence.**
- No runtime claims were made; this is code-and-tests/documentation inspection only.

## Issue-by-Issue Verification

1. **High:** KPI endpoint leaked global aggregates to scoped reviewers  
   **Previous evidence:** `backend/src/services/authz.js:130`, `backend/src/routes/reports.js:17`  
   **Status:** **Fixed**  
   **Current evidence:**
   - Access mode now differentiates `global` vs `scoped` vs `deny`: `backend/src/services/authz.js:130`
   - Scoped KPI path exists and applies scope filters (`scopeFilterForReviewer`, `scopeAssignmentFilterForReviewer`): `backend/src/routes/reports.js:77`
   - Route now dispatches by mode and denies missing scope: `backend/src/routes/reports.js:150`
   - Regression tests assert scoped reviewer behavior and global/non-global separation: `backend/tests/integration/authzRegressions.test.js:173`

2. **High:** Tag visibility bypassed scope model for non-admin staff/reviewers  
   **Previous evidence:** `backend/src/services/authz.js:135`, `backend/src/routes/tags.js:29`  
   **Status:** **Fixed**  
   **Current evidence:**
   - Target user scopes are resolved before auth decision: `backend/src/routes/tags.js:12`
   - `canReadTagsForUser` now accepts target scopes and performs strict intersection checks: `backend/src/services/authz.js:191`
   - `/tags/user/:userId` enforces the new scope-aware check: `backend/src/routes/tags.js:40`
   - Additional scoped behavior on `/tags/counts`: `backend/src/routes/tags.js:85`
   - Regression tests cover in-scope/out-of-scope/unscope/admin cases: `backend/tests/integration/authzRegressions.test.js:274`

3. **Medium:** API docs missing service-request endpoints  
   **Previous evidence:** `backend/src/app.js:36`, `docs/api_reference.md:66`  
   **Status:** **Fixed**  
   **Current evidence:**
   - `Service Requests` section is now present with route contract details: `docs/api_reference.md:72`
   - Endpoints documented for create/list/detail/cancel: `docs/api_reference.md:75`, `docs/api_reference.md:82`, `docs/api_reference.md:86`, `docs/api_reference.md:90`

4. **Medium:** Security tests did not assert reviewer-scope restrictions on KPI/tags  
   **Previous evidence:** `backend/tests/integration/authzRegressions.test.js:83`, `backend/tests/integration/authzRegressions.test.js:96`  
   **Status:** **Fixed**  
   **Current evidence:**
   - KPI scope-leak regression block with mentor/faculty/no-scope/admin/ops scenarios: `backend/tests/integration/authzRegressions.test.js:173`
   - Tag visibility scope-leak regression block with mentor/faculty/out-of-scope/admin + counts behavior: `backend/tests/integration/authzRegressions.test.js:274`

## Notes
- The prior file appears to be named `audit_repot-1.md` (typo) rather than `audt_report-1.md`; this check used the existing file in `.tmp`.
- This fix check validates only the previously listed issues, not a full fresh acceptance audit.
