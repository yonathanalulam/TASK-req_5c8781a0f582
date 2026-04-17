const { Schema, model } = require('mongoose');

const DeliveryExceptionSchema = new Schema({
  shippingOrderId: { type: Schema.Types.ObjectId, ref: 'ShippingOrder', required: true, index: true },
  reasonCode: { type: String, required: true },
  attemptedAt: { type: Date, default: Date.now },
  remediationSteps: String,
  signedOffBy: { type: Schema.Types.ObjectId, ref: 'User' },
  signedOffAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('DeliveryException', DeliveryExceptionSchema);
