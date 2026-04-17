const { Schema, model } = require('mongoose');

const AppealDecisionSchema = new Schema({
  appealId: { type: Schema.Types.ObjectId, ref: 'Appeal', required: true, index: true },
  versionNumber: { type: Number, required: true },
  outcome: { type: String, enum: ['approved','denied','remanded'], required: true },
  rationale: { type: String, required: true },
  reviewerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewerUsername: String,
  decidedAt: { type: Date, default: Date.now },
  supersededBy: { type: Schema.Types.ObjectId, ref: 'AppealDecision' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

AppealDecisionSchema.index({ appealId: 1, versionNumber: 1 }, { unique: true });

module.exports = model('AppealDecision', AppealDecisionSchema);
