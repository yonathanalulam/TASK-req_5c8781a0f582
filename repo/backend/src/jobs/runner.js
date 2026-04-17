const JobRun = require('../models/JobRun');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const Attachment = require('../models/Attachment');
const LeaseContract = require('../models/LeaseContract');
const TerminationReconciliation = require('../models/TerminationReconciliation');
const BillingRuleVersion = require('../models/BillingRuleVersion');
const tagSvc = require('../services/tagService');
const { verifyIntegrity } = require('../services/attachmentService');
const audit = require('../services/auditService');
const AuditLog = require('../models/AuditLog');

const STALLED_MS = 15 * 60 * 1000;

async function beginJob(jobName, maxAttempts = 3) {
  const run = await JobRun.create({
    jobName, state: 'running', attempt: 1,
    startedAt: new Date(), lastHeartbeatAt: new Date(), maxAttempts,
  });
  return run;
}

async function finishJob(run, { state = 'succeeded', error = null, summary = null } = {}) {
  run.state = state; run.endedAt = new Date(); run.error = error; run.summary = summary;
  await run.save();
}

async function tagRecompute() {
  const run = await beginJob('tag_recompute');
  try {
    const results = await tagSvc.recomputeAllTags({ jobRunId: String(run._id) });
    await finishJob(run, { state: 'succeeded', summary: { results } });
    await audit.record({ action: 'job.tag_recompute', actorUsername: 'job_runner', diffSummary: { results } });
    return { runId: String(run._id), results };
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
    throw e;
  }
}

async function reconciliationOverdueDetector() {
  const run = await beginJob('reconciliation_overdue');
  try {
    const now = new Date();
    const pending = await TerminationReconciliation.find({ status: 'pending', dueAt: { $lt: now } });
    let flagged = 0;
    for (const r of pending) {
      r.status = 'overdue';
      await r.save();
      const c = await LeaseContract.findById(r.contractId);
      if (c && c.status === 'reconciliation_pending') {
        c.status = 'reconciliation_overdue';
        await c.save();
      }
      await audit.record({ action: 'job.reconciliation_overdue', actorUsername: 'job_runner', entityType: 'TerminationReconciliation', entityId: r._id });
      flagged++;
    }
    await finishJob(run, { state: 'succeeded', summary: { flagged } });
    return { runId: String(run._id), flagged };
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
    throw e;
  }
}

async function expirationAlertRefresh() {
  const run = await beginJob('contract_expiration_alerts');
  try {
    const now = new Date();
    const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
    const contracts = await LeaseContract.find({
      status: { $in: ['active','amended','pending_renewal','renewed'] },
      endDate: { $gte: now, $lte: d90 },
    }).select('contractNumber facilityUnit endDate').lean();
    const buckets = { within7Days: [], within30Days: [], within90Days: [] };
    for (const c of contracts) {
      const daysLeft = Math.ceil((c.endDate - now) / (24 * 3600 * 1000));
      if (daysLeft <= 7) buckets.within7Days.push(c);
      else if (daysLeft <= 30) buckets.within30Days.push(c);
      else buckets.within90Days.push(c);
    }
    await finishJob(run, { state: 'succeeded', summary: {
      within7: buckets.within7Days.length,
      within30: buckets.within30Days.length,
      within90: buckets.within90Days.length,
    } });
    return { runId: String(run._id), buckets };
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
    throw e;
  }
}

async function attachmentIntegrityCheck() {
  const run = await beginJob('attachment_integrity');
  try {
    const atts = await Attachment.find({ active: true }).limit(500);
    const counts = { ok: 0, corrupt: 0, missing: 0 };
    for (const a of atts) {
      const r = await verifyIntegrity(a);
      counts[r] = (counts[r] || 0) + 1;
      if (r !== 'ok') {
        await audit.record({ action: 'attachment.integrity_warning', actorUsername: 'job_runner', entityType: 'Attachment', entityId: a.opaqueId, outcome: 'failure', reason: r });
      }
    }
    await finishJob(run, { state: 'succeeded', summary: counts });
    return { runId: String(run._id), counts };
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
    throw e;
  }
}

async function auditRetentionReport() {
  const run = await beginJob('audit_retention_report');
  try {
    const cutoff = new Date(Date.now() - 7 * 365 * 24 * 3600 * 1000);
    const eligibleCount = await AuditLog.countDocuments({ timestamp: { $lt: cutoff } });
    // We never purge audit logs; we just report beyond-retention rows for operator review.
    await finishJob(run, { state: 'succeeded', summary: { eligibleForReview: eligibleCount } });
    return { eligibleCount };
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
    throw e;
  }
}

async function idempotencyCleanup() {
  const run = await beginJob('idempotency_cleanup');
  try {
    const now = new Date();
    const r = await IdempotencyRecord.deleteMany({ expiresAt: { $lt: now } });
    await finishJob(run, { state: 'succeeded', summary: { deleted: r.deletedCount } });
  } catch (e) {
    await finishJob(run, { state: 'failed', error: e.message });
  }
}

async function stalledJobSweep() {
  const cutoff = new Date(Date.now() - STALLED_MS);
  const running = await JobRun.find({ state: 'running', lastHeartbeatAt: { $lt: cutoff } });
  for (const r of running) {
    r.state = r.attempt >= r.maxAttempts ? 'dead_letter' : 'stalled';
    await r.save();
    await audit.record({ action: 'job.stalled', actorUsername: 'job_runner', entityType: 'JobRun', entityId: r._id });
  }
  return running.length;
}

module.exports = {
  tagRecompute, reconciliationOverdueDetector, expirationAlertRefresh,
  attachmentIntegrityCheck, auditRetentionReport, idempotencyCleanup, stalledJobSweep,
};
