const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function buildTerminatedContract(tok) {
  const c = await auth(request(app).post('/api/v1/contracts').send({
    contractNumber: 'R-1', facilityUnit: 'RU-1', lessorName: 'L', lesseeName: 'M',
    startDate: '2026-01-01', endDate: '2027-01-01',
  }), tok);
  const id = c.body.data._id;
  await auth(request(app).post(`/api/v1/billing/contracts/${id}/rules`).send({ ruleType: 'fixed', fixedAmountCents: 100000 }), tok);
  await auth(request(app).post(`/api/v1/contracts/${id}/activate`).send({}), tok);
  await auth(request(app).post(`/api/v1/deposits/contracts/${id}/ledger`).send({ entryType: 'deposit', amountCents: 150000 }), tok);
  await auth(request(app).post(`/api/v1/contracts/${id}/terminate`).send({
    terminationEffectiveDate: new Date().toISOString(), reason: 'term',
  }), tok);
  return id;
}

describe('GET /api/v1/deposits/contracts/:contractId/reconciliation', () => {
  test('admin gets reconciliation with unmasked final balance only after completion', async () => {
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    const id = await buildTerminatedContract(tok);
    // Before reconciliation completion the workflow is 'pending'
    const r = await auth(request(app).get(`/api/v1/deposits/contracts/${id}/reconciliation`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('pending');
    await auth(request(app).post(`/api/v1/deposits/contracts/${id}/reconciliation/complete`).send({ notes: 'done' }), tok);
    const r2 = await auth(request(app).get(`/api/v1/deposits/contracts/${id}/reconciliation`), tok);
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('completed');
    expect(r2.body.data.finalBalanceCents).toBe(150000);
  });

  test('unknown reconciliation returns 404', async () => {
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const r = await auth(request(app).get('/api/v1/deposits/contracts/000000000000000000000000/reconciliation'), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot view reconciliation (403)', async () => {
    await makeUser('stu', ['student']);
    const tok = await loginAs(app, 'stu');
    const r = await auth(request(app).get('/api/v1/deposits/contracts/000000000000000000000000/reconciliation'), tok);
    expect(r.status).toBe(403);
  });
});
