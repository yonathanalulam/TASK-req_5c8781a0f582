const { Schema, model } = require('mongoose');

const JobRunSchema = new Schema({
  jobName: { type: String, required: true, index: true },
  state: { type: String, enum: ['pending','running','stalled','succeeded','failed','partial_success','cancelled','dead_letter'], default: 'pending', index: true },
  attempt: { type: Number, default: 1 },
  startedAt: Date,
  endedAt: Date,
  lastHeartbeatAt: Date,
  error: String,
  summary: Schema.Types.Mixed,
  maxAttempts: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('JobRun', JobRunSchema);
