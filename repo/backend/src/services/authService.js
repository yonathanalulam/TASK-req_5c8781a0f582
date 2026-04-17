const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const User = require('../models/User');
const Session = require('../models/Session');
const UserRoleAssignment = require('../models/UserRoleAssignment');
const ScopeAssignment = require('../models/ScopeAssignment');
const SecurityQuestion = require('../models/SecurityQuestion');
const env = require('../config/env');
const { hashPassword, verifyPassword } = require('../utils/password');
const audit = require('./auditService');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const ANSWER_WINDOW_MS = 30 * 60 * 1000;
const ANSWER_LOCKOUT_MS = 30 * 60 * 1000;
const MAX_LOGIN_FAILS = 5;
const MAX_ANSWER_FAILS = 5;

function validateUsername(u) {
  return typeof u === 'string' && /^[A-Za-z0-9._-]{3,64}$/.test(u);
}
function validatePassword(p) {
  return typeof p === 'string' && p.length >= 12 && p.length <= 256;
}

async function signup({ username, password, displayName, email, securityQuestionId, securityAnswer }) {
  if (!validateUsername(username)) throw apiError('VALIDATION_ERROR', 'Invalid username', [{ field: 'username', issue: 'USERNAME_FORMAT' }], 422);
  if (!validatePassword(password)) throw apiError('VALIDATION_ERROR', 'Password must be at least 12 characters', [{ field: 'password', issue: 'MIN_LENGTH_12' }], 422);
  if (!securityQuestionId || !securityAnswer || String(securityAnswer).trim().length < 2)
    throw apiError('VALIDATION_ERROR', 'Security question + answer required', [{ field: 'securityAnswer', issue: 'REQUIRED' }], 422);
  const q = await SecurityQuestion.findById(securityQuestionId);
  if (!q || !q.active) throw apiError('VALIDATION_ERROR', 'Invalid security question', null, 422);

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) throw apiError('CONFLICT', 'Username already exists', null, 409);

  const passwordHash = await hashPassword(password);
  const securityAnswerHash = await hashPassword(String(securityAnswer).trim().toLowerCase());
  const user = await User.create({
    username: username.toLowerCase(),
    displayName: displayName || username,
    email: email ? String(email).toLowerCase() : undefined,
    passwordHash,
    securityQuestionId: q._id,
    securityAnswerHash,
    roles: ['student'],
  });
  await UserRoleAssignment.create({ userId: user._id, roleCode: 'student' });
  await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'user.signup', entityType: 'User', entityId: user._id });
  return user;
}

async function issueSession(user, { ip, deviceDescriptor } = {}) {
  const tokenId = uuid();
  const absoluteExpiresAt = new Date(Date.now() + env.sessionAbsoluteHours * 3600 * 1000);
  const s = await Session.create({
    userId: user._id, tokenId, ip, deviceDescriptor, absoluteExpiresAt,
  });
  const token = jwt.sign(
    { sub: String(user._id), sid: tokenId, username: user.username },
    env.jwtSecret,
    { expiresIn: `${env.sessionAbsoluteHours}h` }
  );
  return { token, session: s };
}

async function login({ username, password, ip, deviceDescriptor }) {
  const user = await User.findOne({ username: String(username || '').toLowerCase() });
  if (!user) {
    await audit.record({ action: 'auth.login', outcome: 'failure', reason: 'unknown_user', diffSummary: { username }, ip });
    throw apiError('INVALID_CREDENTIALS', 'Invalid username or password', null, 401);
  }
  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'auth.login', outcome: 'blocked', reason: 'locked_out', ip });
    throw apiError('ACCOUNT_LOCKED', 'Account temporarily locked due to failed attempts', null, 423);
  }
  if (user.status !== 'active') {
    throw apiError('ACCOUNT_DISABLED', 'Account is not active', null, 403);
  }
  const ok = await verifyPassword(user.passwordHash, password || '');
  if (!ok) {
    const firstTs = user.firstFailedLoginAt ? user.firstFailedLoginAt.getTime() : 0;
    if (!firstTs || (now - firstTs) > LOGIN_WINDOW_MS) {
      user.firstFailedLoginAt = new Date(now);
      user.failedLoginAttempts = 1;
    } else {
      user.failedLoginAttempts += 1;
    }
    if (user.failedLoginAttempts >= MAX_LOGIN_FAILS) {
      user.lockedUntil = new Date(now + LOGIN_LOCKOUT_MS);
      user.failedLoginAttempts = 0;
      user.firstFailedLoginAt = null;
    }
    await user.save();
    await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'auth.login', outcome: 'failure', reason: 'bad_password', ip });
    throw apiError('INVALID_CREDENTIALS', 'Invalid username or password', null, 401);
  }
  user.failedLoginAttempts = 0;
  user.firstFailedLoginAt = null;
  user.lockedUntil = null;
  await user.save();
  const { token, session } = await issueSession(user, { ip, deviceDescriptor });
  await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'auth.login', outcome: 'success', ip, deviceDescriptor });
  return { token, session, user };
}

async function validateSession(tokenId) {
  const s = await Session.findOne({ tokenId });
  if (!s) return null;
  if (s.state !== 'active') return null;
  const now = Date.now();
  if (s.absoluteExpiresAt.getTime() <= now) {
    s.state = 'absolute_expired';
    await s.save();
    return null;
  }
  const idleMs = env.sessionIdleMinutes * 60 * 1000;
  if (now - s.lastActivityAt.getTime() > idleMs) {
    s.state = 'idle_expired';
    await s.save();
    return null;
  }
  s.lastActivityAt = new Date(now);
  await s.save();
  return s;
}

async function logout(session, actor) {
  session.state = 'logged_out';
  await session.save();
  await audit.record({ actorUserId: actor._id, actorUsername: actor.username, action: 'auth.logout', entityType: 'Session', entityId: session._id });
}

async function forceLogout(userId, { adminUser, reason, sessionId }) {
  if (!reason || String(reason).trim().length < 3) {
    throw apiError('VALIDATION_ERROR', 'reason required for forced logout', null, 422);
  }
  const filter = { userId, state: 'active' };
  if (sessionId) filter._id = sessionId;
  const sessions = await Session.find(filter);
  for (const s of sessions) {
    s.state = 'revoked';
    s.revokedBy = adminUser._id;
    s.revokedReason = reason;
    await s.save();
    await audit.record({
      actorUserId: adminUser._id, actorUsername: adminUser.username,
      action: 'session.force_logout', entityType: 'Session', entityId: s._id,
      reason, diffSummary: { targetUserId: String(userId) },
    });
  }
  return sessions.length;
}

async function startPasswordReset({ username }) {
  // Uniform response for known and unknown usernames — never reveal account existence
  // or the user-specific security question text at this step. The user is expected to
  // know their own security answer from signup; the next step (`/reset/complete`)
  // validates username + answer together and rejects both unknown-user and bad-answer
  // cases with the same 401 code. We also perform a lookup + no-op touch so timing is
  // comparable for existent vs non-existent usernames.
  try {
    await User.findOne({ username: String(username || '').toLowerCase() }).lean();
  } catch { /* swallow to keep response uniform */ }
  return {
    masked: true,
    questionText: null,
    questionId: null,
    message: 'If an account exists for this username, enter your security answer on the next step to reset the password.',
  };
}

async function completePasswordReset({ username, securityAnswer, newPassword, ip }) {
  if (!validatePassword(newPassword)) throw apiError('VALIDATION_ERROR', 'Password must be at least 12 characters', [{ field: 'newPassword', issue: 'MIN_LENGTH_12' }], 422);
  const user = await User.findOne({ username: String(username || '').toLowerCase() });
  if (!user) throw apiError('INVALID_CREDENTIALS', 'Unable to reset', null, 401);
  const now = Date.now();
  if (user.answerLockedUntil && user.answerLockedUntil.getTime() > now) {
    throw apiError('RESET_LOCKED', 'Reset flow temporarily locked', null, 423);
  }
  const ok = await verifyPassword(user.securityAnswerHash, String(securityAnswer || '').trim().toLowerCase());
  if (!ok) {
    const firstTs = user.firstFailedAnswerAt ? user.firstFailedAnswerAt.getTime() : 0;
    if (!firstTs || (now - firstTs) > ANSWER_WINDOW_MS) {
      user.firstFailedAnswerAt = new Date(now);
      user.failedAnswerAttempts = 1;
    } else {
      user.failedAnswerAttempts += 1;
    }
    if (user.failedAnswerAttempts >= MAX_ANSWER_FAILS) {
      user.answerLockedUntil = new Date(now + ANSWER_LOCKOUT_MS);
      user.failedAnswerAttempts = 0;
      user.firstFailedAnswerAt = null;
    }
    await user.save();
    await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'auth.reset', outcome: 'failure', reason: 'bad_answer', ip });
    throw apiError('INVALID_CREDENTIALS', 'Invalid credentials', null, 401);
  }
  user.passwordHash = await hashPassword(newPassword);
  user.failedAnswerAttempts = 0;
  user.firstFailedAnswerAt = null;
  user.answerLockedUntil = null;
  user.failedLoginAttempts = 0;
  user.firstFailedLoginAt = null;
  user.lockedUntil = null;
  user.mustChangePassword = false;
  await user.save();
  // Invalidate all existing sessions:
  await Session.updateMany({ userId: user._id, state: 'active' }, { $set: { state: 'revoked', revokedReason: 'password_reset' } });
  await audit.record({ actorUserId: user._id, actorUsername: user.username, action: 'auth.reset', outcome: 'success', ip });
  return user;
}

async function loadRolesAndScopes(userId) {
  const [roles, scopes] = await Promise.all([
    UserRoleAssignment.find({ userId, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }] }).lean(),
    ScopeAssignment.find({ userId, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }] }).lean(),
  ]);
  return {
    roles: roles.map(r => r.roleCode),
    scopes: scopes.map(s => ({ dimension: s.dimension, value: s.value })),
  };
}

function apiError(code, message, details, status) {
  const e = new Error(message);
  e.apiCode = code;
  e.status = status || 400;
  e.details = details || null;
  return e;
}

function verifyToken(token) {
  try { return jwt.verify(token, env.jwtSecret); } catch { return null; }
}

module.exports = {
  signup, login, validateSession, logout, forceLogout,
  startPasswordReset, completePasswordReset,
  loadRolesAndScopes, verifyToken, issueSession, validateUsername, validatePassword,
};
