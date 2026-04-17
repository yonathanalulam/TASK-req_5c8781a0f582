const { Schema, model } = require('mongoose');

const EXCEPTION_STATES = ['open','under_review','appealed','appeal_under_review','appeal_approved','appeal_denied','appeal_remanded','resolved','dismissed'];

const ExceptionSchema = new Schema({
  exceptionType: { type: String, enum: ['missed_check_in','misidentification','suspected_buddy_punching','delivery_failure','other'], required: true, index: true },
  subjectUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // impacted user
  shoeProfileId: { type: Schema.Types.ObjectId, ref: 'ShoeProfile' },
  shippingOrderId: { type: Schema.Types.ObjectId, ref: 'ShippingOrder' },
  custodyEventId: { type: Schema.Types.ObjectId, ref: 'CustodyEvent' },
  scopes: [{ dimension: String, value: String }],
  status: { type: String, enum: EXCEPTION_STATES, default: 'open', index: true },
  summary: { type: String, required: true },
  details: String,
  openedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

ExceptionSchema.index({ subjectUserId: 1, createdAt: 1 });

module.exports = model('Exception', ExceptionSchema);
module.exports.EXCEPTION_STATES = EXCEPTION_STATES;
