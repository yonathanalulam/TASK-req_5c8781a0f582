const router = require('express').Router();
const User = require('../models/User');
const Session = require('../models/Session');
const UserRoleAssignment = require('../models/UserRoleAssignment');
const ScopeAssignment = require('../models/ScopeAssignment');
const auditService = require('../services/auditService');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireCapability } = require('../middleware/auth');
const authSvc = require('../services/authService');
const { ok, fail } = require('../utils/response');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

router.use(requireAuth);

router.get('/users', requireCapability('user.manage'), wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = parseInt(req.query.skip || '0', 10);
  const filter = {};
  if (req.query.q) filter.username = new RegExp(req.query.q, 'i');
  const [items, total] = await Promise.all([
    User.find(filter).select('username displayName status roles email createdAt lockedUntil').skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return ok(res, { items, total, limit, skip });
}));

router.post('/users/:id/roles', requireCapability('role.manage'), wrap(async (req, res) => {
  const { roleCode } = req.body || {};
  if (!roleCode) return fail(res, 'VALIDATION_ERROR', 'roleCode required', null, 422);
  await UserRoleAssignment.updateOne({ userId: req.params.id, roleCode }, { $setOnInsert: { userId: req.params.id, roleCode, assignedBy: req.user._id } }, { upsert: true });
  await User.updateOne({ _id: req.params.id }, { $addToSet: { roles: roleCode } });
  await auditService.record({ ...req.auditContext, action: 'role.assign', entityType: 'User', entityId: req.params.id, diffSummary: { roleCode } });
  return ok(res, { assigned: true });
}));

router.delete('/users/:id/roles/:roleCode', requireCapability('role.manage'), wrap(async (req, res) => {
  await UserRoleAssignment.deleteOne({ userId: req.params.id, roleCode: req.params.roleCode });
  await User.updateOne({ _id: req.params.id }, { $pull: { roles: req.params.roleCode } });
  await auditService.record({ ...req.auditContext, action: 'role.unassign', entityType: 'User', entityId: req.params.id, diffSummary: { roleCode: req.params.roleCode } });
  return ok(res, { removed: true });
}));

router.post('/users/:id/scopes', requireCapability('scope.manage'), wrap(async (req, res) => {
  const { dimension, value } = req.body || {};
  if (!dimension || !value) return fail(res, 'VALIDATION_ERROR', 'dimension and value required', null, 422);
  await ScopeAssignment.updateOne({ userId: req.params.id, dimension, value }, { $setOnInsert: { userId: req.params.id, dimension, value } }, { upsert: true });
  await auditService.record({ ...req.auditContext, action: 'scope.assign', entityType: 'User', entityId: req.params.id, diffSummary: { dimension, value } });
  return ok(res, { assigned: true });
}));

router.post('/users/:id/unlock', requireCapability('user.unlock'), wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return fail(res, 'NOT_FOUND', 'User not found', null, 404);
  u.lockedUntil = null; u.failedLoginAttempts = 0; u.firstFailedLoginAt = null;
  u.answerLockedUntil = null; u.failedAnswerAttempts = 0; u.firstFailedAnswerAt = null;
  await u.save();
  await auditService.record({ ...req.auditContext, action: 'user.unlock', entityType: 'User', entityId: u._id, reason: (req.body||{}).reason || 'admin action' });
  return ok(res, { unlocked: true });
}));

router.post('/sessions/force-logout', requireCapability('force_logout'), wrap(async (req, res) => {
  const { userId, reason, sessionId } = req.body || {};
  if (!userId) return fail(res, 'VALIDATION_ERROR', 'userId required', null, 422);
  const count = await authSvc.forceLogout(userId, { adminUser: req.user, reason, sessionId });
  return ok(res, { revoked: count });
}));

router.get('/audit', requireCapability('audit.view'), wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
  const skip = parseInt(req.query.skip || '0', 10);
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.actorUserId) filter.actorUserId = req.query.actorUserId;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ seq: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return ok(res, { items, total, limit, skip });
}));

router.post('/audit/verify', requireCapability('audit.verify'), wrap(async (req, res) => {
  const result = await auditService.verifyChain({ limit: parseInt((req.body||{}).limit || '0', 10) });
  await auditService.record({ ...req.auditContext, action: 'audit.verify', outcome: result.valid ? 'success' : 'failure', diffSummary: result });
  return ok(res, result);
}));

module.exports = router;
