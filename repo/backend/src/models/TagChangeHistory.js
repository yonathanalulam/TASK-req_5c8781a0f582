const { Schema, model } = require('mongoose');

const TagChangeHistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tagCode: { type: String, required: true, index: true },
  action: { type: String, enum: ['add','remove'], required: true },
  source: { type: String, enum: ['static','computed','import'], required: true },
  ruleVersionId: { type: Schema.Types.ObjectId, ref: 'TagRuleVersion' },
  triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  jobRunId: String,
  reason: String,
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

module.exports = model('TagChangeHistory', TagChangeHistorySchema);
