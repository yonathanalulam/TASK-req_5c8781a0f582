const { Schema, model } = require('mongoose');

const ServiceRequestSchema = new Schema({
  requesterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  onBehalfOfUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  shoeProfileId: { type: Schema.Types.ObjectId, ref: 'ShoeProfile', index: true },
  serviceCodes: [{ type: String }],
  status: { type: String, enum: ['draft','submitted','accepted','completed','cancelled'], default: 'submitted', index: true },
  notes: String,
  scopes: [{ dimension: String, value: String }],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
}, { versionKey: false });

module.exports = model('ServiceRequest', ServiceRequestSchema);
