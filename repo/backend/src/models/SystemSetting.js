const { Schema, model } = require('mongoose');

const SystemSettingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { versionKey: false });

module.exports = model('SystemSetting', SystemSettingSchema);
