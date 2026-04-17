const { Schema, model } = require('mongoose');

const CONTRACT_STATES = ['draft','active','amended','pending_renewal','renewed','terminated','reconciliation_pending','reconciliation_overdue','expired','closed','voided'];

const LeaseContractSchema = new Schema({
  contractNumber: { type: String, required: true, unique: true },
  facilityUnit: { type: String, required: true, index: true },
  lessorName: { type: String, required: true },
  lesseeName: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: CONTRACT_STATES, default: 'draft', index: true },
  currentVersionId: { type: Schema.Types.ObjectId, ref: 'LeaseContractVersion' },
  currentBillingRuleVersionId: { type: Schema.Types.ObjectId, ref: 'BillingRuleVersion' },
  // encrypted deposit total (amount stored as integer cents via ledger; encrypted string value here is optional summary)
  depositBalanceEnc: { v: Number, iv: String, ct: String, tag: String },
  terminationEffectiveDate: Date,
  reconciliationDueAt: Date,
  version: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

LeaseContractSchema.index({ facilityUnit: 1, startDate: 1, endDate: 1 });
LeaseContractSchema.index({ endDate: 1 });

module.exports = model('LeaseContract', LeaseContractSchema);
module.exports.CONTRACT_STATES = CONTRACT_STATES;
