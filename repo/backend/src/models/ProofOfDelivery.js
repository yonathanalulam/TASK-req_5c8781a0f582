const { Schema, model } = require('mongoose');

const ProofOfDeliverySchema = new Schema({
  shippingOrderId: { type: Schema.Types.ObjectId, ref: 'ShippingOrder', required: true, unique: true },
  signatureAttachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment' },
  deliveredAt: { type: Date, required: true },
  recipientName: String,
  operatorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  operatorUsername: String,
  notes: String,
  overrideApprovalBy: { type: Schema.Types.ObjectId, ref: 'User' },
  overrideReason: String,
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('ProofOfDelivery', ProofOfDeliverySchema);
