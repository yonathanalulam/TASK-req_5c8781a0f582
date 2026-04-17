# Encryption Key Rotation

Steps to rotate AES-256-GCM data-encryption keys (addresses, deposits, etc.):

1. **Generate a new 32-byte key** and append to `.env`:
   ```
   ENCRYPTION_KEY_V2_HEX=<64 hex chars>
   ```
2. **Bump `CURRENT_KEY_VERSION`** to 2.
3. **Restart API** — new writes/re-encryptions target v2.
4. **Re-encrypt existing records** with the rotation utility:
   ```
   cd backend
   node src/jobs/keyRotation.js
   ```
   Progress logs the per-collection counts; an audit entry `key.rotate` is written at the end.
5. **Do NOT remove old key entries** from `.env` until the job has re-encrypted all records AND backups using the old key are beyond retention. The decrypt path looks up by version, so old ciphertext will keep working as long as its key remains available.
6. Verify:
   - `POST /api/v1/jobs/run/attachment_integrity`
   - Spot-check a `SavedAddress` decrypt through the UI/API.

## Failure recovery
- If the rotation job fails mid-way, re-run it — it is idempotent by key-version check.
- If a key was lost (never back up ENTs without keys): data under that version is unrecoverable. Restore from a matching backup.
