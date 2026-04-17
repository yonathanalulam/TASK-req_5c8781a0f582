const router = require('express').Router();
const ShoeProfile = require('../models/ShoeProfile');
const CustodyEvent = require('../models/CustodyEvent');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const sm = require('../services/shoeStateMachine');
const { verifyBarcodeCheckDigit } = require('../services/barcodeService');
const serviceHistory = require('../services/serviceHistoryService');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

router.use(requireAuth);

router.post('/scan', requireCapability('custody.scan'), idempotency({ required: false }), wrap(async (req, res) => {
  const { barcode, eventType, station, location, notes, manualEntry, manualEntryReason, toState, restoredFromState } = req.body || {};
  if (!barcode || !eventType) return fail(res, 'VALIDATION_ERROR', 'barcode and eventType required', null, 422);
  const profile = await ShoeProfile.findOne({ barcode });
  if (!profile) {
    await CustodyEvent.create({
      shoeProfileId: null, barcode: barcode || 'UNKNOWN',
      actorUserId: req.user._id, actorUsername: req.user.username,
      eventType: 'correction', scanOutcome: 'rejected',
      manualEntry: !!manualEntry,
      notes: 'Unknown barcode scan',
    }).catch(() => {});
    await audit.record({ ...req.auditContext, action: 'custody.scan', outcome: 'failure', reason: 'unknown_barcode', diffSummary: { barcode } });
    return fail(res, 'UNKNOWN_BARCODE', 'Barcode not registered', null, 404);
  }
  if (manualEntry && (!manualEntryReason || String(manualEntryReason).trim().length < 3)) {
    return fail(res, 'VALIDATION_ERROR', 'manualEntryReason required for manual scan fallback', null, 422);
  }

  // Dedup: same barcode + actor + eventType within 30 seconds
  const since = new Date(Date.now() - 30 * 1000);
  const recent = await CustodyEvent.findOne({
    barcode, actorUserId: req.user._id, eventType,
    timestamp: { $gte: since },
  }).lean();
  if (recent) {
    return ok(res, { suppressedDuplicate: true, eventId: String(recent._id) }, 200);
  }

  const fromState = profile.status;
  let targetState = toState || null;
  const eventToStateMap = {
    handoff: null, // caller supplies toState
    service_start: 'in_service',
    service_complete: 'quality_check',
    quality_check: null,
    rework_assigned: 'rework_required',
    ready_for_delivery: 'ready_for_delivery',
    shipping_prepared: 'shipping_prepared',
    in_transit: 'in_transit',
    delivered: 'delivered',
    delivery_exception: 'delivery_exception',
    picked_up: 'picked_up',
    returned_to_office: 'returned_to_office',
    exception_hold_applied: 'exception_hold',
    exception_hold_cleared: restoredFromState || null,
    cancelled: 'cancelled',
    closed: null,
  };
  if (!targetState) targetState = eventToStateMap[eventType];
  if (!targetState) return fail(res, 'VALIDATION_ERROR', 'toState required for this eventType', null, 422);

  const viaHoldClear = eventType === 'exception_hold_cleared';
  if (!sm.canTransition(fromState, targetState, { viaHoldClear, restoredFrom: restoredFromState })) {
    await audit.record({ ...req.auditContext, action: 'custody.scan', outcome: 'blocked', reason: 'illegal_transition', diffSummary: { fromState, targetState, eventType } });
    return fail(res, 'ILLEGAL_TRANSITION', `Cannot transition ${fromState} -> ${targetState}`, null, 409);
  }

  if (targetState === 'exception_hold') profile.exceptionHoldFrom = fromState;
  profile.previousStatus = fromState;
  profile.status = targetState;
  profile.updatedAt = new Date();
  profile.version = (profile.version || 1) + 1;
  if (serviceHistory.COMPLETION_STATES.has(targetState) && !profile.completedAt) {
    profile.completedAt = new Date();
  }
  await profile.save();
  if (serviceHistory.COMPLETION_STATES.has(targetState)) {
    await serviceHistory.recordCompletion(profile, { outcome: targetState });
  }

  const event = await CustodyEvent.create({
    shoeProfileId: profile._id, barcode,
    actorUserId: req.user._id, actorUsername: req.user.username,
    eventType, fromState, toState: targetState,
    station, location, notes,
    manualEntry: !!manualEntry,
    scanOutcome: manualEntry ? 'manual_entry' : 'success',
    idempotencyKey: req.headers['idempotency-key'] || null,
  });
  await audit.record({
    ...req.auditContext,
    action: 'custody.scan',
    entityType: 'CustodyEvent', entityId: event._id,
    reason: manualEntry ? `manual entry: ${manualEntryReason}` : undefined,
    diffSummary: { barcode, eventType, fromState, toState: targetState },
  });
  return ok(res, { event, profile }, 201);
}));

router.get('/lookup', wrap(async (req, res) => {
  const { barcode, serial, ownerUserId } = req.query;
  const filter = {};
  if (barcode) filter.barcode = barcode;
  else if (serial) filter.serial = serial;
  else if (ownerUserId) filter.ownerUserId = ownerUserId;
  else return fail(res, 'VALIDATION_ERROR', 'barcode, serial, or ownerUserId required', null, 422);
  const profile = await ShoeProfile.findOne(filter).lean();
  if (!profile) return fail(res, 'NOT_FOUND', 'No matching item', null, 404);
  const authz = require('../services/authz');
  if (!authz.canViewCustodyForShoe(req, profile)) {
    return fail(res, 'FORBIDDEN', 'Not permitted to view this item', null, 403);
  }
  const events = await CustodyEvent.find({ shoeProfileId: profile._id }).sort({ timestamp: 1 }).lean();
  return ok(res, { profile, events });
}));

router.get('/verify-barcode/:code', wrap(async (req, res) => {
  const valid = verifyBarcodeCheckDigit(req.params.code);
  return ok(res, { valid });
}));

module.exports = router;
