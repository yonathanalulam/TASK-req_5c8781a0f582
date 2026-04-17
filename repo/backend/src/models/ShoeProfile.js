const { Schema, model } = require('mongoose');

const SHOE_STATES = [
  'intake_draft','intake_completed','in_service_queue','in_service','quality_check',
  'ready_for_delivery','rework_required','shipping_prepared','in_transit',
  'delivery_exception','picked_up','delivered','returned_to_office',
  'exception_hold','closed','cancelled','closed_exception',
];

const ShoeProfileSchema = new Schema({
  serial: { type: String, required: true },
  barcode: { type: String, required: true },
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  intakeStaffUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  brand: { type: String, required: true, maxlength: 100 },
  material: { type: String, maxlength: 100 },
  color: { type: String, maxlength: 100 },
  size: { type: String, required: true },
  defectNotes: { type: String, maxlength: 4000 },
  status: { type: String, enum: SHOE_STATES, default: 'intake_draft', index: true },
  previousStatus: { type: String, enum: SHOE_STATES },
  intakeCompletedAt: Date,
  intakeStartedAt: { type: Date, default: Date.now },
  completedAt: Date,
  scopes: [{ dimension: String, value: String }],
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  exceptionHoldFrom: { type: String }, // prior state before exception_hold
}, { versionKey: false });

ShoeProfileSchema.index({ serial: 1 }, { unique: true });
ShoeProfileSchema.index({ barcode: 1 }, { unique: true });
ShoeProfileSchema.index({ ownerUserId: 1 });

module.exports = model('ShoeProfile', ShoeProfileSchema);
module.exports.SHOE_STATES = SHOE_STATES;
