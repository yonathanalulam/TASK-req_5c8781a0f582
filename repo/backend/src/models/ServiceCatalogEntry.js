const { Schema, model } = require('mongoose');

const ServiceCatalogEntrySchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true, index: 'text' },
  description: { type: String, default: '' },
  categoryCode: { type: String, index: true },
  tags: [{ type: String, index: true }],
  priceCents: { type: Number, default: 0 },
  estimatedDurationMinutes: { type: Number, default: 0 },
  active: { type: Boolean, default: true, index: true },
  displayOrder: { type: Number, default: 100 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

ServiceCatalogEntrySchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = model('ServiceCatalogEntry', ServiceCatalogEntrySchema);
