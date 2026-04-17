const { Schema, model } = require('mongoose');

const encryptedBlob = {
  v: Number,
  iv: String,
  ct: String,
  tag: String,
};

const UserSchema = new Schema({
  username: { type: String, required: true, lowercase: true, trim: true, minlength: 3, maxlength: 64 },
  displayName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true }, // optional local-only
  passwordHash: { type: String, required: true },
  mustChangePassword: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'locked', 'disabled'], default: 'active' },
  failedLoginAttempts: { type: Number, default: 0 },
  firstFailedLoginAt: { type: Date },
  lockedUntil: { type: Date },
  failedAnswerAttempts: { type: Number, default: 0 },
  firstFailedAnswerAt: { type: Date },
  answerLockedUntil: { type: Date },
  securityQuestionId: { type: Schema.Types.ObjectId, ref: 'SecurityQuestion' },
  securityAnswerHash: { type: String },
  identityMetadata: encryptedBlob, // encrypted JSON (address etc. if ever stored on user)
  roles: [{ type: String }], // cached role codes; authoritative list is user_role_assignments
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

UserSchema.index({ username: 1 }, { unique: true });

module.exports = model('User', UserSchema);
