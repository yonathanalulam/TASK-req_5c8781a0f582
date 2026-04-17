const { Schema, model } = require('mongoose');

const ImportJobSchema = new Schema({
  jobType: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending','processing','completed','failed','partial'], default: 'pending', index: true },
  filename: String,
  totalRows: Number,
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  errors: [{ row: Number, field: String, issue: String, message: String, raw: Schema.Types.Mixed }],
  mode: { type: String, enum: ['strict','tolerant'], default: 'strict' }, // strict rejects unknown columns
  initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  startedAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false, suppressReservedKeysWarning: true });

module.exports = model('ImportJob', ImportJobSchema);
