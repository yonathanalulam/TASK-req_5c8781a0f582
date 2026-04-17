const router = require('express').Router();
const JobRun = require('../models/JobRun');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const runner = require('../jobs/runner');
const audit = require('../services/auditService');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

router.get('/runs', requireCapability('audit.view'), wrap(async (req, res) => {
  const filter = {};
  if (req.query.jobName) filter.jobName = req.query.jobName;
  if (req.query.state) filter.state = req.query.state;
  const items = await JobRun.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return ok(res, items);
}));

const MAP = {
  tag_recompute: runner.tagRecompute,
  reconciliation_overdue: runner.reconciliationOverdueDetector,
  contract_expiration_alerts: runner.expirationAlertRefresh,
  attachment_integrity: runner.attachmentIntegrityCheck,
  audit_retention_report: runner.auditRetentionReport,
  idempotency_cleanup: runner.idempotencyCleanup,
  stalled_sweep: runner.stalledJobSweep,
};

router.post('/run/:name', requireCapability('tag.rule.manage'), wrap(async (req, res) => {
  const fn = MAP[req.params.name];
  if (!fn) return fail(res, 'NOT_FOUND', 'Unknown job', null, 404);
  try {
    const r = await fn();
    await audit.record({ ...req.auditContext, action: 'job.manual_run', diffSummary: { job: req.params.name, result: r } });
    return ok(res, r);
  } catch (e) {
    return fail(res, 'JOB_FAILED', e.message, null, 500);
  }
}));

module.exports = router;
