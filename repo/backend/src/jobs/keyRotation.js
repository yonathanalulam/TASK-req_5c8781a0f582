// Key rotation utility. Re-encrypts encrypted fields (addresses, deposits) under the current key version.
// Run via: node src/jobs/keyRotation.js
const { connect, disconnect } = require('../config/db');
const SavedAddress = require('../models/SavedAddress');
const DepositLedgerEntry = require('../models/DepositLedgerEntry');
const TerminationReconciliation = require('../models/TerminationReconciliation');
const audit = require('../services/auditService');
const { encryptField, decryptField } = require('../utils/crypto');
const env = require('../config/env');

async function reencryptAddress(a) {
  let changed = false;
  for (const f of ['line1Enc','line2Enc','cityEnc','stateEnc','postalCodeEnc']) {
    if (a[f] && a[f].v !== env.currentKeyVersion) {
      const pt = decryptField(a[f]);
      if (pt != null) a[f] = encryptField(pt);
      changed = true;
    }
  }
  if (changed) await a.save();
  return changed;
}

async function reencryptLedger(e) {
  let changed = false;
  for (const f of ['amountCentsEnc','runningBalanceCentsEnc']) {
    if (e[f] && e[f].v !== env.currentKeyVersion) {
      const pt = decryptField(e[f]);
      if (pt != null) e[f] = encryptField(pt);
      changed = true;
    }
  }
  if (changed) await e.save();
  return changed;
}

async function run() {
  await connect();
  const stats = { addresses: 0, ledger: 0, reconciliations: 0 };
  for await (const a of SavedAddress.find({})) if (await reencryptAddress(a)) stats.addresses++;
  for await (const e of DepositLedgerEntry.find({})) if (await reencryptLedger(e)) stats.ledger++;
  for await (const r of TerminationReconciliation.find({})) {
    if (r.finalBalanceCentsEnc && r.finalBalanceCentsEnc.v !== env.currentKeyVersion) {
      const pt = decryptField(r.finalBalanceCentsEnc);
      if (pt != null) { r.finalBalanceCentsEnc = encryptField(pt); await r.save(); stats.reconciliations++; }
    }
  }
  await audit.record({ action: 'key.rotate', actorUsername: 'job_runner', diffSummary: stats });
  console.log('[key-rotation] stats:', stats);
  await disconnect();
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

module.exports = { run };
