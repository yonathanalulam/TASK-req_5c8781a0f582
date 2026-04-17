# Security Model

## Authentication
- Local accounts only (no OAuth / OIDC / social / email).
- Passwords: **Argon2id** is the production algorithm (via the `argon2` native addon). If the native addon is not loadable at runtime (e.g., a stripped CI sandbox), the code transparently falls back to Node's built-in **scrypt** (N=16384, r=8, p=1) with a 16-byte random salt. Production deployments MUST ensure the `argon2` native build is present — there is no bcrypt path.
- Password minimum 12 characters; stored salted + hashed.
- Security-question answer hashed same way; never retrievable in plaintext.

## Sessions
- Bearer JWT with signed sessionId.
- Server-side `sessions` record is authoritative for state (`active` / `idle_expired` / `revoked` / `logged_out` / `absolute_expired`).
- Idle timeout 30 min sliding; absolute expiry 24 h.
- Forced logout revokes all active sessions for the target user immediately.

## Encryption at rest
- AES-256-GCM per field with random 96-bit IV and 128-bit tag.
- Key version stored per record (`v`) to support rotation.
- Encrypted fields: address lines/city/state/postal; deposit amounts and running balances (stored ONLY encrypted — no plaintext shadow columns); reconciliation final balances.

## Attachments
- Allowlist: JPEG, PNG (magic-byte + MIME verified).
- Max 5 MB per file, max 8 photos per intake.
- SHA-256 fingerprint stored and verified by integrity job.
- File path is not user-controlled (opaque UUID + sha-prefixed subdir).

## Audit
- Append-only log; each entry hash-chained to the previous (`prev_hash + canonical(entry) → sha256`).
- Verification tool: `POST /api/v1/admin/audit/verify`.
- Retention: 7 years (enforced by policy; nothing auto-purges).
- Logged security events include: login success/failure, reset success/failure, session revocation, export requests, forced logout, admin overrides, sensitive attachment reads.

## Masking / unmasking
- Addresses: unmasked only to owner or `department_admin` / `security_admin` / `operations_staff` (need-to-know).
- Deposits / reconciliation balances: unmasked only with `view_financial_sensitive` capability.
- Exports default to masked; unmasked exports require the **`unmask_export` capability** (granted to `department_admin` / `security_admin`) AND explicit `unmask: true` in the request body. Attempts to unmask without the capability silently produce a masked export; the request is still recorded in `export_jobs` with `unmasked=false`.

## Threat model excerpts
- **Insider data tampering** — mitigated by append-only audit chain + attachment SHA-256 + deposit ledger append-only.
- **Credential stuffing** — mitigated by account lockout (5 fails / 15 min → 15-min lock).
- **Answer guessing** — mitigated by 5 fails / 30 min → 30-min reset-flow lock.
- **Stolen session** — mitigated by forced-logout endpoint + 24h absolute expiry.
- **Lost key** — mitigated by documented key backup + rotation process.
