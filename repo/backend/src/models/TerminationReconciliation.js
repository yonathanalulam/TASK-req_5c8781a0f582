const { Schema, model } = require('mongoose');

const TerminationReconciliationSchema = new Schema({
  contractId: { type: Schema.Types.ObjectId, ref: 'LeaseContract', required: true, index: true, unique: true },
  terminationEffectiveDate: { type: Date, required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['pending','completed','overdue'], default: 'pending', index: true },
  finalBalanceCents: Number,
  finalBalanceCentsEnc: { v: Number, iv: String, ct: String, tag: String },
  completedAt: Date,
  completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('TerminationReconciliation', TerminationReconciliationSchema);
