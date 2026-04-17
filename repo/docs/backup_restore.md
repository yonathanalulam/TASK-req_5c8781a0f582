# Backup and Restore

Three items must be backed up together for a consistent restore:

1. **MongoDB database** (`offline_ops_portal`)
2. **Local attachment directory** (default `backend/storage/attachments`)
3. **Encryption keys** (`ENCRYPTION_KEY_V*_HEX` in `backend/.env`)

## Nightly backup script (example, bash)
```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
DEST=/var/backups/oop/$STAMP
mkdir -p $DEST
mongodump --db offline_ops_portal --out $DEST/mongo
tar czf $DEST/attachments.tgz -C backend/storage attachments
cp backend/.env $DEST/.env.secret.copy
chmod 600 $DEST/.env.secret.copy
```

Rotate old backups (retain at minimum 7-years of audit-log-eligible backups).

## Restore
```bash
mongorestore --db offline_ops_portal --drop /var/backups/oop/<STAMP>/mongo/offline_ops_portal
tar xzf /var/backups/oop/<STAMP>/attachments.tgz -C backend/storage
cp /var/backups/oop/<STAMP>/.env.secret.copy backend/.env
```

Verify integrity after restore:
```bash
# In API:
POST /api/v1/admin/audit/verify   (security_admin)
POST /api/v1/jobs/run/attachment_integrity  (admin)
```

## Encryption key handling
- Keys are kept OUT of source control in `backend/.env`.
- Each encrypted record stores `v` (key version). Restores must ship the matching keys.
- When rotating, see `docs/key_rotation.md`.
