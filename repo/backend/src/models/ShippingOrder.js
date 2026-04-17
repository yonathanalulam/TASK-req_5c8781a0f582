const { Schema, model } = require('mongoose');

const SHIPPING_STATES = [
  'draft','queued_offline','sync_failed','ready_to_ship','in_transit',
  'delivery_failed','exception_pending_signoff','returned','delivered',
  'closed_exception','cancelled','closed',
];

const ShippingOrderSchema = new Schema({
  shoeProfileId: { type: Schema.Types.ObjectId, ref: 'ShoeProfile', required: true, index: true },
  addressId: { type: Schema.Types.ObjectId, ref: 'SavedAddress', required: true },
  fulfillmentOperator: { type: String, required: true }, // staff/user handle
  method: { type: String, enum: ['pickup','standard','expedited'], default: 'standard' },
  status: { type: String, enum: SHIPPING_STATES, default: 'draft', index: true },
  offlineCreatedAt: Date,
  syncedAt: Date,
  exceptionNote: String,
  version: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = model('ShippingOrder', ShippingOrderSchema);
module.exports.SHIPPING_STATES = SHIPPING_STATES;
