const router = require('express').Router();
const LeaseContract = require('../models/LeaseContract');
const LeaseContractVersion = require('../models/LeaseContractVersion');
const TerminationReconciliation = require('../models/TerminationReconciliation');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const sm = require('../services/contractStateMachine');
const { addBusinessDays } = require('../utils/businessCalendar');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

async function snapshotVersion(contract, changeType, effectiveDate, userId, reason) {
  const last = await LeaseContractVersion.findOne({ contractId: contract._id }).sort({ versionNumber: -1 }).lean();
  const versionNumber = last ? last.versionNumber + 1 : 1;
  const v = await LeaseContractVersion.create({
    contractId: contract._id, versionNumber, changeType,
    effectiveDate, snapshot: contract.toObject(), reason, createdBy: userId,
  });
  contract.currentVersionId = v._id;
  return v;
}

router.post('/', requireCapability('contract.create'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.contractNumber || !b.facilityUnit || !b.lessorName || !b.lesseeName || !b.startDate || !b.endDate)
    return fail(res, 'VALIDATION_ERROR', 'missing required contract fields', null, 422);
  if (new Date(b.startDate) > new Date(b.endDate))
    return fail(res, 'VALIDATION_ERROR', 'startDate must be <= endDate', null, 422);

  // overlap check
  const overlap = await LeaseContract.findOne({
    facilityUnit: b.facilityUnit,
    status: { $in: ['active','amended','pending_renewal','renewed'] },
    startDate: { $lte: new Date(b.endDate) },
    endDate: { $gte: new Date(b.startDate) },
  });
  if (overlap && !b.allowOverride) {
    return fail(res, 'CONFLICT', 'Overlapping active contract exists for this facility unit', { existingId: String(overlap._id) }, 409);
  }

  const c = await LeaseContract.create({
    contractNumber: b.contractNumber,
    facilityUnit: b.facilityUnit,
    lessorName: b.lessorName, lesseeName: b.lesseeName,
    startDate: b.startDate, endDate: b.endDate,
    status: 'draft', createdBy: req.user._id,
  });
  await snapshotVersion(c, 'create', new Date(b.startDate), req.user._id, b.reason || 'initial');
  await c.save();
  await audit.record({ ...req.auditContext, action: 'contract.create', entityType: 'LeaseContract', entityId: c._id, diffSummary: { contractNumber: c.contractNumber } });
  return ok(res, c, 201);
}));

router.post('/:id/activate', requireCapability('contract.create'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.id);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  if (!sm.canTransition(c.status, 'active')) return fail(res, 'ILLEGAL_TRANSITION', `Cannot activate from ${c.status}`, null, 409);
  if (!c.currentBillingRuleVersionId) return fail(res, 'VALIDATION_ERROR', 'billing rule required before activation', null, 422);
  c.status = 'active';
  c.updatedAt = new Date();
  c.version = (c.version || 1) + 1;
  await snapshotVersion(c, 'create', new Date(), req.user._id, 'activation');
  await c.save();
  await audit.record({ ...req.auditContext, action: 'contract.activate', entityType: 'LeaseContract', entityId: c._id });
  return ok(res, c);
}));

router.post('/:id/amend', requireCapability('contract.amend'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.id);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  if (!['active','amended'].includes(c.status)) return fail(res, 'ILLEGAL_TRANSITION', 'Contract not amendable in current state', null, 409);
  const { endDate, lessorName, lesseeName, effectiveDate, reason, billingRuleVersionId } = req.body || {};
  if (!reason) return fail(res, 'VALIDATION_ERROR', 'reason required for amendment', null, 422);
  if (endDate) c.endDate = new Date(endDate);
  if (lessorName) c.lessorName = lessorName;
  if (lesseeName) c.lesseeName = lesseeName;
  if (billingRuleVersionId) c.currentBillingRuleVersionId = billingRuleVersionId;
  c.status = 'active';
  c.updatedAt = new Date();
  c.version = (c.version || 1) + 1;
  await snapshotVersion(c, 'amend', new Date(effectiveDate || Date.now()), req.user._id, reason);
  await c.save();
  await audit.record({ ...req.auditContext, action: 'contract.amend', entityType: 'LeaseContract', entityId: c._id, reason });
  return ok(res, c);
}));

router.post('/:id/renew', requireCapability('contract.renew'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.id);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  if (!['active','pending_renewal','expired'].includes(c.status)) return fail(res, 'ILLEGAL_TRANSITION', 'Not renewable in current state', null, 409);
  const { newEndDate, effectiveDate, reason, billingRuleVersionId } = req.body || {};
  if (!newEndDate) return fail(res, 'VALIDATION_ERROR', 'newEndDate required', null, 422);
  if (new Date(newEndDate) <= new Date(c.endDate)) return fail(res, 'VALIDATION_ERROR', 'newEndDate must be after current endDate', null, 422);
  c.endDate = new Date(newEndDate);
  if (billingRuleVersionId) c.currentBillingRuleVersionId = billingRuleVersionId;
  c.status = 'active';
  c.updatedAt = new Date();
  c.version = (c.version || 1) + 1;
  await snapshotVersion(c, 'renew', new Date(effectiveDate || Date.now()), req.user._id, reason || 'renewal');
  await c.save();
  await audit.record({ ...req.auditContext, action: 'contract.renew', entityType: 'LeaseContract', entityId: c._id });
  return ok(res, c);
}));

router.post('/:id/terminate', requireCapability('contract.terminate'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.id);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  if (!sm.canTransition(c.status, 'terminated')) return fail(res, 'ILLEGAL_TRANSITION', `Cannot terminate from ${c.status}`, null, 409);
  const { terminationEffectiveDate, reason } = req.body || {};
  if (!terminationEffectiveDate || !reason) return fail(res, 'VALIDATION_ERROR', 'terminationEffectiveDate and reason required', null, 422);
  const termDate = new Date(terminationEffectiveDate);
  if (termDate < c.startDate) return fail(res, 'VALIDATION_ERROR', 'terminationEffectiveDate must be >= contract startDate', null, 422);
  c.terminationEffectiveDate = termDate;
  c.status = 'terminated';
  c.reconciliationDueAt = addBusinessDays(termDate, 10);
  c.updatedAt = new Date();
  c.version = (c.version || 1) + 1;
  await snapshotVersion(c, 'terminate', termDate, req.user._id, reason);
  await c.save();
  // Create reconciliation workflow and move to reconciliation_pending
  await TerminationReconciliation.updateOne(
    { contractId: c._id },
    { $setOnInsert: {
      contractId: c._id,
      terminationEffectiveDate: termDate,
      dueAt: c.reconciliationDueAt,
      status: 'pending',
    } },
    { upsert: true },
  );
  c.status = 'reconciliation_pending';
  await c.save();
  await audit.record({ ...req.auditContext, action: 'contract.terminate', entityType: 'LeaseContract', entityId: c._id, reason });
  return ok(res, c);
}));

router.get('/', requireCapability('contract.view.all'), wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.contractNumber = new RegExp(req.query.q, 'i');
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = parseInt(req.query.skip || '0', 10);
  const [items, total] = await Promise.all([
    LeaseContract.find(filter).sort({ endDate: 1 }).skip(skip).limit(limit).lean(),
    LeaseContract.countDocuments(filter),
  ]);
  return ok(res, { items, total, limit, skip });
}));

router.get('/expirations', requireCapability('contract.view.all'), wrap(async (req, res) => {
  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() + 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
  const baseFilter = { status: { $in: ['active','amended','pending_renewal','renewed'] } };
  const [b7, b30, b90] = await Promise.all([
    LeaseContract.find({ ...baseFilter, endDate: { $gte: now, $lte: d7 } }).select('contractNumber facilityUnit endDate status').lean(),
    LeaseContract.find({ ...baseFilter, endDate: { $gt: d7, $lte: d30 } }).select('contractNumber facilityUnit endDate status').lean(),
    LeaseContract.find({ ...baseFilter, endDate: { $gt: d30, $lte: d90 } }).select('contractNumber facilityUnit endDate status').lean(),
  ]);
  return ok(res, { within7Days: b7, within30Days: b30, within90Days: b90, generatedAt: now.toISOString() });
}));

router.get('/:id', requireCapability('contract.view.all'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.id).lean();
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  const versions = await LeaseContractVersion.find({ contractId: c._id }).sort({ versionNumber: 1 }).lean();
  return ok(res, { contract: c, versions });
}));

module.exports = router;
