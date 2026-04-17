const { fail } = require('../utils/response');

function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  const code = err.apiCode || 'INTERNAL_ERROR';
  const status = err.status || 500;
  const details = err.details || null;
  if (status >= 500) console.error('[api-error]', err);
  return fail(res, code, err.message || 'Internal error', details, status);
}

module.exports = { errorHandler };
