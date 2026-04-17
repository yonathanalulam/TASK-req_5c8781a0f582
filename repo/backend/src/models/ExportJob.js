const { Schema, model } = require('mongoose');

const ExportJobSchema = new Schema({
  jobType: { type: String, required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedByUsername: String,
  scope: Schema.Types.Mixed,
  filePath: String,
  filename: String,
  checksum: String,
  sizeBytes: Number,
  recordCount: Number,
  generatedAt: Date,
  unmasked: { type: Boolean, default: false },
  status: { type: String, enum: ['pending','completed','failed'], default: 'pending', index: true },
  error: String,
  expiresAt: Date,
  accessLog: [{ accessedAt: Date, byUserId: { type: Schema.Types.ObjectId, ref: 'User' } }],
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('ExportJob', ExportJobSchema);
