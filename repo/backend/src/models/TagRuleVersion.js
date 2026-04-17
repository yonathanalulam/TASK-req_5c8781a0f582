const { Schema, model } = require('mongoose');

// Rule definition: { type: 'high_risk_exceptions', windowDays: 14, minCount: 3 } etc.
const TagRuleVersionSchema = new Schema({
  tagCode: { type: String, required: true, index: true },
  versionNumber: { type: Number, required: true },
  active: { type: Boolean, default: true },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo: Date,
  ruleType: { type: String, required: true }, // e.g. 'exception_count_rolling'
  params: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  immutable: { type: Boolean, default: false },
}, { versionKey: false });

TagRuleVersionSchema.index({ tagCode: 1, versionNumber: 1 }, { unique: true });

module.exports = model('TagRuleVersion', TagRuleVersionSchema);
