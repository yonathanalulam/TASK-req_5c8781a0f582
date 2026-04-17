const router = require('express').Router();
const ServiceRequest = require('../models/ServiceRequest');
const ShoeProfile = require('../models/ShoeProfile');
const ServiceCatalogEntry = require('../models/ServiceCatalogEntry');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const authz = require('../services/authz');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

// Create a service request.
// Students may create for themselves; operations_staff/department_admin may create `onBehalfOfUserId`.
router.post('/', idempotency({ required: false }), wrap(async (req, res) => {
  const b = req.body || {};
  const serviceCodes = Array.isArray(b.serviceCodes) ? b.serviceCodes.filter(Boolean) : [];
  if (serviceCodes.length === 0) {
    return fail(res, 'VALIDATION_ERROR', 'At least one serviceCode required', [{ field: 'serviceCodes', issue: 'REQUIRED' }], 422);
  }
  // Validate codes refer to active catalog entries
  const entries = await ServiceCatalogEntry.find({ code: { $in: serviceCodes } }).lean();
  const activeCodes = new Set(entries.filter(e => e.active !== false).map(e => e.code));
  const invalid = serviceCodes.filter(c => !activeCodes.has(c));
  if (invalid.length) {
    return fail(res, 'VALIDATION_ERROR', 'Unknown or inactive service codes', { invalid }, 422);
  }

  let requesterUserId = req.user._id;
  let onBehalfOfUserId = null;
  if (b.onBehalfOfUserId && String(b.onBehalfOfUserId) !== String(req.user._id)) {
    if (!authz.hasAnyRole(req, 'operations_staff', 'department_admin')) {
      return fail(res, 'FORBIDDEN', 'Only ops/admin may create on behalf of another user', null, 403);
    }
    const subject = await User.findById(b.onBehalfOfUserId);
    if (!subject) return fail(res, 'VALIDATION_ERROR', 'onBehalfOfUserId not found', null, 422);
    onBehalfOfUserId = subject._id;
  }

  // Optional shoe linkage must be owned by requester/subject (or ops acting)
  let shoeProfileId = null;
  if (b.shoeProfileId) {
    const shoe = await ShoeProfile.findById(b.shoeProfileId);
    if (!shoe) return fail(res, 'VALIDATION_ERROR', 'shoeProfileId not found', null, 422);
    const ownerMatches = onBehalfOfUserId
      ? String(shoe.ownerUserId) === String(onBehalfOfUserId)
      : String(shoe.ownerUserId) === String(req.user._id);
    if (!ownerMatches && !authz.hasAnyRole(req, 'operations_staff', 'department_admin')) {
      return fail(res, 'FORBIDDEN', 'Cannot link a shoe you do not own', null, 403);
    }
    shoeProfileId = shoe._id;
  }

  const sr = await ServiceRequest.create({
    requesterUserId,
    onBehalfOfUserId,
    shoeProfileId,
    serviceCodes,
    status: 'submitted',
    notes: b.notes,
    scopes: b.scopes || [],
  });
  await audit.record({
    ...req.auditContext,
    action: 'service_request.create',
    entityType: 'ServiceRequest',
    entityId: sr._id,
    diffSummary: { serviceCodes, onBehalfOf: onBehalfOfUserId ? String(onBehalfOfUserId) : null },
  });
  return ok(res, sr, 201);
}));

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.shoeProfileId) filter.shoeProfileId = req.query.shoeProfileId;
  const raw = await ServiceRequest.find(filter).sort({ createdAt: -1 }).lean();
  const items = raw.filter(sr => authz.canViewServiceRequest(req, sr));
  return ok(res, { items, total: items.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const sr = await ServiceRequest.findById(req.params.id).lean();
  if (!sr) return fail(res, 'NOT_FOUND', 'Service request not found', null, 404);
  if (!authz.canViewServiceRequest(req, sr)) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  // Attach linked shoe summary and catalog details (public-safe fields).
  const [shoe, catalog] = await Promise.all([
    sr.shoeProfileId ? ShoeProfile.findById(sr.shoeProfileId).select('serial barcode status brand color size').lean() : null,
    ServiceCatalogEntry.find({ code: { $in: sr.serviceCodes } }).select('code name priceCents estimatedDurationMinutes').lean(),
  ]);
  return ok(res, { request: sr, shoe, catalog });
}));

router.post('/:id/cancel', wrap(async (req, res) => {
  const sr = await ServiceRequest.findById(req.params.id);
  if (!sr) return fail(res, 'NOT_FOUND', 'Service request not found', null, 404);
  if (!authz.canCancelServiceRequest(req, sr)) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  if (!['submitted','draft','accepted'].includes(sr.status)) {
    return fail(res, 'INVALID_STATE', `Cannot cancel from status ${sr.status}`, null, 409);
  }
  sr.status = 'cancelled';
  await sr.save();
  await audit.record({ ...req.auditContext, action: 'service_request.cancel', entityType: 'ServiceRequest', entityId: sr._id, reason: (req.body || {}).reason || null });
  return ok(res, sr);
}));

module.exports = router;
