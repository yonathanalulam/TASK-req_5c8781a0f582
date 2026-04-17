const { Schema, model } = require('mongoose');

const SecurityQuestionSchema = new Schema({
  text: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('SecurityQuestion', SecurityQuestionSchema);
