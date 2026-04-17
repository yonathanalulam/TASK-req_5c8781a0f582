const router = require('express').Router();
const multer = require('multer');
const ShoeProfile = require('../models/ShoeProfile');
const Attachment = require('../models/Attachment');
const CustodyEvent = require('../models/CustodyEvent');
const ServiceHistory = require('../models/ServiceHistory');
const User = require('../models/User');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const barcode = require('../services/barcodeService');
const attachments = require('../services/attachmentService');
const authz = require('../services/authz');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 } });

router.use(requireAuth);

router.post('/intake', requireCapability('shoe.intake.create'), idempotency({ required: false }), wrap(async (req, res) => {
  const body = req.body || {};
  const { ownerUserId, brand, size, material, color, defectNotes, scopes, allowDuplicateOverride, duplicateOverrideReason } = body;
  if (!ownerUserId || !brand || !size) return fail(res, 'VALIDATION_ERROR', 'ownerUserId, brand, size are required', null, 422);
  if (defectNotes && String(defectNotes).length > 4000) return fail(res, 'VALIDATION_ERROR', 'defectNotes too long', [{ field: 'defectNotes', issue: 'MAX_LENGTH_4000' }], 422);

  const owner = await User.findById(ownerUserId);
  if (!owner) return fail(res, 'VALIDATION_ERROR', 'Owner not found', null, 422);

  // duplicate detection (24 hours)
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const dup = await ShoeProfile.findOne({
    ownerUserId, brand, color, size,
    createdAt: { $gte: since },
    status: { $nin: ['cancelled','closed','closed_exception'] },
  }).lean();
  if (dup && !allowDuplicateOverride) {
    return fail(res, 'DUPLICATE_WARNING', 'Possible duplicate intake in last 24h', { duplicateId: String(dup._id) }, 409);
  }
  if (dup && allowDuplicateOverride && (!duplicateOverrideReason || String(duplicateOverrideReason).trim().length < 3)) {
    return fail(res, 'VALIDATION_ERROR', 'duplicateOverrideReason required', null, 422);
  }

  const serial = barcode.generateSerial();
  const barcodeValue = await barcode.generateUniqueBarcode(ShoeProfile, serial);
  const profile = await ShoeProfile.create({
    serial, barcode: barcodeValue,
    ownerUserId, intakeStaffUserId: req.user._id,
    brand, material, color, size, defectNotes,
    status: 'intake_draft',
    scopes: scopes || [],
  });
  await audit.record({
    ...req.auditContext,
    action: 'shoe.intake.create',
    entityType: 'ShoeProfile',
    entityId: profile._id,
    reason: allowDuplicateOverride ? `duplicate override: ${duplicateOverrideReason}` : undefined,
    diffSummary: { serial, barcode: barcodeValue, ownerUserId: String(ownerUserId) },
  });
  return ok(res, profile, 201);
}));

router.post('/:id/photos', requireCapability('shoe.attachment.upload'), upload.array('photos', 8), wrap(async (req, res) => {
  const profile = await ShoeProfile.findById(req.params.id);
  if (!profile) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (profile.status !== 'intake_draft' && profile.status !== 'intake_completed') {
    return fail(res, 'INVALID_STATE', 'Photos can only be added during intake', null, 409);
  }
  if (!req.files || req.files.length === 0) return fail(res, 'VALIDATION_ERROR', 'At least one file required', null, 422);
  const existing = await Attachment.countDocuments({ ownerType: 'shoe_profile', ownerId: profile._id, context: 'intake_photo', active: true });
  if (existing + req.files.length > 8) return fail(res, 'VALIDATION_ERROR', 'Maximum 8 intake photos per shoe', null, 422);
  const uploaded = [];
  for (const f of req.files) {
    const att = await attachments.storeAttachment({
      buffer: f.buffer,
      declaredContentType: f.mimetype,
      originalFilename: f.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
      ownerType: 'shoe_profile',
      ownerId: profile._id,
      uploaderUserId: req.user._id,
      context: 'intake_photo',
    });
    uploaded.push({ opaqueId: att.opaqueId, sha256: att.sha256, sizeBytes: att.sizeBytes });
  }
  await audit.record({ ...req.auditContext, action: 'shoe.photos.upload', entityType: 'ShoeProfile', entityId: profile._id, diffSummary: { count: uploaded.length } });
  return ok(res, uploaded, 201);
}));

router.post('/:id/complete-intake', requireCapability('shoe.intake.create'), wrap(async (req, res) => {
  const profile = await ShoeProfile.findById(req.params.id);
  if (!profile) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (profile.status !== 'intake_draft') return fail(res, 'INVALID_STATE', 'Shoe is not in intake_draft', null, 409);
  const photos = await Attachment.countDocuments({ ownerType: 'shoe_profile', ownerId: profile._id, context: 'intake_photo', active: true });
  const { zeroPhotoReason } = req.body || {};
  if (photos < 1 && !zeroPhotoReason) return fail(res, 'VALIDATION_ERROR', 'At least one intake photo required (or supply zeroPhotoReason per admin policy)', null, 422);
  profile.status = 'intake_completed';
  profile.intakeCompletedAt = new Date();
  profile.version = (profile.version || 1) + 1;
  profile.updatedAt = new Date();
  await profile.save();
  await CustodyEvent.create({
    shoeProfileId: profile._id, barcode: profile.barcode,
    actorUserId: req.user._id, actorUsername: req.user.username,
    eventType: 'intake_scan', fromState: 'intake_draft', toState: 'intake_completed',
    station: (req.body || {}).station, scanOutcome: 'success',
    manualEntry: false, notes: zeroPhotoReason ? `zero-photo intake: ${zeroPhotoReason}` : null,
  });
  await audit.record({ ...req.auditContext, action: 'shoe.intake.complete', entityType: 'ShoeProfile', entityId: profile._id, reason: zeroPhotoReason });
  return ok(res, profile);
}));

router.get('/label/:id', requireCapability('shoe.intake.create'), wrap(async (req, res) => {
  const profile = await ShoeProfile.findById(req.params.id).lean();
  if (!profile) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (!authz.canViewShoe(req, profile)) return fail(res, 'FORBIDDEN', 'Not permitted to view', null, 403);
  const reprint = Boolean(req.query.reprint);
  await audit.record({
    ...req.auditContext,
    action: reprint ? 'shoe.label.reprint' : 'shoe.label.print',
    entityType: 'ShoeProfile',
    entityId: profile._id,
    diffSummary: { serial: profile.serial, barcode: profile.barcode },
  });
  return ok(res, {
    shoeId: String(profile._id),
    serial: profile.serial,
    barcode: profile.barcode,
    brand: profile.brand,
    color: profile.color,
    size: profile.size,
    ownerUserId: String(profile.ownerUserId),
    printedAt: new Date().toISOString(),
    reprint,
    labelText: `${profile.serial} | ${profile.barcode}`,
  });
}));

router.get('/:id/history', wrap(async (req, res) => {
  const profile = await ShoeProfile.findById(req.params.id).lean();
  if (!profile) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (!authz.canViewShoe(req, profile)) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  const history = await ServiceHistory.find({ shoeProfileId: profile._id }).sort({ completedAt: 1, createdAt: 1 }).lean();
  return ok(res, { items: history, total: history.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const profile = await ShoeProfile.findById(req.params.id).lean();
  if (!profile) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (!authz.canViewShoe(req, profile)) return fail(res, 'FORBIDDEN', 'Not permitted to view', null, 403);
  const events = await CustodyEvent.find({ shoeProfileId: profile._id }).sort({ timestamp: 1 }).lean();
  const atts = await Attachment.find({ ownerType: 'shoe_profile', ownerId: profile._id, active: true }).select('opaqueId contentType sha256 context sizeBytes createdAt').lean();
  const history = await ServiceHistory.find({ shoeProfileId: profile._id }).sort({ completedAt: 1, createdAt: 1 }).lean();
  return ok(res, { profile, events, attachments: atts, history });
}));

router.get('/', wrap(async (req, res) => {
  const base = {};
  if (req.query.ownerUserId) base.ownerUserId = req.query.ownerUserId;
  if (req.query.status) base.status = req.query.status;
  if (req.query.barcode) base.barcode = req.query.barcode;
  if (req.query.serial) base.serial = req.query.serial;
  const scopeFilter = authz.listFilterFor(req, 'shoe');
  const filter = Object.keys(scopeFilter).length ? { $and: [base, scopeFilter] } : base;
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = parseInt(req.query.skip || '0', 10);
  const [items, total] = await Promise.all([
    ShoeProfile.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ShoeProfile.countDocuments(filter),
  ]);
  // Defense-in-depth: also post-filter via object-level policy so empty-scope records
  // cannot accidentally surface to scoped reviewers via the base filter.
  const visible = items.filter(p => authz.canViewShoe(req, p));
  return ok(res, { items: visible, total, limit, skip });
}));

router.get('/attachments/:opaqueId', wrap(async (req, res) => {
  const att = await Attachment.findOne({ opaqueId: req.params.opaqueId, active: true }).lean();
  if (!att) return fail(res, 'NOT_FOUND', 'Attachment not found', null, 404);
  if (att.ownerType === 'shoe_profile') {
    const profile = await ShoeProfile.findById(att.ownerId).lean();
    if (!profile || !authz.canViewShoe(req, profile)) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  } else if (att.ownerType === 'appeal') {
    const Appeal = require('../models/Appeal');
    const Exception = require('../models/Exception');
    const appeal = await Appeal.findById(att.ownerId).lean();
    const exception = appeal ? await Exception.findById(appeal.exceptionId).lean() : null;
    if (!appeal || !authz.canViewAppeal(req, appeal, { exception })) return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  } else {
    // Unknown attachment owner types are denied by default.
    return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  }
  const fs = require('fs');
  if (!fs.existsSync(att.storagePath)) return fail(res, 'NOT_FOUND', 'File missing on disk', null, 410);
  await audit.record({ ...req.auditContext, action: 'attachment.read', entityType: 'Attachment', entityId: att.opaqueId });
  res.setHeader('Content-Type', att.contentType);
  res.setHeader('Content-Length', att.sizeBytes);
  res.setHeader('X-Content-SHA256', att.sha256);
  return fs.createReadStream(att.storagePath).pipe(res);
}));

module.exports = router;
