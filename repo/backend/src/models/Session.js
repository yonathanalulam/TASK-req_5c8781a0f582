const { Schema, model } = require('mongoose');

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenId: { type: String, required: true },
  deviceDescriptor: { type: String },
  ip: { type: String },
  state: { type: String, enum: ['active','idle_expired','revoked','logged_out','absolute_expired'], default: 'active', index: true },
  createdAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  absoluteExpiresAt: { type: Date, required: true },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  revokedReason: String,
}, { versionKey: false });

SessionSchema.index({ tokenId: 1 }, { unique: true });
SessionSchema.index({ userId: 1, state: 1 });

module.exports = model('Session', SessionSchema);
