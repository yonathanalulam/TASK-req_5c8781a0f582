const { createApp } = require('./app');
const { connect } = require('./config/db');
const env = require('./config/env');
const { startScheduler } = require('./jobs/scheduler');

async function main() {
  await connect();
  const app = createApp();
  const server = app.listen(env.port, () => {
    // Do not log connection strings; they can contain credentials/hosts.
    console.log(`[api] listening on :${env.port}`);
  });
  startScheduler();
  const shutdown = async (sig) => {
    console.log(`[api] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => { console.error('[api] fatal', err); process.exit(1); });
