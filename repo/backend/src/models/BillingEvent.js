const { Schema, model } = require('mongoose');

const BillingEventSchema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: 'LeaseContract', required: true, index: true },
  billingRuleVersionId: { type: Schema.Types.ObjectId, ref: 'BillingRuleVersion', required: true },
  eventType: { type: String, enum: ['monthly_bill','true_up','correction','deposit_adjustment','manual_override'], required: true },
  periodStart: Date,
  periodEnd: Date,
  amountCents: { type: Number, required: true }, // can be negative for corrections/credits
  basisCents: Number, // gross revenue basis for revenue_share
  inputs: Schema.Types.Mixed,
  correctsEventId: { type: Schema.Types.ObjectId, ref: 'BillingEvent' },
  reason: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

BillingEventSchema.index({ contractId: 1, periodStart: 1 });

module.exports = model('BillingEvent', BillingEventSchema);
