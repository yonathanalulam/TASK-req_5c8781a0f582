const { Schema, model } = require('mongoose');

const AuditLogSchema = new Schema({
  seq: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  actorUsername: { type: String },
  action: { type: String, required: true, index: true },
  entityType: { type: String, index: true },
  entityId: { type: String, index: true },
  outcome: { type: String, enum: ['success', 'failure', 'blocked'], default: 'success' },
  reason: String,
  ip: String,
  deviceDescriptor: String,
  diffSummary: Schema.Types.Mixed,
  prevHash: { type: String, required: true },
  hash: { type: String, required: true, index: true },
}, { versionKey: false, capped: false });

AuditLogSchema.index({ seq: 1 }, { unique: true });

module.exports = model('AuditLog', AuditLogSchema);
