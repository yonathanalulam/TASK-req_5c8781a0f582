# Offline Lease & Service Operations Portal

**Project type: fullstack** (Node.js + Express backend, React 18 + Vite frontend, MongoDB).

On-premise, offline-capable operations system for facility lease contracts and physical-item
(shoe) intake-to-delivery workflows with RBAC + scoped access, local identity, append-only
audit, and 7-year retention.

---

## Stack

- **Backend:** Node.js 20 + Express 4, MongoDB 7 (local, no internet egress)
- **Frontend:** React 18 + Vite 5 (served via nginx in Docker, with `/api` proxied to the backend)
- **Auth:** local username/password (Argon2id), security-question reset, JWT bearer sessions
- **Storage:** local filesystem for attachments; SHA-256 fingerprinted
- **Encryption at rest:** AES-256-GCM for addresses, deposit amounts, identity metadata
- **Audit:** append-only log with chained SHA-256 hashes, 7-year retention
- **Jobs:** local scheduler; persisted job records in MongoDB
- **Testing:** Jest (backend + E2E), Vitest (frontend), supertest, mongodb-memory-server,
  cheerio + node-fetch for real FE↔BE integration tests; all orchestrated via Docker.

---

## Architecture overview

```
┌────────────────────────┐    /api/* proxy   ┌──────────────────────────┐
│  frontend (nginx:80)   │  ───────────────▶ │  backend (Express:4000)  │
│  React SPA (Vite dist) │                   │  Routes → Services → DB  │
└────────────────────────┘                   └────────────┬─────────────┘
                                                          │
                                                   mongodb://mongo:27017
                                                          │
                                              ┌───────────▼───────────┐
                                              │  mongo (MongoDB 7)    │
                                              │  offline_ops_portal   │
                                              └───────────────────────┘
```

Request flow: browser → nginx (SPA + `/api` reverse proxy) → Express (auth middleware →
capability/scope checks → service layer → Mongoose models → MongoDB). Exports write CSVs
to a mounted volume; attachments do the same. Both are SHA-256 fingerprinted.

---

## Startup (Docker-contained)

The entire system — database, API, frontend, and seed data — boots with a single command.
There is no `npm install` on the host, no manual `mongod`, and no external SaaS.

```
docker-compose up -d
# equivalent modern form:
docker compose up --build -d
docker compose run --rm seed          # idempotent; seeds roles, demo users, catalog, sample data
```

After both commands complete:

| Service   | URL                                         | Port |
| --------- | ------------------------------------------- | ---- |
| Frontend  | http://localhost:8080                       | 8080 |
| Backend   | http://localhost:4000/api/v1                | 4000 |
| MongoDB   | mongodb://localhost:27017                   | 27017|

Shut down with `docker compose down` (add `--volumes` to also wipe MongoDB + storage state).

---

## Verification

### API verification (curl)

```
# 1. Health — must return { status: "ok" }.
curl -s http://localhost:4000/api/v1/health | jq

# 2. Login as the seeded admin and capture the JWT.
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"ChangeMeNow!2026"}' \
  | jq -r '.data.token')

# 3. Authenticated identity check.
curl -s http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer $TOKEN" | jq

# 4. List the seeded catalog through the authenticated API.
curl -s 'http://localhost:4000/api/v1/catalog/services' \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items[].code'

# 5. Run the same call through the frontend's proxy — confirms the nginx /api route works.
curl -s http://localhost:8080/api/v1/health | jq
```

### Web verification (step-by-step UI)

1. Open `http://localhost:8080` in a browser. Confirm the SPA shell loads (no network
   errors in devtools, an `#root` node is hydrated).
2. Click **Login**. Enter `admin` / `ChangeMeNow!2026`. On success you should see the
   operations dashboard with the user menu showing **System Admin**.
3. Navigate to **Catalog**. Expect at least the seeded services: `basic-clean`,
   `deep-clean`, `sole-repair`, `suede-clean`, `polish-shine`, `full-redye`.
4. Log out, log back in as `ops1` / `OpsPass!2026ABC`. Go to **Intake**, create a new
   shoe for student `student1`. Note the generated serial + barcode.
5. Log out, log back in as `student1` / `StudentPass!2026`. Go to **My Shoes**. The shoe
   created in step 4 must appear, with the student seeing only their own items.
6. Log in as `admin` and browse **Audit**. Confirm entries appear for the login, intake,
   and log-out actions.

If any step fails, check `docker compose logs backend frontend mongo`.

---

## Demo credentials (all seeded roles)

These accounts are created by `docker compose run --rm seed`. Use them for
role-specific validation during review. Passwords are local-only; rotate before any
non-demo use.

| Role                 | Username   | Password            | Scope                                      |
| -------------------- | ---------- | ------------------- | ------------------------------------------ |
| department_admin + security_admin | `admin`    | `ChangeMeNow!2026`  | global (`*`). **Must change password on first login.** |
| operations_staff     | `ops1`     | `OpsPass!2026ABC`   | global (`*`)                               |
| student              | `student1` | `StudentPass!2026`  | school=SCH-1, internship_cohort=COH-1      |
| faculty_advisor      | `faculty1` | `FacultyPass!2026`  | school=SCH-1                               |
| corporate_mentor     | `mentor1`  | `MentorPass!2026`   | internship_cohort=COH-1                    |
| job_runner           | _N/A_      | _N/A_               | System-only role (non-interactive, no seeded login user) |

Security-question answer for all demo accounts: `rover` (question: "What is the name of your first pet?").

---

## Security and roles model

| Role               | Key capabilities (see `backend/src/services/rbac.js` for the full matrix)        |
| ------------------ | -------------------------------------------------------------------------------- |
| student            | browse catalog, submit service request / appeal for self, view own item/shipping |
| faculty_advisor    | scoped item + exception + appeal view; scoped export; contract view (scoped)     |
| corporate_mentor   | scoped (cohort) item + exception view; scoped appeal approval                    |
| operations_staff   | shoe intake, custody scans, shipping fulfillment, proof-of-delivery capture      |
| department_admin   | full contract lifecycle, billing + deposit + reconciliation, catalog CRUD, tags  |
| security_admin     | force logout, audit view + verify, user unlock, session revoke, key rotation     |
| job_runner         | background job execution                                                         |

Three-layer authorization (all server-side): `requireAuth` → capability check
(`requireCapability`) → object- or scope-level policy (`backend/src/services/authz.js`).

All mutating actions record an append-only audit entry with a chained SHA-256 hash;
`POST /api/v1/admin/audit/verify` recomputes the chain and reports tampering.

---

## Workflow summary

1. **Intake** — `operations_staff` scans in a physical item; shoe moves through
   `intake_draft → intake_completed` with mandatory attachments + barcode.
2. **Service** — custody scans transition through `in_service → quality_check →
   ready_for_delivery` (state machine enforced in `shoeStateMachine.js`).
3. **Shipping** — `shipping.create → transition → proof-of-delivery / delivery-failed
   / exception.signoff → closed`. Each transition is enforced by
   `shippingStateMachine.js` and requires matching capability.
4. **Contracts + billing** — `contract.create → activate → amend/renew → terminate →
   reconciliation.complete`; every step snapshots an immutable
   `LeaseContractVersion` and any billing rule change bumps `BillingRuleVersion`.
5. **Exceptions + appeals** — subjects surface exceptions; scoped reviewers
   (`faculty_advisor`, `corporate_mentor`, `department_admin`) transition/decide
   appeals with scope-level authorization.
6. **Tags + imports/exports** — tag rules are versioned; CSV imports/exports are
   logged, fingerprinted, and role-gated.

---

## Testing

All test workflows are fully containerized. No host-side `npm install`, no manual DB.

### Run everything (recommended)

```
./run_tests.sh
```

This runs, in order:

1. **Backend** — `jest` against `backend/tests/**/*.test.js`. Real Express app + real
   MongoDB (`mongodb-memory-server`) via `supertest`. No transport/service mocks.
2. **Frontend unit** — `vitest` against `frontend/src/__tests__/*.test.jsx`
   (component/behavior tests, `@testing-library/react` + jsdom).
3. **Fullstack E2E** — `e2e/tests/*.e2e.test.js`. Brings up the real `backend` +
   `frontend` (nginx) + `mongo` containers, seeds demo data, then drives the flows
   through the frontend's `/api` reverse proxy using `node-fetch`. No mocked backend.

The script exits non-zero if any stage fails and always tears down test containers +
volumes on exit. Individual stages can be run via:

```
./run_tests.sh backend
./run_tests.sh frontend
./run_tests.sh e2e
SKIP_E2E=1 ./run_tests.sh   # backend + frontend only
```

### Endpoint coverage

Every endpoint declared in `backend/src/routes/*.js` has at least one true no-mock HTTP
test under `backend/tests/integration/`. Negative auth paths (401/403) are asserted
alongside positive (200/201) cases for capability-gated routes. See the integration
suite list in `backend/tests/integration/`.

---

## Project layout

```
backend/      Express API, Mongoose models, services, tests, Dockerfile
frontend/     React SPA, vitest unit tests, Dockerfile (multi-stage → nginx)
e2e/          Fullstack end-to-end tests (real containers, no mocks)
docs/         Operational runbooks (backup, key rotation, forced-logout, etc.)
samples/      CSV templates for imports/exports
docker-compose.yml         — runtime (backend, frontend, mongo, one-shot seed)
docker-compose.test.yml    — isolated test stack (backend-test, frontend-test, e2e)
run_tests.sh               — Docker-based test orchestrator (entry point)
```

## License

Internal use only.
