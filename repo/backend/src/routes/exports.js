const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const ExportJob = require('../models/ExportJob');
const LeaseContract = require('../models/LeaseContract');
const Exception = require('../models/Exception');
const Appeal = require('../models/Appeal');
const ShippingOrder = require('../models/ShippingOrder');
const MemberTag = require('../models/MemberTag');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const audit = require('../services/auditService');
const { objectsToCsv } = require('../utils/csv');
const { sha256Hex } = require('../utils/crypto');
const rbac = require('../services/rbac');
const env = require('../config/env');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

function ensureExportDir() {
  const d = path.resolve(env.exportDir);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// Default-deny unmasking. Caller must hold the `unmask_export` capability
// AND explicitly request `unmask: true`. This replaces the prior raw role-string check.
function resolveUnmask(req) {
  const requested = !!(req.body || {}).unmask;
  if (!requested) return false;
  if (!rbac.hasCapability(req.roles || [], 'unmask_export')) return false;
  return true;
}

async function writeExport({ jobType, columns, rows, user, unmasked, scope }) {
  const csv = objectsToCsv(rows, columns);
  const filename = `${jobType}-${Date.now()}.csv`;
  const filePath = path.join(ensureExportDir(), filename);
  fs.writeFileSync(filePath, csv);
  const checksum = sha256Hex(csv);
  const job = await ExportJob.create({
    jobType, requestedBy: user._id, requestedByUsername: user.username,
    scope, filePath, filename, checksum, sizeBytes: Buffer.byteLength(csv),
    recordCount: rows.length, generatedAt: new Date(),
    unmasked, status: 'completed',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  return job;
}

function maskField(val) { return val == null ? '' : '********'; }

router.post('/contracts', requireCapability('export.all'), wrap(async (req, res) => {
  const unmasked = resolveUnmask(req);
  const items = await LeaseContract.find({}).lean();
  const rows = items.map(c => ({
    contractNumber: c.contractNumber,
    facilityUnit: c.facilityUnit,
    lessor: unmasked ? c.lessorName : maskField(c.lessorName),
    lessee: unmasked ? c.lesseeName : maskField(c.lesseeName),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    status: c.status,
    terminationEffectiveDate: c.terminationEffectiveDate ? c.terminationEffectiveDate.toISOString() : '',
  }));
  const job = await writeExport({
    jobType: 'contracts',
    columns: ['contractNumber','facilityUnit','lessor','lessee','startDate','endDate','status','terminationEffectiveDate'],
    rows, user: req.user, unmasked, scope: 'all',
  });
  await audit.record({
    ...req.auditContext,
    action: unmasked ? 'export.contracts.unmasked' : 'export.contracts',
    entityType: 'ExportJob', entityId: job._id,
    reason: unmasked ? (req.body && req.body.reason) || 'unmask requested' : null,
    diffSummary: { recordCount: rows.length, unmasked },
  });
  return ok(res, job, 201);
}));

router.post('/tags', requireCapability('export.all'), wrap(async (req, res) => {
  const items = await MemberTag.find({ active: true }).populate('userId', 'username').lean();
  const rows = items.map(t => ({
    username: t.userId && t.userId.username ? t.userId.username : '',
    tagCode: t.tagCode,
    source: t.source,
    assignedAt: t.assignedAt ? t.assignedAt.toISOString() : '',
  }));
  const job = await writeExport({
    jobType: 'tags', columns: ['username','tagCode','source','assignedAt'],
    rows, user: req.user, unmasked: false, scope: 'all',
  });
  await audit.record({ ...req.auditContext, action: 'export.tags', entityType: 'ExportJob', entityId: job._id, diffSummary: { recordCount: rows.length } });
  return ok(res, job, 201);
}));

router.post('/exceptions', requireCapability('export.all'), wrap(async (req, res) => {
  const items = await Exception.find({}).lean();
  const rows = items.map(e => ({
    id: String(e._id), type: e.exceptionType, status: e.status,
    summary: e.summary, subjectUserId: e.subjectUserId ? String(e.subjectUserId) : '',
    createdAt: e.createdAt.toISOString(),
  }));
  const job = await writeExport({
    jobType: 'exceptions', columns: ['id','type','status','summary','subjectUserId','createdAt'],
    rows, user: req.user, unmasked: false, scope: 'all',
  });
  await audit.record({ ...req.auditContext, action: 'export.exceptions', entityType: 'ExportJob', entityId: job._id });
  return ok(res, job, 201);
}));

router.post('/appeals', requireCapability('export.all'), wrap(async (req, res) => {
  const items = await Appeal.find({}).lean();
  const rows = items.map(a => ({
    id: String(a._id), exceptionId: String(a.exceptionId),
    appellantUserId: String(a.appellantUserId), status: a.status,
    submittedAt: a.submittedAt ? a.submittedAt.toISOString() : '',
    closedAt: a.closedAt ? a.closedAt.toISOString() : '',
  }));
  const job = await writeExport({
    jobType: 'appeals', columns: ['id','exceptionId','appellantUserId','status','submittedAt','closedAt'],
    rows, user: req.user, unmasked: false, scope: 'all',
  });
  await audit.record({ ...req.auditContext, action: 'export.appeals', entityType: 'ExportJob', entityId: job._id });
  return ok(res, job, 201);
}));

router.post('/shipping', requireCapability('export.all'), wrap(async (req, res) => {
  const items = await ShippingOrder.find({}).lean();
  const rows = items.map(o => ({
    id: String(o._id), shoeProfileId: String(o.shoeProfileId),
    status: o.status, method: o.method,
    createdAt: o.createdAt.toISOString(),
  }));
  const job = await writeExport({
    jobType: 'shipping', columns: ['id','shoeProfileId','status','method','createdAt'],
    rows, user: req.user, unmasked: false, scope: 'all',
  });
  await audit.record({ ...req.auditContext, action: 'export.shipping', entityType: 'ExportJob', entityId: job._id });
  return ok(res, job, 201);
}));

router.get('/', requireCapability('export.all'), wrap(async (req, res) => {
  const filter = {};
  if (!rbac.hasCapability(req.roles || [], 'export.all')) filter.requestedBy = req.user._id;
  const items = await ExportJob.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return ok(res, items);
}));

router.get('/:id/download', requireCapability('export.all'), wrap(async (req, res) => {
  const job = await ExportJob.findById(req.params.id);
  if (!job) return fail(res, 'NOT_FOUND', 'Export job not found', null, 404);
  if (String(job.requestedBy) !== String(req.user._id) && !rbac.hasCapability(req.roles || [], 'export.all')) {
    return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  }
  if (!fs.existsSync(job.filePath)) return fail(res, 'NOT_FOUND', 'Export file missing', null, 410);
  job.accessLog.push({ accessedAt: new Date(), byUserId: req.user._id });
  await job.save();
  await audit.record({ ...req.auditContext, action: 'export.download', entityType: 'ExportJob', entityId: job._id });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
  res.setHeader('X-Export-Checksum', job.checksum);
  return fs.createReadStream(job.filePath).pipe(res);
}));

module.exports = router;
