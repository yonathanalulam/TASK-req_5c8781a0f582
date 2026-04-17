const router = require('express').Router();
const multer = require('multer');
const ImportJob = require('../models/ImportJob');
const User = require('../models/User');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const tagSvc = require('../services/tagService');
const { parseCsvToObjects } = require('../utils/csv');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

// Tag import: columns username,tagCode,action(add|remove),reason
router.post('/tags', requireCapability('import.run'), idempotency({ required: false }), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return fail(res, 'VALIDATION_ERROR', 'CSV file required', null, 422);
  const mode = (req.body && req.body.mode) || 'strict';
  let parsed;
  try {
    parsed = parseCsvToObjects(req.file.buffer.toString('utf8'), {
      strictColumns: mode === 'strict',
      expectedColumns: ['username','tagCode','action','reason'],
    });
  } catch (e) {
    return fail(res, e.apiCode || 'VALIDATION_ERROR', e.message, e.details, e.status || 422);
  }
  const job = await ImportJob.create({
    jobType: 'tags', status: 'processing',
    filename: req.file.originalname, mode,
    totalRows: parsed.rows.length, initiatedBy: req.user._id, startedAt: new Date(),
  });
  let success = 0;
  const errors = [];
  for (const { line, values } of parsed.rows) {
    const user = await User.findOne({ username: String(values.username || '').toLowerCase() });
    if (!user) { errors.push({ row: line, field: 'username', issue: 'NOT_FOUND', message: `User ${values.username} not found`, raw: values }); continue; }
    if (!['add','remove'].includes(values.action)) { errors.push({ row: line, field: 'action', issue: 'INVALID', message: 'action must be add|remove', raw: values }); continue; }
    if (!values.tagCode) { errors.push({ row: line, field: 'tagCode', issue: 'REQUIRED', message: 'tagCode required', raw: values }); continue; }
    try {
      if (values.action === 'add') {
        await tagSvc.applyTag({ userId: user._id, tagCode: values.tagCode, source: 'static', triggeredBy: req.user._id, reason: values.reason || 'import' });
      } else {
        await tagSvc.removeTag({ userId: user._id, tagCode: values.tagCode, source: 'static', triggeredBy: req.user._id, reason: values.reason || 'import' });
      }
      success++;
    } catch (e) {
      errors.push({ row: line, field: null, issue: 'EXCEPTION', message: e.message, raw: values });
    }
  }
  job.successCount = success;
  job.failureCount = errors.length;
  job.errors = errors;
  job.status = errors.length === 0 ? 'completed' : (success > 0 ? 'partial' : 'failed');
  job.completedAt = new Date();
  await job.save();
  await audit.record({ ...req.auditContext, action: 'import.tags', entityType: 'ImportJob', entityId: job._id, diffSummary: { success, failed: errors.length } });
  return ok(res, job, 201);
}));

router.get('/', requireCapability('import.run'), wrap(async (_req, res) => {
  const items = await ImportJob.find({}).sort({ createdAt: -1 }).limit(100).lean();
  return ok(res, items);
}));

router.get('/:id', requireCapability('import.run'), wrap(async (req, res) => {
  const j = await ImportJob.findById(req.params.id).lean();
  if (!j) return fail(res, 'NOT_FOUND', 'Import job not found', null, 404);
  return ok(res, j);
}));

module.exports = router;
