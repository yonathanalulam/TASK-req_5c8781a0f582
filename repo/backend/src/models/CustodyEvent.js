const { Schema, model } = require('mongoose');

const EVENT_TYPES = [
  'intake_scan','handoff','service_start','service_complete','quality_check',
  'rework_assigned','ready_for_delivery','shipping_prepared','in_transit',
  'delivered','delivery_exception','picked_up','returned_to_office',
  'exception_hold_applied','exception_hold_cleared','correction',
  'cancelled','closed',
];

const CustodyEventSchema = new Schema({
  shoeProfileId: { type: Schema.Types.ObjectId, ref: 'ShoeProfile', required: true, index: true },
  barcode: { type: String, required: true, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorUsername: String,
  timestamp: { type: Date, default: Date.now, index: true },
  eventType: { type: String, enum: EVENT_TYPES, required: true, index: true },
  fromState: String,
  toState: String,
  station: String,
  location: String,
  scanOutcome: { type: String, enum: ['success','rejected','duplicate_suppressed','manual_entry'], default: 'success' },
  manualEntry: { type: Boolean, default: false },
  idempotencyKey: { type: String, index: true },
  notes: String,
  correctsEventId: { type: Schema.Types.ObjectId, ref: 'CustodyEvent' },
}, { versionKey: false });

// append-only: no updates via API

CustodyEventSchema.index({ shoeProfileId: 1, timestamp: 1 });
CustodyEventSchema.index({ barcode: 1, timestamp: 1 });

module.exports = model('CustodyEvent', CustodyEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
