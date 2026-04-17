const { Schema, model } = require('mongoose');

const LeaseContractVersionSchema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: 'LeaseContract', required: true, index: true },
  versionNumber: { type: Number, required: true },
  changeType: { type: String, enum: ['create','renew','amend','terminate','void'], required: true },
  effectiveDate: { type: Date, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true }, // full contract state at the time
  reason: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

LeaseContractVersionSchema.index({ contractId: 1, versionNumber: 1 }, { unique: true });

module.exports = model('LeaseContractVersion', LeaseContractVersionSchema);
