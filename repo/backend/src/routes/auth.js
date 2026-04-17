const router = require('express').Router();
const auth = require('../services/authService');
const SecurityQuestion = require('../models/SecurityQuestion');
const User = require('../models/User');
const { ok, fail } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/security-questions', wrap(async (_req, res) => {
  const q = await SecurityQuestion.find({ active: true }).lean();
  return ok(res, q.map(x => ({ id: String(x._id), text: x.text })));
}));

router.post('/signup', wrap(async (req, res) => {
  const user = await auth.signup(req.body || {});
  return ok(res, { id: String(user._id), username: user.username }, 201);
}));

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { token, session, user } = await auth.login({
    username, password, ip: req.ip,
    deviceDescriptor: req.headers['x-device-descriptor'] || null,
  });
  const rs = await auth.loadRolesAndScopes(user._id);
  return ok(res, {
    token,
    sessionId: session.tokenId,
    user: {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      roles: rs.roles,
      scopes: rs.scopes,
    },
  });
}));

router.post('/logout', requireAuth, wrap(async (req, res) => {
  await auth.logout(req.session, req.user);
  return ok(res, { loggedOut: true });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  return ok(res, {
    id: String(req.user._id),
    username: req.user.username,
    displayName: req.user.displayName,
    mustChangePassword: req.user.mustChangePassword,
    roles: req.roles,
    scopes: req.scopes,
  });
}));

router.post('/reset/start', wrap(async (req, res) => {
  const r = await auth.startPasswordReset({ username: (req.body || {}).username });
  return ok(res, r);
}));

router.post('/reset/complete', wrap(async (req, res) => {
  const { username, securityAnswer, newPassword } = req.body || {};
  await auth.completePasswordReset({ username, securityAnswer, newPassword, ip: req.ip });
  return ok(res, { reset: true });
}));

router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!auth.validatePassword(newPassword || '')) {
    return fail(res, 'VALIDATION_ERROR', 'Password must be at least 12 characters', [{ field: 'newPassword', issue: 'MIN_LENGTH_12' }], 422);
  }
  const u = await User.findById(req.user._id);
  const { verifyPassword, hashPassword } = require('../utils/password');
  const ok1 = await verifyPassword(u.passwordHash, currentPassword || '');
  if (!ok1) return fail(res, 'INVALID_CREDENTIALS', 'Current password is incorrect', null, 401);
  u.passwordHash = await hashPassword(newPassword);
  u.mustChangePassword = false;
  await u.save();
  await require('../services/auditService').record({
    actorUserId: u._id, actorUsername: u.username, action: 'user.change_password',
  });
  return ok(res, { changed: true });
}));

module.exports = router;
