const cron = (() => { try { return require('node-cron'); } catch { return null; } })();
const runner = require('./runner');

function startScheduler() {
  if (!cron) {
    console.warn('[scheduler] node-cron not available; jobs can be invoked via /api/v1/jobs or manually');
    return;
  }
  // Nightly tag recompute @ 02:00 server-local
  cron.schedule('0 2 * * *', () => { runner.tagRecompute().catch(err => console.error('[scheduler] tag_recompute', err)); });
  // Reconciliation overdue: every hour
  cron.schedule('15 * * * *', () => { runner.reconciliationOverdueDetector().catch(err => console.error('[scheduler] reconciliation', err)); });
  // Contract expiration alert materialization: every 6 hours
  cron.schedule('30 */6 * * *', () => { runner.expirationAlertRefresh().catch(err => console.error('[scheduler] expiration', err)); });
  // Attachment integrity check: daily @ 03:30
  cron.schedule('30 3 * * *', () => { runner.attachmentIntegrityCheck().catch(err => console.error('[scheduler] attachment_integrity', err)); });
  // Audit retention reporting: daily @ 04:00
  cron.schedule('0 4 * * *', () => { runner.auditRetentionReport().catch(err => console.error('[scheduler] audit_retention', err)); });
  // Idempotency cleanup: hourly
  cron.schedule('45 * * * *', () => { runner.idempotencyCleanup().catch(err => console.error('[scheduler] idempotency_cleanup', err)); });
  // Stalled job sweep: every 5 minutes
  cron.schedule('*/5 * * * *', () => { runner.stalledJobSweep().catch(err => console.error('[scheduler] stalled_sweep', err)); });
  console.log('[scheduler] cron jobs registered');
}

module.exports = { startScheduler };
