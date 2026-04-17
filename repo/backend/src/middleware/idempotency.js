const crypto = require('crypto');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const { fail } = require('../utils/response');

const WINDOW_MS = 7 * 24 * 3600 * 1000;

function hashPayload(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

function idempotency({ required = false } = {}) {
  return async function (req, res, next) {
    const key = req.headers['idempotency-key'];
    if (!key) {
      if (required) return fail(res, 'VALIDATION_ERROR', 'Idempotency-Key header required', null, 422);
      return next();
    }
    const payloadHash = hashPayload(req.body);
    const existing = await IdempotencyRecord.findOne({ key });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return fail(res, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'Idempotency key reused with different payload', null, 409);
      }
      if (existing.responseStatus) {
        return res.status(existing.responseStatus).json(existing.responseBody);
      }
      // In-flight: return 409 to ask client to retry later
      return fail(res, 'IDEMPOTENCY_IN_FLIGHT', 'Duplicate request in progress', null, 409);
    }
    const record = await IdempotencyRecord.create({
      key,
      userId: req.user ? req.user._id : null,
      route: req.originalUrl,
      payloadHash,
      expiresAt: new Date(Date.now() + WINDOW_MS),
    });
    const origJson = res.json.bind(res);
    res.json = function (body) {
      record.responseStatus = res.statusCode;
      record.responseBody = body;
      record.save().catch(() => {});
      return origJson(body);
    };
    next();
  };
}

module.exports = { idempotency, hashPayload };
