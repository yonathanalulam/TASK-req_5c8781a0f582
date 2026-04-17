const { Schema, model } = require('mongoose');

const ServiceCategorySchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 100 },
}, { versionKey: false });

module.exports = model('ServiceCategory', ServiceCategorySchema);
