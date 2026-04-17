const { Schema, model } = require('mongoose');

// Rule types: fixed, tiered, revenue_share
const BillingRuleVersionSchema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: 'LeaseContract', required: true, index: true },
  versionNumber: { type: Number, required: true },
  ruleType: { type: String, enum: ['fixed','tiered','revenue_share'], required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date }, // null = open-ended
  // Fixed rent
  fixedAmountCents: Number,
  dueDayOfMonth: { type: Number, default: 1 },
  shiftDueDatesToNextBusinessDay: { type: Boolean, default: false },
  // Tiered
  tiers: [{ minBasisCents: Number, maxBasisCents: Number, amountCents: Number }],
  // Revenue share
  revenueShareRate: Number,
  provisionalAmountCents: Number,
  allowNegativeTrueUpAsCredit: { type: Boolean, default: false },
  immutable: { type: Boolean, default: false }, // becomes true after first posted billing event
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

BillingRuleVersionSchema.index({ contractId: 1, versionNumber: 1 }, { unique: true });

module.exports = model('BillingRuleVersion', BillingRuleVersionSchema);
