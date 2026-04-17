const router = require('express').Router();
const SavedAddress = require('../models/SavedAddress');
const { requireAuth } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { encryptField, decryptField } = require('../utils/crypto');
const audit = require('../services/auditService');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
router.use(requireAuth);

function maskPreview(a) {
  const postal = a.postalCode || '';
  const state = a.state || '';
  const masked = `***, ***, ${state} ${postal.slice(-5)}`.trim();
  return masked;
}

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.label || !b.line1 || !b.city || !b.state || !b.postalCode)
    return fail(res, 'VALIDATION_ERROR', 'label, line1, city, state, postalCode required', null, 422);
  if ((b.country || 'US') !== 'US') return fail(res, 'VALIDATION_ERROR', 'US addresses only', null, 422);
  if (!/^\d{5}(-\d{4})?$/.test(String(b.postalCode))) return fail(res, 'VALIDATION_ERROR', 'Invalid US postal code', null, 422);
  const addr = await SavedAddress.create({
    ownerUserId: req.user._id,
    label: b.label,
    country: 'US',
    line1Enc: encryptField(b.line1),
    line2Enc: b.line2 ? encryptField(b.line2) : undefined,
    cityEnc: encryptField(b.city),
    stateEnc: encryptField(b.state),
    postalCodeEnc: encryptField(b.postalCode),
    maskedPreview: maskPreview({ state: b.state, postalCode: b.postalCode }),
  });
  await audit.record({ ...req.auditContext, action: 'address.create', entityType: 'SavedAddress', entityId: addr._id });
  return ok(res, { id: String(addr._id), label: addr.label, maskedPreview: addr.maskedPreview }, 201);
}));

router.get('/', wrap(async (req, res) => {
  const items = await SavedAddress.find({ ownerUserId: req.user._id, active: true }).lean();
  // Owner can see their own unmasked; otherwise return masked list.
  const out = items.map(a => ({
    id: String(a._id), label: a.label,
    line1: decryptField(a.line1Enc),
    line2: a.line2Enc ? decryptField(a.line2Enc) : null,
    city: decryptField(a.cityEnc),
    state: decryptField(a.stateEnc),
    postalCode: decryptField(a.postalCodeEnc),
    maskedPreview: a.maskedPreview,
  }));
  return ok(res, out);
}));

// Explicit policy: only the owner or an explicitly authorized role (department_admin,
// security_admin, operations_staff for shipping need-to-know) may read a saved address
// by id. Unauthorized IDs return 404 — identical to nonexistent ids — to prevent
// existence-enumeration via metadata response differences.
function canReadAddress(req, a) {
  if (!a) return false;
  if (String(a.ownerUserId) === String(req.user._id)) return true;
  const roles = req.roles || [];
  return roles.some(r => ['department_admin', 'security_admin', 'operations_staff'].includes(r));
}

router.get('/:id', wrap(async (req, res) => {
  const a = await SavedAddress.findById(req.params.id).lean();
  if (!a || !canReadAddress(req, a)) {
    return fail(res, 'NOT_FOUND', 'Address not found', null, 404);
  }
  return ok(res, {
    id: String(a._id), label: a.label,
    line1: decryptField(a.line1Enc),
    line2: a.line2Enc ? decryptField(a.line2Enc) : null,
    city: decryptField(a.cityEnc),
    state: decryptField(a.stateEnc),
    postalCode: decryptField(a.postalCodeEnc),
    maskedPreview: a.maskedPreview,
  });
}));

module.exports = router;
