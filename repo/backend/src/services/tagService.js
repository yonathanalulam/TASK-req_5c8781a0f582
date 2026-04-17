const MemberTag = require('../models/MemberTag');
const TagChangeHistory = require('../models/TagChangeHistory');
const TagRuleVersion = require('../models/TagRuleVersion');
const Exception = require('../models/Exception');

async function applyTag({ userId, tagCode, source, ruleVersionId, triggeredBy, jobRunId, reason }) {
  const existing = await MemberTag.findOne({ userId, tagCode, active: true });
  if (existing) return { changed: false, existingId: existing._id };
  const mt = await MemberTag.create({ userId, tagCode, source, ruleVersionId, assignedBy: triggeredBy });
  await TagChangeHistory.create({ userId, tagCode, action: 'add', source, ruleVersionId, triggeredBy, jobRunId, reason });
  return { changed: true, tagId: mt._id };
}

async function removeTag({ userId, tagCode, source, ruleVersionId, triggeredBy, jobRunId, reason }) {
  const existing = await MemberTag.findOne({ userId, tagCode, active: true });
  if (!existing) return { changed: false };
  existing.active = false;
  existing.removedAt = new Date();
  await existing.save();
  await TagChangeHistory.create({ userId, tagCode, action: 'remove', source, ruleVersionId, triggeredBy, jobRunId, reason });
  return { changed: true, tagId: existing._id };
}

// Evaluate one rule against all candidate users and ensure tag membership matches result.
async function evaluateRule(rule, { jobRunId }) {
  let added = 0, removed = 0;
  if (rule.ruleType === 'exception_count_rolling') {
    const { windowDays = 14, minCount = 3, exceptionTypes = null } = rule.params || {};
    const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
    const match = { createdAt: { $gte: cutoff } };
    if (exceptionTypes) match.exceptionType = { $in: exceptionTypes };
    const agg = await Exception.aggregate([
      { $match: match },
      { $match: { subjectUserId: { $ne: null } } },
      { $group: { _id: '$subjectUserId', count: { $sum: 1 } } },
      { $match: { count: { $gte: minCount } } },
    ]);
    const eligible = new Set(agg.map(a => String(a._id)));
    // Add to eligible
    for (const uid of eligible) {
      const r = await applyTag({ userId: uid, tagCode: rule.tagCode, source: 'computed', ruleVersionId: rule._id, jobRunId, reason: `rule ${rule.ruleType}` });
      if (r.changed) added++;
    }
    // Remove from no-longer-eligible (computed only)
    const activeTags = await MemberTag.find({ tagCode: rule.tagCode, active: true, source: 'computed' }).lean();
    for (const t of activeTags) {
      if (!eligible.has(String(t.userId))) {
        const r = await removeTag({ userId: t.userId, tagCode: rule.tagCode, source: 'computed', ruleVersionId: rule._id, jobRunId, reason: 'no longer eligible' });
        if (r.changed) removed++;
      }
    }
  }
  return { added, removed };
}

async function recomputeAllTags({ jobRunId }) {
  const rules = await TagRuleVersion.find({ active: true }).lean();
  const results = [];
  for (const r of rules) results.push({ rule: r.tagCode, ...(await evaluateRule(r, { jobRunId })) });
  return results;
}

module.exports = { applyTag, removeTag, evaluateRule, recomputeAllTags };
