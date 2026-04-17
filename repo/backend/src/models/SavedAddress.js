const { Schema, model } = require('mongoose');

const SavedAddressSchema = new Schema({
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, required: true }, // e.g. "Home", "Campus Mailroom"
  country: { type: String, default: 'US' },
  // encrypted fields (serialized blob)
  line1Enc: { v: Number, iv: String, ct: String, tag: String },
  line2Enc: { v: Number, iv: String, ct: String, tag: String },
  cityEnc: { v: Number, iv: String, ct: String, tag: String },
  stateEnc: { v: Number, iv: String, ct: String, tag: String },
  postalCodeEnc: { v: Number, iv: String, ct: String, tag: String },
  maskedPreview: String, // e.g. "***, ***, ZZ 12345" for list UIs
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('SavedAddress', SavedAddressSchema);
