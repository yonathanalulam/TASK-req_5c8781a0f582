const router = require('express').Router();
const multer = require('multer');
const ShippingOrder = require('../models/ShippingOrder');
const ProofOfDelivery = require('../models/ProofOfDelivery');
const DeliveryException = require('../models/DeliveryException');
const ShoeProfile = require('../models/ShoeProfile');
const SavedAddress = require('../models/SavedAddress');
const Attachment = require('../models/Attachment');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { ok, fail } = require('../utils/response');
const { idempotency } = require('../middleware/idempotency');
const audit = require('../services/auditService');
const sm = require('../services/shippingStateMachine');
const attachments = require('../services/attachmentService');
const authz = require('../services/authz');
const serviceHistory = require('../services/serviceHistoryService');

function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

router.post('/', requireCapability('shipping.create'), idempotency({ required: false }), wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.shoeProfileId || !b.addressId || !b.fulfillmentOperator)
    return fail(res, 'VALIDATION_ERROR', 'shoeProfileId, addressId, fulfillmentOperator required', null, 422);
  const shoe = await ShoeProfile.findById(b.shoeProfileId);
  if (!shoe) return fail(res, 'NOT_FOUND', 'Shoe not found', null, 404);
  if (!['ready_for_delivery','shipping_prepared'].includes(shoe.status))
    return fail(res, 'INVALID_STATE', `Shoe must be ready_for_delivery (is ${shoe.status})`, null, 409);
  const addr = await SavedAddress.findById(b.addressId);
  if (!addr) return fail(res, 'NOT_FOUND', 'Address not found', null, 404);
  if (addr.country !== 'US') return fail(res, 'VALIDATION_ERROR', 'US addresses only', null, 422);
  const order = await ShippingOrder.create({
    shoeProfileId: shoe._id, addressId: addr._id,
    fulfillmentOperator: b.fulfillmentOperator,
    method: b.method || 'standard',
    status: b.offline ? 'queued_offline' : 'draft',
    offlineCreatedAt: b.offline ? new Date(b.offlineCreatedAt || Date.now()) : null,
    syncedAt: new Date(),
    createdBy: req.user._id,
  });
  await audit.record({ ...req.auditContext, action: 'shipping.create', entityType: 'ShippingOrder', entityId: order._id, diffSummary: { shoeProfileId: String(shoe._id) } });
  return ok(res, order, 201);
}));

router.post('/:id/transition', requireCapability('shipping.fulfill'), wrap(async (req, res) => {
  const { to } = req.body || {};
  const order = await ShippingOrder.findById(req.params.id);
  if (!order) return fail(res, 'NOT_FOUND', 'Shipping order not found', null, 404);
  if (!sm.canTransition(order.status, to)) return fail(res, 'ILLEGAL_TRANSITION', `Cannot ${order.status} -> ${to}`, null, 409);
  // Prevent delivered without POD
  if (to === 'closed' && order.status === 'delivered') {
    const pod = await ProofOfDelivery.findOne({ shippingOrderId: order._id });
    if (!pod) return fail(res, 'VALIDATION_ERROR', 'Proof of delivery required before close', null, 422);
  }
  order.status = to;
  order.updatedAt = new Date();
  order.version = (order.version||1) + 1;
  await order.save();
  await audit.record({ ...req.auditContext, action: 'shipping.transition', entityType: 'ShippingOrder', entityId: order._id, diffSummary: { to } });
  return ok(res, order);
}));

router.post('/:id/proof-of-delivery', requireCapability('delivery.proof.capture'), upload.single('signature'), wrap(async (req, res) => {
  const order = await ShippingOrder.findById(req.params.id);
  if (!order) return fail(res, 'NOT_FOUND', 'Shipping order not found', null, 404);
  const b = req.body || {};
  const override = !!b.overrideApproval;
  if (!override && !req.file) return fail(res, 'VALIDATION_ERROR', 'signature file required (unless admin override)', null, 422);
  if (override && !b.overrideReason) return fail(res, 'VALIDATION_ERROR', 'overrideReason required for override', null, 422);
  if (override && !(req.roles||[]).includes('department_admin'))
    return fail(res, 'FORBIDDEN', 'Only department_admin can approve POD override', null, 403);

  if (!sm.canTransition(order.status, 'delivered'))
    return fail(res, 'ILLEGAL_TRANSITION', `Cannot mark delivered from ${order.status}`, null, 409);

  let sigAtt = null;
  if (req.file) {
    sigAtt = await attachments.storeAttachment({
      buffer: req.file.buffer,
      declaredContentType: req.file.mimetype,
      originalFilename: req.file.originalname,
      maxSizeBytes: 5 * 1024 * 1024,
      ownerType: 'proof_of_delivery',
      ownerId: order._id,
      uploaderUserId: req.user._id,
      context: 'pod_signature',
    });
  }
  const pod = await ProofOfDelivery.create({
    shippingOrderId: order._id,
    signatureAttachmentId: sigAtt ? sigAtt._id : null,
    deliveredAt: b.deliveredAt ? new Date(b.deliveredAt) : new Date(),
    recipientName: b.recipientName,
    operatorUserId: req.user._id,
    operatorUsername: req.user.username,
    notes: b.notes,
    overrideApprovalBy: override ? req.user._id : null,
    overrideReason: override ? b.overrideReason : null,
  });
  order.status = 'delivered';
  order.updatedAt = new Date();
  order.version = (order.version||1) + 1;
  await order.save();
  // Also update the underlying shoe profile
  const shoe = await ShoeProfile.findById(order.shoeProfileId);
  if (shoe) {
    shoe.previousStatus = shoe.status;
    shoe.status = 'delivered';
    shoe.updatedAt = new Date();
    shoe.version = (shoe.version||1) + 1;
    shoe.completedAt = new Date();
    await shoe.save();
    await serviceHistory.recordCompletion(shoe, { outcome: 'delivered' });
  }
  await audit.record({
    ...req.auditContext,
    action: 'delivery.proof_capture',
    entityType: 'ProofOfDelivery',
    entityId: pod._id,
    reason: override ? `override: ${b.overrideReason}` : undefined,
  });
  return ok(res, pod, 201);
}));

router.post('/:id/delivery-failed', requireCapability('shipping.fulfill'), wrap(async (req, res) => {
  const { reasonCode, remediationSteps } = req.body || {};
  if (!reasonCode) return fail(res, 'VALIDATION_ERROR', 'reasonCode required', null, 422);
  const order = await ShippingOrder.findById(req.params.id);
  if (!order) return fail(res, 'NOT_FOUND', 'Shipping order not found', null, 404);
  if (!sm.canTransition(order.status, 'delivery_failed'))
    return fail(res, 'ILLEGAL_TRANSITION', `Cannot mark delivery_failed from ${order.status}`, null, 409);
  order.status = 'delivery_failed';
  order.updatedAt = new Date();
  order.exceptionNote = reasonCode;
  await order.save();
  const ex = await DeliveryException.create({
    shippingOrderId: order._id, reasonCode, remediationSteps, createdBy: req.user._id,
  });
  order.status = 'exception_pending_signoff';
  await order.save();
  await audit.record({ ...req.auditContext, action: 'delivery.failed', entityType: 'DeliveryException', entityId: ex._id, diffSummary: { reasonCode } });
  return ok(res, { order, exception: ex });
}));

router.post('/:id/delivery-exception/signoff', requireCapability('delivery.exception.signoff'), wrap(async (req, res) => {
  const { exceptionId, notes, followUpStatus } = req.body || {};
  const ex = await DeliveryException.findById(exceptionId);
  if (!ex) return fail(res, 'NOT_FOUND', 'Delivery exception not found', null, 404);
  const order = await ShippingOrder.findById(ex.shippingOrderId);
  if (!order) return fail(res, 'NOT_FOUND', 'Shipping order not found', null, 404);
  ex.signedOffBy = req.user._id;
  ex.signedOffAt = new Date();
  ex.remediationSteps = (ex.remediationSteps || '') + (notes ? `\n${notes}` : '');
  await ex.save();
  const target = followUpStatus || 'returned';
  if (!sm.canTransition(order.status, target))
    return fail(res, 'ILLEGAL_TRANSITION', `Cannot transition to ${target}`, null, 409);
  order.status = target;
  order.updatedAt = new Date();
  await order.save();
  await audit.record({ ...req.auditContext, action: 'delivery.exception.signoff', entityType: 'DeliveryException', entityId: ex._id, diffSummary: { followUpStatus: target } });
  return ok(res, { order, exception: ex });
}));

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.shoeProfileId) filter.shoeProfileId = req.query.shoeProfileId;
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = parseInt(req.query.skip || '0', 10);
  const ordersRaw = await ShippingOrder.find(filter).sort({ createdAt: -1 }).lean();
  const shoeIds = [...new Set(ordersRaw.map(o => String(o.shoeProfileId)))];
  const shoes = await ShoeProfile.find({ _id: { $in: shoeIds } }).lean();
  const shoeById = new Map(shoes.map(s => [String(s._id), s]));
  const allowed = ordersRaw.filter(o => {
    const shoe = shoeById.get(String(o.shoeProfileId));
    return shoe && authz.canViewShippingOrder(req, o, { shoe });
  });
  const page = allowed.slice(skip, skip + limit);
  return ok(res, { items: page, total: allowed.length, limit, skip });
}));

router.get('/:id', wrap(async (req, res) => {
  const o = await ShippingOrder.findById(req.params.id).lean();
  if (!o) return fail(res, 'NOT_FOUND', 'Shipping order not found', null, 404);
  const shoe = await ShoeProfile.findById(o.shoeProfileId).lean();
  if (!authz.canViewShippingOrder(req, o, { shoe })) {
    return fail(res, 'FORBIDDEN', 'Not permitted', null, 403);
  }
  const [pod, exceptions] = await Promise.all([
    ProofOfDelivery.findOne({ shippingOrderId: o._id }).lean(),
    DeliveryException.find({ shippingOrderId: o._id }).lean(),
  ]);
  return ok(res, { order: o, proofOfDelivery: pod, deliveryExceptions: exceptions });
}));

module.exports = router;
