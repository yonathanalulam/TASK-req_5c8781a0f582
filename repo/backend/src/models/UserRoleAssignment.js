const { Schema, model } = require('mongoose');

const UserRoleAssignmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roleCode: { type: String, required: true, index: true },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo: { type: Date, default: null },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

UserRoleAssignmentSchema.index({ userId: 1, roleCode: 1 });

module.exports = model('UserRoleAssignment', UserRoleAssignmentSchema);
