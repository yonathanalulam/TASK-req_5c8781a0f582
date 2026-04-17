const router = require('express').Router();
const LeaseContract = require('../models/LeaseContract');
const BillingRuleVersion = require('../models/BillingRuleVersion');
const BillingEvent = require('../models/BillingEvent');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const billing = require('../services/billingService');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

router.post('/contracts/:contractId/rules', requireCapability('billing.rule.manage'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.contractId);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  const body = req.body || {};
  if (!['fixed','tiered','revenue_share'].includes(body.ruleType))
    return fail(res, 'VALIDATION_ERROR', 'invalid ruleType', null, 422);
  if (body.ruleType === 'fixed' && (body.fixedAmountCents == null || body.fixedAmountCents < 0))
    return fail(res, 'VALIDATION_ERROR', 'fixedAmountCents required (>=0)', null, 422);
  if (body.ruleType === 'tiered') billing.validateTiers((body.tiers || []).slice().sort((a,b)=>a.minBasisCents-b.minBasisCents));
  if (body.ruleType === 'revenue_share' && (body.revenueShareRate == null || body.revenueShareRate < 0 || body.revenueShareRate > 1))
    return fail(res, 'VALIDATION_ERROR', 'revenueShareRate must be within [0,1]', null, 422);
  const last = await BillingRuleVersion.findOne({ contractId: c._id }).sort({ versionNumber: -1 });
  const versionNumber = last ? last.versionNumber + 1 : 1;
  const rule = await BillingRuleVersion.create({
    contractId: c._id, versionNumber,
    ruleType: body.ruleType,
    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
    fixedAmountCents: body.fixedAmountCents,
    dueDayOfMonth: body.dueDayOfMonth || 1,
    shiftDueDatesToNextBusinessDay: !!body.shiftDueDatesToNextBusinessDay,
    tiers: body.tiers,
    revenueShareRate: body.revenueShareRate,
    provisionalAmountCents: body.provisionalAmountCents,
    allowNegativeTrueUpAsCredit: !!body.allowNegativeTrueUpAsCredit,
    createdBy: req.user._id,
  });
  c.currentBillingRuleVersionId = rule._id;
  await c.save();
  await audit.record({ ...req.auditContext, action: 'billing.rule.create', entityType: 'BillingRuleVersion', entityId: rule._id, diffSummary: { ruleType: rule.ruleType, version: versionNumber } });
  return ok(res, rule, 201);
}));

router.post('/contracts/:contractId/events', requireCapability('billing.rule.manage'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.contractId);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  const body = req.body || {};
  const ruleId = body.billingRuleVersionId || c.currentBillingRuleVersionId;
  if (!ruleId) return fail(res, 'VALIDATION_ERROR', 'billingRuleVersionId required', null, 422);
  const rule = await BillingRuleVersion.findById(ruleId);
  if (!rule) return fail(res, 'NOT_FOUND', 'Billing rule not found', null, 404);
  const result = billing.compute(rule, {
    basisCents: body.basisCents,
    grossRevenueCents: body.grossRevenueCents,
    provisionalAmountsAlreadyBilledCents: body.provisionalAmountsAlreadyBilledCents || 0,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
  });
  const evt = await BillingEvent.create({
    contractId: c._id,
    billingRuleVersionId: rule._id,
    eventType: body.eventType || (rule.ruleType === 'revenue_share' ? 'true_up' : 'monthly_bill'),
    periodStart: body.periodStart ? new Date(body.periodStart) : null,
    periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
    amountCents: result.amountCents,
    basisCents: body.basisCents,
    inputs: body,
    reason: body.reason,
    createdBy: req.user._id,
  });
  if (!rule.immutable) { rule.immutable = true; await rule.save(); }
  await audit.record({ ...req.auditContext, action: 'billing.event.post', entityType: 'BillingEvent', entityId: evt._id, diffSummary: { amountCents: result.amountCents, ruleType: rule.ruleType } });
  return ok(res, { event: evt, computed: result }, 201);
}));

router.post('/contracts/:contractId/events/:eventId/correct', requireCapability('billing.override'), wrap(async (req, res) => {
  const orig = await BillingEvent.findById(req.params.eventId);
  if (!orig) return fail(res, 'NOT_FOUND', 'Billing event not found', null, 404);
  const { amountCents, reason } = req.body || {};
  if (amountCents == null || !reason) return fail(res, 'VALIDATION_ERROR', 'amountCents and reason required', null, 422);
  const corr = await BillingEvent.create({
    contractId: orig.contractId,
    billingRuleVersionId: orig.billingRuleVersionId,
    eventType: 'correction',
    periodStart: orig.periodStart, periodEnd: orig.periodEnd,
    amountCents,
    correctsEventId: orig._id,
    reason,
    createdBy: req.user._id,
  });
  await audit.record({ ...req.auditContext, action: 'billing.event.correct', entityType: 'BillingEvent', entityId: corr._id, reason });
  return ok(res, corr, 201);
}));

router.get('/contracts/:contractId/events', requireCapability('view_financial_sensitive'), wrap(async (req, res) => {
  const items = await BillingEvent.find({ contractId: req.params.contractId }).sort({ createdAt: 1 }).lean();
  return ok(res, items);
}));

router.get('/contracts/:contractId/rules', requireCapability('contract.view.all'), wrap(async (req, res) => {
  const items = await BillingRuleVersion.find({ contractId: req.params.contractId }).sort({ versionNumber: 1 }).lean();
  return ok(res, items);
}));

module.exports = router;
