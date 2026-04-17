const { Schema, model } = require('mongoose');

const MemberTagSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tagCode: { type: String, required: true, index: true },
  source: { type: String, enum: ['static','computed'], required: true },
  ruleVersionId: { type: Schema.Types.ObjectId, ref: 'TagRuleVersion' },
  assignedAt: { type: Date, default: Date.now },
  removedAt: { type: Date },
  active: { type: Boolean, default: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { versionKey: false });

MemberTagSchema.index({ userId: 1, tagCode: 1, active: 1 });

module.exports = model('MemberTag', MemberTagSchema);
