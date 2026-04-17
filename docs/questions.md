# Offline Lease & Service Operations Portal - Clarification Questions

## 1. Persona Coverage: Hidden Operational Roles

**Question:** The prompt enumerates four personas — Students, Faculty Advisors, Corporate Mentors, and Department Admins — but the workflows it describes (creating shoe profiles with barcode labels, running nightly cron jobs, revoking compromised-device sessions) cannot plausibly be performed by any of them. Staff who "create a shoe profile" are not Students; nightly tag recomputation and audit-chain verification are not a Faculty Advisor's remit; force-logout for compromised devices is a security-officer concern, not an academic department admin concern. Are additional first-class roles required to make the system coherent, and if so, where do they sit in the capability matrix?

**My Understanding:** Two additional roles are required. `operations_staff` owns intake, custody, shipping, and POD; `security_admin` owns session revocation, audit inspection, audit-chain verification, and key rotation. Both roles are permission-narrowed rather than admin-superset — e.g. `operations_staff` must not gain `catalog.manage` or `contract.*` capabilities, and `security_admin` must not gain `deposit.manage` — so neither can substitute for `department_admin` on its own.

**Solution:** The role matrix in `services/rbac.js` defines `roleCapabilities` for seven roles: `student`, `faculty_advisor`, `corporate_mentor`, `operations_staff`, `department_admin`, `security_admin`, and `job_runner`. `operations_staff` receives `shoe.intake.create`, `custody.scan`, `shipping.create`, `shipping.fulfill`, `delivery.proof.capture`, and `delivery.exception.signoff` but no contract or tag-rule authority. `security_admin` receives `force_logout`, `audit.view`, `audit.verify`, `user.unlock`, `key.rotate`, and `session.revoke`. `department_admin` retains the cross-cutting catalog/contract/billing/tag/export superset but not `audit.verify` or `key.rotate`, preserving separation-of-duty.

---

## 2. Password Reset Without Email or SMS: Question-Disclosure Oracle

**Question:** The prompt requires offline-only password reset via a pre-registered security question, but the obvious flow — "enter username, see your security question, answer it" — turns the login page into a username enumeration oracle *and* leaks the question text (often a memorable personal fact) to anyone who can guess a username. How is reset-start supposed to behave for both known and unknown usernames without leaking either signal?

**My Understanding:** `/auth/reset/start` must return an identical response shape and timing for known and unknown usernames — no "this username has no account" and no question text disclosure. The actual security answer verification is deferred to `/auth/reset/complete`, which takes `{username, securityAnswer, newPassword}` together and returns a single `INVALID_CREDENTIALS` response for both unknown-user and wrong-answer failures. A per-user 5/30-minute throttle on answer attempts prevents brute force once a real username is guessed.

**Solution:** `authService.startPasswordReset` returns `{ masked: true, questionText: null, questionId: null, message: "If an account exists for this username, enter your security answer on the next step…" }` regardless of existence, and still performs a no-op `User.findOne(...).lean()` so lookup timing is comparable. `completePasswordReset` enforces `ANSWER_WINDOW_MS = 30 min` with `MAX_ANSWER_FAILS = 5`, setting `answerLockedUntil` on lockout. On successful reset it revokes every active session for that user via `Session.updateMany({ userId, state: 'active' }, { state: 'revoked', revokedReason: 'password_reset' })`.

---

## 3. Session Lifetime: Idle vs Absolute vs Forced Logout

**Question:** The prompt states "30-minute idle timeout and an admin-driven forced logout," but an idle timeout alone doesn't bound total exposure if an attacker keeps a stolen token active by sending periodic requests. Is an absolute session lifetime also required, and how are forced logouts distinguished from natural expiries in the audit trail so a compromised-device event can be reconstructed?

**My Understanding:** Three independent kill-switches are needed: 30-minute idle, a 24-hour absolute cap, and explicit admin revocation. Every request must re-validate session state server-side rather than trusting JWT expiry alone, and revoked/idle_expired/absolute_expired sessions must be distinguishable in `AuditLog` so incident response can answer "was this logout user-initiated, timed out, or forced?"

**Solution:** `Session` documents carry `state ∈ {active, logged_out, idle_expired, absolute_expired, revoked}` plus `revokedBy`, `revokedReason`, `absoluteExpiresAt`, and `lastActivityAt`. `authService.validateSession` runs on every authenticated request, auto-transitioning expired sessions and refreshing `lastActivityAt` only for active ones. `forceLogout` requires a ≥3-char reason and records `action: 'session.force_logout'` in the audit chain with the target userId in `diffSummary`. Absolute cap is 24h via `SESSION_ABSOLUTE_HOURS` env var; idle cap is 30 min via `SESSION_IDLE_MINUTES`.

---

## 4. Encryption Key Lifecycle: Storage, Rotation, and Startup Safety

**Question:** The prompt requires that "sensitive fields (addresses, deposit amounts, and identity metadata) are encrypted at rest," but does not say how the encryption key is generated, versioned, or rotated. A hardcoded key compiled into the binary would negate encryption; a single key with no version tag makes rotation impossible without re-encrypting every row in one big-bang migration. How should keys be provisioned and rotated, and what must the system do at startup if the key is missing or weak in production?

**My Understanding:** Keys must be provisioned per-deployment as 32-byte random values supplied via environment variables, with a numeric version suffix so multiple generations can coexist. Ciphertext must embed the version used to write it so later decryption can pick the correct key. Rotation is a background job, not a release-blocker. Startup must refuse to run in production with a missing, default, or low-entropy key rather than silently falling back to a predictable literal.

**Solution:** `utils/crypto.js` uses AES-256-GCM; every ciphertext blob is `{v, iv, ct, tag}` where `v` is the key version used. `config/env.js` resolves keys from `ENCRYPTION_KEY_V<n>_HEX` env vars into a version→buffer map, with `CURRENT_KEY_VERSION` selecting the active write key. `isStrongEncryptionKeyHex` rejects anything not 64 hex chars, rejects `0123…ef` patterns and single-byte repeats, and raises at boot in production. In dev/test it substitutes an ephemeral random key rather than a predictable literal. `jobs/keyRotation.js` re-encrypts ciphertext with a newer version in the background.

---

## 5. Termination Reconciliation: Defining "10 Business Days"

**Question:** The prompt requires that deposits "must be reconciled within 10 business days after termination," but "business day" is ambiguous — does it mean weekdays, exclude US federal holidays, exclude organization-local closures, or all of the above? If a contract terminates on Dec 22nd, what is the exact reconciliation due date?

**My Understanding:** Business days exclude Saturdays, Sundays, and a configurable holiday calendar (US federal by default), and the calendar must be editable by admins without a code deploy. Termination effective on Dec 22 with Dec 25 and Jan 1 as observed holidays therefore lands the reconciliation due date on approximately Jan 8, not Jan 1.

**Solution:** `LeaseContract.reconciliationDueAt` is computed via `utils/businessCalendar.addBusinessDays(terminationEffectiveDate, 10)` at the moment of termination. The calendar is seeded with US federal holidays 2025–2030 and is admin-editable via `SystemSetting.businessCalendar`. A contract moves `terminated → reconciliation_pending` on termination; the hourly `reconciliation_overdue` job flips `TerminationReconciliation.status` to `overdue` and the parent contract to `reconciliation_overdue` when `dueAt < now`, so the date is enforced by automation rather than reviewer vigilance.

---

## 6. Duplicate Shoe Intake: Same Owner, Same Day

**Question:** The prompt says every incoming pair gets a unique serial and barcode, but says nothing about the common operational case of a student dropping off two visually identical pairs, or staff accidentally starting a second intake before finishing the first. Should the second intake be silently allowed (creating twin records with the same brand/size/color), blocked outright, or blocked with an override path?

**My Understanding:** Silent duplication creates a custody nightmare; hard blocking breaks legitimate cases of genuinely identical pairs. The compromise is a 24-hour warning window that blocks the second intake unless the operator explicitly acknowledges and provides a written reason, which lands in the audit trail alongside the created record.

**Solution:** `POST /shoes/intake` checks for any non-terminal `ShoeProfile` with matching `ownerUserId + brand + color + size` created within the last 24h. On match it returns `409 DUPLICATE_WARNING` with the `duplicateId` in `details`. The client can retry with `{ allowDuplicateOverride: true, duplicateOverrideReason: "…" }`; the reason must be ≥3 chars and is persisted on the new profile's audit entry as `reason: "duplicate override: <text>"`.

---

## 7. Barcode Format and Collision Handling

**Question:** The prompt requires "a unique serial plus barcode label" but does not specify the barcode symbology, its length, whether it carries a check digit, or what happens on the vanishingly rare hash collision. Operational scanners need fixed-length numeric payloads with self-validation; a misprinted digit must be detectable without a DB round-trip.

**My Understanding:** Serials should remain UUID v4 for uniqueness; barcodes should be a 12-digit numeric payload (Code128-renderable) derived deterministically from the serial, with a Luhn check digit so operators can validate scan reads locally. Collisions are rare but possible after the mod-10^11 reduction; the system must retry with a perturbation before giving up.

**Solution:** `services/barcodeService.js` sets `serial = uuid()` and derives `barcode = (first 8 bytes of sha256(serial + ':' + attempt) mod 10^11).padStart(11,'0') + luhnCheckDigit()`. `generateUniqueBarcode` retries up to 10 times with incrementing `attempt` on DB-unique-index collisions before throwing. `GET /custody/verify-barcode/:code` and `verifyBarcodeCheckDigit` let the client validate a scan locally before sending it to the server.

---

## 8. Attachment Safety: MIME Lies and SHA-256 Fingerprinting

**Question:** The prompt mandates JPEG/PNG intake photos ≤5 MB and SHA-256 fingerprints on stored attachments, but trusting the uploaded `Content-Type` header is a well-known hole — an attacker can rename `payload.exe` to `.jpg` and upload it with `image/jpeg`. How does the system guarantee the bytes actually are an image, and how does it detect silent corruption on disk over time?

**My Understanding:** Validation must combine the declared MIME type with a magic-byte sniff that reads the first few bytes of the buffer; a mismatch between the declared and sniffed type must be a hard reject. At persistence time, the SHA-256 is stored alongside the blob; a scheduled integrity job re-reads a rolling sample and flags any divergence.

**Solution:** `services/attachmentService.js` defines `ALLOWED` with magic-byte signatures — `FF D8 FF` for JPEG, `89 50 4E 47 0D 0A 1A 0A` for PNG. `storeAttachment` calls `detectContentType` first and rejects `422 VALIDATION_ERROR` if the sniff fails or the declared MIME doesn't match. Files land under `storage/attachments/<sha[:2]>/<opaqueId>.<ext>`. The nightly `attachmentIntegrityCheck` job (03:30) re-hashes up to 500 active attachments per run, flipping `verifiedStatus` to `corrupt` or `missing` and writing a separate `attachment.integrity_warning` audit row per failure.

---

## 9. Export Masking: Who Can Read Legal Names and Deposit Dollars?

**Question:** The prompt says sensitive fields are encrypted at rest, but says nothing about what the CSV export contains or who can request unmasked data. A blanket "admin can export everything" policy is unsafe — a read-only finance auditor and a rogue admin look identical from the server's perspective unless unmasking is an explicit capability that must be separately granted and independently audited.

**My Understanding:** Export endpoints must default-deny unmasking. Unmasking requires both a specific `unmask_export` capability *and* an explicit `unmask: true` flag in the request body (with a reason), so accidental unmasking is impossible and every unmasked export lands in the audit log with a distinct action name.

**Solution:** `routes/exports.js#resolveUnmask` requires both the `unmask_export` capability and `req.body.unmask === true`; otherwise `maskField(val)` returns `'********'` for every sensitive column. The audit action name is `export.contracts.unmasked` vs `export.contracts` so an audit reviewer can filter unmasked exports directly. `department_admin` holds both `export.all` and `unmask_export`; `faculty_advisor` and `corporate_mentor` hold `export.scoped` or `export.scoped_cohort` only. Every download call appends to `ExportJob.accessLog` and emits an `export.download` audit entry.

---

## 10. Appeal Decision Authority: Cohort vs Department

**Question:** The prompt says Corporate Mentors "approve appeals for their internship cohort" but also says Department Admins "configure catalogs, contracts, and access rules." When an exception is raised for a student who belongs to an internship cohort, does the mentor decide, the department admin decide, both, or does authority depend on which scope dimensions the exception carries? Faculty Advisors "review exceptions and oversee cohorts" — do they also decide appeals?

**My Understanding:** Authority should follow the scope tags on the underlying exception. If the exception is tagged with an `internship_cohort` scope that overlaps the reviewer's scope, the corporate mentor decides. Otherwise the department admin decides as the universal backstop. Faculty advisors are comment-only by default — they read and contribute commentary but do not hold the decide-button, which keeps the decision authority graph acyclic.

**Solution:** `services/authz.js#canDecideAppeal` returns true for `department_admin` unconditionally, true for `corporate_mentor` iff the exception carries any `internship_cohort` scope tag *and* the mentor's scopes intersect, and false for all other roles including `faculty_advisor`. `canStartReview` is broader — `department_admin` and any scoped `corporate_mentor`/`faculty_advisor` can start a review (generating a state transition on the appeal and exception). `appeal.override` is reserved for `department_admin` and records a separate `appeal.override` audit action with the override reason distinct from the regular rationale.

---

## 11. Computed Tags: Recompute Cadence, Stale Eligibility, and History

**Question:** The prompt specifies "scheduled recomputation every night at 2:00 AM" and rule-based tags such as "High-Risk Exceptions if 3 anomalies occur within 14 days." Two things are ambiguous: (a) if a user qualified three days ago but has had no new anomalies since, do they still carry the tag tonight, and (b) should the nightly job be able to *remove* a computed tag that a human previously assigned as a static tag?

**My Understanding:** Qualification is evaluated fresh each night against a rolling 14-day window, so users who fall out of the window lose the tag automatically — "High-Risk Exceptions" should not be a stuck state. Static tags (human-assigned) must never be removed by automation; the removal pass only affects tags whose `source === 'computed'`, so a manual override survives the nightly sweep.

**Solution:** `services/tagService.js#evaluateRule` for `exception_count_rolling` aggregates Exceptions within `cutoff = now - windowDays*24h`, selects users with `count >= minCount`, then calls `applyTag` for all eligible and `removeTag` *only* for currently-active tags with `source === 'computed'` that are no longer eligible. Every add/remove appends a `TagChangeHistory` entry with the `ruleVersionId`, `jobRunId`, and reason. The cron entry `0 2 * * *` in `jobs/scheduler.js` triggers `tagRecompute`; `/tags/recompute` exposes a manual trigger for `tag.rule.manage`. Rule edits create a new `TagRuleVersion` with an incremented `versionNumber` and mark the prior version `immutable`, preserving traceability.

---

## 12. Offline Queue: Idempotency, Backoff, and the Unhappy Path

**Question:** The prompt describes offline shipping orders and an on-device catalog, but a queued action replayed hours later might be sent twice (browser retry, service worker retry, manual refresh). What prevents duplicate writes, how long is a queued action allowed to survive, and what happens when a queued action has failed so many times that automation cannot resolve it?

**My Understanding:** Every queued mutation must carry a client-generated idempotency key with a 7-day server-side uniqueness window; matching-payload replays must short-circuit to the cached response. Backoff must be bounded (an ever-growing retry interval eventually gives up), and after a reasonable number of failures the entry must be frozen in a `manual_review_required` state rather than silently retried forever.

**Solution:** The React client uses `window.crypto.randomUUID()` keys and stores queued actions in IndexedDB (`store/offlineQueue.jsx`); replay walks the queue on the `online` event, sending `Idempotency-Key: <uuid>` with each retry. Server-side `middleware/idempotency.js` persists `IdempotencyRecord { key, payloadHash, responseStatus, responseBody, expiresAt }` with a 7-day window; mismatched-payload replays fail `409 IDEMPOTENCY_PAYLOAD_MISMATCH`, concurrent in-flight fail `409 IDEMPOTENCY_IN_FLIGHT`. Client backoff is `[30s, 2m, 10m, 30m, 2h]`; after `retryCount >= 10` the item moves to `status: 'manual_review_required'` and is surfaced in the header badge for operator intervention. The `idempotency_cleanup` job sweeps expired records hourly at `:45`.

---

## 13. Deposit Ledger: Signed Amounts, Negative Balances, and Corrections

**Question:** The prompt permits "partial refunds" on deposits, which means the ledger must record signed movements, but also implies a deposit balance can never legitimately go negative. What happens if an operator tries to refund more than the current balance, and how are genuine accounting corrections (for example, a mistakenly-entered deposit) reversed without rewriting history?

**My Understanding:** Entry types are distinguished by semantics — `deposit` adds, `partial_refund` / `full_refund` / `forfeit` subtract, `adjustment` can go either way, and `correction` is the only entry type permitted to make the running balance cross zero, and only then with an explicit pointer to the entry it corrects. Amounts are stored as integer cents (never floats) and encrypted at rest; audit entries never contain the amount.

**Solution:** `routes/deposits.js` normalizes `signed` — deposits are always positive, refunds/forfeits forced negative. Before insert it computes the new running balance and rejects with `422 VALIDATION_ERROR` when `newBal < 0` unless `entryType === 'correction'`; corrections additionally require `correctsEntryId`. Every entry's `amountCentsEnc` and `runningBalanceCentsEnc` are AES-256-GCM blobs; the GET endpoint returns `'********'` for amounts unless the caller holds `view_financial_sensitive`. The audit `diffSummary` deliberately contains only `{ entryType, contractId }` — never the monetary value.

---

## 14. Scope Visibility: What Happens When a Record Has No Scope Tags?

**Question:** Scoped reviewers (faculty advisors, corporate mentors) are supposed to see only records inside their scope. But a newly created record might carry zero scope tags, or an admin-created record might intentionally have no scope. Does a scoped reviewer see all zero-scope records, none of them, or is it a per-entity decision?

**My Understanding:** Default-broadening on empty scopes is a classic permissions-inversion bug: a careless admin creating an unscoped record effectively exposes it to every reviewer in the system. Policy must be deny-by-default — empty record scopes are invisible to scoped reviewers, and only `department_admin` / `security_admin` see unscoped data freely. Ownership (a student's own shoe, an appellant's own appeal) remains an independent grant.

**Solution:** `services/authz.js#canViewShoe` explicitly returns `false` when `recordScopes.length === 0` for `faculty_advisor`/`corporate_mentor`; admins bypass via `ALL_SEEING` and `operations_staff` retains internal-staff all-seeing behavior. `rbac.scopeMatches` enforces any-of intersection but rejects empty record scopes for scoped reviewers. List endpoints apply the same object-level policy as a post-filter after the DB query (defense in depth: a permissive base filter cannot leak records the object-level policy would reject). The KPI endpoint in `services/authz.js#kpiAccessMode` returns `'deny'` (not silently falling back to global) for scoped reviewers with no effective scope.

---

## 15. Audit Tamper Evidence: Hash Chain and Retention

**Question:** The prompt requires "append-only" audit logs with 7-year retention but does not describe tamper-evidence. Append-only as a database constraint is meaningless if an operator with database access can simply overwrite a row; integrity requires cryptographic chaining so a tampered-with entry is detectable by recomputing a hash. How is the chain built, and what happens to rows older than 7 years?

**My Understanding:** Each entry stores `prevHash` (the prior entry's `hash`) and `hash = sha256(prevHash || canonicalJSON(entry))`, genesis entry anchored to `"0" * 64`. A verification endpoint replays the chain and returns the first break. 7-year retention is enforced by *reporting* beyond-retention rows for operator review, not automatic deletion — the compliance value of older rows is higher than the storage savings, and automated purge risks mass deletion via misconfiguration.

**Solution:** `services/auditService.js#record` reads the latest audit row, computes `hash = sha256Hex(prevHash + canonicalize(payload))`, and writes the new entry with the prior hash embedded. `canonicalize` sorts keys and serializes deterministically so the chain is reproducible. `verifyChain` replays from genesis, returning `{ valid, checked, broken: { seq, expected, stored } | null }`. `POST /admin/audit/verify` exposes this to `security_admin` and records its own `audit.verify` entry so that the act of verification itself is auditable. The `auditRetentionReport` job runs daily at `04:00` and counts rows older than `now - 7 years`, writing the count to `JobRun.summary` — no rows are purged.

---

## 16. Idempotency Key Uniqueness Window

**Question:** Idempotency keys are intended to deduplicate retried requests, but a truly global uniqueness guarantee would require indefinite storage. What window is appropriate — long enough that realistic retry scenarios (offline queue, hung request, browser reload) dedupe correctly, but short enough that keys don't accumulate forever?

**My Understanding:** Seven days is the sweet spot: long enough to cover a weekend-outage offline queue replay, short enough to bound `IdempotencyRecord` table growth.

**Solution:** `middleware/idempotency.js` sets `WINDOW_MS = 7 * 24 * 3600 * 1000` and stores `expiresAt = now + WINDOW_MS` on each record. The `idempotency_cleanup` job deletes expired rows hourly at `:45`. Payload hashes use SHA-256 over JSON-serialized body so same-key, different-payload reuse is a hard error rather than a silent replay of the first response.

---

## 17. Seed Admin Credentials: Bootstrap Without a Chicken-and-Egg

**Question:** An offline deployment needs a first admin who can grant roles and assignments, but the system cannot ship with a well-known password that stays valid indefinitely — that is the classic root/root backdoor. What credentials seed the first admin, and how are operators forced off the default?

**My Understanding:** A seeded username/password pair is unavoidable, but it must carry a one-shot `mustChangePassword` flag that forces the user to pick a new password on first login. Documentation must make operators change it before the first production start.

**Solution:** `config/env.js` defaults `SEED_ADMIN_USERNAME = 'admin'` and `SEED_ADMIN_PASSWORD = 'ChangeMeNow!2026'`. The seeded User document carries `mustChangePassword: true`; the `/auth/me` response surfaces the flag, and client code gates access to routes behind a change-password prompt. `POST /auth/change-password` clears the flag on successful rotation and writes a `user.change_password` audit row. The operator runbook documents overriding both env vars before the first boot.

---

## 18. Intake Photos: When Zero Photos Is Acceptable

**Question:** The prompt mandates "up to 8 intake photos," but "up to" implies an upper bound, not a minimum. Operational reality is messier — a staff member may accept an item without a camera or with broken hardware. Is at least one photo required, and if not, what compensating control captures the why?

**My Understanding:** One photo should be the default minimum; zero is permitted only as an explicit admin-policy exception that requires a written reason, so the audit trail explains why the visual record is missing.

**Solution:** `POST /shoes/:id/complete-intake` counts existing `intake_photo` attachments and returns `422 VALIDATION_ERROR` when photo count is zero unless the body contains `zeroPhotoReason`. The reason is embedded in the `CustodyEvent.notes` as `"zero-photo intake: <reason>"` and on the completion audit entry. Photo uploads themselves enforce the ≤8 cap via `Attachment.countDocuments + req.files.length > 8` — the 8-file limit from `multer` is defense in depth, not the sole enforcement.

---

## 19. Secret Strength at Startup: Failing Loud vs Failing Silent

**Question:** Weak or default secrets in production are one of the most common breach patterns. What does the system do when `JWT_SECRET` or `ENCRYPTION_KEY_V1_HEX` is unset, a known-default placeholder, or below the entropy floor — fall back to a compiled-in default, generate an ephemeral random one, or refuse to start?

**My Understanding:** Production must refuse to start: a weak-secret fallback in production silently converts a deployment error into an indefinite security vulnerability. Development can fall back to an ephemeral random value so local dev works without requiring operators to configure secrets for a throwaway instance — but never to a predictable literal.

**Solution:** `config/env.js` maintains `KNOWN_WEAK_JWT_SECRETS` and `KNOWN_WEAK_ENC_KEYS_HEX` deny-lists, plus structural checks (JWT secret ≥32 chars with ≥2 character classes, encryption key exactly 64 hex chars excluding single-byte-repeat patterns). `resolveJwtSecret` and `resolveEncryptionKeys` throw in production when any required secret is missing/weak; in test mode they substitute `crypto.randomBytes()` ephemeral values. Dev mode prints a warning and also uses an ephemeral random — never a compiled-in placeholder.

---

## 20. Data Masking in Saved Addresses: 404 vs 403

**Question:** Saved delivery addresses are sensitive and contain full line1/2/city/state/zip. Non-owners trying to read another user's address should of course fail — but should the failure return 403 (you exist but are not authorized) or 404 (no such address)? The former confirms that the ID exists and can be enumerated against brute-force guesses; the latter is indistinguishable from a mistyped ID.

**My Understanding:** 404 is the right answer for address reads — return `NOT_FOUND` for both nonexistent addresses and unauthorized reads of existing ones, so existence itself is not disclosed. Owners and specifically-authorized roles (ops for shipping, admin for everything) get the full record.

**Solution:** `routes/addresses.js#canReadAddress` returns true only for the owner or `department_admin`/`security_admin`/`operations_staff`. When it returns false, the route emits `fail(res, 'NOT_FOUND', 'Address not found', null, 404)` — identical to the response for a truly missing ID. The list endpoint returns only the caller's own addresses decrypted; unknown dimensions of the masked preview (`"***, ***, <state> <zip5>"`) are deliberately lossy so they can be shown in UI lists without full decryption.

---

## 21. Billing Event Corrections and Rule Version Immutability

**Question:** Billing disputes are inevitable. A tiered rent calculation might be based on an incorrect basis, or a revenue-share number might need re-filing after the tenant's true-up. How are corrections applied without destroying the original record, and how is a rule version protected from retroactive modification after events have been posted against it?

**My Understanding:** Corrections must be new events with an `eventType: 'correction'` and a pointer to the event they correct; the original never changes. A `BillingRuleVersion` becomes immutable the first time a `BillingEvent` is posted against it — subsequent rule edits create a new version with an incremented number and an `effectiveFrom` so history is reconstructible.

**Solution:** `POST /billing/contracts/:contractId/events/:eventId/correct` (capability `billing.override`) creates a new `BillingEvent` with `eventType: 'correction'`, `correctsEventId: <orig>`, and the corrected amount; the original row is untouched. `POST /billing/contracts/:contractId/events` sets `rule.immutable = true` on the rule version the first time an event references it. `POST /billing/contracts/:contractId/rules` creates a new version with `versionNumber = last.versionNumber + 1`, marks the prior version `immutable`, and points `contract.currentBillingRuleVersionId` at the new one. The compute engine in `services/billingService.js` validates tier ranges as contiguous and non-overlapping before accepting a new tiered rule.
