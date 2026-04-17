const router = require('express').Router();
const MemberTag = require('../models/MemberTag');
const TagRuleVersion = require('../models/TagRuleVersion');
const TagChangeHistory = require('../models/TagChangeHistory');
const ScopeAssignment = require('../models/ScopeAssignment');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const tagSvc = require('../services/tagService');
const authz = require('../services/authz');

async function resolveTargetUserScopes(userId) {
  const now = new Date();
  const rows = await ScopeAssignment.find({
    userId,
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
  }).lean();
  return rows.map(s => ({ dimension: s.dimension, value: s.value }));
}

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

router.post('/assign', requireCapability('tag.manage'), wrap(async (req, res) => {
  const { userId, tagCode, reason } = req.body || {};
  if (!userId || !tagCode) return fail(res, 'VALIDATION_ERROR', 'userId and tagCode required', null, 422);
  const r = await tagSvc.applyTag({ userId, tagCode, source: 'static', triggeredBy: req.user._id, reason });
  await audit.record({ ...req.auditContext, action: 'tag.assign', entityType: 'MemberTag', entityId: userId, diffSummary: { tagCode, changed: r.changed } });
  return ok(res, r);
}));

router.post('/remove', requireCapability('tag.manage'), wrap(async (req, res) => {
  const { userId, tagCode, reason } = req.body || {};
  if (!userId || !tagCode) return fail(res, 'VALIDATION_ERROR', 'userId and tagCode required', null, 422);
  const r = await tagSvc.removeTag({ userId, tagCode, source: 'static', triggeredBy: req.user._id, reason });
  await audit.record({ ...req.auditContext, action: 'tag.remove', entityType: 'MemberTag', entityId: userId, diffSummary: { tagCode, changed: r.changed } });
  return ok(res, r);
}));

router.get('/user/:userId', wrap(async (req, res) => {
  const targetScopes = await resolveTargetUserScopes(req.params.userId);
  if (!authz.canReadTagsForUser(req, req.params.userId, { targetScopes })) {
    return fail(res, 'FORBIDDEN', 'Not permitted to view tags for this user', null, 403);
  }
  const items = await MemberTag.find({ userId: req.params.userId, active: true }).lean();
  return ok(res, items);
}));

router.get('/history', requireCapability('tag.manage'), wrap(async (req, res) => {
  const filter = {};
  if (req.query.userId) filter.userId = req.query.userId;
  if (req.query.tagCode) filter.tagCode = req.query.tagCode;
  const items = await TagChangeHistory.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return ok(res, items);
}));

router.post('/rules', requireCapability('tag.rule.manage'), wrap(async (req, res) => {
  const { tagCode, ruleType, params, effectiveFrom, active } = req.body || {};
  if (!tagCode || !ruleType) return fail(res, 'VALIDATION_ERROR', 'tagCode and ruleType required', null, 422);
  const last = await TagRuleVersion.findOne({ tagCode }).sort({ versionNumber: -1 });
  if (last && !last.immutable) { last.immutable = true; await last.save(); }
  const rule = await TagRuleVersion.create({
    tagCode, ruleType, params: params || {},
    versionNumber: (last ? last.versionNumber : 0) + 1,
    active: active !== false,
    effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
    createdBy: req.user._id,
  });
  await audit.record({ ...req.auditContext, action: 'tag.rule.create', entityType: 'TagRuleVersion', entityId: rule._id, diffSummary: { tagCode, ruleType } });
  return ok(res, rule, 201);
}));

router.get('/rules', wrap(async (req, res) => {
  const items = await TagRuleVersion.find({}).sort({ tagCode: 1, versionNumber: 1 }).lean();
  return ok(res, items);
}));

router.post('/recompute', requireCapability('tag.rule.manage'), wrap(async (req, res) => {
  const jobRunId = `manual-${Date.now()}`;
  const results = await tagSvc.recomputeAllTags({ jobRunId });
  await audit.record({ ...req.auditContext, action: 'tag.recompute.manual', diffSummary: { results } });
  return ok(res, { jobRunId, results });
}));

router.get('/counts', wrap(async (req, res) => {
  const mode = authz.kpiAccessMode(req);
  if (mode === 'deny') return fail(res, 'FORBIDDEN', 'Not permitted to view tag counts', null, 403);
  const match = { active: true };
  if (mode === 'scoped') {
    const saFilter = authz.scopeAssignmentFilterForReviewer(req);
    if (!saFilter) return fail(res, 'FORBIDDEN', 'No effective scope assigned', null, 403);
    const userIds = await ScopeAssignment.distinct('userId', saFilter);
    match.userId = { $in: userIds };
  }
  const agg = await MemberTag.aggregate([
    { $match: match },
    { $group: { _id: '$tagCode', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return ok(res, agg.map(a => ({ tagCode: a._id, count: a.count })));
}));

module.exports = router;
