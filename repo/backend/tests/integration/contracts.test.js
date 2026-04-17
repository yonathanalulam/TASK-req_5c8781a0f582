const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const { hashPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function adminToken() {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({ username: 'adm', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['department_admin'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: u._id, roleCode: 'department_admin' });
  const r = await request(app).post('/api/v1/auth/login').send({ username: 'adm', password: 'SuperSecure12345!' });
  return r.body.data.token;
}

describe('contracts lifecycle', () => {
  test('create -> add rule -> activate -> terminate -> reconcile', async () => {
    const token = await adminToken();
    const create = await request(app).post('/api/v1/contracts').set('Authorization', `Bearer ${token}`).send({
      contractNumber: 'C-1', facilityUnit: 'HQ-A',
      lessorName: 'Acme', lesseeName: 'Meridian',
      startDate: '2026-01-01', endDate: '2027-01-01',
    });
    expect(create.status).toBe(201);
    const id = create.body.data._id;
    const rule = await request(app).post(`/api/v1/billing/contracts/${id}/rules`).set('Authorization', `Bearer ${token}`).send({
      ruleType: 'fixed', fixedAmountCents: 100000, dueDayOfMonth: 1,
    });
    expect(rule.status).toBe(201);
    const activate = await request(app).post(`/api/v1/contracts/${id}/activate`).set('Authorization', `Bearer ${token}`).send({});
    expect(activate.status).toBe(200);
    // Deposit
    const dep = await request(app).post(`/api/v1/deposits/contracts/${id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'deposit', amountCents: 200000 });
    expect(dep.status).toBe(201);
    // Partial refund
    const rf = await request(app).post(`/api/v1/deposits/contracts/${id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'partial_refund', amountCents: 50000 });
    expect(rf.status).toBe(201);
    // Cannot refund below zero
    const bad = await request(app).post(`/api/v1/deposits/contracts/${id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'partial_refund', amountCents: 10000000 });
    expect(bad.status).toBe(422);
    // Terminate
    const term = await request(app).post(`/api/v1/contracts/${id}/terminate`).set('Authorization', `Bearer ${token}`).send({
      terminationEffectiveDate: '2026-06-01', reason: 'tenant moving',
    });
    expect(term.status).toBe(200);
    expect(term.body.data.status).toBe('reconciliation_pending');
    // Reconcile
    const recon = await request(app).post(`/api/v1/deposits/contracts/${id}/reconciliation/complete`).set('Authorization', `Bearer ${token}`).send({ notes: 'done' });
    expect(recon.status).toBe(200);
  });

  test('expiration dashboard returns 3 buckets', async () => {
    const token = await adminToken();
    const now = Date.now();
    const in5 = new Date(now + 5 * 24 * 3600 * 1000);
    const in20 = new Date(now + 20 * 24 * 3600 * 1000);
    const in60 = new Date(now + 60 * 24 * 3600 * 1000);
    for (const [n, end] of [['C-5', in5],['C-20', in20],['C-60', in60]]) {
      const c = await request(app).post('/api/v1/contracts').set('Authorization', `Bearer ${token}`).send({
        contractNumber: n, facilityUnit: `Unit-${n}`, lessorName: 'L', lesseeName: 'M',
        startDate: new Date(now).toISOString(), endDate: end.toISOString(),
      });
      const rule = await request(app).post(`/api/v1/billing/contracts/${c.body.data._id}/rules`).set('Authorization', `Bearer ${token}`).send({
        ruleType: 'fixed', fixedAmountCents: 100000,
      });
      await request(app).post(`/api/v1/contracts/${c.body.data._id}/activate`).set('Authorization', `Bearer ${token}`).send({});
    }
    const dash = await request(app).get('/api/v1/contracts/expirations').set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.within7Days.length).toBe(1);
    expect(dash.body.data.within30Days.length).toBe(1);
    expect(dash.body.data.within90Days.length).toBe(1);
  });
});
