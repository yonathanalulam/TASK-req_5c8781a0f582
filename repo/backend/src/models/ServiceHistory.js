const { Schema, model } = require('mongoose');

const ServiceHistorySchema = new Schema({
  shoeProfileId: { type: Schema.Types.ObjectId, ref: 'ShoeProfile', required: true, index: true },
  barcode: String,
  serial: String,
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  summary: String,
  serviceCodes: [String],
  outcome: String,
  intakeCompletedAt: Date,
  completedAt: Date,
  totalDurationMs: Number,
}, { versionKey: false });

module.exports = model('ServiceHistory', ServiceHistorySchema);
