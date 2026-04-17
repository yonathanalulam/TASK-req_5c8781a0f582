const { Schema, model } = require('mongoose');

const APPEAL_STATES = ['draft','submitted','under_review','approved','denied','remanded','resubmitted','withdrawn'];

const AppealSchema = new Schema({
  exceptionId: { type: Schema.Types.ObjectId, ref: 'Exception', required: true, index: true },
  appellantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: APPEAL_STATES, default: 'draft', index: true },
  rationale: String,
  evidenceAttachmentIds: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
  currentDecisionId: { type: Schema.Types.ObjectId, ref: 'AppealDecision' },
  scopes: [{ dimension: String, value: String }],
  submittedAt: Date,
  closedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('Appeal', AppealSchema);
module.exports.APPEAL_STATES = APPEAL_STATES;
