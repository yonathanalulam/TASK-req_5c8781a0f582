const router = require('express').Router();
const multer = require('multer');
const Appeal = require('../models/Appeal');
const AppealDecision = require('../models/AppealDecision');
const Exception = require('../models/Exception');
const Attachment = require('../models/Attachment');
const { requireAuth } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const attachments = require('../services/attachmentService');
const authz = require('../services/authz');
const { canAppealTransition, canExceptionTransition } = require('../services/appealStateMachine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 } });
function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

router.post('/', idempotency({ required: false }), upload.array('evidence', 8), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.exceptionId) return fail(res, 'VALIDATION_ERROR', 'exceptionId required', null, 422);
  const ex = await Exception.findById(body.exceptionId);
  if (!ex) return fail(res, 'NOT_FOUND', 'Exception not found', null, 404);
  if (ex.subjectUserId && String(ex.subjectUserId) !== String(req.user._id) && !authz.hasAnyRole(req, 'department_admin')) {
    return fail(res, 'FORBIDDEN', 'Can only appeal own exceptions (admins may act on behalf with audit)', null, 403);
  }
  // One active appeal per exception unless remanded
  const activeAppeal = await Appeal.findOne({
    exceptionId: ex._id,
    status: { $in: ['draft','submitted','under_review','resubmitted'] },
  });
  if (activeAppeal) return fail(res, 'CONFLICT', 'An active appeal already exists for this exception', null, 409);
  const rationale = (body.rationale || '').trim();
  const files = req.files || [];
  if (!rationale && files.length === 0) {
    return fail(res, 'VALIDATION_ERROR', 'rationale or at least one evidence attachment required', null, 422);
  }
  const appeal = await Appeal.create({
    exceptionId: ex._id,
    appellantUserId: req.user._id,
    rationale,
    status: 'submitted',
    scopes: ex.scopes || [],
    submittedAt: new Date(),
  });
  for (const f of files) {
    const att = await attachments.storeAttachment({
      buffer: f.buffer, declaredContentType: f.mimetype, originalFilename: f.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
      ownerType: 'appeal', ownerId: appeal._id,
      uploaderUserId: req.user._id,
      context: 'appeal_evidence',
    });
    appeal.evidenceAttachmentIds.push(att._id);
  }
  await appeal.save();
  if (canExceptionTransition(ex.status, 'appealed')) {
    ex.status = 'appealed'; await ex.save();
  }
  await audit.record({ ...req.auditContext, action: 'appeal.submit', entityType: 'Appeal', entityId: appeal._id, diffSummary: { exceptionId: String(ex._id) } });
  return ok(res, appeal, 201);
}));

router.post('/:id/start-review', wrap(async (req, res) => {
  const a = await Appeal.findById(req.params.id);
  if (!a) return fail(res, 'NOT_FOUND', 'Appeal not found', null, 404);
  const ex0 = await Exception.findById(a.exceptionId).lean();
  const effectiveScopes = (ex0 && ex0.scopes) || a.scopes || [];
  if (!authz.canStartReview(req, effectiveScopes)) {
    return fail(res, 'FORBIDDEN', 'Only authorized reviewers may start appeal review', null, 403);
  }
  if (!canAppealTransition(a.status, 'under_review')) return fail(res, 'ILLEGAL_TRANSITION', null, null, 409);
  a.status = 'under_review'; a.updatedAt = new Date(); await a.save();
  const ex = await Exception.findById(a.exceptionId);
  if (ex && canExceptionTransition(ex.status, 'appeal_under_review')) {
    ex.status = 'appeal_under_review'; await ex.save();
  }
  await audit.record({ ...req.auditContext, action: 'appeal.start_review', entityType: 'Appeal', entityId: a._id });
  return ok(res, a);
}));

router.post('/:id/decide', wrap(async (req, res) => {
  const a = await Appeal.findById(req.params.id);
  if (!a) return fail(res, 'NOT_FOUND', 'Appeal not found', null, 404);
  const ex = await Exception.findById(a.exceptionId);
  if (!ex) return fail(res, 'NOT_FOUND', 'Related exception missing', null, 404);
  if (!authz.canDecideAppeal(req, ex)) return fail(res, 'FORBIDDEN', 'Not authorized to decide this appeal', null, 403);
  const { outcome, rationale, override, overrideReason } = req.body || {};
  if (!['approved','denied','remanded'].includes(outcome)) return fail(res, 'VALIDATION_ERROR', 'outcome must be approved|denied|remanded', null, 422);
  if (!rationale || String(rationale).trim().length < 3) return fail(res, 'VALIDATION_ERROR', 'rationale required', null, 422);
  if (!canAppealTransition(a.status, outcome)) return fail(res, 'ILLEGAL_TRANSITION', `Cannot ${a.status} -> ${outcome}`, null, 409);
  if (override && !authz.hasAnyRole(req, 'department_admin')) {
    return fail(res, 'FORBIDDEN', 'Only department_admin may override normal reviewer path', null, 403);
  }
  const lastDecision = await AppealDecision.findOne({ appealId: a._id }).sort({ versionNumber: -1 });
  const decision = await AppealDecision.create({
    appealId: a._id,
    versionNumber: (lastDecision ? lastDecision.versionNumber : 0) + 1,
    outcome, rationale,
    reviewerUserId: req.user._id,
    reviewerUsername: req.user.username,
  });
  if (lastDecision) { lastDecision.supersededBy = decision._id; await lastDecision.save(); }
  a.status = outcome;
  a.currentDecisionId = decision._id;
  a.updatedAt = new Date();
  if (outcome !== 'remanded') a.closedAt = new Date();
  await a.save();
  if (outcome === 'approved' && canExceptionTransition(ex.status, 'appeal_approved')) { ex.status = 'appeal_approved'; await ex.save(); }
  if (outcome === 'denied' && canExceptionTransition(ex.status, 'appeal_denied')) { ex.status = 'appeal_denied'; await ex.save(); }
  if (outcome === 'remanded' && canExceptionTransition(ex.status, 'appeal_remanded')) { ex.status = 'appeal_remanded'; await ex.save(); }
  await audit.record({
    ...req.auditContext,
    action: override ? 'appeal.override' : 'appeal.decide',
    entityType: 'AppealDecision', entityId: decision._id,
    reason: override ? `override: ${overrideReason || 'no reason'}` : rationale,
    diffSummary: { outcome },
  });
  return ok(res, { appeal: a, decision });
}));

router.post('/:id/withdraw', wrap(async (req, res) => {
  const a = await Appeal.findById(req.params.id);
  if (!a) return fail(res, 'NOT_FOUND', 'Appeal not found', null, 404);
  if (!authz.canWithdrawAppeal(req, a)) {
    return fail(res, 'FORBIDDEN', 'Only appellant or department_admin may withdraw', null, 403);
  }
  if (!canAppealTransition(a.status, 'withdrawn')) return fail(res, 'ILLEGAL_TRANSITION', null, null, 409);
  a.status = 'withdrawn'; a.closedAt = new Date(); await a.save();
  await audit.record({ ...req.auditContext, action: 'appeal.withdraw', entityType: 'Appeal', entityId: a._id });
  return ok(res, a);
}));

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.exceptionId) filter.exceptionId = req.query.exceptionId;
  const raw = await Appeal.find(filter).sort({ createdAt: -1 }).lean();
  const exceptionsById = new Map();
  for (const a of raw) {
    if (!exceptionsById.has(String(a.exceptionId))) {
      const ex = await Exception.findById(a.exceptionId).lean();
      exceptionsById.set(String(a.exceptionId), ex);
    }
  }
  const items = raw.filter(a => authz.canViewAppeal(req, a, { exception: exceptionsById.get(String(a.exceptionId)) }));
  return ok(res, { items, total: items.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const a = await Appeal.findById(req.params.id).lean();
  if (!a) return fail(res, 'NOT_FOUND', 'Appeal not found', null, 404);
  const ex = await Exception.findById(a.exceptionId).lean();
  if (!authz.canViewAppeal(req, a, { exception: ex })) {
    return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  }
  const decisions = await AppealDecision.find({ appealId: a._id }).sort({ versionNumber: 1 }).lean();
  const attList = await Attachment.find({ ownerType: 'appeal', ownerId: a._id, active: true }).select('opaqueId contentType sha256 context sizeBytes').lean();
  return ok(res, { appeal: a, decisions, attachments: attList });
}));

module.exports = router;
