const router = require('express').Router();
const ServiceCatalogEntry = require('../models/ServiceCatalogEntry');
const ServiceCategory = require('../models/ServiceCategory');
const ServiceTag = require('../models/ServiceTag');
const { requireAuth, requireCapability } = require('../middleware/auth');
const audit = require('../services/auditService');
const { ok, fail } = require('../utils/response');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

router.use(requireAuth);

// List / search
router.get('/services', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const activeOnly = req.query.includeInactive !== 'true';
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = Math.max(parseInt(req.query.skip || '0', 10), 0);
  const filter = {};
  if (activeOnly) filter.active = true;
  if (req.query.category) filter.categoryCode = req.query.category;
  if (req.query.tag) filter.tags = req.query.tag;
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: new RegExp(safe, 'i') },
      { description: new RegExp(safe, 'i') },
      { tags: new RegExp(`^${safe}`, 'i') },
      { code: new RegExp(safe, 'i') },
    ];
  }
  const [items, total, updatedAt] = await Promise.all([
    ServiceCatalogEntry.find(filter).sort({ displayOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
    ServiceCatalogEntry.countDocuments(filter),
    ServiceCatalogEntry.findOne({}).sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ]);
  return ok(res, {
    items, total, limit, skip,
    cachedAt: updatedAt ? updatedAt.updatedAt : null,
  });
}));

router.get('/services/sync', wrap(async (_req, res) => {
  const [services, categories, tags] = await Promise.all([
    ServiceCatalogEntry.find({}).lean(),
    ServiceCategory.find({}).lean(),
    ServiceTag.find({}).lean(),
  ]);
  return ok(res, { services, categories, tags, syncedAt: new Date().toISOString() });
}));

router.get('/categories', wrap(async (_req, res) => {
  return ok(res, await ServiceCategory.find({ active: true }).sort({ displayOrder: 1 }).lean());
}));
router.get('/tags', wrap(async (_req, res) => {
  return ok(res, await ServiceTag.find({ active: true }).sort({ label: 1 }).lean());
}));

// Admin CRUD
router.post('/services', requireCapability('catalog.manage'), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.code || !body.name) return fail(res, 'VALIDATION_ERROR', 'code and name required', null, 422);
  const existing = await ServiceCatalogEntry.findOne({ code: body.code });
  if (existing) return fail(res, 'CONFLICT', 'Service code already exists', null, 409);
  const entry = await ServiceCatalogEntry.create({
    ...body,
    createdBy: req.user._id, updatedBy: req.user._id,
  });
  await audit.record({ ...req.auditContext, action: 'catalog.create', entityType: 'ServiceCatalogEntry', entityId: entry._id, diffSummary: { code: entry.code } });
  return ok(res, entry, 201);
}));

router.put('/services/:id', requireCapability('catalog.manage'), wrap(async (req, res) => {
  const body = req.body || {};
  const current = await ServiceCatalogEntry.findById(req.params.id);
  if (!current) return fail(res, 'NOT_FOUND', 'Service not found', null, 404);
  if (body.version != null && body.version !== current.version) {
    return fail(res, 'CONFLICT', 'Stale record; reload and retry', { currentVersion: current.version }, 409);
  }
  const before = current.toObject();
  for (const k of ['name','description','categoryCode','tags','priceCents','estimatedDurationMinutes','active','displayOrder']) {
    if (k in body) current[k] = body[k];
  }
  current.updatedBy = req.user._id;
  current.updatedAt = new Date();
  current.version = (current.version || 1) + 1;
  await current.save();
  await audit.record({ ...req.auditContext, action: 'catalog.update', entityType: 'ServiceCatalogEntry', entityId: current._id, diffSummary: { before: { active: before.active, priceCents: before.priceCents }, after: { active: current.active, priceCents: current.priceCents } } });
  return ok(res, current);
}));

router.delete('/services/:id', requireCapability('catalog.manage'), wrap(async (req, res) => {
  const current = await ServiceCatalogEntry.findById(req.params.id);
  if (!current) return fail(res, 'NOT_FOUND', 'Service not found', null, 404);
  current.active = false;
  current.updatedAt = new Date();
  current.updatedBy = req.user._id;
  current.version = (current.version || 1) + 1;
  await current.save();
  await audit.record({ ...req.auditContext, action: 'catalog.deactivate', entityType: 'ServiceCatalogEntry', entityId: current._id });
  return ok(res, { deactivated: true });
}));

router.post('/categories', requireCapability('catalog.manage'), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.code || !body.name) return fail(res, 'VALIDATION_ERROR', 'code and name required', null, 422);
  const cat = await ServiceCategory.create(body);
  await audit.record({ ...req.auditContext, action: 'category.create', entityType: 'ServiceCategory', entityId: cat._id });
  return ok(res, cat, 201);
}));
router.post('/tags', requireCapability('catalog.manage'), wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.code || !body.label) return fail(res, 'VALIDATION_ERROR', 'code and label required', null, 422);
  const t = await ServiceTag.create(body);
  await audit.record({ ...req.auditContext, action: 'tag.create', entityType: 'ServiceTag', entityId: t._id });
  return ok(res, t, 201);
}));

module.exports = router;
