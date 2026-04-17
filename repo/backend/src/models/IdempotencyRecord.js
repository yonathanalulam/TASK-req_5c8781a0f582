const { Schema, model } = require('mongoose');

const IdempotencyRecordSchema = new Schema({
  key: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  route: { type: String },
  payloadHash: { type: String },
  responseStatus: Number,
  responseBody: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: true },
}, { versionKey: false });

// Retain >=7 days per PRD; cleanup job removes beyond window.
module.exports = model('IdempotencyRecord', IdempotencyRecordSchema);
