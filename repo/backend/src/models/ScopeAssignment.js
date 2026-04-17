const { Schema, model } = require('mongoose');

// dimensions: school, major, class, internship_cohort
// value "*" represents global scope for that dimension (admin).
const ScopeAssignmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dimension: { type: String, enum: ['school', 'major', 'class', 'internship_cohort', 'global'], required: true },
  value: { type: String, required: true }, // "*" for any-value in that dimension
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

ScopeAssignmentSchema.index({ userId: 1, dimension: 1, value: 1 });

module.exports = model('ScopeAssignment', ScopeAssignmentSchema);
