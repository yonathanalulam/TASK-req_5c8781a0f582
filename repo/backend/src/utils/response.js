const { v4: uuid } = require('uuid');

function meta() {
  return { requestId: uuid(), serverTime: new Date().toISOString() };
}

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null, meta: meta() });
}

function fail(res, code, message, details = null, status = 400) {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details },
    meta: meta(),
  });
}

module.exports = { ok, fail };
