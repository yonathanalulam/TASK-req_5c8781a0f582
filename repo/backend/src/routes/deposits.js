const router = require('express').Router();
const LeaseContract = require('../models/LeaseContract');
const DepositLedgerEntry = require('../models/DepositLedgerEntry');
const TerminationReconciliation = require('../models/TerminationReconciliation');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const { encryptField, decryptField } = require('../utils/crypto');
const rbac = require('../services/rbac');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

// Decrypt helpers — privileged callers only. Never return plaintext to unauthorized roles.
async function computeRunningBalance(contractId) {
  const last = await DepositLedgerEntry.findOne({ contractId }).sort({ createdAt: -1 }).lean();
  if (!last || !last.runningBalanceCentsEnc) return 0;
  return parseInt(decryptField(last.runningBalanceCentsEnc), 10);
}

function maskAmount() {
  return '********';
}

router.post('/contracts/:contractId/ledger', requireCapability('deposit.manage'), wrap(async (req, res) => {
  const c = await LeaseContract.findById(req.params.contractId);
  if (!c) return fail(res, 'NOT_FOUND', 'Contract not found', null, 404);
  const { entryType, amountCents, reason, correctsEntryId } = req.body || {};
  if (!['deposit','partial_refund','full_refund','forfeit','correction','adjustment'].includes(entryType))
    return fail(res, 'VALIDATION_ERROR', 'invalid entryType', null, 422);
  if (!Number.isInteger(amountCents)) return fail(res, 'VALIDATION_ERROR', 'amountCents must be integer (cents)', null, 422);
  if (entryType === 'correction' && !correctsEntryId) return fail(res, 'VALIDATION_ERROR', 'correctsEntryId required for correction', null, 422);

  let signed = amountCents;
  if (['partial_refund','full_refund','forfeit'].includes(entryType)) signed = -Math.abs(amountCents);
  if (entryType === 'deposit') signed = Math.abs(amountCents);

  const current = await computeRunningBalance(c._id);
  const newBal = current + signed;
  if (newBal < 0 && entryType !== 'correction') {
    return fail(res, 'VALIDATION_ERROR', 'Deposit balance cannot go below zero without a correction ledger entry', null, 422);
  }

  const entry = await DepositLedgerEntry.create({
    contractId: c._id,
    entryType,
    amountCentsEnc: encryptField(String(signed)),
    runningBalanceCentsEnc: encryptField(String(newBal)),
    reason,
    correctsEntryId,
    createdBy: req.user._id,
  });
  await audit.record({
    ...req.auditContext,
    action: 'deposit.ledger.append',
    entityType: 'DepositLedgerEntry',
    entityId: entry._id,
    // intentionally do NOT include amount in audit diffSummary; amounts are sensitive
    diffSummary: { entryType, contractId: String(c._id) },
  });
  // Response: only return sensitive values if caller has view_financial_sensitive.
  const canUnmask = rbac.hasCapability(req.roles || [], 'view_financial_sensitive');
  return ok(res, {
    id: String(entry._id),
    entryType,
    createdAt: entry.createdAt,
    amountCents: canUnmask ? signed : maskAmount(),
    runningBalanceCents: canUnmask ? newBal : maskAmount(),
  }, 201);
}));

router.get('/contracts/:contractId/ledger', requireCapability('deposit.manage'), wrap(async (req, res) => {
  const items = await DepositLedgerEntry.find({ contractId: req.params.contractId }).sort({ createdAt: 1 }).lean();
  const canUnmask = rbac.hasCapability(req.roles || [], 'view_financial_sensitive');
  const view = items.map(e => ({
    id: String(e._id),
    entryType: e.entryType,
    reason: e.reason,
    correctsEntryId: e.correctsEntryId,
    createdAt: e.createdAt,
    amountCents: canUnmask ? parseInt(decryptField(e.amountCentsEnc), 10) : maskAmount(),
    runningBalanceCents: canUnmask ? parseInt(decryptField(e.runningBalanceCentsEnc), 10) : maskAmount(),
  }));
  return ok(res, view);
}));

router.get('/contracts/:contractId/reconciliation', requireCapability('reconciliation.manage'), wrap(async (req, res) => {
  const r = await TerminationReconciliation.findOne({ contractId: req.params.contractId }).lean();
  if (!r) return fail(res, 'NOT_FOUND', 'No reconciliation workflow', null, 404);
  const canUnmask = rbac.hasCapability(req.roles || [], 'view_financial_sensitive');
  const out = { ...r };
  if (r.finalBalanceCentsEnc && canUnmask) {
    out.finalBalanceCents = parseInt(decryptField(r.finalBalanceCentsEnc), 10);
  } else {
    out.finalBalanceCents = maskAmount();
  }
  delete out.finalBalanceCentsEnc;
  return ok(res, out);
}));

router.post('/contracts/:contractId/reconciliation/complete', requireCapability('reconciliation.manage'), wrap(async (req, res) => {
  const r = await TerminationReconciliation.findOne({ contractId: req.params.contractId });
  if (!r) return fail(res, 'NOT_FOUND', 'No reconciliation workflow', null, 404);
  if (r.status === 'completed') return fail(res, 'INVALID_STATE', 'Already completed', null, 409);
  const finalBalance = await computeRunningBalance(req.params.contractId);
  r.status = 'completed';
  r.completedAt = new Date();
  r.completedBy = req.user._id;
  r.finalBalanceCentsEnc = encryptField(String(finalBalance));
  r.notes = (req.body || {}).notes || null;
  await r.save();
  const c = await LeaseContract.findById(req.params.contractId);
  if (c) { c.status = 'closed'; c.updatedAt = new Date(); c.version = (c.version||1)+1; await c.save(); }
  await audit.record({
    ...req.auditContext,
    action: 'reconciliation.complete',
    entityType: 'TerminationReconciliation',
    entityId: r._id,
    diffSummary: { contractId: String(req.params.contractId) }, // no amounts
  });
  const canUnmask = rbac.hasCapability(req.roles || [], 'view_financial_sensitive');
  const resp = r.toObject();
  resp.finalBalanceCents = canUnmask ? finalBalance : maskAmount();
  delete resp.finalBalanceCentsEnc;
  return ok(res, resp);
}));

module.exports = router;
