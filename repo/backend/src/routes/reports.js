const router = require('express').Router();
const LeaseContract = require('../models/LeaseContract');
const TerminationReconciliation = require('../models/TerminationReconciliation');
const ShoeProfile = require('../models/ShoeProfile');
const ShippingOrder = require('../models/ShippingOrder');
const CustodyEvent = require('../models/CustodyEvent');
const Exception = require('../models/Exception');
const Appeal = require('../models/Appeal');
const MemberTag = require('../models/MemberTag');
const ScopeAssignment = require('../models/ScopeAssignment');
const { requireAuth } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const authz = require('../services/authz');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

async function globalKpis() {
  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() + 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

  const [activeContracts, exp7, exp30, exp90, reconPending, reconOverdue] = await Promise.all([
    LeaseContract.countDocuments({ status: { $in: ['active','amended','pending_renewal','renewed'] } }),
    LeaseContract.countDocuments({ status: { $in: ['active','amended','pending_renewal','renewed'] }, endDate: { $lte: d7, $gte: now } }),
    LeaseContract.countDocuments({ status: { $in: ['active','amended','pending_renewal','renewed'] }, endDate: { $lte: d30, $gte: now } }),
    LeaseContract.countDocuments({ status: { $in: ['active','amended','pending_renewal','renewed'] }, endDate: { $lte: d90, $gte: now } }),
    TerminationReconciliation.countDocuments({ status: 'pending' }),
    TerminationReconciliation.countDocuments({ status: 'overdue' }),
  ]);
  const [shoesDay, shoesWeek] = await Promise.all([
    ShoeProfile.countDocuments({ intakeCompletedAt: { $gte: dayAgo } }),
    ShoeProfile.countDocuments({ intakeCompletedAt: { $gte: weekAgo } }),
  ]);
  const completed = await ShoeProfile.find({ completedAt: { $gte: weekAgo }, intakeCompletedAt: { $ne: null } }).select('intakeCompletedAt completedAt').lean();
  const avgTurnaroundMs = completed.length
    ? Math.round(completed.reduce((a, s) => a + (s.completedAt - s.intakeCompletedAt), 0) / completed.length)
    : null;
  const [deliveredWeek, shippedWeek, failedWeek] = await Promise.all([
    ShippingOrder.countDocuments({ status: { $in: ['delivered','closed'] }, updatedAt: { $gte: weekAgo } }),
    ShippingOrder.countDocuments({ status: { $ne: 'cancelled' }, createdAt: { $gte: weekAgo } }),
    ShippingOrder.countDocuments({ status: { $in: ['delivery_failed','exception_pending_signoff','closed_exception'] }, updatedAt: { $gte: weekAgo } }),
  ]);
  const deliverySuccessRate = shippedWeek ? (deliveredWeek / shippedWeek) : null;
  const exceptionsByType = await Exception.aggregate([{ $group: { _id: '$exceptionType', count: { $sum: 1 } } }]);
  const [appealApproved, appealTotal] = await Promise.all([
    Appeal.countDocuments({ status: 'approved' }),
    Appeal.countDocuments({ status: { $in: ['approved','denied'] } }),
  ]);
  const [scanRejected, scanSuccess] = await Promise.all([
    CustodyEvent.countDocuments({ scanOutcome: 'rejected' }),
    CustodyEvent.countDocuments({ scanOutcome: 'success' }),
  ]);
  const tagCountsAgg = await MemberTag.aggregate([
    { $match: { active: true } },
    { $group: { _id: '$tagCode', count: { $sum: 1 } } },
  ]);
  return {
    scope: 'global',
    activeContracts,
    expiring: { within7Days: exp7, within30Days: exp30, within90Days: exp90 },
    reconciliations: { pending: reconPending, overdue: reconOverdue },
    intake: { last24h: shoesDay, last7days: shoesWeek },
    turnaroundMs: avgTurnaroundMs,
    delivery: { deliveredWeek, shippedWeek, failedWeek, successRate: deliverySuccessRate },
    exceptionsByType: exceptionsByType.reduce((a, e) => ({ ...a, [e._id]: e.count }), {}),
    appealApprovalRate: appealTotal ? appealApproved / appealTotal : null,
    scanCompliance: { success: scanSuccess, rejected: scanRejected, rate: (scanSuccess + scanRejected) ? scanSuccess / (scanSuccess + scanRejected) : null },
    tagCounts: tagCountsAgg.reduce((a, t) => ({ ...a, [t._id]: t.count }), {}),
    generatedAt: new Date().toISOString(),
  };
}

async function scopedKpis(req) {
  const scopeFilter = authz.scopeFilterForReviewer(req);
  if (!scopeFilter) return null; // caller resolves to a deny response
  const saFilter = authz.scopeAssignmentFilterForReviewer(req);

  const now = new Date();
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

  // Pre-resolve the scoped entity sets so shipping/custody/tag aggregates cannot
  // leak data linked to out-of-scope shoes or users.
  const [scopedShoes, scopedUserIds] = await Promise.all([
    ShoeProfile.find(scopeFilter).select('_id').lean(),
    saFilter ? ScopeAssignment.distinct('userId', saFilter) : Promise.resolve([]),
  ]);
  const scopedShoeIds = scopedShoes.map(s => s._id);

  const [shoesDay, shoesWeek] = await Promise.all([
    ShoeProfile.countDocuments({ ...scopeFilter, intakeCompletedAt: { $gte: dayAgo } }),
    ShoeProfile.countDocuments({ ...scopeFilter, intakeCompletedAt: { $gte: weekAgo } }),
  ]);
  const completed = await ShoeProfile.find({ ...scopeFilter, completedAt: { $gte: weekAgo }, intakeCompletedAt: { $ne: null } })
    .select('intakeCompletedAt completedAt').lean();
  const avgTurnaroundMs = completed.length
    ? Math.round(completed.reduce((a, s) => a + (s.completedAt - s.intakeCompletedAt), 0) / completed.length)
    : null;

  const shipBase = { shoeProfileId: { $in: scopedShoeIds } };
  const [deliveredWeek, shippedWeek, failedWeek] = await Promise.all([
    ShippingOrder.countDocuments({ ...shipBase, status: { $in: ['delivered','closed'] }, updatedAt: { $gte: weekAgo } }),
    ShippingOrder.countDocuments({ ...shipBase, status: { $ne: 'cancelled' }, createdAt: { $gte: weekAgo } }),
    ShippingOrder.countDocuments({ ...shipBase, status: { $in: ['delivery_failed','exception_pending_signoff','closed_exception'] }, updatedAt: { $gte: weekAgo } }),
  ]);
  const deliverySuccessRate = shippedWeek ? (deliveredWeek / shippedWeek) : null;

  const exceptionsByType = await Exception.aggregate([
    { $match: scopeFilter },
    { $group: { _id: '$exceptionType', count: { $sum: 1 } } },
  ]);
  const [appealApproved, appealTotal] = await Promise.all([
    Appeal.countDocuments({ ...scopeFilter, status: 'approved' }),
    Appeal.countDocuments({ ...scopeFilter, status: { $in: ['approved','denied'] } }),
  ]);

  const custodyBase = { shoeProfileId: { $in: scopedShoeIds } };
  const [scanRejected, scanSuccess] = await Promise.all([
    CustodyEvent.countDocuments({ ...custodyBase, scanOutcome: 'rejected' }),
    CustodyEvent.countDocuments({ ...custodyBase, scanOutcome: 'success' }),
  ]);

  const tagCountsAgg = await MemberTag.aggregate([
    { $match: { active: true, userId: { $in: scopedUserIds } } },
    { $group: { _id: '$tagCode', count: { $sum: 1 } } },
  ]);

  return {
    scope: 'scoped',
    // Contract/reconciliation records do not carry scope tags in this schema,
    // so scoped reviewers receive null rather than a potentially-misleading global figure.
    activeContracts: null,
    expiring: { within7Days: null, within30Days: null, within90Days: null },
    reconciliations: { pending: null, overdue: null },
    intake: { last24h: shoesDay, last7days: shoesWeek },
    turnaroundMs: avgTurnaroundMs,
    delivery: { deliveredWeek, shippedWeek, failedWeek, successRate: deliverySuccessRate },
    exceptionsByType: exceptionsByType.reduce((a, e) => ({ ...a, [e._id]: e.count }), {}),
    appealApprovalRate: appealTotal ? appealApproved / appealTotal : null,
    scanCompliance: { success: scanSuccess, rejected: scanRejected, rate: (scanSuccess + scanRejected) ? scanSuccess / (scanSuccess + scanRejected) : null },
    tagCounts: tagCountsAgg.reduce((a, t) => ({ ...a, [t._id]: t.count }), {}),
    generatedAt: new Date().toISOString(),
  };
}

router.get('/kpis', wrap(async (req, res) => {
  const mode = authz.kpiAccessMode(req);
  if (mode === 'deny') return fail(res, 'FORBIDDEN', 'Not permitted to view KPIs', null, 403);
  if (mode === 'global') return ok(res, await globalKpis());
  const scoped = await scopedKpis(req);
  if (!scoped) return fail(res, 'FORBIDDEN', 'No effective scope assigned for KPI access', null, 403);
  return ok(res, scoped);
}));

module.exports = router;
