const { Schema, model } = require('mongoose');

const RoleSchema = new Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  capabilities: [{ type: String }],
  description: String,
  isSystem: { type: Boolean, default: false },
}, { versionKey: false });

RoleSchema.index({ code: 1 }, { unique: true });

module.exports = model('Role', RoleSchema);
