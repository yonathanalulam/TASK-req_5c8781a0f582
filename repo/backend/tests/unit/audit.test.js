const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const audit = require('../../src/services/auditService');
const AuditLog = require('../../src/models/AuditLog');

beforeAll(async () => { await startTestDb(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('audit chain', () => {
  test('writes linked chain and verifies', async () => {
    await audit.record({ action: 'test.one' });
    await audit.record({ action: 'test.two' });
    await audit.record({ action: 'test.three' });
    const v = await audit.verifyChain({});
    expect(v.valid).toBe(true);
    expect(v.checked).toBe(3);
  });
  test('tampered entry is detected', async () => {
    await audit.record({ action: 'a' });
    await audit.record({ action: 'b' });
    const middle = await AuditLog.findOne({ seq: 2 });
    middle.action = 'tampered';
    await middle.save();
    const v = await audit.verifyChain({});
    expect(v.valid).toBe(false);
    expect(v.broken.seq).toBe(2);
  });
});
