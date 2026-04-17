# Operator Runbook

## Forced logout / compromised session response
- Required capability: `force_logout` (roles: `security_admin`, optionally `department_admin`)
- API: `POST /api/v1/admin/sessions/force-logout` with JSON:
  ```json
  { "userId": "<id>", "reason": "phishing incident #123", "sessionId": "<optional>" }
  ```
- All active sessions for that user are revoked server-side immediately.
- Audit entry `session.force_logout` recorded with reason.

## Failed / stalled jobs
- List jobs: `GET /api/v1/jobs/runs?state=failed|stalled|dead_letter`
- Retry failed job by kicking off a new run: `POST /api/v1/jobs/run/<job_name>`
- Stalled jobs auto-detected every 5 min (`stalled_sweep`); threshold 15 min without heartbeat.
- Dead-letter jobs require operator review; do not auto-retry.

## Reconciliation overdue handling
- Reconciliations pending past `dueAt` are flagged `overdue` by the hourly job.
- Dashboard KPI shows overdue count. Manually complete via:
  `POST /api/v1/deposits/contracts/<contractId>/reconciliation/complete` with `{ notes }`.
- Overdue transitions from `reconciliation_overdue` require admin review and an audit reason.

## Export review
- Admins list: `GET /api/v1/exports`
- Every download adds to the `accessLog` of that export.
- Unmasked exports require `view_financial_sensitive` + `unmask_export` capabilities.
- Export files live under `backend/storage/exports/`; their checksum is in the job record.

## Audit verification
- `POST /api/v1/admin/audit/verify` (cap `audit.verify`): walks the chain and reports any tampered entry.
- A verification failure itself is logged as `audit.verify` with `outcome: failure` — rerun after every recovery.

## Key rotation
- See `docs/key_rotation.md`.

## Locked account unlock
- `POST /api/v1/admin/users/<id>/unlock` with `{ reason }` — clears login and reset throttles.
