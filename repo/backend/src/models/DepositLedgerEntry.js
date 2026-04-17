const { Schema, model } = require('mongoose');

// Deposit amounts are sensitive: persisted ONLY as encrypted blobs (AES-256-GCM).
// No plaintext `amountCentsSigned` or `runningBalanceCents` fields are stored.
// Balance math derives from the most recent entry by decrypting its runningBalanceCentsEnc.
const DepositLedgerEntrySchema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: 'LeaseContract', required: true, index: true },
  entryType: { type: String, enum: ['deposit','partial_refund','full_refund','forfeit','correction','adjustment'], required: true },
  amountCentsEnc: { v: Number, iv: String, ct: String, tag: String },
  runningBalanceCentsEnc: { v: Number, iv: String, ct: String, tag: String },
  reason: String,
  linkedReconciliationId: { type: Schema.Types.ObjectId, ref: 'TerminationReconciliation' },
  correctsEntryId: { type: Schema.Types.ObjectId, ref: 'DepositLedgerEntry' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

DepositLedgerEntrySchema.index({ contractId: 1, createdAt: 1 });

module.exports = model('DepositLedgerEntry', DepositLedgerEntrySchema);
