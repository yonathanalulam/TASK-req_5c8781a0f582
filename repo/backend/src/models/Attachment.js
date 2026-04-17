const { Schema, model } = require('mongoose');

const AttachmentSchema = new Schema({
  opaqueId: { type: String, required: true, unique: true },
  ownerType: { type: String, required: true, index: true }, // 'shoe_intake', 'appeal', 'proof_of_delivery', etc.
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  uploaderUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  originalFilename: { type: String },
  contentType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  sha256: { type: String, required: true, index: true },
  storagePath: { type: String, required: true }, // never exposed to clients
  context: { type: String }, // 'intake_photo', 'pod_signature', 'appeal_evidence'
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  verifiedStatus: { type: String, enum: ['ok','corrupt','missing','unverified'], default: 'unverified' },
}, { versionKey: false });

AttachmentSchema.index({ ownerType: 1, ownerId: 1 });

module.exports = model('Attachment', AttachmentSchema);
