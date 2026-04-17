const { Schema, model } = require('mongoose');

const ServiceTagSchema = new Schema({
  code: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { versionKey: false });

module.exports = model('ServiceTag', ServiceTagSchema);
