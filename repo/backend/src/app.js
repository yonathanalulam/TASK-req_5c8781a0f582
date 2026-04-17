const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() }, error: null, meta: {} });
  });

  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/catalog', require('./routes/catalog'));
  app.use('/api/v1/admin', require('./routes/admin'));
  app.use('/api/v1/shoes', require('./routes/shoes'));
  app.use('/api/v1/custody', require('./routes/custody'));
  app.use('/api/v1/contracts', require('./routes/contracts'));
  app.use('/api/v1/billing', require('./routes/billing'));
  app.use('/api/v1/deposits', require('./routes/deposits'));
  app.use('/api/v1/shipping', require('./routes/shipping'));
  app.use('/api/v1/addresses', require('./routes/addresses'));
  app.use('/api/v1/exceptions', require('./routes/exceptions'));
  app.use('/api/v1/appeals', require('./routes/appeals'));
  app.use('/api/v1/tags', require('./routes/tags'));
  app.use('/api/v1/imports', require('./routes/imports'));
  app.use('/api/v1/exports', require('./routes/exports'));
  app.use('/api/v1/reports', require('./routes/reports'));
  app.use('/api/v1/jobs', require('./routes/jobs'));
  app.use('/api/v1/service-requests', require('./routes/serviceRequests'));

  app.use((_req, res) => res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Route not found' }, meta: {} }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
