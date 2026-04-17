const router = require('express').Router();
const Exception = require('../models/Exception');
const { requireAuth } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const authz = require('../services/authz');
const { canExceptionTransition } = require('../services/appealStateMachine');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.exceptionType || !b.summary) return fail(res, 'VALIDATION_ERROR', 'exceptionType and summary required', null, 422);
  if (!authz.hasAnyRole(req, 'operations_staff', 'department_admin', 'security_admin', 'faculty_advisor', 'corporate_mentor')) {
    return fail(res, 'FORBIDDEN', 'Not permitted to open exceptions', null, 403);
  }
  const ex = await Exception.create({
    exceptionType: b.exceptionType,
    summary: b.summary,
    details: b.details,
    subjectUserId: b.subjectUserId,
    shoeProfileId: b.shoeProfileId,
    shippingOrderId: b.shippingOrderId,
    custodyEventId: b.custodyEventId,
    scopes: b.scopes || [],
    openedBy: req.user._id,
  });
  await audit.record({ ...req.auditContext, action: 'exception.open', entityType: 'Exception', entityId: ex._id, diffSummary: { type: ex.exceptionType } });
  return ok(res, ex, 201);
}));

router.post('/:id/transition', wrap(async (req, res) => {
  const ex = await Exception.findById(req.params.id);
  if (!ex) return fail(res, 'NOT_FOUND', 'Exception not found', null, 404);
  const { to, reason } = req.body || {};
  if (!authz.canTransitionException(req, ex, to)) {
    return fail(res, 'FORBIDDEN', 'Not permitted to transition this exception', null, 403);
  }
  if (!canExceptionTransition(ex.status, to)) return fail(res, 'ILLEGAL_TRANSITION', `Cannot ${ex.status} -> ${to}`, null, 409);
  ex.status = to;
  if (['resolved','dismissed'].includes(to)) {
    ex.resolvedAt = new Date();
    ex.resolvedBy = req.user._id;
  }
  await ex.save();
  await audit.record({ ...req.auditContext, action: 'exception.transition', entityType: 'Exception', entityId: ex._id, reason, diffSummary: { to } });
  return ok(res, ex);
}));

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.exceptionType = req.query.type;
  if (req.query.subjectUserId) filter.subjectUserId = req.query.subjectUserId;
  const items = await Exception.find(filter).sort({ createdAt: -1 }).lean();
  const visible = items.filter(e => authz.canViewException(req, e));
  return ok(res, { items: visible, total: visible.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const ex = await Exception.findById(req.params.id).lean();
  if (!ex) return fail(res, 'NOT_FOUND', 'Exception not found', null, 404);
  if (!authz.canViewException(req, ex)) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  return ok(res, ex);
}));

module.exports = router;
